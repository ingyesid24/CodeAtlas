import { contextBridge, ipcRenderer } from 'electron';
import type { AnalysisProgress, AnalysisResult } from '../src/analyzer/types';

export interface DetectedEditor {
  id: string;
  name: string;
}

export interface OpenInEditorRequest {
  editorId: string;
  rootPath: string;
  file: string;
  line?: number;
}

export interface CodeAtlasAPI {
  selectFolder: () => Promise<
    { ok: true; path: string | null } | { ok: false; error: string }
  >;
  analyzeProject: (
    folderPath: string,
    onProgress?: (progress: AnalysisProgress) => void
  ) => Promise<{ ok: true; data: AnalysisResult } | { ok: false; error: string }>;
  detectEditors: () => Promise<
    { ok: true; editors: DetectedEditor[] } | { ok: false; error: string }
  >;
  openInEditor: (request: OpenInEditorRequest) => Promise<
    { ok: true } | { ok: false; error: string }
  >;
}

const api: CodeAtlasAPI = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  analyzeProject: (folderPath: string, onProgress?: (progress: AnalysisProgress) => void) => {
    if (!onProgress) return ipcRenderer.invoke('analyze-project', folderPath);

    const listener = (_event: Electron.IpcRendererEvent, progress: AnalysisProgress) => {
      onProgress(progress);
    };

    ipcRenderer.on('analyze-progress', listener);

    return ipcRenderer.invoke('analyze-project', folderPath).finally(() => {
      ipcRenderer.removeListener('analyze-progress', listener);
    });
  },
  detectEditors: () => ipcRenderer.invoke('detect-editors'),
  openInEditor: (request: OpenInEditorRequest) => ipcRenderer.invoke('open-in-editor', request)
};

contextBridge.exposeInMainWorld('codeatlas', api);
