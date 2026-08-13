import type { GraphEdge, GraphNode } from '../analyzer/types';

export const NODE_TYPE_LABELS: Record<GraphNode['type'], string> = {
  file: 'Archivo',
  route: 'Ruta',
  environment: 'Variable',
  package: 'Paquete',
  dependency: 'Dependencia'
};

export const EDGE_TYPE_LABELS: Record<GraphEdge['type'], string> = {
  'declares-route': 'Declara ruta',
  'uses-env': 'Usa variable',
  'depends-on': 'Depende de',
  imports: 'Importa módulo'
};
