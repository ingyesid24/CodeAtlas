import * as fs from 'fs';
import { collectJvmSourceFiles, type SourceFile } from './scanner';
import type { HttpMethod, RouteInfo } from './types';

const METHOD_ANNOTATIONS: Record<string, HttpMethod> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  PatchMapping: 'PATCH',
  DeleteMapping: 'DELETE'
};

// Anotaciones que abren un controlador Spring.
const CONTROLLER_ANNOTATION_REGEX = /^\s*@(RestController|Controller)\b/;
// @RequestMapping(...) — puede ser de clase (prefijo) o de método.
const REQUEST_MAPPING_REGEX = /^\s*@RequestMapping\s*\(/;
// Métodos HTTP declarados en @RequestMapping(method = RequestMethod.GET)
const REQUEST_METHOD_REGEX = /RequestMethod\.([A-Z]+)/;

// Línea que declara una clase/interface/enum (cierra el bloque de anotaciones de clase).
const CLASS_DECLARATION_REGEX = /^\s*(?:public\s+|protected\s+|private\s+|abstract\s+|final\s+)*\s*(?:class|interface|enum|@interface)\s+[\w]+/;

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
    if (char === '"' || char === "'") {
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

/** Extrae el primer argumento string de la anotación (value, path o array de un elemento). */
function extractPathArgument(argument: string): string | undefined {
  const trimmed = argument.trim();
  if (!trimmed) return '';

  const valueMatch = /(?:value|path)\s*=\s*\{?\s*['"]([^'"]+)['"]/.exec(trimmed);
  if (valueMatch) return valueMatch[1];

  const literalMatch = /^\{?\s*['"]([^'"]+)['"]/.exec(trimmed);
  return literalMatch ? literalMatch[1] : '';
}

function joinRoutePaths(prefix: string, subPath: string): string {
  let combined = `${prefix}/${subPath}`.replace(/\/{2,}/g, '/');
  if (combined.endsWith('/')) combined = combined.slice(0, -1);
  if (!combined) combined = '/';
  if (!combined.startsWith('/')) combined = `/${combined}`;
  return combined;
}

/**
 * Detecta rutas de controladores Spring Boot (Java y Kotlin). Heurístico:
 *
 * - `@RestController` / `@Controller` abren un controlador.
 * - Un `@RequestMapping(...)` antes de la declaración de la clase actúa como
 *   prefijo del controlador.
 * - `@GetMapping`/`@PostMapping`/etc. (y `@RequestMapping` de método) componen
 *   prefijo + subruta con su método HTTP.
 *
 * Límites: los argumentos de ruta deben ser literales; las anotaciones con
 * `value = {...}` (arrays) se ignoran; no se resuelven path variables anidadas
 * ni se validan imports de Spring.
 */
export function scanSpringRoutes(
  rootPath: string,
  sourceFiles?: SourceFile[],
  onProgress?: (processed: number, total: number) => void
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const files = sourceFiles ?? collectJvmSourceFiles(rootPath);

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

    let inController = false;
    let controllerPrefix: string | null = null;
    let awaitingClass = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const lineStart = lineOffsets[idx];

      // ¿Abrimos un controlador?
      const controllerMatch = CONTROLLER_ANNOTATION_REGEX.exec(lines[idx]);
      if (controllerMatch) {
        inController = true;
        awaitingClass = true;
        controllerPrefix = null;
        continue;
      }

      if (!inController) continue;

      // ¿La declaración de la clase? Cierra el bloque de anotaciones de clase.
      if (CLASS_DECLARATION_REGEX.test(lines[idx])) {
        awaitingClass = false;
        continue;
      }

      if (!REQUEST_MAPPING_REGEX.test(lines[idx]) && !/^\s*@([A-Za-z]+Mapping)\b/.test(lines[idx])) {
        continue;
      }

      const annotationName = lines[idx].match(/@([A-Za-z]+Mapping)/)?.[1];
      if (!annotationName) continue;

      const parensStart = lines[idx].indexOf('(');
      const parens = parensStart >= 0 ? readBalancedParens(content, lineStart + parensStart) : null;
      const argument = parens ? parens.text : '';

      // @RequestMapping antes de la clase = prefijo del controlador.
      if (annotationName === 'RequestMapping' && awaitingClass) {
        const prefix = extractPathArgument(argument) ?? '';
        if (prefix) controllerPrefix = prefix;
        continue;
      }

      // Ignoramos anotaciones de clase tras la declaración (no deberían aparecer).
      if (awaitingClass) continue;

      let method: HttpMethod | undefined;
      if (annotationName === 'RequestMapping') {
        const requestMethod = REQUEST_METHOD_REGEX.exec(argument);
        method = requestMethod ? (requestMethod[1] as HttpMethod) : undefined;
        if (!method) continue; // @RequestMapping sin método HTTP explícito → no es ruta accionable
      } else {
        method = METHOD_ANNOTATIONS[annotationName];
      }
      if (!method) continue;

      const subPath = extractPathArgument(argument) ?? '';
      routes.push({
        method,
        path: joinRoutePaths(controllerPrefix ?? '', subPath),
        file: relPath,
        line: idx + 1
      });
    }
  }

  return routes;
}