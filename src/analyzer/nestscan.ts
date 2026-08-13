import * as fs from 'fs';
import { collectSourceFiles, type SourceFile } from './scanner';
import type { HttpMethod, RouteInfo } from './types';

const METHOD_DECORATORS: Record<string, HttpMethod> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL'
};

const DECORATOR_REGEX = /^\s*@(Controller|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/;

function readBalancedParens(content: string, openIndex: number): { text: string; endIndex: number } | null {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = openIndex; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth === 0) {
        return { text: content.slice(openIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

function extractPathArgument(argument: string): string | undefined {
  const trimmed = argument.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    const match = /path\s*:\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(trimmed);
    return match ? match[2] : '';
  }
  const match = /^(['"`])((?:\\.|(?!\1).)*)\1/.exec(trimmed);
  return match ? match[2] : '';
}

function joinRoutePaths(prefix: string, subPath: string): string {
  let combined = `${prefix}/${subPath}`.replace(/\/{2,}/g, '/');
  if (combined.endsWith('/')) combined = combined.slice(0, -1);
  if (!combined) combined = '/';
  if (!combined.startsWith('/')) combined = `/${combined}`;
  return combined;
}

export function scanNestRoutes(
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

    const lines = content.split('\n');
    const lineOffsets: number[] = [];
    {
      let offset = 0;
      for (const line of lines) {
        lineOffsets.push(offset);
        offset += line.length + 1;
      }
    }

    let controllerPrefix: string | null = null;
    let nextScanLine = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      if (idx < nextScanLine) continue;

      const decoratorMatch = DECORATOR_REGEX.exec(lines[idx]);
      if (!decoratorMatch) continue;
      const decoratorName = decoratorMatch[1];

      const lineStart = lineOffsets[idx];
      const parens = readBalancedParens(content, lineStart + lines[idx].indexOf('('));
      if (!parens) continue;
      nextScanLine = idx + content.slice(lineStart, parens.endIndex).split('\n').length;

      if (decoratorName === 'Controller') {
        controllerPrefix = extractPathArgument(parens.text) ?? '';
        continue;
      }

      if (controllerPrefix === null) continue;

      const method = METHOD_DECORATORS[decoratorName];
      const subPath = extractPathArgument(parens.text) ?? '';
      routes.push({
        method,
        path: joinRoutePaths(controllerPrefix, subPath),
        file: relPath,
        line: idx + 1
      });
    }
  }

  return routes;
}
