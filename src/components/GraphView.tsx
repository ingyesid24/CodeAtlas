import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { ArchitectureGraph, GraphNode } from '../analyzer/types';
import {
  buildFlowGraph,
  computeHighlight,
  connectedEdges,
  edgeClassName,
  edgeSecondaryText,
  filterGraphByType,
  nodeClassName,
  nodeColor,
  nodeDetailRows,
  nodeFileLocation,
  type ModuleNodeData
} from './graphMapper';
import { EDGE_TYPE_LABELS, NODE_TYPE_LABELS } from './graphLabels';

const nodeTypes = { module: ModuleNode };

// Tipos ocultos por defecto: 'dependency' suele ser el más numeroso
// (una entrada por cada paquete de package.json) y el menos útil para
// entender la arquitectura del proyecto a primera vista.
const DEFAULT_HIDDEN_TYPES: GraphNode['type'][] = ['dependency'];
const ALL_NODE_TYPES: GraphNode['type'][] = ['file', 'route', 'environment', 'package', 'dependency'];

function ModuleNode({ data }: NodeProps<ModuleNodeData>) {
  return (
    <div className="module-node" style={{ borderLeft: `3px solid ${nodeColor(data.nodeType)}` }}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--line)' }} />
      <span className="module-node-chip" style={{ background: nodeColor(data.nodeType) }}>{data.nodeType}</span>
      <div className="module-node-label" title={data.label}>{data.label}</div>
      {data.detail && <div className="module-node-detail" title={data.detail}>{data.detail}</div>}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--line)' }} />
    </div>
  );
}

function miniMapColor(node: Node): string {
  return nodeColor((node.data as ModuleNodeData).nodeType);
}

export interface OpenFileAction {
  label: string;
  onOpen: (file: string, line?: number) => void;
}

function TypeToggleBar({
  graph,
  visibleTypes,
  onToggle
}: {
  graph: ArchitectureGraph;
  visibleTypes: Set<GraphNode['type']>;
  onToggle: (type: GraphNode['type']) => void;
}) {
  const counts = new Map<GraphNode['type'], number>();
  for (const node of graph.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }

  return (
    <div className="type-toggle-bar">
      {ALL_NODE_TYPES.filter((type) => (counts.get(type) ?? 0) > 0).map((type) => {
        const active = visibleTypes.has(type);
        return (
          <button
            key={type}
            className={`type-toggle-chip${active ? ' active' : ''}`}
            style={active ? { borderColor: nodeColor(type) } : undefined}
            onClick={() => onToggle(type)}
            title={active ? `Ocultar ${NODE_TYPE_LABELS[type]}` : `Mostrar ${NODE_TYPE_LABELS[type]}`}
          >
            <span className="type-toggle-dot" style={{ background: nodeColor(type), opacity: active ? 1 : 0.35 }} />
            {NODE_TYPE_LABELS[type]}
            <span className="type-toggle-count">{counts.get(type)}</span>
          </button>
        );
      })}
    </div>
  );
}

function NodeDetails({
  graph,
  nodeId,
  onSelect,
  openAction
}: {
  graph: ArchitectureGraph;
  nodeId: string;
  onSelect: (id: string | null) => void;
  openAction?: OpenFileAction;
}) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;

  const { outgoing, incoming } = connectedEdges(graph, nodeId);
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const location = nodeFileLocation(node);

  return (
    <div className="node-details">
      <div className="node-details-head">
        <span className="module-node-chip" style={{ background: nodeColor(node.type) }}>
          {NODE_TYPE_LABELS[node.type]}
        </span>
        <button className="node-details-close" onClick={() => onSelect(null)}>✕</button>
      </div>
      <h3 className="node-details-title" title={node.label}>{node.label}</h3>

      {location && openAction && (
        <button
          className="node-details-open"
          onClick={() => openAction.onOpen(location.file, location.line)}
        >
          Abrir en {openAction.label}
        </button>
      )}

      <dl className="node-details-rows">
        {nodeDetailRows(node).map((row) => (
          <div key={row.label} className="node-details-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="node-details-list">
        <h4>Depende de · {outgoing.length}</h4>
        {outgoing.length === 0 && <p className="muted">No depende de ningún módulo.</p>}
        {outgoing.map((edge) => {
          const secondary = edgeSecondaryText(edge);
          return (
            <button key={edge.id} className="node-details-link" onClick={() => onSelect(edge.target)}>
              <span className="node-details-link-label">{nodesById.get(edge.target)?.label ?? edge.target}</span>
              <span className="node-details-link-meta">
                {EDGE_TYPE_LABELS[edge.type]}{secondary ? ` · ${secondary}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="node-details-list">
        <h4>Usado por · {incoming.length}</h4>
        {incoming.length === 0 && <p className="muted">Ningún módulo lo usa.</p>}
        {incoming.map((edge) => (
          <button key={edge.id} className="node-details-link" onClick={() => onSelect(edge.source)}>
            <span className="node-details-link-label">{nodesById.get(edge.source)?.label ?? edge.source}</span>
            <span className="node-details-link-meta">{EDGE_TYPE_LABELS[edge.type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MapSection({ graph, openAction }: { graph: ArchitectureGraph; openAction?: OpenFileAction }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphNode['type']>>(
    () => new Set(ALL_NODE_TYPES.filter((type) => !DEFAULT_HIDDEN_TYPES.includes(type)))
  );

  const filteredGraph = useMemo(() => filterGraphByType(graph, visibleTypes), [graph, visibleTypes]);
  const initial = useMemo(() => buildFlowGraph(filteredGraph), [filteredGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // El layout cambia cuando cambia el grafo filtrado (toggle de tipos):
  // hay que reemplazar nodes/edges, no solo re-decorarlos.
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGraph]);

  useEffect(() => {
    const highlight = computeHighlight(filteredGraph, selectedId);
    setNodes((current) => current.map((node) => ({
      ...node,
      selected: node.id === selectedId,
      className: nodeClassName(selectedId, node.id, highlight.nodeIds.has(node.id))
    })));
    setEdges((current) => current.map((edge) => ({
      ...edge,
      className: edgeClassName(selectedId, highlight.edgeIds.has(edge.id)),
      animated: highlight.edgeIds.has(edge.id)
    })));
  }, [filteredGraph, selectedId, setNodes, setEdges]);

  function toggleType(type: GraphNode['type']) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleSelect(id: string | null) {
    // Si se selecciona (p.ej. desde el panel de detalles) un nodo cuyo tipo
    // está oculto, lo mostramos para que aparezca resaltado en el lienzo.
    if (id) {
      const target = graph.nodes.find((node) => node.id === id);
      if (target && !visibleTypes.has(target.type)) {
        setVisibleTypes((current) => new Set(current).add(target.type));
      }
    }
    setSelectedId(id);
  }

  function handleDoubleClick(nodeId: string) {
    if (!openAction) return;
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const location = nodeFileLocation(node);
    if (location) openAction.onOpen(location.file, location.line);
  }

  if (graph.nodes.length === 0) {
    return <p className="muted">No hay nodos para graficar.</p>;
  }

  return (
    <div className="graph-map-layout">
      <aside className="graph-map-side">
        {selectedId ? (
          <NodeDetails graph={graph} nodeId={selectedId} onSelect={handleSelect} openAction={openAction} />
        ) : (
          <p className="graph-map-hint">
            Haz clic en un nodo para ver sus dependencias y qué módulos lo usan. Clic en el lienzo para limpiar la selección. Doble clic para abrir el archivo en tu editor.
          </p>
        )}
      </aside>
      <div className="graph-map-main">
        <TypeToggleBar graph={graph} visibleTypes={visibleTypes} onToggle={toggleType} />
        {initial.nodes.length === 0 ? (
          <p className="muted graph-map-empty-filter">
            Ningún tipo de nodo visible. Activa alguno arriba para ver el mapa.
          </p>
        ) : (
          <div className="graph-map">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_event, node) => handleSelect(node.id)}
              onNodeDoubleClick={(_event, node) => handleDoubleClick(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              minZoom={0.05}
              maxZoom={2}
              nodesConnectable={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#2A3D5C" />
              <Controls />
              <MiniMap nodeColor={miniMapColor} />
            </ReactFlow>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GraphView({
  graph,
  openAction
}: {
  graph: ArchitectureGraph;
  openAction?: OpenFileAction;
}) {
  return (
    <ReactFlowProvider>
      <MapSection graph={graph} openAction={openAction} />
    </ReactFlowProvider>
  );
}
