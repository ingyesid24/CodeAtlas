export interface FileNode {
  name: string;
  path: string;       // ruta relativa al root del proyecto escaneado
  type: 'file' | 'dir';
  children?: FileNode[];
}

export interface PackageInfo {
  path: string;        // ruta relativa del package.json
  name?: string;
  version?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface EnvVarUsage {
  name: string;         // p.ej. DATABASE_URL
  files: string[];      // archivos (rutas relativas) donde se usa
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'ALL' | 'USE';

export interface RouteInfo {
  method: HttpMethod;
  path: string;
  file: string;
  line: number;
}

export interface ImportInfo {
  file: string;       // archivo fuente (ruta relativa)
  specifier: string;  // specifier tal como aparece en el código
  line: number;
  target?: string;    // ruta relativa resuelta solo para imports relativos
}

export interface SourceLocation {
  file: string;
  line?: number;
}

interface BaseGraphNode {
  id: string;
  label: string;
}

export interface FileGraphNode extends BaseGraphNode {
  type: 'file';
  path: string;
}

export interface RouteGraphNode extends BaseGraphNode {
  type: 'route';
  method: HttpMethod;
  routePath: string;
  location: SourceLocation;
}

export interface EnvironmentGraphNode extends BaseGraphNode {
  type: 'environment';
  name: string;
}

export interface PackageGraphNode extends BaseGraphNode {
  type: 'package';
  name: string;
  version?: string;
  manifestPath: string;
}

export interface DependencyGraphNode extends BaseGraphNode {
  type: 'dependency';
  name: string;
}

export type GraphNode =
  | FileGraphNode
  | RouteGraphNode
  | EnvironmentGraphNode
  | PackageGraphNode
  | DependencyGraphNode;

interface BaseGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface DeclaresRouteGraphEdge extends BaseGraphEdge {
  type: 'declares-route';
  location: SourceLocation;
}

export interface UsesEnvironmentGraphEdge extends BaseGraphEdge {
  type: 'uses-env';
}

export type DependencyScope = 'runtime' | 'development';

export interface DependsOnGraphEdge extends BaseGraphEdge {
  type: 'depends-on';
  scope: DependencyScope;
  version: string;
}

export interface ImportsGraphEdge extends BaseGraphEdge {
  type: 'imports';
  specifier: string;
  location?: SourceLocation;
}

export type GraphEdge =
  | DeclaresRouteGraphEdge
  | UsesEnvironmentGraphEdge
  | DependsOnGraphEdge
  | ImportsGraphEdge;

export interface ArchitectureGraph {
  schemaVersion: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AnalysisResult {
  rootPath: string;
  scannedAt: string;
  fileCount: number;
  dirCount: number;
  tree: FileNode;
  packages: PackageInfo[];
  envVars: EnvVarUsage[];
  routes: RouteInfo[];
  imports: ImportInfo[];
  graph: ArchitectureGraph;
}

export type AnalysisPhase =
  | 'scan'
  | 'env'
  | 'routes'
  | 'imports'
  | 'graph';

export interface AnalysisProgress {
  /** Fase del análisis en curso. */
  phase: AnalysisPhase;
  /** Progreso global del análisis, en el rango [0, 1]. */
  fraction: number;
  /** Mensaje legible para la interfaz. */
  message: string;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;
