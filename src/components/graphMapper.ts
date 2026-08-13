import dagre from 'dagre';
import type { Edge, MarkerType, Node } from 'reactflow';
import type { ArchitectureGraph, GraphEdge, GraphNode } from '../analyzer/types';

export interface ModuleNodeData {
  label: string;
  nodeType: GraphNode['type'];
  detail?: string;
}

export type FlowNode = Node<ModuleNodeData>;
export type FlowEdge = Edge;

const NODE_COLORS: Record<GraphNode['type'], string> = {
  file: '#4FB6A8',
  route: '#C9A15A',
  environment: '#D97757',
  package: '#EDE6D6',
  dependency: '#8A96A8'
};
export function filterGraphByType(
  graph: ArchitectureGraph,
  visibleTypes: Set<GraphNode['type']>
): ArchitectureGraph {
  const nodes = graph.nodes.filter((node) => visibleTypes.has(node.type));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );
    return { schemaVersion: graph.schemaVersion, nodes, edges };
}

const EDGE_COLORS: Record<GraphEdge['type'], string> = {
  'declares-route': '#C9A15A',
  'uses-env': '#D97757',
  'depends-on': '#EDE6D6',
  imports: '#4FB6A8'
};

export function nodeColor(nodeType: GraphNode['type']): string {
  return NODE_COLORS[nodeType];
}

export function edgeColor(edgeType: GraphEdge['type']): string {
  return EDGE_COLORS[edgeType];
}

function nodeDetail(node: GraphNode): string | undefined {
  switch (node.type) {
    case 'file':
      return node.path;
    case 'route':
      return `${node.location.file}${node.location.line ? `:${node.location.line}` : ''}`;
    case 'package':
      return node.version ?? node.manifestPath;
    default:
      return undefined;
  }
}

// Debe reflejar el tamaño real renderizado de .module-node (ver App.css).
// Si cambias el CSS de esa clase, ajusta estos valores o el layout volverá
// a solaparse — dagre necesita saber cuánto espacio ocupa cada nodo.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

/**
 * Layout real basado en el grafo: usa dagre para posicionar los nodos
 * según sus conexiones (imports, depends-on, etc.), no según su tipo.
 * Los nodos sin conexiones también se posicionan (dagre los trata como
 * componentes propios), pero se acomodan igual sin solaparse.
 */
function layoutWithDagre(graph: ArchitectureGraph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',   // izquierda -> derecha: se lee como flujo de dependencias
    nodesep: 36,      // separación entre nodos del mismo rango (vertical en LR)
    ranksep: 140,     // separación entre rangos (horizontal en LR)
    marginx: 40,
    marginy: 40
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    // dagre no soporta bien aristas duplicadas entre el mismo par; con un
    // grafo de este tamaño no afecta el resultado visual.
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    const pos = g.node(node.id);
    if (!pos) continue;
    // dagre da coordenadas del centro; React Flow espera la esquina superior izquierda.
    positions.set(node.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  }
  return positions;
}

export function buildFlowGraph(graph: ArchitectureGraph): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const positions = layoutWithDagre(graph);

  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'module',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      label: node.label,
      nodeType: node.type,
      detail: nodeDetail(node)
    }
  }));

  const edges: FlowEdge[] = graph.edges.map((edge) => {
    const color = edgeColor(edge.type);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'default',
      markerEnd: { type: 'arrowclosed' as MarkerType, width: 14, height: 14, color },
      style: { stroke: color, strokeWidth: 1.4 },
      data: { edgeType: edge.type }
    };
  });

  return { nodes, edges };
}

export interface HighlightResult {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Clase de un nodo según la selección: sin selección nada se atenúa;
 * con selección, el nodo elegido se marca y el resto se oscurece salvo
 * los vecinos resaltados.
 */
export function nodeClassName(
  selectedId: string | null,
  nodeId: string,
  highlighted: boolean
): string | undefined {
  if (selectedId === null) return undefined;
  if (nodeId === selectedId) return 'module-node-selected';
  return highlighted ? undefined : 'module-node-dim';
}

export function edgeClassName(selectedId: string | null, highlighted: boolean): string | undefined {
  return selectedId === null ? undefined : highlighted ? undefined : 'graph-edge-dim';
}

/**
 * Nodos y aristas visibles al seleccionar un nodo: el propio nodo, sus
 * vecinos directos (entrantes y salientes) y las aristas que los conectan.
 * Con selección nula o id desconocido devuelve conjuntos vacíos.
 */
export function computeHighlight(
  graph: ArchitectureGraph,
  selectedId: string | null
): HighlightResult {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!selectedId || !graph.nodes.some((node) => node.id === selectedId)) {
    return { nodeIds, edgeIds };
  }

  nodeIds.add(selectedId);
  for (const edge of graph.edges) {
    if (edge.source === selectedId) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.target);
    } else if (edge.target === selectedId) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
    }
  }
  return { nodeIds, edgeIds };
}

export function connectedEdges(
  graph: ArchitectureGraph,
  nodeId: string
): { outgoing: GraphEdge[]; incoming: GraphEdge[] } {
  const outgoing: GraphEdge[] = [];
  const incoming: GraphEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.source === nodeId) outgoing.push(edge);
    else if (edge.target === nodeId) incoming.push(edge);
  }
  return { outgoing, incoming };
}

/** Texto secundario de una arista según su tipo (specifier, versión o ubicación). */
export function edgeSecondaryText(edge: GraphEdge): string | undefined {
  switch (edge.type) {
    case 'imports':
      return edge.specifier;
    case 'depends-on':
      return edge.version;
    case 'declares-route':
      return edge.location
        ? `${edge.location.file}${edge.location.line ? `:${edge.location.line}` : ''}`
        : undefined;
    default:
      return undefined;
  }
}

/** Campos informativos de un nodo según su tipo, para el panel de detalles. */
export function nodeDetailRows(node: GraphNode): Array<{ label: string; value: string }> {
  switch (node.type) {
    case 'file':
      return [{ label: 'Ruta', value: node.path }];
    case 'route':
      return [
        { label: 'Método', value: node.method },
        { label: 'Ruta', value: node.routePath },
        {
          label: 'Declarada en',
          value: `${node.location.file}${node.location.line ? `:${node.location.line}` : ''}`
        }
      ];
    case 'environment':
      return [{ label: 'Nombre', value: node.name }];
    case 'package':
      return [
        { label: 'Nombre', value: node.name },
        { label: 'Versión', value: node.version ?? '?' },
        { label: 'Manifiesto', value: node.manifestPath }
      ];
    case 'dependency':
      return [{ label: 'Nombre', value: node.name }];
  }
}

/** Archivo (y línea opcional) que un nodo representa, para abrirlo en el editor. */
export function nodeFileLocation(
  node: GraphNode
): { file: string; line?: number } | null {
  switch (node.type) {
    case 'file':
      return { file: node.path };
    case 'route':
      return { file: node.location.file, line: node.location.line };
    case 'package':
      return { file: node.manifestPath };
    default:
      return null;
  }
}