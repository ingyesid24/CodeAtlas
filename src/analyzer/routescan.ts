import * as fs from 'fs';
import { collectSourceFiles, type SourceFile } from './scanner';
import type { HttpMethod, RouteInfo } from './types';

const RECEIVER_REGEX = /^(app|router|api)$/i;
const RECEIVER_SUFFIX_REGEX = /(router|app)$/i;

const ROUTE_CALL_REGEX = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all|use)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g;

export function scanExpressRoutes(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const files = sourceFiles ?? collectSourceFiles(rootPath);

  function isLikelyRouter(receiver: string): boolean {
    return RECEIVER_REGEX.test(receiver) || RECEIVER_SUFFIX_REGEX.test(receiver);
  }

  for (let index = 0; index < files.length; index++) {
    const { fullPath, relPath } = files[index];
    onProgress?.(index + 1, files.length);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

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

  return routes;
}
