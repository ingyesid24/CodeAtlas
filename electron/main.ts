import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { execFile, execFileSync, spawn } from 'child_process';
import { Worker } from 'worker_threads';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AnalysisProgress } from '../src/analyzer/types';
import {
  buildEditorCommand,
  buildEditorDeepLink,
  EDITORS,
  type EditorInfo
} from '../src/editors/registry';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

const analysisWorkers = new Set<Worker>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateProjectPath(folderPath: unknown): string {
  if (typeof folderPath !== 'string' || folderPath.trim() === '') {
    throw new Error('La ruta del proyecto no es válida.');
  }

  const resolvedPath = path.resolve(folderPath);
  let stats: fs.Stats;

  try {
    stats = fs.statSync(resolvedPath);
    fs.accessSync(resolvedPath, fs.constants.R_OK);
  } catch {
    throw new Error('La carpeta seleccionada no existe o no tiene permisos de lectura.');
  }

  if (!stats.isDirectory()) {
    throw new Error('La ruta seleccionada no es una carpeta.');
  }

  return resolvedPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0F1B2B',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function ensureDesktopIntegration() {
  if (!app.isPackaged || process.platform !== 'linux' || !process.env.APPIMAGE) return;

  try {
    const appsDir = path.join(os.homedir(), '.local/share/applications');
    const iconsDir = path.join(os.homedir(), '.local/share/icons/hicolor/512x512/apps');
    const desktopPath = path.join(appsDir, 'codeatlas.desktop');
    const iconPath = path.join(iconsDir, 'codeatlas.png');
    const iconSource = path.join(__dirname, '../../build/icon.png');

    const desktopEntry =
      [
        '[Desktop Entry]',
        'Name=CodeAtlas',
        'Comment=Understand any codebase in minutes.',
        `Exec="${process.env.APPIMAGE}" --no-sandbox %U`,
        'Terminal=false',
        'Type=Application',
        'Icon=codeatlas',
        'StartupWMClass=CodeAtlas',
        'Categories=Development;'
      ].join('\n') + '\n';

    const existingDesktop = fs.existsSync(desktopPath) ? fs.readFileSync(desktopPath, 'utf8') : null;
    if (existingDesktop !== desktopEntry) {
      fs.mkdirSync(appsDir, { recursive: true });
      fs.writeFileSync(desktopPath, desktopEntry);
    }

    if (!fs.existsSync(iconPath) || fs.readFileSync(iconSource).length !== fs.statSync(iconPath).size) {
      fs.mkdirSync(iconsDir, { recursive: true });
      fs.copyFileSync(iconSource, iconPath);
    }

    execFile('gtk-update-icon-cache', [path.join(os.homedir(), '.local/share/icons')], () => undefined);
    execFile('update-desktop-database', [appsDir], () => undefined);
  } catch {
    // La integración es best-effort: si falla, la app arranca igual.
  }
}

app.whenReady().then(() => {
  ensureDesktopIntegration();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const worker of analysisWorkers) worker.terminate();
  analysisWorkers.clear();
});

// --- IPC: selección de carpeta ---
ipcMain.handle('select-folder', async () => {
  try {
    if (!mainWindow) {
      return { ok: false, error: 'La ventana principal no está disponible.' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    return {
      ok: true,
      path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});

// --- IPC: análisis del proyecto (worker para no congelar Electron) ---

interface AnalyzeReply {
  ok: boolean;
  data?: import('../src/analyzer/types').AnalysisResult;
  error?: string;
}

function runAnalysisInWorker(
  projectPath: string,
  onProgress: (progress: AnalysisProgress) => void
): Promise<AnalyzeReply> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'analyzerWorker.js'));
    analysisWorkers.add(worker);

    let settled = false;
    const finish = (reply: AnalyzeReply) => {
      if (settled) return;
      settled = true;
      analysisWorkers.delete(worker);
      worker.terminate();
      resolve(reply);
    };

    worker.on('message', (message: { type: string; progress?: AnalysisProgress; data?: import('../src/analyzer/types').AnalysisResult; error?: string }) => {
      if (message.type === 'progress' && message.progress) {
        onProgress(message.progress);
      } else if (message.type === 'result' && message.data) {
        finish({ ok: true, data: message.data });
      } else if (message.type === 'error') {
        finish({ ok: false, error: message.error ?? 'El análisis falló.' });
      }
    });

    worker.on('error', (error) => finish({ ok: false, error: errorMessage(error) }));
    worker.on('exit', (code) => {
      if (code !== 0) finish({ ok: false, error: 'El análisis terminó inesperadamente.' });
    });

    worker.postMessage({ rootPath: projectPath });
  });
}

ipcMain.handle('analyze-project', async (event, folderPath: unknown) => {
  let projectPath: string;
  try {
    projectPath = validateProjectPath(folderPath);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const sendProgress = (progress: AnalysisProgress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('analyze-progress', progress);
    }
  };

  return runAnalysisInWorker(projectPath, sendProgress);
});

// --- Editores: detección y apertura de archivos ---

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function detectInstalledEditors(): EditorInfo[] {
  return EDITORS.filter((editor) => editor.cli && commandExists(editor.cli));
}

function validateRelativeProjectFile(rootPath: string, file: unknown): string {
  if (typeof file !== 'string' || file.trim() === '' || path.isAbsolute(file)) {
    throw new Error('La ruta del archivo no es válida.');
  }

  const absPath = path.resolve(rootPath, file);
  const rootResolved = path.resolve(rootPath);
  if (absPath !== rootResolved && !absPath.startsWith(rootResolved + path.sep)) {
    throw new Error('El archivo está fuera del proyecto.');
  }

  return absPath;
}

ipcMain.handle('detect-editors', async () => {
  try {
    const editors = detectInstalledEditors().map(({ id, name }) => ({ id, name }));
    return { ok: true, editors };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});

ipcMain.handle('open-in-editor', async (_event, request: unknown) => {
  try {
    const { editorId, rootPath, file, line } = request as {
      editorId?: unknown;
      rootPath?: unknown;
      file?: unknown;
      line?: unknown;
    };
    if (typeof editorId !== 'string' || editorId.trim() === '') {
      throw new Error('Editor no especificado.');
    }

    const projectPath = validateProjectPath(rootPath);
    const absPath = validateRelativeProjectFile(projectPath, file);
    const lineNumber =
      typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : undefined;

    const command = buildEditorCommand(editorId, absPath, lineNumber);
    if (command) {
      spawn(command.command, command.args, {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32'
      }).unref();
      return { ok: true };
    }

    const deepLink = buildEditorDeepLink(editorId, absPath, lineNumber);
    if (deepLink) {
      await shell.openExternal(deepLink);
      return { ok: true };
    }

    return { ok: false, error: 'El editor seleccionado no está disponible en este sistema.' };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});
