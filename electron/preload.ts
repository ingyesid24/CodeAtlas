import { contextBridge, ipcRenderer } from 'electron';
import type { AnalysisProgress, AnalysisResult, ArchitectureGraph } from '../src/analyzer/types';

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

export type UpdateStatus =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseDate?: string; releaseNotes?: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; error: string };

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
  exportGraph: (graph: ArchitectureGraph) => Promise<
    { ok: true; path: string | null } | { ok: false; error: string }
  >;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
  checkForUpdates: () => Promise<{ ok: true } | { ok: false; error: string }>;
  downloadUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>;
  installUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>;
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
  openInEditor: (request: OpenInEditorRequest) => ipcRenderer.invoke('open-in-editor', request),
  exportGraph: (graph: ArchitectureGraph) => ipcRenderer.invoke('export-graph', graph),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
      callback(status);
    };
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update')
};

contextBridge.exposeInMainWorld('codeatlas', api);
