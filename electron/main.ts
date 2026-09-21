import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { execFile, execFileSync, spawn } from 'child_process';
import { Worker } from 'worker_threads';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import type { AnalysisProgress } from '../src/analyzer/types';
import type { UpdateStatus } from './preload';
import {
  buildDesktopEntry,
  buildLauncherScript,
  launcherPath
} from '../src/platform/linuxLauncher';
import {
  buildEditorCommand,
  buildEditorDeepLink,
  EDITORS,
  type EditorInfo
} from '../src/editors/registry';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

const analysisWorkers = new Set<Worker>();

// --- Actualizaciones automáticas (solo en app empaquetada) ---

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status: UpdateStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', status);
  }
}

function wireUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ type: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({
      type: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    });
  });
  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus({ type: 'not-available' });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      type: 'progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ type: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (error) => {
    sendUpdateStatus({ type: 'error', error: errorMessage(error) });
  });
}

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
    const homeDir = os.homedir();
    const appsDir = path.join(homeDir, '.local/share/applications');
    const iconsDir = path.join(homeDir, '.local/share/icons/hicolor/512x512/apps');
    const desktopPath = path.join(appsDir, 'codeatlas.desktop');
    const iconPath = path.join(iconsDir, 'codeatlas.png');
    const iconSource = path.join(__dirname, '../../build/icon.png');

    // Launcher estable: el .desktop nunca apunta a un AppImage con nombre
    // versionado (que cambia con cada actualización). El script busca el
    // AppImage más reciente en el directorio de instalación y lo ejecuta.
    const launcher = launcherPath(homeDir);
    const appImageDir = path.dirname(process.env.APPIMAGE);
    const launcherScript = buildLauncherScript(appImageDir);
    const existingLauncher = fs.existsSync(launcher) ? fs.readFileSync(launcher, 'utf8') : null;
    if (existingLauncher !== launcherScript) {
      fs.mkdirSync(path.dirname(launcher), { recursive: true });
      fs.writeFileSync(launcher, launcherScript, { mode: 0o755 });
      fs.chmodSync(launcher, 0o755);
    }

    // Entrada .desktop estable (apunta al launcher, no al AppImage versionado).
    const desktopEntry = buildDesktopEntry(launcher);
    const existingDesktop = fs.existsSync(desktopPath) ? fs.readFileSync(desktopPath, 'utf8') : null;
    if (existingDesktop !== desktopEntry) {
      fs.mkdirSync(appsDir, { recursive: true });
      fs.writeFileSync(desktopPath, desktopEntry);
    }

    if (!fs.existsSync(iconPath) || fs.readFileSync(iconSource).length !== fs.statSync(iconPath).size) {
      fs.mkdirSync(iconsDir, { recursive: true });
      fs.copyFileSync(iconSource, iconPath);
    }

    execFile('gtk-update-icon-cache', [path.join(homeDir, '.local/share/icons')], () => undefined);
    execFile('update-desktop-database', [appsDir], () => undefined);
  } catch {
    // La integración es best-effort: si falla, la app arranca igual.
  }
}

app.whenReady().then(() => {
  ensureDesktopIntegration();
  createWindow();
  wireUpdaterEvents();

  // Comprobación silenciosa al arranque: no molesta y avisa si hay una
  // versión nueva. Solo aplica a binarios empaquetados (en desarrollo
  // electron-updater no tiene app-update.yml).
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => undefined);
    }, 10_000);
  }

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

// --- Actualizaciones: IPC ---

ipcMain.handle('check-for-updates', async () => {
  try {
    if (!app.isPackaged) {
      return { ok: false, error: 'La comprobación de actualizaciones solo está disponible en la app instalada.' };
    }
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    if (!app.isPackaged) {
      return { ok: false, error: 'La descarga de actualizaciones solo está disponible en la app instalada.' };
    }
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});

ipcMain.handle('install-update', async () => {
  try {
    if (!app.isPackaged) {
      return { ok: false, error: 'La instalación de actualizaciones solo está disponible en la app instalada.' };
    }
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});

// --- Exportar el grafo a un archivo JSON ---

/**
 * Valida que el payload recibido sea un grafo serializable y devuelve una
 * copia limpia (solo schemaVersion/nodes/edges) para no escribir de más.
 */
function sanitizeGraph(graph: unknown): import('../src/analyzer/types').ArchitectureGraph | null {
  if (typeof graph !== 'object' || graph === null) return null;
  const candidate = graph as { schemaVersion?: unknown; nodes?: unknown; edges?: unknown };
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    return null;
  }
  return {
    schemaVersion: 1,
    nodes: candidate.nodes,
    edges: candidate.edges
  };
}

ipcMain.handle('export-graph', async (event, graph: unknown) => {
  try {
    if (!mainWindow) {
      return { ok: false, error: 'La ventana principal no está disponible.' };
    }

    const clean = sanitizeGraph(graph);
    if (!clean) {
      return { ok: false, error: 'El grafo recibido no es válido.' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar grafo de CodeAtlas',
      defaultPath: path.join(app.getPath('documents'), 'codeatlas-graph.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { ok: true, path: null };
    }

    await fs.promises.writeFile(result.filePath, JSON.stringify(clean, null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
});
