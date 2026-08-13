import { describe, it, expect } from 'vitest';
import { buildArchitectureGraph, createFileNodeId, normalizeGraphPath } from '../../src/analyzer/graph';
import type {
  EnvVarUsage,
  FileNode,
  ImportInfo,
  PackageInfo,
  RouteInfo
} from '../../src/analyzer/types';

// Árbol mínimo reutilizado por varios tests: backend/index.js, backend/auth.js, frontend/app.js
const tree: FileNode = {
  name: 'root',
  path: '.',
  type: 'dir',
  children: [
    {
      name: 'backend',
      path: 'backend',
      type: 'dir',
      children: [
        { name: 'index.js', path: 'backend/index.js', type: 'file' },
        { name: 'auth.js', path: 'backend/auth.js', type: 'file' }
      ]
    },
    {
      name: 'frontend',
      path: 'frontend',
      type: 'dir',
      children: [{ name: 'app.js', path: 'frontend/app.js', type: 'file' }]
    }
  ]
};

function emptyInput(overrides: Partial<{
  tree: FileNode;
  packages: PackageInfo[];
  envVars: EnvVarUsage[];
  routes: RouteInfo[];
  imports: ImportInfo[];
}> = {}) {
  return {
    tree,
    packages: [],
    envVars: [],
    routes: [],
    imports: [],
    ...overrides
  };
}

describe('normalizeGraphPath / createFileNodeId', () => {
  it('normaliza separadores de Windows a /', () => {
    expect(normalizeGraphPath('backend\\routes\\auth.js')).toBe('backend/routes/auth.js');
  });

  it('elimina el prefijo ./', () => {
    expect(normalizeGraphPath('./backend/index.js')).toBe('backend/index.js');
  });

  it('genera el mismo id para rutas equivalentes en distinto formato', () => {
    expect(createFileNodeId('backend/index.js')).toBe(createFileNodeId('./backend\\index.js'));
  });
});

describe('buildArchitectureGraph — archivos', () => {
  it('crea un nodo de tipo file por cada archivo del árbol', () => {
    const graph = buildArchitectureGraph(emptyInput());
    const fileNodes = graph.nodes.filter((n) => n.type === 'file');

    expect(fileNodes).toHaveLength(3);
    expect(fileNodes.map((n) => (n as any).path).sort()).toEqual([
      'backend/auth.js',
      'backend/index.js',
      'frontend/app.js'
    ]);
  });

  it('devuelve schemaVersion 1 y arrays vacíos con un árbol sin archivos ni datos', () => {
    const graph = buildArchitectureGraph(
      emptyInput({ tree: { name: 'root', path: '.', type: 'dir', children: [] } })
    );

    expect(graph.schemaVersion).toBe(1);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

describe('buildArchitectureGraph — packages y dependencias', () => {
  it('crea un nodo package y nodos/edges depends-on por cada dependencia', () => {
    const packages: PackageInfo[] = [
      {
        path: 'package.json',
        name: 'demo',
        version: '1.0.0',
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0' }
      }
    ];

    const graph = buildArchitectureGraph(emptyInput({ packages }));

    const packageNode = graph.nodes.find((n) => n.type === 'package');
    expect(packageNode).toBeDefined();
    expect((packageNode as any).name).toBe('demo');

    const dependsOnEdges = graph.edges.filter((e) => e.type === 'depends-on');
    expect(dependsOnEdges).toHaveLength(2);

    const runtimeEdge = dependsOnEdges.find((e) => (e as any).scope === 'runtime');
    const devEdge = dependsOnEdges.find((e) => (e as any).scope === 'development');
    expect((runtimeEdge as any).version).toBe('^18.0.0');
    expect((devEdge as any).version).toBe('^1.0.0');

    const dependencyNodes = graph.nodes.filter((n) => n.type === 'dependency');
    expect(dependencyNodes.map((n) => (n as any).name).sort()).toEqual(['react', 'vitest']);
  });

  it('usa el nombre del manifiesto como label si el package.json no tiene "name"', () => {
    const packages: PackageInfo[] = [{ path: 'backend/package.json' }];
    const graph = buildArchitectureGraph(emptyInput({ packages }));
    const packageNode = graph.nodes.find((n) => n.type === 'package');

    expect(packageNode?.label).toBe('backend/package.json');
  });
});

describe('buildArchitectureGraph — variables de entorno', () => {
  it('crea un nodo environment y una edge uses-env por archivo que la usa', () => {
    const envVars: EnvVarUsage[] = [
      { name: 'DATABASE_URL', files: ['backend/index.js', 'backend/auth.js'] }
    ];

    const graph = buildArchitectureGraph(emptyInput({ envVars }));

    const envNode = graph.nodes.find((n) => n.type === 'environment');
    expect(envNode).toBeDefined();
    expect((envNode as any).name).toBe('DATABASE_URL');

    const usesEnvEdges = graph.edges.filter((e) => e.type === 'uses-env');
    expect(usesEnvEdges).toHaveLength(2);
  });

  it('crea el nodo file correspondiente aunque no estuviera en el árbol original', () => {
    const envVars: EnvVarUsage[] = [{ name: 'PORT', files: ['scripts/deploy.sh'] }];
    const graph = buildArchitectureGraph(emptyInput({ envVars }));

    const fileNode = graph.nodes.find(
      (n) => n.type === 'file' && (n as any).path === 'scripts/deploy.sh'
    );
    expect(fileNode).toBeDefined();
  });
});

describe('buildArchitectureGraph — rutas', () => {
  it('crea un nodo route con label "MÉTODO /ruta" y una edge declares-route', () => {
    const routes: RouteInfo[] = [
      { method: 'POST', path: '/login', file: 'backend/auth.js', line: 12 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ routes }));

    const routeNode = graph.nodes.find((n) => n.type === 'route');
    expect(routeNode?.label).toBe('POST /login');
    expect((routeNode as any).location).toEqual({ file: 'backend/auth.js', line: 12 });

    const declaresEdge = graph.edges.find((e) => e.type === 'declares-route');
    expect(declaresEdge).toBeDefined();
    expect(declaresEdge?.source).toBe(createFileNodeId('backend/auth.js'));
    expect(declaresEdge?.target).toBe(routeNode?.id);
  });

  it('genera ids distintos para dos rutas con el mismo método y archivo pero distinta línea', () => {
    const routes: RouteInfo[] = [
      { method: 'GET', path: '/a', file: 'backend/index.js', line: 5 },
      { method: 'GET', path: '/a', file: 'backend/index.js', line: 9 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ routes }));
    const routeIds = graph.nodes.filter((n) => n.type === 'route').map((n) => n.id);

    expect(new Set(routeIds).size).toBe(2);
  });
});

describe('buildArchitectureGraph — imports', () => {
  it('crea una edge "imports" entre dos archivos cuando el import es local', () => {
    const imports: ImportInfo[] = [
      { file: 'backend/index.js', target: 'backend/auth.js', specifier: './auth', line: 1 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ imports }));
    const importEdge = graph.edges.find((e) => e.type === 'imports');

    expect(importEdge).toBeDefined();
    expect(importEdge?.source).toBe(createFileNodeId('backend/index.js'));
    expect(importEdge?.target).toBe(createFileNodeId('backend/auth.js'));
  });

  it('conecta un import externo con el nodo dependency si coincide con una dependencia declarada', () => {
    const packages: PackageInfo[] = [
      { path: 'package.json', name: 'demo', dependencies: { express: '^4.0.0' } }
    ];
    const imports: ImportInfo[] = [
      { file: 'backend/index.js', specifier: 'express', line: 1 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ packages, imports }));
    const importEdge = graph.edges.find((e) => e.type === 'imports');

    expect(importEdge).toBeDefined();
    expect(importEdge?.target).toBe(graph.nodes.find((n) => n.type === 'dependency')?.id);
  });

  it('no crea edge para un import externo que no coincide con ninguna dependencia declarada', () => {
    const imports: ImportInfo[] = [{ file: 'backend/index.js', specifier: 'left-pad', line: 3 }];

    const graph = buildArchitectureGraph(emptyInput({ imports }));

    expect(graph.edges.filter((e) => e.type === 'imports')).toHaveLength(0);
  });

  it('ignora un import que apunta al mismo archivo (self-import)', () => {
    const imports: ImportInfo[] = [
      { file: 'backend/index.js', target: 'backend/index.js', specifier: './index', line: 1 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ imports }));

    expect(graph.edges.filter((e) => e.type === 'imports')).toHaveLength(0);
  });
});

describe('buildArchitectureGraph — deduplicación y orden', () => {
  it('no duplica un nodo ni una edge si se generan dos veces con el mismo id', () => {
    const envVars: EnvVarUsage[] = [
      { name: 'API_KEY', files: ['backend/index.js'] },
      { name: 'API_KEY', files: ['backend/index.js'] } // mismo nombre repetido a propósito
    ];

    const graph = buildArchitectureGraph(emptyInput({ envVars }));

    expect(graph.nodes.filter((n) => n.type === 'environment')).toHaveLength(1);
    expect(graph.edges.filter((e) => e.type === 'uses-env')).toHaveLength(1);
  });

  it('devuelve nodes y edges ordenados alfabéticamente por id', () => {
    const routes: RouteInfo[] = [
      { method: 'GET', path: '/z', file: 'frontend/app.js', line: 1 },
      { method: 'GET', path: '/a', file: 'backend/index.js', line: 1 }
    ];

    const graph = buildArchitectureGraph(emptyInput({ routes }));
    const ids = graph.nodes.map((n) => n.id);
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));

    expect(ids).toEqual(sortedIds);
  });
});
