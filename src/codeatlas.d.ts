import type { CodeAtlasAPI } from '../electron/preload';

declare global {
  interface Window {
    codeatlas: CodeAtlasAPI;
  }
}

export {};
