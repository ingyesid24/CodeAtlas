import * as fs from 'fs';
import { collectSourceFiles, type SourceFile } from './scanner';
import type { EnvVarUsage } from './types';

// Cubre process.env.VAR y process.env['VAR'] / process.env["VAR"]
const ENV_REGEX = /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;

/**
 * Recorre el código fuente buscando usos de process.env.X y agrupa
 * por nombre de variable, indicando en qué archivos aparece cada una.
 */
export function scanEnvVars(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): EnvVarUsage[] {
  const usageMap = new Map<string, Set<string>>();
  const files = sourceFiles ?? collectSourceFiles(rootPath);

  for (let index = 0; index < files.length; index++) {
    const { fullPath, relPath } = files[index];
    onProgress?.(index + 1, files.length);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    ENV_REGEX.lastIndex = 0;
    while ((match = ENV_REGEX.exec(content)) !== null) {
      const varName = match[1] || match[2];
      if (!usageMap.has(varName)) usageMap.set(varName, new Set());
      usageMap.get(varName)!.add(relPath);
    }
  }

  return Array.from(usageMap.entries())
    .map(([name, files]) => ({ name, files: Array.from(files).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
