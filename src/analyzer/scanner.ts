import * as fs from 'fs';
import * as path from 'path';
import type { FileNode, PackageInfo } from './types';

// Carpetas que nunca queremos escanear (ruido, no aportan a la arquitectura)
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'build', 'out',
  'release', '.next', '.vite', 'coverage', '.turbo', '.cache'
]);

/** Extensiones de código fuente que interesan a los detectores. */
export const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

export interface SourceFile {
  /** Ruta absoluta al archivo. */
  fullPath: string;
  /** Ruta relativa al root del proyecto. */
  relPath: string;
}

/**
 * Recolecta los archivos de código fuente del proyecto (misma ruta de
 * exclusión que los detectores), para escanearlos una sola vez.
 */
export function collectSourceFiles(rootPath: string): SourceFile[] {
  const files: SourceFile[] = [];

  function walk(currentPath: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return; // permisos, symlink roto, etc. — lo saltamos sin romper el escaneo
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(currentPath, entry.name), path.join(relativePath, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;

      files.push({
        fullPath: path.join(currentPath, entry.name),
        relPath: path.join(relativePath, entry.name)
      });
    }
  }

  walk(rootPath, '');
  return files;
}

export interface ScanStats {
  fileCount: number;
  dirCount: number;
}

/**
 * Recorre recursivamente un directorio y construye el árbol de archivos,
 * ignorando carpetas de build/dependencias. También devuelve conteos.
 */
export function scanDirectory(rootPath: string): { tree: FileNode; stats: ScanStats } {
  const stats: ScanStats = { fileCount: 0, dirCount: 0 };

  function walk(currentPath: string, relativePath: string): FileNode {
    const name = path.basename(currentPath) || currentPath;
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (error) {
      if (relativePath === '') {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new Error(`No se pudo leer la carpeta seleccionada${detail}`);
      }

      return { name, path: relativePath, type: 'dir', children: [] };
    }

    const children: FileNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const entryFullPath = path.join(currentPath, entry.name);
      const entryRelPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        stats.dirCount++;
        children.push(walk(entryFullPath, entryRelPath));
      } else if (entry.isFile()) {
        stats.fileCount++;
        children.push({ name: entry.name, path: entryRelPath, type: 'file' });
      }
    }

    // Carpetas antes que archivos, alfabético dentro de cada grupo
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { name, path: relativePath || '.', type: 'dir', children };
  }

  const tree = walk(rootPath, '');
  return { tree, stats };
}

/**
 * Busca todos los archivos package.json del proyecto (raíz + subcarpetas,
 * excluyendo node_modules) y extrae la info relevante de cada uno.
 */
export function findPackageJsonFiles(rootPath: string): PackageInfo[] {
  const results: PackageInfo[] = [];

  function walk(currentPath: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return; // permisos, symlink roto, etc. — lo saltamos sin romper el escaneo
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(currentPath, entry.name), path.join(relativePath, entry.name));
      } else if (entry.isFile() && entry.name === 'package.json') {
        const fullPath = path.join(currentPath, entry.name);
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const json = JSON.parse(raw);
          results.push({
            path: path.join(relativePath, entry.name),
            name: json.name,
            version: json.version,
            main: json.main,
            scripts: json.scripts,
            dependencies: json.dependencies,
            devDependencies: json.devDependencies
          });
        } catch {
          // package.json inválido o ilegible — lo ignoramos, no bloqueamos el análisis
        }
      }
    }
  }

  walk(rootPath, '');
  return results;
}
