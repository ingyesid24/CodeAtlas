import type {
  ArchitectureGraph,
  DependencyGraphNode,
  DependencyScope,
  EnvVarUsage,
  FileGraphNode,
  FileNode,
  GraphEdge,
  GraphNode,
  ImportInfo,
  PackageInfo,
  RouteInfo
} from './types';

interface GraphInput {
  tree: FileNode;
  packages: PackageInfo[];
  envVars: EnvVarUsage[];
  routes: RouteInfo[];
  imports?: ImportInfo[];
}

export function normalizeGraphPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function createId(type: string, ...parts: Array<string | number>): string {
  return [type, ...parts.map((part) => encodeURIComponent(String(part)))].join(':');
}

export function createFileNodeId(filePath: string): string {
  return createId('file', normalizeGraphPath(filePath));
}

function fileName(filePath: string): string {
  const parts = normalizeGraphPath(filePath).split('/');
  return parts[parts.length - 1] || filePath;
}

export function buildArchitectureGraph(input: GraphInput): ArchitectureGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  function addNode(node: GraphNode): void {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }

  function addEdge(edge: GraphEdge): void {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  }

  function ensureFileNode(filePath: string): string {
    const normalizedPath = normalizeGraphPath(filePath);
    const id = createFileNodeId(normalizedPath);
    const node: FileGraphNode = {
      id,
      type: 'file',
      label: fileName(normalizedPath),
      path: normalizedPath
    };
    addNode(node);
    return id;
  }

  function addFiles(node: FileNode): void {
    if (node.type === 'file') {
      ensureFileNode(node.path);
      return;
    }

    for (const child of node.children ?? []) addFiles(child);
  }

  function addDependencies(
    packageId: string,
    dependencies: Record<string, string> | undefined,
    scope: DependencyScope
  ): void {
    for (const [name, version] of Object.entries(dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const dependencyId = createId('dependency', name);
      const dependencyNode: DependencyGraphNode = {
        id: dependencyId,
        type: 'dependency',
        label: name,
        name
      };
      addNode(dependencyNode);

      const edgeId = createId('edge', 'depends-on', packageId, dependencyId, scope);
      addEdge({
        id: edgeId,
        type: 'depends-on',
        source: packageId,
        target: dependencyId,
        scope,
        version
      });
    }
  }

  addFiles(input.tree);

  for (const pkg of input.packages) {
    const manifestPath = normalizeGraphPath(pkg.path);
    const packageId = createId('package', manifestPath);
    const packageName = pkg.name ?? manifestPath;
    addNode({
      id: packageId,
      type: 'package',
      label: packageName,
      name: packageName,
      version: pkg.version,
      manifestPath
    });
    addDependencies(packageId, pkg.dependencies, 'runtime');
    addDependencies(packageId, pkg.devDependencies, 'development');
  }

  for (const envVar of input.envVars) {
    const environmentId = createId('environment', envVar.name);
    addNode({
      id: environmentId,
      type: 'environment',
      label: envVar.name,
      name: envVar.name
    });

    for (const file of envVar.files) {
      const fileId = ensureFileNode(file);
      const edgeId = createId('edge', 'uses-env', fileId, environmentId);
      addEdge({
        id: edgeId,
        type: 'uses-env',
        source: fileId,
        target: environmentId
      });
    }
  }

  for (const route of input.routes) {
    const normalizedFile = normalizeGraphPath(route.file);
    const fileId = ensureFileNode(normalizedFile);
    const routeId = createId('route', normalizedFile, route.line, route.method, route.path);
    const location = { file: normalizedFile, line: route.line };
    addNode({
      id: routeId,
      type: 'route',
      label: `${route.method} ${route.path}`,
      method: route.method,
      routePath: route.path,
      location
    });

    const edgeId = createId('edge', 'declares-route', fileId, routeId);
    addEdge({
      id: edgeId,
      type: 'declares-route',
      source: fileId,
      target: routeId,
      location
    });
  }

  for (const imp of input.imports ?? []) {
    const sourceId = ensureFileNode(imp.file);

    let targetId: string | undefined;
    if (imp.target) {
      targetId = ensureFileNode(imp.target);
    } else {
      const dependencyId = createId('dependency', imp.specifier);
      if (nodes.has(dependencyId)) targetId = dependencyId;
    }
    if (!targetId || targetId === sourceId) continue;

    const edgeId = createId('edge', 'imports', sourceId, targetId, imp.specifier);
    addEdge({
      id: edgeId,
      type: 'imports',
      source: sourceId,
      target: targetId,
      specifier: imp.specifier,
      location: { file: normalizeGraphPath(imp.file), line: imp.line }
    });
  }

  return {
    schemaVersion: 1,
    nodes: Array.from(nodes.values()).sort((a, b) => a.id.localeCompare(b.id)),
    edges: Array.from(edges.values()).sort((a, b) => a.id.localeCompare(b.id))
  };
}
