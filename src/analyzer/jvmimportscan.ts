import * as fs from 'fs';
import * as path from 'path';
import { normalizeGraphPath } from './graph';
import { collectJvmSourceFiles, type SourceFile } from './scanner';
import type { ImportInfo } from './types';

// package a.b.c;  (Java) |  package a.b.c  (Kotlin)
const PACKAGE_REGEX = /^\s*package\s+([\w.]+)\s*;?/m;

// import a.b.c.Clase;  |  import a.b.c.*;  |  import static a.b.c.Clase.metodo;
// (Kotlin puede omitir el punto y coma final)
const IMPORT_REGEX = /^\s*import\s+(static\s+)?([\w.*]+)\s*;?/gm;

const JDK_PREFIXES = ['java.', 'javax.', 'jakarta.', 'jdk.', 'kotlin.', 'kotlinx.'];

function packageOf(content: string): string | undefined {
  const match = PACKAGE_REGEX.exec(content);
  return match ? match[1] : undefined;
}

/**
 * Construye un mapa "FQN de clase" -> ruta relativa del archivo que la define.
 * Asume la convención Java: el nombre del archivo es el nombre de la clase.
 */
function buildClassIndex(files: SourceFile[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const { fullPath, relPath } of files) {
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }
    const pkg = packageOf(content);
    if (!pkg) continue;

    const fileName = path.basename(relPath);
    const className = fileName.replace(/\.(java|kt)$/, '');
    const fqn = `${pkg}.${className}`;
    index.set(fqn, normalizeGraphPath(relPath));
  }

  return index;
}

/**
 * Para un import static (a.b.c.Clase.metodo) devuelve el FQN de la clase
 * (a.b.c.Clase); para un import normal devuelve el specifier tal cual.
 */
function staticClassFqn(specifier: string, isStatic: boolean): string {
  if (!isStatic) return specifier;
  const segments = specifier.split('.');
  if (segments.length < 2) return specifier;
  segments.pop(); // quita el nombre del miembro estático
  return segments.join('.');
}

/**
 * Detecta imports de Java y Kotlin. Los imports relativos al propio proyecto
 * se resuelven al archivo local que define la clase cuando es posible
 * (convención Java: nombre de archivo = nombre de clase). Los imports de la
 * JDK y de librerías externas se conservan como specifier sin target.
 */
export function scanJvmImports(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const files = sourceFiles ?? collectJvmSourceFiles(rootPath);
  const classIndex = buildClassIndex(files);

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
    let match: RegExpExecArray | null;
    IMPORT_REGEX.lastIndex = 0;
    while ((match = IMPORT_REGEX.exec(content)) !== null) {
      const isStatic = match[1]?.trim() === 'static';
      const specifier = match[2];
      if (seen.has(specifier)) continue;
      seen.add(specifier);

      const line = content.slice(0, match.index).split('\n').length;

      // import a.b.c.* -> paquete completo, sin clase concreta
      if (specifier.endsWith('.*')) {
        imports.push({ file: normalizedRelPath, specifier, line });
        continue;
      }

      const classFqn = staticClassFqn(specifier, isStatic);
      const target = classIndex.get(classFqn);
      imports.push({
        file: normalizedRelPath,
        specifier,
        line,
        target
      });
    }
  }

  return imports;
}

export { JDK_PREFIXES };