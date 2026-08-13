import * as fs from 'fs';
import * as path from 'path';
import { normalizeGraphPath } from './graph';
import { collectSourceFiles, SOURCE_EXTENSIONS, type SourceFile } from './scanner';
import type { ImportInfo } from './types';

const RESOLVABLE_EXTENSIONS = [...SOURCE_EXTENSIONS, '.json'];

// import x from 'y' | import 'y' | import * as x from 'y' | import { a, b } from 'y'
const STATIC_IMPORT_REGEX = /\bimport\s+(?:[\w*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/g;
// export * from 'y' | export { a } from 'y'
const EXPORT_FROM_REGEX = /\bexport\s+(?:[\w*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_REGEX = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Resuelve un specifier relativo (./x, ../y) a una ruta de proyecto,
 * probando extensiones y archivos index de carpeta. Devuelve undefined
 * para specifiers externos (bare) o sin archivo local que coincida.
 */
function resolveRelativeSpecifier(
  rootPath: string,
  sourceRelPath: string,
  specifier: string
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;

  const sourceAbs = path.resolve(rootPath, sourceRelPath);
  const candidateAbs = path.resolve(path.dirname(sourceAbs), specifier);

  function toProjectPath(absPath: string): string | undefined {
    return fs.statSync(absPath).isFile()
      ? normalizeGraphPath(path.relative(rootPath, absPath))
      : undefined;
  }

  const candidates = [
    candidateAbs,
    ...RESOLVABLE_EXTENSIONS.map((ext) => candidateAbs + ext)
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const resolved = toProjectPath(candidate);
        if (resolved) return resolved;
      }
    } catch {
      // carpeta ilegible o symlink roto — probamos el siguiente candidato
    }
  }

  for (const ext of RESOLVABLE_EXTENSIONS) {
    const indexFile = path.join(candidateAbs, `index${ext}`);
    try {
      if (fs.existsSync(indexFile)) {
        const resolved = toProjectPath(indexFile);
        if (resolved) return resolved;
      }
    } catch {
      // seguimos con la siguiente extensión
    }
  }

  return undefined;
}

/**
 * Recorre el proyecto y detecta imports ES y require() de CommonJS.
 * Los imports relativos se resuelven al archivo local cuando es posible.
 */
export function scanImports(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const files = sourceFiles ?? collectSourceFiles(rootPath);

  for (let index = 0; index < files.length; index++) {
    const { fullPath, relPath } = files[index];
    onProgress?.(index + 1, files.length);
    const normalizedRelPath = normalizeGraphPath(relPath);

    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const seen = new Set<string>();
    const lines = content.split('\n');
    lines.forEach((lineText, idx) => {
      const push = (specifier: string) => {
        if (seen.has(specifier)) return;
        seen.add(specifier);
        imports.push({
          file: normalizedRelPath,
          specifier,
          line: idx + 1,
          target: resolveRelativeSpecifier(rootPath, normalizedRelPath, specifier)
        });
      };

      for (const regex of [
        STATIC_IMPORT_REGEX,
        EXPORT_FROM_REGEX,
        DYNAMIC_IMPORT_REGEX,
        REQUIRE_REGEX
      ]) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(lineText)) !== null) push(match[1]);
      }
    });
  }

  return imports;
}
