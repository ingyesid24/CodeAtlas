import * as fs from 'fs';
import { literalValue, parseSourceFile, walk } from './astscan';
import { collectSourceFiles, type SourceFile } from './scanner';
import type { HttpMethod, RouteInfo } from './types';

const RECEIVER_REGEX = /^(app|router|api)$/i;
const RECEIVER_SUFFIX_REGEX = /(router|app)$/i;

const ROUTE_CALL_REGEX = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all|use)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g;

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);

function isLikelyRouter(receiver: string): boolean {
  return RECEIVER_REGEX.test(receiver) || RECEIVER_SUFFIX_REGEX.test(receiver);
}

/**
 * Detecta llamadas a métodos HTTP de Express sobre el AST del archivo.
 * Soporta rutas literales y template literals sin interpolación, también
 * en llamadas multilínea. Los comentarios no cuentan.
 */
function scanExpressRoutesAst(content: string, relPath: string, routes: RouteInfo[]): boolean {
  const program = parseSourceFile(content);
  if (!program) return false;

  walk(program, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    if (callee.type !== 'MemberExpression') return;

    const receiver = callee.object;
    if (receiver.type !== 'Identifier' || !isLikelyRouter(receiver.name)) return;

    let method: string | undefined;
    if (callee.property.type === 'Identifier') {
      method = callee.property.name;
    } else if (callee.property.type === 'Literal' && typeof callee.property.value === 'string') {
      method = callee.property.value;
    }
    if (!method || !ROUTE_METHODS.has(method)) return;

    const routePath = literalValue(node.arguments[0]);
    if (routePath === undefined || !routePath.startsWith('/')) return;

    routes.push({
      method: method.toUpperCase() as HttpMethod,
      path: routePath,
      file: relPath,
      line: node.loc?.start.line ?? 0
    });
  });

  return true;
}

export function scanExpressRoutes(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): RouteInfo[] {
  const routes: RouteInfo[] = [];
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

    const parsed = scanExpressRoutesAst(content, relPath, routes);

    // Respaldo por regex solo si el archivo no se pudo parsear.
    if (!parsed) {
      const lines = content.split('\n');
      lines.forEach((lineText, idx) => {
        ROUTE_CALL_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = ROUTE_CALL_REGEX.exec(lineText)) !== null) {
          const [, receiver, method, , routePath] = match;
          if (!isLikelyRouter(receiver)) continue;
          if (!routePath.startsWith('/')) continue;

          routes.push({
            method: method.toUpperCase() as HttpMethod,
            path: routePath,
            file: relPath,
            line: idx + 1
          });
        }
      });
    }
  }

  return routes;
}