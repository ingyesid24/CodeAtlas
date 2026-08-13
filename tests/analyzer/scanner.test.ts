import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { findPackageJsonFiles, scanDirectory } from '../../src/analyzer/scanner';
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

describe('scanDirectory', () => {
  it('cuenta archivos y carpetas correctamente', () => {
    const root = setup({
      'index.js': 'console.log(1)',
      src: {
        'a.ts': '',
        'b.ts': '',
        utils: { 'helper.ts': '' }
      }
    });

    const { stats } = scanDirectory(root);

    expect(stats).toEqual({ fileCount: 4, dirCount: 2 });
  });

  it('ignora dependencias, metadatos y artefactos de build', () => {
    const root = setup({
      'index.js': '',
      node_modules: { 'lib.js': '' },
      '.git': { HEAD: 'ref: refs/heads/main' },
      dist: { 'bundle.js': '' },
      src: { 'app.js': '' }
    });

    const { tree, stats } = scanDirectory(root);
    const topLevelNames = (tree.children ?? []).map((child) => child.name);

    expect(topLevelNames).not.toContain('node_modules');
    expect(topLevelNames).not.toContain('.git');
    expect(topLevelNames).not.toContain('dist');
    expect(topLevelNames).toContain('src');
    expect(stats.fileCount).toBe(2);
  });

  it('ordena carpetas antes que archivos y alfabéticamente en cada grupo', () => {
    const root = setup({
      'zeta.js': '',
      'alpha.js': '',
      zzz_folder: {},
      aaa_folder: {}
    });

    const { tree } = scanDirectory(root);
    const names = (tree.children ?? []).map((child) => child.name);

    expect(names).toEqual(['aaa_folder', 'zzz_folder', 'alpha.js', 'zeta.js']);
  });

  it('conserva .env e ignora otros archivos ocultos', () => {
    const root = setup({
      '.env': 'PORT=3000',
      '.env.local': 'PORT=4000'
    });

    const { tree } = scanDirectory(root);
    const names = (tree.children ?? []).map((child) => child.name);

    expect(names).toContain('.env');
    expect(names).not.toContain('.env.local');
  });

  it('lanza un error legible si la carpeta raíz no existe', () => {
    const fakeRoot = path.join('/tmp', `codeatlas-nonexistent-${Date.now()}`);

    expect(() => scanDirectory(fakeRoot)).toThrow('No se pudo leer la carpeta seleccionada');
  });

  it.runIf(
    process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0
  )('omite una subcarpeta sin permisos sin abortar el análisis', () => {
    const root = setup({
      'index.ts': '',
      blocked: { 'secret.ts': '' }
    });
    const blockedPath = path.join(root, 'blocked');

    fs.chmodSync(blockedPath, 0o000);
    try {
      const { tree, stats } = scanDirectory(root);
      const blockedNode = tree.children?.find((child) => child.name === 'blocked');

      expect(blockedNode?.children).toEqual([]);
      expect(stats).toEqual({ fileCount: 1, dirCount: 1 });
    } finally {
      fs.chmodSync(blockedPath, 0o700);
    }
  });
});

describe('findPackageJsonFiles', () => {
  it('detecta y parsea el package.json raíz', () => {
    const root = setup({
      'package.json': JSON.stringify({
        name: 'demo-app',
        version: '1.2.3',
        scripts: { dev: 'vite' },
        dependencies: { react: '^18.0.0' },
        devDependencies: { vite: '^5.0.0' }
      })
    });

    const packages = findPackageJsonFiles(root);

    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      path: 'package.json',
      name: 'demo-app',
      version: '1.2.3',
      dependencies: { react: '^18.0.0' }
    });
  });

  it('detecta package.json anidados en un monorepo', () => {
    const root = setup({
      'package.json': JSON.stringify({ name: 'root' }),
      backend: { 'package.json': JSON.stringify({ name: 'backend' }) },
      frontend: { 'package.json': JSON.stringify({ name: 'frontend' }) }
    });

    const names = findPackageJsonFiles(root).map((pkg) => pkg.name).sort();

    expect(names).toEqual(['backend', 'frontend', 'root']);
  });

  it('ignora package.json dentro de node_modules', () => {
    const root = setup({
      'package.json': JSON.stringify({ name: 'root' }),
      node_modules: {
        'some-lib': { 'package.json': JSON.stringify({ name: 'some-lib' }) }
      }
    });

    const packages = findPackageJsonFiles(root);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe('root');
  });

  it('ignora un package.json inválido sin abortar el análisis', () => {
    const root = setup({
      'package.json': '{ esto no es json válido',
      src: { 'index.js': '' }
    });

    expect(findPackageJsonFiles(root)).toEqual([]);
  });
});
