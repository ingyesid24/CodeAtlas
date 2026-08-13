import { describe, expect, it } from 'vitest';
import {
  computeHighlight,
  connectedEdges,
  edgeClassName,
  edgeSecondaryText,
  nodeClassName,
  nodeDetailRows,
  nodeFileLocation
} from '../../src/components/graphMapper';
import type { ArchitectureGraph } from '../../src/analyzer/types';

const serverId = 'file:src/server.ts';
const utilsId = 'file:src/utils.ts';
const routeId = 'route:src/server.ts:2:GET:/health';
const envId = 'environment:PORT';
const pkgId = 'package:package.json';
const reactId = 'dependency:react';

function sampleGraph(): ArchitectureGraph {
  return {
    schemaVersion: 1,
    nodes: [
      { id: serverId, type: 'file', label: 'server.ts', path: 'src/server.ts' },
      { id: utilsId, type: 'file', label: 'utils.ts', path: 'src/utils.ts' },
      { id: routeId, type: 'route', label: 'GET /health', method: 'GET', routePath: '/health', location: { file: 'src/server.ts', line: 2 } },
      { id: envId, type: 'environment', label: 'PORT', name: 'PORT' },
      { id: pkgId, type: 'package', label: 'fixture', name: 'fixture', version: '1.0.0', manifestPath: 'package.json' },
      { id: reactId, type: 'dependency', label: 'react', name: 'react' }
    ],
    edges: [
      { id: 'edge:imports:file:src/server.ts:file:src/utils.ts:./utils', type: 'imports', source: serverId, target: utilsId, specifier: './utils', location: { file: 'src/server.ts', line: 1 } },
      { id: 'edge:declares-route:file:src/server.ts:route:src/server.ts:2:GET:/health', type: 'declares-route', source: serverId, target: routeId, location: { file: 'src/server.ts', line: 2 } },
      { id: 'edge:uses-env:file:src/server.ts:environment:PORT', type: 'uses-env', source: serverId, target: envId },
      { id: 'edge:depends-on:package:package.json:dependency:react:runtime', type: 'depends-on', source: pkgId, target: reactId, scope: 'runtime', version: '^18.0.0' }
    ]
  };
}

describe('computeHighlight', () => {
  it('sin selección devuelve conjuntos vacíos', () => {
    const { nodeIds, edgeIds } = computeHighlight(sampleGraph(), null);
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });

  it('con nodo seleccionado incluye vecinos directos en ambos sentidos', () => {
    const graph = sampleGraph();
    const { nodeIds, edgeIds } = computeHighlight(graph, serverId);

    expect(nodeIds).toEqual(new Set([serverId, utilsId, routeId, envId]));
    expect(nodeIds.has(reactId)).toBe(false);
    expect(nodeIds.has(pkgId)).toBe(false);

    expect(edgeIds).toEqual(new Set([
      'edge:imports:file:src/server.ts:file:src/utils.ts:./utils',
      'edge:declares-route:file:src/server.ts:route:src/server.ts:2:GET:/health',
      'edge:uses-env:file:src/server.ts:environment:PORT'
    ]));
  });

  it('detecta vecinos entrantes (quién usa al nodo seleccionado)', () => {
    const graph = sampleGraph();
    const { nodeIds, edgeIds } = computeHighlight(graph, reactId);

    expect(nodeIds).toEqual(new Set([reactId, pkgId]));
    expect(edgeIds).toEqual(new Set(['edge:depends-on:package:package.json:dependency:react:runtime']));
  });

  it('un id desconocido devuelve conjuntos vacíos', () => {
    const { nodeIds, edgeIds } = computeHighlight(sampleGraph(), 'file:no-existe.ts');
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });
});

describe('nodeClassName / edgeClassName', () => {
  it('sin selección nada se atenúa ni se marca', () => {
    expect(nodeClassName(null, serverId, false)).toBeUndefined();
    expect(nodeClassName(null, serverId, true)).toBeUndefined();
    expect(edgeClassName(null, false)).toBeUndefined();
    expect(edgeClassName(null, true)).toBeUndefined();
  });

  it('con selección marca el nodo elegido y atenúa solo lo no relacionado', () => {
    const graph = sampleGraph();
    const { nodeIds, edgeIds } = computeHighlight(graph, serverId);

    expect(nodeClassName(serverId, serverId, nodeIds.has(serverId))).toBe('module-node-selected');
    expect(nodeClassName(serverId, utilsId, nodeIds.has(utilsId))).toBeUndefined();
    expect(nodeClassName(serverId, reactId, nodeIds.has(reactId))).toBe('module-node-dim');

    expect(edgeClassName(serverId, edgeIds.has('edge:uses-env:file:src/server.ts:environment:PORT'))).toBeUndefined();
    expect(edgeClassName(serverId, edgeIds.has('edge:depends-on:package:package.json:dependency:react:runtime'))).toBe('graph-edge-dim');
  });
});

describe('connectedEdges', () => {
  it('separa aristas salientes y entrantes', () => {
    const graph = sampleGraph();
    const { outgoing, incoming } = connectedEdges(graph, serverId);

    expect(outgoing.map((edge) => edge.target).sort()).toEqual([envId, routeId, utilsId].sort());
    expect(incoming).toEqual([]);

    const reactIncoming = connectedEdges(graph, reactId);
    expect(reactIncoming.incoming.map((edge) => edge.source)).toEqual([pkgId]);
  });
});

describe('edgeSecondaryText', () => {
  const importsEdge = sampleGraph().edges.find((edge) => edge.type === 'imports')!;
  const dependsEdge = sampleGraph().edges.find((edge) => edge.type === 'depends-on')!;
  const routeEdge = sampleGraph().edges.find((edge) => edge.type === 'declares-route')!;
  const envEdge = sampleGraph().edges.find((edge) => edge.type === 'uses-env')!;

  it('usa specifier, versión o ubicación según el tipo de arista', () => {
    expect(edgeSecondaryText(importsEdge)).toBe('./utils');
    expect(edgeSecondaryText(dependsEdge)).toBe('^18.0.0');
    expect(edgeSecondaryText(routeEdge)).toBe('src/server.ts:2');
    expect(edgeSecondaryText(envEdge)).toBeUndefined();
  });
});

describe('nodeDetailRows', () => {
  it('describe cada tipo de nodo con sus campos', () => {
    const graph = sampleGraph();

    expect(nodeDetailRows(graph.nodes.find((node) => node.id === serverId)!)).toEqual([
      { label: 'Ruta', value: 'src/server.ts' }
    ]);

    expect(nodeDetailRows(graph.nodes.find((node) => node.id === routeId)!)).toEqual([
      { label: 'Método', value: 'GET' },
      { label: 'Ruta', value: '/health' },
      { label: 'Declarada en', value: 'src/server.ts:2' }
    ]);

    expect(nodeDetailRows(graph.nodes.find((node) => node.id === pkgId)!)).toEqual([
      { label: 'Nombre', value: 'fixture' },
      { label: 'Versión', value: '1.0.0' },
      { label: 'Manifiesto', value: 'package.json' }
    ]);

    expect(nodeDetailRows(graph.nodes.find((node) => node.id === envId)!)).toEqual([
      { label: 'Nombre', value: 'PORT' }
    ]);

    expect(nodeDetailRows(graph.nodes.find((node) => node.id === reactId)!)).toEqual([
      { label: 'Nombre', value: 'react' }
    ]);
  });
});

describe('nodeFileLocation', () => {
  it('expone el archivo editable de archivos, rutas y paquetes', () => {
    const graph = sampleGraph();

    expect(nodeFileLocation(graph.nodes.find((node) => node.id === serverId)!)).toEqual({
      file: 'src/server.ts'
    });

    expect(nodeFileLocation(graph.nodes.find((node) => node.id === routeId)!)).toEqual({
      file: 'src/server.ts',
      line: 2
    });

    expect(nodeFileLocation(graph.nodes.find((node) => node.id === pkgId)!)).toEqual({
      file: 'package.json'
    });
  });

  it('variables y dependencias no tienen un archivo único', () => {
    const graph = sampleGraph();
    expect(nodeFileLocation(graph.nodes.find((node) => node.id === envId)!)).toBeNull();
    expect(nodeFileLocation(graph.nodes.find((node) => node.id === reactId)!)).toBeNull();
  });
});
