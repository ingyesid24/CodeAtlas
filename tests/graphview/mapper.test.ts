import { describe, it, expect } from 'vitest';
import {
  buildFlowGraph,
  computeHighlight,
  connectedEdges,
  edgeClassName,
  edgeColor,
  edgeSecondaryText,
  filterGraphByType,
  nodeClassName,
  nodeColor,
  nodeDetailRows,
  nodeFileLocation
} from '../../src/components/graphMapper';
import type { ArchitectureGraph, GraphNode } from '../../src/analyzer/types';

// Grafo fixture: dos archivos conectados por un import, uno de ellos declara
// una ruta y usa una variable de entorno; un package con una dependencia.
const fileA: GraphNode = { id: 'file:a.js', type: 'file', label: 'a.js', path: 'a.js' };
const fileB: GraphNode = { id: 'file:b.js', type: 'file', label: 'b.js', path: 'b.js' };
const routeNode: GraphNode = {
  id: 'route:1',
  type: 'route',
  label: 'GET /health',
  method: 'GET',
  routePath: '/health',
  location: { file: 'a.js', line: 3 }
} as GraphNode;
const envNode: GraphNode = { id: 'environment:PORT', type: 'environment', label: 'PORT', name: 'PORT' } as GraphNode;
const packageNode: GraphNode = {
  id: 'package:package.json',
  type: 'package',
  label: 'demo',
  name: 'demo',
  version: '1.0.0',
  manifestPath: 'package.json'
} as GraphNode;
const depNode: GraphNode = { id: 'dependency:express', type: 'dependency', label: 'express', name: 'express' } as GraphNode;

function makeGraph(): ArchitectureGraph {
  return {
    schemaVersion: 1,
    nodes: [fileA, fileB, routeNode, envNode, packageNode, depNode],
    edges: [
      { id: 'e1', type: 'imports', source: 'file:a.js', target: 'file:b.js', specifier: './b' } as any,
      { id: 'e2', type: 'declares-route', source: 'file:a.js', target: 'route:1' } as any,
      { id: 'e3', type: 'uses-env', source: 'file:a.js', target: 'environment:PORT' } as any,
      { id: 'e4', type: 'depends-on', source: 'package:package.json', target: 'dependency:express', scope: 'runtime', version: '^4.0.0' } as any
    ]
  };
}

describe('nodeColor / edgeColor', () => {
  it('devuelve un color distinto por cada tipo de nodo', () => {
    const types: GraphNode['type'][] = ['file', 'route', 'environment', 'package', 'dependency'];
    const colors = new Set(types.map(nodeColor));
    expect(colors.size).toBe(types.length);
  });

  it('devuelve un color por cada tipo de edge', () => {
    expect(edgeColor('imports')).toBeTruthy();
    expect(edgeColor('depends-on')).toBeTruthy();
  });
});

describe('buildFlowGraph', () => {
  it('genera un FlowNode por cada nodo del grafo con el mismo id', () => {
    const { nodes } = buildFlowGraph(makeGraph());
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ['dependency:express', 'environment:PORT', 'file:a.js', 'file:b.js', 'package:package.json', 'route:1'].sort()
    );
    expect(nodes.every((n) => n.type === 'module')).toBe(true);
  });

  it('genera un FlowEdge por cada edge del grafo, preservando source/target', () => {
    const { edges } = buildFlowGraph(makeGraph());
    expect(edges).toHaveLength(4);
    const importEdge = edges.find((e) => e.id === 'e1');
    expect(importEdge).toMatchObject({ source: 'file:a.js', target: 'file:b.js' });
    expect(importEdge?.style).toMatchObject({ stroke: edgeColor('imports') });
  });

  it('asigna una posición numérica finita a cada nodo (layout no lanza NaN)', () => {
    const { nodes } = buildFlowGraph(makeGraph());
    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('no todos los nodos terminan en la misma posición (layout real, no cuadrícula colapsada)', () => {
    const { nodes } = buildFlowGraph(makeGraph());
    const uniquePositions = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
  });

  it('es determinista: el mismo grafo produce siempre las mismas posiciones', () => {
    const graph = makeGraph();
    const first = buildFlowGraph(graph);
    const second = buildFlowGraph(graph);
    expect(first.nodes.map((n) => n.position)).toEqual(second.nodes.map((n) => n.position));
  });

  it('con un grafo vacío devuelve arrays vacíos sin lanzar', () => {
    const result = buildFlowGraph({ schemaVersion: 1, nodes: [], edges: [] });
    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it('rellena data.detail según el tipo de nodo (ruta del archivo, ubicación de la ruta, versión del paquete)', () => {
    const { nodes } = buildFlowGraph(makeGraph());
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('file:a.js')?.data.detail).toBe('a.js');
    expect(byId.get('route:1')?.data.detail).toBe('a.js:3');
    expect(byId.get('package:package.json')?.data.detail).toBe('1.0.0');
    expect(byId.get('dependency:express')?.data.detail).toBeUndefined();
  });
});

describe('filterGraphByType', () => {
  it('conserva solo los nodos de los tipos indicados', () => {
    const filtered = filterGraphByType(makeGraph(), new Set(['file']));
    expect(filtered.nodes.every((n) => n.type === 'file')).toBe(true);
    expect(filtered.nodes).toHaveLength(2);
  });

  it('elimina las edges cuyo origen o destino quedó oculto', () => {
    // Solo 'file' visible: la edge declares-route (a route) y uses-env (a environment)
    // y depends-on (package/dependency) deben desaparecer; solo queda 'imports' (file->file).
    const filtered = filterGraphByType(makeGraph(), new Set(['file']));
    expect(filtered.edges).toHaveLength(1);
    expect(filtered.edges[0].type).toBe('imports');
  });

  it('con todos los tipos visibles devuelve el grafo completo', () => {
    const graph = makeGraph();
    const filtered = filterGraphByType(graph, new Set(['file', 'route', 'environment', 'package', 'dependency']));
    expect(filtered.nodes).toHaveLength(graph.nodes.length);
    expect(filtered.edges).toHaveLength(graph.edges.length);
  });

  it('con ningún tipo visible devuelve un grafo vacío', () => {
    const filtered = filterGraphByType(makeGraph(), new Set());
    expect(filtered.nodes).toHaveLength(0);
    expect(filtered.edges).toHaveLength(0);
  });
});

describe('computeHighlight', () => {
  it('con selección nula devuelve conjuntos vacíos', () => {
    const result = computeHighlight(makeGraph(), null);
    expect(result.nodeIds.size).toBe(0);
    expect(result.edgeIds.size).toBe(0);
  });

  it('con un id desconocido devuelve conjuntos vacíos', () => {
    const result = computeHighlight(makeGraph(), 'file:no-existe.js');
    expect(result.nodeIds.size).toBe(0);
  });

  it('incluye el nodo seleccionado y sus vecinos directos (salientes y entrantes)', () => {
    const result = computeHighlight(makeGraph(), 'file:a.js');
    // a.js -> b.js (imports), a.js -> route:1 (declares-route), a.js -> environment:PORT (uses-env)
    expect(result.nodeIds).toEqual(new Set(['file:a.js', 'file:b.js', 'route:1', 'environment:PORT']));
    expect(result.edgeIds).toEqual(new Set(['e1', 'e2', 'e3']));
  });
});

describe('connectedEdges', () => {
  it('separa correctamente edges salientes y entrantes de un nodo', () => {
    const { outgoing, incoming } = connectedEdges(makeGraph(), 'file:a.js');
    expect(outgoing.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(incoming).toHaveLength(0);
  });

  it('un nodo destino solo tiene edges entrantes', () => {
    const { outgoing, incoming } = connectedEdges(makeGraph(), 'file:b.js');
    expect(outgoing).toHaveLength(0);
    expect(incoming.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('nodeClassName / edgeClassName', () => {
  it('sin selección no aplica ninguna clase', () => {
    expect(nodeClassName(null, 'file:a.js', false)).toBeUndefined();
    expect(edgeClassName(null, false)).toBeUndefined();
  });

  it('marca el nodo seleccionado con module-node-selected', () => {
    expect(nodeClassName('file:a.js', 'file:a.js', false)).toBe('module-node-selected');
  });

  it('atenúa los nodos/edges no resaltados cuando hay selección', () => {
    expect(nodeClassName('file:a.js', 'file:b.js', false)).toBe('module-node-dim');
    expect(edgeClassName('file:a.js', false)).toBe('graph-edge-dim');
  });

  it('no atenúa los nodos/edges resaltados', () => {
    expect(nodeClassName('file:a.js', 'file:b.js', true)).toBeUndefined();
    expect(edgeClassName('file:a.js', true)).toBeUndefined();
  });
});

describe('edgeSecondaryText', () => {
  it('devuelve el specifier para imports', () => {
    const edge = makeGraph().edges.find((e) => e.type === 'imports')!;
    expect(edgeSecondaryText(edge)).toBe('./b');
  });

  it('devuelve la versión para depends-on', () => {
    const edge = makeGraph().edges.find((e) => e.type === 'depends-on')!;
    expect(edgeSecondaryText(edge)).toBe('^4.0.0');
  });

  it('devuelve undefined para uses-env', () => {
    const edge = makeGraph().edges.find((e) => e.type === 'uses-env')!;
    expect(edgeSecondaryText(edge)).toBeUndefined();
  });
});

describe('nodeDetailRows', () => {
  it('devuelve la ruta para un nodo file', () => {
    expect(nodeDetailRows(fileA)).toEqual([{ label: 'Ruta', value: 'a.js' }]);
  });

  it('devuelve método/ruta/ubicación para un nodo route', () => {
    const rows = nodeDetailRows(routeNode);
    expect(rows).toContainEqual({ label: 'Método', value: 'GET' });
    expect(rows).toContainEqual({ label: 'Ruta', value: '/health' });
  });

  it('devuelve nombre/versión/manifiesto para un nodo package', () => {
    const rows = nodeDetailRows(packageNode);
    expect(rows).toContainEqual({ label: 'Versión', value: '1.0.0' });
  });
});

describe('nodeFileLocation', () => {
  it('un nodo file apunta a su propia ruta, sin línea', () => {
    expect(nodeFileLocation(fileA)).toEqual({ file: 'a.js' });
  });

  it('un nodo route apunta a su archivo y línea de declaración', () => {
    expect(nodeFileLocation(routeNode)).toEqual({ file: 'a.js', line: 3 });
  });

  it('un nodo package apunta a su manifiesto', () => {
    expect(nodeFileLocation(packageNode)).toEqual({ file: 'package.json' });
  });

  it('nodos environment/dependency no tienen ubicación de archivo', () => {
    expect(nodeFileLocation(envNode)).toBeNull();
    expect(nodeFileLocation(depNode)).toBeNull();
  });
});
