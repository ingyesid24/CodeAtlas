import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { analyzeProject, createFileNodeId } from '../../src/analyzer';
import type { AnalysisProgress } from '../../src/analyzer/types';
import { cleanupTempProject, createTempProject } from '../helpers/tmpProject';

let currentProject: string | null = null;

afterEach(() => {
  if (!currentProject) return;
  cleanupTempProject(currentProject);
  currentProject = null;
});

describe('analyzeProject', () => {
  it('combina árbol, paquetes, variables, rutas e imports en un solo resultado', () => {
    currentProject = createTempProject({
      'package.json': JSON.stringify({ name: 'integration-fixture', version: '1.0.0' }),
      src: {
        'server.ts': [
          "import { helper } from './util';",
          'const port = process.env.PORT;',
          "app.get('/health', handler);"
        ].join('\n'),
        'util.ts': 'export const helper = true;'
      }
    });

    const result = analyzeProject(currentProject);

    expect(result.rootPath).toBe(currentProject);
    expect(result.fileCount).toBe(3);
    expect(result.dirCount).toBe(1);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe('integration-fixture');
    expect(result.envVars).toEqual([
      { name: 'PORT', files: [path.join('src', 'server.ts')] }
    ]);
    expect(result.routes).toEqual([
      {
        method: 'GET',
        path: '/health',
        file: path.join('src', 'server.ts'),
        line: 3
      }
    ]);
    expect(result.imports).toEqual([
      { file: 'src/server.ts', specifier: './util', line: 1, target: 'src/util.ts' }
    ]);
    expect(result.graph.schemaVersion).toBe(1);
    expect(result.graph.nodes).toHaveLength(6);
    expect(result.graph.edges).toHaveLength(3);
    expect(result.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'imports',
          source: createFileNodeId('src/server.ts'),
          target: createFileNodeId('src/util.ts'),
          specifier: './util'
        })
      ])
    );
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
  });

  it('reporta progreso monótono desde 0 hasta 1 con las fases esperadas', () => {
    currentProject = createTempProject({
      'package.json': JSON.stringify({ name: 'progress-fixture', version: '1.0.0' }),
      src: {
        'a.ts': "import { b } from './b';\nconst x = process.env.TOKEN;",
        'b.ts': "export const b = true;\napp.get('/x', handler);"
      }
    });

    const progressEvents: AnalysisProgress[] = [];
    analyzeProject(currentProject, (progress) => progressEvents.push(progress));

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].fraction).toBe(0);
    expect(progressEvents[progressEvents.length - 1].fraction).toBe(1);
    const fractions = progressEvents.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));

    const phases = progressEvents.map((p) => p.phase);
    const phaseOrder: AnalysisProgress['phase'][] = ['scan', 'env', 'routes', 'imports', 'graph'];
    const firstIndexOf = (phase: AnalysisProgress['phase']) => phases.indexOf(phase);
    expect(firstIndexOf('scan')).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < phaseOrder.length; i++) {
      const prev = firstIndexOf(phaseOrder[i - 1]);
      const next = firstIndexOf(phaseOrder[i]);
      if (prev >= 0 && next >= 0) expect(next).toBeGreaterThanOrEqual(prev);
    }

    for (const progress of progressEvents) {
      expect(progress.fraction).toBeGreaterThanOrEqual(0);
      expect(progress.fraction).toBeLessThanOrEqual(1);
      expect(progress.message.length).toBeGreaterThan(0);
    }
  });

  it('no requiere callback de progreso y produce el mismo resultado', () => {
    currentProject = createTempProject({
      'index.ts': "const a = process.env.A;\napp.get('/a', h);"
    });

    const withProgress = analyzeProject(currentProject, () => {});
    const withoutProgress = analyzeProject(currentProject);

    const { scannedAt: scannedAtWith, ...restWith } = withProgress;
    const { scannedAt: scannedAtWithout, ...restWithout } = withoutProgress;
    expect(scannedAtWithout.length).toBeGreaterThan(0);
    expect(scannedAtWith.length).toBeGreaterThan(0);
    expect(restWithout).toEqual(restWith);
  });
});
