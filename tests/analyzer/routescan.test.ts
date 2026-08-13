import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { scanExpressRoutes } from '../../src/analyzer/routescan';
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

describe('scanExpressRoutes', () => {
  it('detecta rutas declaradas con app.METHOD', () => {
    const root = setup({
      'index.js': [
        "const app = require('express')();",
        "app.get('/health', handler);",
        "app.post('/login', handler);"
      ].join('\n')
    });

    expect(scanExpressRoutes(root)).toEqual([
      { method: 'GET', path: '/health', file: 'index.js', line: 2 },
      { method: 'POST', path: '/login', file: 'index.js', line: 3 }
    ]);
  });

  it('detecta rutas de router y variables terminadas en Router', () => {
    const root = setup({
      routes: {
        'auth.js': [
          "const authRouter = require('express').Router();",
          "authRouter.post('/login', ctrl.login);",
          "authRouter.get('/me', ctrl.me);"
        ].join('\n')
      }
    });

    expect(scanExpressRoutes(root)).toEqual([
      { method: 'POST', path: '/login', file: path.join('routes', 'auth.js'), line: 2 },
      { method: 'GET', path: '/me', file: path.join('routes', 'auth.js'), line: 3 }
    ]);
  });

  it('detecta todos los métodos HTTP soportados', () => {
    const root = setup({
      'routes.ts': [
        "router.get('/get', handler);",
        "router.post('/post', handler);",
        "router.put('/put', handler);",
        "router.patch('/patch', handler);",
        "router.delete('/delete', handler);",
        "router.all('/all', handler);",
        "router.use('/use', handler);"
      ].join('\n')
    });

    const methods = scanExpressRoutes(root).map((route) => route.method);

    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL', 'USE']);
  });

  it('detecta app.use con un prefijo de montaje', () => {
    const root = setup({ 'index.js': "app.use('/api/auth', authRouter);" });

    expect(scanExpressRoutes(root)).toEqual([
      { method: 'USE', path: '/api/auth', file: 'index.js', line: 1 }
    ]);
  });

  it('ignora llamadas sobre receptores que no parecen routers', () => {
    const root = setup({
      'index.js': [
        "config.get('someKey');",
        "await axios.post('/not-a-route', data);"
      ].join('\n')
    });

    expect(scanExpressRoutes(root)).toEqual([]);
  });

  it('ignora carpetas de dependencias y build', () => {
    const root = setup({
      node_modules: { 'express-like.js': "router.get('/ignored', handler);" },
      dist: { 'bundle.js': "app.get('/also-ignored', handler);" },
      'index.js': "router.get('/real', handler);"
    });

    expect(scanExpressRoutes(root)).toEqual([
      { method: 'GET', path: '/real', file: 'index.js', line: 1 }
    ]);
  });

  it('reporta el número de línea correcto', () => {
    const root = setup({
      'index.js': [
        '// comentario',
        '',
        "router.get('/a', handler);",
        "router.get('/b', handler);",
        '',
        "router.delete('/c', handler);"
      ].join('\n')
    });

    const lines = scanExpressRoutes(root).map((route) => route.line);

    expect(lines).toEqual([3, 4, 6]);
  });

  it('devuelve una lista vacía cuando no hay rutas', () => {
    const root = setup({ 'index.js': 'console.log("sin rutas")' });

    expect(scanExpressRoutes(root)).toEqual([]);
  });
});
