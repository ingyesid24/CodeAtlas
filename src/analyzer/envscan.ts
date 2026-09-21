import * as fs from 'fs';
import { parseSourceFile, walk } from './astscan';
import { collectSourceFiles, type SourceFile } from './scanner';
import type { EnvVarUsage } from './types';

// Cubre process.env.VAR y process.env['VAR'] / process.env["VAR"]
const ENV_REGEX = /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;

const ENV_NAME_REGEX = /^[A-Z_][A-Z0-9_]*$/;

/** Devuelve true si el nodo es exactamente `process.env`. */
function isProcessEnv(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('type' in node)) return false;
  const member = node as { type: string; object?: unknown; property?: unknown };
  if (member.type !== 'MemberExpression') return false;
  const object = member.object as { type?: string; name?: string };
  const property = member.property as { type?: string; name?: string };
  return (
    object?.type === 'Identifier' &&
    object.name === 'process' &&
    property?.type === 'Identifier' &&
    property.name === 'env'
  );
}

/**
 * Detecta usos de process.env.X sobre el AST del archivo. Soporta acceso por
 * propiedad, acceso por índice con string y destructuring
 * (`const { PORT } = process.env`). Los comentarios y strings no cuentan.
 */
function scanEnvVarsAst(content: string, relPath: string, usageMap: Map<string, Set<string>>): boolean {
  const program = parseSourceFile(content);
  if (!program) return false;

  const register = (name: string) => {
    if (!ENV_NAME_REGEX.test(name)) return;
    if (!usageMap.has(name)) usageMap.set(name, new Set());
    usageMap.get(name)!.add(relPath);
  };

  walk(program, (node) => {
    if (node.type === 'MemberExpression') {
      // process.env.NOMBRE o process.env['NOMBRE']
      if (isProcessEnv(node.object)) {
        if (node.property.type === 'Identifier') {
          register(node.property.name);
        } else if (node.property.type === 'Literal' && typeof node.property.value === 'string') {
          register(node.property.value);
        }
      }
    } else if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern') {
      // const { PORT } = process.env
      if (isProcessEnv(node.init)) {
        for (const property of node.id.properties) {
          if (property.type === 'RestElement') continue;
          if (property.key.type === 'Identifier') register(property.key.name);
        }
      }
    }
  });

  return true;
}

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

    const parsed = scanEnvVarsAst(content, relPath, usageMap);

    // Respaldo por regex solo si el archivo no se pudo parsear.
    if (!parsed) {
      let match: RegExpExecArray | null;
      ENV_REGEX.lastIndex = 0;
      while ((match = ENV_REGEX.exec(content)) !== null) {
        const varName = match[1] || match[2];
        if (!usageMap.has(varName)) usageMap.set(varName, new Set());
        usageMap.get(varName)!.add(relPath);
      }
    }
  }

  return Array.from(usageMap.entries())
    .map(([name, files]) => ({ name, files: Array.from(files).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}