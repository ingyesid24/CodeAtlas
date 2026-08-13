import { afterEach, describe, expect, it } from 'vitest';
import { scanImports } from '../../src/analyzer/importscan';
import { cleanupTempProject, createTempProject, type FixtureTree } from '../helpers/tmpProject';

let currentProject: string | null = null;

function setup(tree: FixtureTree): string {
  currentProject = createTempProject(tree);
  return currentProject;
}

afterEach(() => {
  if (!currentProject) return;
  cleanupTempProject(currentProject);
  currentProject = null;
});

describe('scanImports', () => {
  it('detecta import estático, export-from, require e import dinámico con su línea', () => {
    const root = setup({
      'index.ts': [
        "import { helper } from './helper';",
        "const express = require('express');",
        "export * from './config';",
        "import('./features').then((m) => m.init());"
      ].join('\n'),
      'helper.ts': 'export const helper = 1;',
      'config.ts': 'module.exports = {};',
      'features.ts': 'export function init() {}'
    });

    expect(scanImports(root)).toEqual([
      { file: 'index.ts', specifier: './helper', line: 1, target: 'helper.ts' },
      { file: 'index.ts', specifier: 'express', line: 2, target: undefined },
      { file: 'index.ts', specifier: './config', line: 3, target: 'config.ts' },
      { file: 'index.ts', specifier: './features', line: 4, target: 'features.ts' }
    ]);
  });

  it('resuelve imports relativos probando extensiones e index de carpeta', () => {
    const root = setup({
      ui: {
        'index.ts': "import Button from './button';",
        'button.tsx': 'export default () => null;'
      },
      api: {
        'index.ts': "import routes from './routes';",
        routes: {
          'index.ts': 'export default [];'
        }
      }
    });

    const imports = scanImports(root).sort((a, b) => a.file.localeCompare(b.file));
    expect(imports).toEqual([
      { file: 'api/index.ts', specifier: './routes', line: 1, target: 'api/routes/index.ts' },
      { file: 'ui/index.ts', specifier: './button', line: 1, target: 'ui/button.tsx' }
    ]);
  });

  it('resuelve specifiers con extensión explícita como JSON', () => {
    const root = setup({
      'config.ts': "import defaults from './settings.json';",
      'settings.json': '{"theme":"dark"}'
    });

    expect(scanImports(root)).toEqual([
      { file: 'config.ts', specifier: './settings.json', line: 1, target: 'settings.json' }
    ]);
  });

  it('deja sin target los specifiers externos', () => {
    const root = setup({
      'app.tsx': "import React from 'react';",
      'server.ts': "import { readFile } from 'fs';"
    });

    expect(scanImports(root)).toEqual([
      { file: 'app.tsx', specifier: 'react', line: 1, target: undefined },
      { file: 'server.ts', specifier: 'fs', line: 1, target: undefined }
    ]);
  });

  it('ignora dependencias, build y archivos no ejecutables', () => {
    const root = setup({
      node_modules: { 'lib.js': "import './x';" },
      dist: { 'bundle.js': "const y = require('./y');" },
      'styles.css': "require('./bad');",
      'index.js': "import './real';",
      'real.js': 'export {};'
    });

    expect(scanImports(root)).toEqual([
      { file: 'index.js', specifier: './real', line: 1, target: 'real.js' }
    ]);
  });

  it('deduplica el mismo specifier dentro de un archivo', () => {
    const root = setup({
      'index.ts': [
        "import './shared';",
        "const a = require('./shared');",
        "import './shared';"
      ].join('\n'),
      'shared.ts': 'export {};'
    });

    expect(scanImports(root)).toEqual([
      { file: 'index.ts', specifier: './shared', line: 1, target: 'shared.ts' }
    ]);
  });

  it('devuelve una lista vacía cuando no hay imports', () => {
    const root = setup({ 'index.ts': "console.log('sin imports');" });

    expect(scanImports(root)).toEqual([]);
  });
});
