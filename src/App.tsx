import { useEffect, useState } from 'react';
import type { AnalysisProgress, AnalysisResult, ArchitectureGraph, GraphEdge, GraphNode, RouteInfo } from './analyzer/types';
import type { DetectedEditor } from '../electron/preload';
import TreeView from './components/TreeView';
import GraphView from './components/GraphView';
import { EDGE_TYPE_LABELS } from './components/graphLabels';
import pkg from '../package.json';

type Status = 'idle' | 'scanning' | 'done' | 'error';

const EDITOR_STORAGE_KEY = 'codeatlas.preferred-editor';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const [editorId, setEditorId] = useState<string>('');
  const [openError, setOpenError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    window.codeatlas.detectEditors().then((response) => {
      if (!response.ok || cancelled) return;
      setEditors(response.editors);
      const saved = localStorage.getItem(EDITOR_STORAGE_KEY);
      const preferred =
        response.editors.find((editor) => editor.id === saved) ?? response.editors[0];
      if (preferred) setEditorId(preferred.id);
    });
    return () => { cancelled = true; };
  }, []);

  const editorName = editors.find((editor) => editor.id === editorId)?.name;

  async function handleOpenFile(file: string, line?: number) {
    if (!result || !editorId) return;
    setOpenError('');
    const response = await window.codeatlas.openInEditor({
      editorId,
      rootPath: result.rootPath,
      file,
      line
    });
    if (!response.ok) setOpenError(response.error);
  }

  async function handleSelectFolder() {
    try {
      const selection = await window.codeatlas.selectFolder();
      if (!selection.ok) {
        setErrorMsg(selection.error);
        setStatus('error');
        return;
      }
      if (!selection.path) return;

      setStatus('scanning');
      setErrorMsg('');
      setResult(null);
      setProgress(null);

      const response = await window.codeatlas.analyzeProject(selection.path, setProgress);

      if (response.ok) {
        setResult(response.data);
        setStatus('done');
      } else {
        setErrorMsg(response.error);
        setStatus('error');
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo comunicar con Electron.');
      setStatus('error');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="eyebrow">CodeAtlas · v{pkg.version}</div>
        <h1>Understand any codebase in minutes.</h1>
        <button className="primary-btn" onClick={handleSelectFolder} disabled={status === 'scanning'}>
          {status === 'scanning' ? 'Escaneando…' : 'Seleccionar proyecto'}
        </button>
      </header>

      {status === 'scanning' && (
        <div className="progress-panel">
          <div className="progress-message">
            {progress ? progress.message : 'Preparando análisis…'}
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}>
            <div
              className="progress-fill"
              style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }}
            />
          </div>
          <div className="progress-percent muted">
            {Math.round((progress?.fraction ?? 0) * 100)}%
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="panel error-panel">
          <strong>Error al analizar el proyecto:</strong> {errorMsg}
        </div>
      )}

      {status === 'idle' && (
        <div className="empty-state">
          Selecciona la carpeta raíz de un proyecto para generar su mapa.
        </div>
      )}

      {result && (
        <div className="results">
          <div className="results-summary">
            <span><strong>{result.fileCount}</strong> archivos</span>
            <span><strong>{result.dirCount}</strong> carpetas</span>
            <span><strong>{result.packages.length}</strong> package.json</span>
            <span><strong>{result.envVars.length}</strong> variables de entorno</span>
            <span><strong>{result.routes.length}</strong> rutas</span>
            <span><strong>{result.graph.nodes.length}</strong> nodos</span>
            <span><strong>{result.graph.edges.length}</strong> relaciones</span>
          </div>

          <GraphOverview graph={result.graph} />

          <section className="panel graph-map-panel">
            <div className="graph-map-head">
              <div>
                <h2>Mapa de módulos</h2>
                <p className="muted">Navega con el ratón: arrastra para moverte, rueda para zoom. Selecciona un nodo para ver sus dependencias.</p>
              </div>
              {editors.length > 0 && (
                <div className="editor-selector">
                  <label htmlFor="editor-select">Abrir con</label>
                  <select
                    id="editor-select"
                    value={editorId}
                    onChange={(event) => {
                      setEditorId(event.target.value);
                      localStorage.setItem(EDITOR_STORAGE_KEY, event.target.value);
                    }}
                  >
                    {editors.map((editor) => (
                      <option key={editor.id} value={editor.id}>{editor.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {openError && <p className="open-error">{openError}</p>}
            <GraphView
              key={result.scannedAt}
              graph={result.graph}
              openAction={editorName ? {
                label: editorName,
                onOpen: handleOpenFile
              } : undefined}
            />
          </section>

          <div className="results-grid">
            <section className="panel">
              <h2>Estructura del proyecto</h2>
              <TreeView node={result.tree} />
            </section>

            <div className="side-panels">
              <section className="panel">
                <h2>Rutas Express detectadas</h2>
                {result.routes.length === 0 && <p className="muted">No se detectaron rutas.</p>}
                <RoutesByFile routes={result.routes} />
              </section>

              <section className="panel">
                <h2>package.json detectados</h2>
                {result.packages.length === 0 && <p className="muted">No se encontró ninguno.</p>}
                {result.packages.map((pkg) => (
                  <div key={pkg.path} className="pkg-card">
                    <div className="pkg-name">{pkg.name ?? '(sin nombre)'} <span className="muted">v{pkg.version ?? '?'}</span></div>
                    <div className="pkg-path muted">{pkg.path}</div>
                    {pkg.dependencies && (
                      <div className="pkg-deps muted">
                        {Object.keys(pkg.dependencies).length} dependencias · {' '}
                        {Object.keys(pkg.devDependencies ?? {}).length} devDependencies
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section className="panel">
                <h2>Variables de entorno</h2>
                {result.envVars.length === 0 && <p className="muted">No se detectó uso de process.env.</p>}
                {result.envVars.map((ev) => (
                  <div key={ev.name} className="env-card">
                    <div className="env-name">{ev.name}</div>
                    <div className="muted">{ev.files.length} archivo(s)</div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypePlurals: Record<GraphNode['type'], string> = {
  file: 'Archivos',
  route: 'Rutas',
  environment: 'Variables',
  package: 'Paquetes',
  dependency: 'Dependencias'
};

const nodeTypes: Array<{ type: GraphNode['type']; label: string }> =
  (Object.keys(nodeTypePlurals) as GraphNode['type'][]).map((type) => ({ type, label: nodeTypePlurals[type] }));

const edgeTypes: Array<{ type: GraphEdge['type']; label: string }> =
  (Object.keys(EDGE_TYPE_LABELS) as GraphEdge['type'][]).map((type) => ({ type, label: EDGE_TYPE_LABELS[type] }));

function GraphOverview({ graph }: { graph: ArchitectureGraph }) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const examples = edgeTypes.flatMap(({ type }) =>
    graph.edges.filter((edge) => edge.type === type).slice(0, 2)
  );

  return (
    <section className="panel graph-overview">
      <div className="graph-overview-head">
        <div>
          <div className="eyebrow">Esquema v{graph.schemaVersion}</div>
          <h2>Modelo arquitectónico</h2>
        </div>
        <p className="muted">Datos que alimentarán el mapa interactivo con React Flow.</p>
      </div>

      <div className="graph-overview-grid">
        <div>
          <h3>Tipos de nodo</h3>
          <div className="graph-stat-list">
            {nodeTypes.map(({ type, label }) => (
              <div key={type} className="graph-stat" data-type={type}>
                <strong>{graph.nodes.filter((node) => node.type === type).length}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Tipos de relación</h3>
          <div className="graph-relation-list">
            {edgeTypes.map(({ type, label }) => {
              const count = graph.edges.filter((edge) => edge.type === type).length;
              return (
                <div key={type} className="graph-relation-count">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {examples.length > 0 && (
        <div className="graph-examples">
          <h3>Relaciones de ejemplo</h3>
          {examples.map((edge) => (
            <div key={edge.id} className="graph-example-row">
              <span>{nodesById.get(edge.source)?.label ?? edge.source}</span>
              <code>{edgeTypes.find(({ type }) => type === edge.type)?.label ?? edge.type}</code>
              <span>{nodesById.get(edge.target)?.label ?? edge.target}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RoutesByFile({ routes }: { routes: RouteInfo[] }) {
  if (routes.length === 0) return null;

  const byFile = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    if (!byFile.has(route.file)) byFile.set(route.file, []);
    byFile.get(route.file)!.push(route);
  }

  return (
    <div className="routes-list">
      {Array.from(byFile.entries()).map(([file, fileRoutes]) => (
        <div key={file} className="route-file-card">
          <div className="route-file-name">{file}</div>
          {fileRoutes.map((r, i) => (
            <div key={i} className="route-row">
              <span className={`method-badge method-${r.method.toLowerCase()}`}>{r.method}</span>
              <span className="route-path">{r.path}</span>
              <span className="route-line muted">:{r.line}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
