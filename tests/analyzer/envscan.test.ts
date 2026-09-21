import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { scanEnvVars } from '../../src/analyzer/envscan';
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

describe('scanEnvVars', () => {
  it('detecta process.env.VAR', () => {
    const root = setup({ 'index.js': 'const port = process.env.PORT;' });

    expect(scanEnvVars(root)).toEqual([{ name: 'PORT', files: ['index.js'] }]);
  });

  it('detecta variables accedidas con comillas simples y dobles', () => {
    const root = setup({
      'a.js': 'const x = process.env["DATABASE_URL"];',
      'b.js': "const y = process.env['JWT_SECRET'];"
    });

    const names = scanEnvVars(root).map((result) => result.name);

    expect(names).toEqual(['DATABASE_URL', 'JWT_SECRET']);
  });

  it('agrupa una variable usada en varios archivos', () => {
    const root = setup({
      'a.js': 'process.env.API_KEY',
      'b.js': 'const key = process.env.API_KEY;',
      nested: { 'c.js': 'foo(process.env.API_KEY)' }
    });

    expect(scanEnvVars(root)).toEqual([{
      name: 'API_KEY',
      files: ['a.js', 'b.js', path.join('nested', 'c.js')]
    }]);
  });

  it('ignora extensiones no soportadas', () => {
    const root = setup({
      'config.json': '{"PORT":"process.env.PORT"}',
      'README.md': 'Usa process.env.PORT en tu .env'
    });

    expect(scanEnvVars(root)).toEqual([]);
  });

  it('ignora carpetas de dependencias y build', () => {
    const root = setup({
      node_modules: { 'lib.js': 'process.env.IGNORED' },
      dist: { 'bundle.js': 'process.env.ALSO_IGNORED' },
      'index.js': 'process.env.REAL_VAR'
    });

    expect(scanEnvVars(root)).toEqual([{ name: 'REAL_VAR', files: ['index.js'] }]);
  });

  it('devuelve una lista vacía cuando no hay variables', () => {
    const root = setup({ 'index.js': 'console.log("sin variables")' });

    expect(scanEnvVars(root)).toEqual([]);
  });

  it('ordena las variables alfabéticamente', () => {
    const root = setup({
      'index.js': 'process.env.ZETA; process.env.ALPHA; process.env.MID;'
    });

    const names = scanEnvVars(root).map((result) => result.name);

    expect(names).toEqual(['ALPHA', 'MID', 'ZETA']);
  });

  it('detecta destructuring: const { PORT } = process.env', () => {
    const root = setup({
      'index.js': 'const { PORT, DATABASE_URL: dbUrl } = process.env;'
    });

    expect(scanEnvVars(root)).toEqual([
      { name: 'DATABASE_URL', files: ['index.js'] },
      { name: 'PORT', files: ['index.js'] }
    ]);
  });

  it('ignora los comentarios y los strings que mencionan process.env', () => {
    const root = setup({
      'index.js': [
        '// process.env.FAKE_PORT',
        'const hint = "usa process.env.FAKE_KEY en tu .env";',
        'const real = process.env.REAL_KEY;'
      ].join('\n')
    });

    expect(scanEnvVars(root)).toEqual([{ name: 'REAL_KEY', files: ['index.js'] }]);
  });

  it('ignora el acceso dinámico process.env[nombre]', () => {
    const root = setup({ 'index.js': 'const key = "PORT"; process.env[key];' });

    expect(scanEnvVars(root)).toEqual([]);
  });
});
