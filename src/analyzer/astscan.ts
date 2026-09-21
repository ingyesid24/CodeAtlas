import { parse, type TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Parsea un archivo fuente con el parser de TypeScript. Devuelve null si el
 * archivo tiene errores de sintaxis: en ese caso los detectores pueden
 * reutilizar el escaneo por regex como respaldo (una clase de archivos que
 * antes se analizaba igualmente).
 */
export function parseSourceFile(content: string): TSESTree.Program | null {
  try {
    return parse(content, {
      loc: true,
      range: true,
      jsx: true,
      errorOnUnknownASTType: false
    });
  } catch {
    return null;
  }
}

/** Recorre el AST en profundidad visitando cada nodo. */
export function walk(node: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) walk(child, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}

/** Valor de un string literal o template literal sin interpolaciones. */
export function literalValue(
  node: TSESTree.Node | null | undefined
): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked ?? undefined;
  }
  return undefined;
}