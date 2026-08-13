import { scanDirectory, findPackageJsonFiles, collectSourceFiles } from './scanner';
import { scanEnvVars } from './envscan';
import { scanExpressRoutes } from './routescan';
import { scanNestRoutes } from './nestscan';
import { scanImports } from './importscan';
import { buildArchitectureGraph } from './graph';
import type {
  AnalysisPhase,
  AnalysisProgress,
  AnalysisResult,
  ProgressCallback
} from './types';

const PHASE_WEIGHTS: Record<AnalysisPhase, { start: number; end: number }> = {
  scan: { start: 0, end: 0.45 },
  env: { start: 0.45, end: 0.62 },
  routes: { start: 0.62, end: 0.8 },
  imports: { start: 0.8, end: 0.93 },
  graph: { start: 0.93, end: 1 }
};

const PHASE_MESSAGES: Record<AnalysisPhase, string> = {
  scan: 'Escaneando estructura del proyecto',
  env: 'Detectando variables de entorno',
  routes: 'Detectando rutas HTTP',
  imports: 'Mapeando imports y dependencias',
  graph: 'Construyendo el grafo arquitectónico'
};

/**
 * Analiza un proyecto y reporta progreso en [0, 1] si se provee un callback.
 * Las fases env/routes/imports avanzan por archivo; scan y graph lo hacen
 * por subetapa.
 */
export function analyzeProject(rootPath: string, onProgress?: ProgressCallback): AnalysisResult {
  const sourceFiles = collectSourceFiles(rootPath);
  const phaseMax = new Map<AnalysisPhase, number>();

  const report = (phase: AnalysisPhase, subFraction: number, message?: string) => {
    if (!onProgress) return;
    const { start, end } = PHASE_WEIGHTS[phase];
    const fraction = Math.min(1, start + (end - start) * subFraction);
    const previous = phaseMax.get(phase) ?? start;
    const next = Math.max(previous, fraction);
    phaseMax.set(phase, next);
    const progress: AnalysisProgress = {
      phase,
      fraction: next,
      message: message ?? PHASE_MESSAGES[phase]
    };
    onProgress(progress);
  };

  const reportPerFile =
    (phase: AnalysisPhase) =>
    (processed: number, total: number) =>
      report(phase, total > 0 ? processed / total : 1);

  report('scan', 0);
  const { tree, stats } = scanDirectory(rootPath);
  report('scan', 0.65);
  const packages = findPackageJsonFiles(rootPath);
  report('scan', 1);

  const envVars = scanEnvVars(rootPath, sourceFiles, reportPerFile('env'));
  const routes = [
    ...scanExpressRoutes(rootPath, sourceFiles, reportPerFile('routes')),
    ...scanNestRoutes(rootPath, sourceFiles, reportPerFile('routes'))
  ];
  const imports = scanImports(rootPath, sourceFiles, reportPerFile('imports'));

  report('graph', 0.5);
  const graph = buildArchitectureGraph({ tree, packages, envVars, routes, imports });
  report('graph', 1);

  return {
    rootPath,
    scannedAt: new Date().toISOString(),
    fileCount: stats.fileCount,
    dirCount: stats.dirCount,
    tree,
    packages,
    envVars,
    routes,
    imports,
    graph
  };
}

export { buildArchitectureGraph, createFileNodeId, normalizeGraphPath } from './graph';
export { scanImports } from './importscan';
export { scanNestRoutes } from './nestscan';
export { collectSourceFiles, type SourceFile } from './scanner';
export type {
  AnalysisPhase,
  AnalysisProgress,
  AnalysisResult,
  ArchitectureGraph,
  DependencyScope,
  EnvVarUsage,
  FileNode,
  GraphEdge,
  GraphNode,
  HttpMethod,
  ImportInfo,
  PackageInfo,
  ProgressCallback,
  RouteInfo,
  SourceLocation
} from './types';
