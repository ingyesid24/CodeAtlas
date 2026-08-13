import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { scanNestRoutes } from '../../src/analyzer/nestscan';
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

describe('scanNestRoutes', () => {
  it('combina @Controller con los decoradores de método', () => {
    const root = setup({
      'users.controller.ts': [
        "import { Controller, Get, Post } from '@nestjs/common';",
        "@Controller('users')",
        'export class UsersController {',
        "  @Get(':id')",
        '  findOne(@Param() params: any): string { return `user ${params.id}`; }',
        '  @Post()',
        '  create(): string { return "created"; }',
        '}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'GET', path: '/users/:id', file: 'users.controller.ts', line: 4 },
      { method: 'POST', path: '/users', file: 'users.controller.ts', line: 6 }
    ]);
  });

  it('detecta todos los decoradores de método soportados', () => {
    const root = setup({
      'api.controller.ts': [
        "@Controller('api')",
        'export class ApiController {',
        "  @Get() get() {}",
        "  @Post() post() {}",
        "  @Put() put() {}",
        "  @Patch() patch() {}",
        "  @Delete() del() {}",
        "  @Options() opts() {}",
        "  @Head() head() {}",
        "  @All() all() {}",
        '}'
      ].join('\n')
    });

    const methods = scanNestRoutes(root).map((route) => route.method);

    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL']);
  });

  it('usa la forma objeto de @Controller con path', () => {
    const root = setup({
      'auth.controller.ts': [
        "@Controller({ path: 'auth', version: '1' })",
        'export class AuthController {',
        "  @Post('login')",
        '  login() {}',
        '}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'POST', path: '/auth/login', file: 'auth.controller.ts', line: 3 }
    ]);
  });

  it('soporta decoradores de varias líneas', () => {
    const root = setup({
      'orders.controller.ts': [
        '@Controller({',
        "  path: 'orders',",
        "  version: '1'",
        '})',
        'export class OrdersController {',
        "  @Get(':id')",
        '  findOne() {}',
        '}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'GET', path: '/orders/:id', file: 'orders.controller.ts', line: 6 }
    ]);
  });

  it('reinicia el prefijo por cada @Controller en el mismo archivo', () => {
    const root = setup({
      'app.controller.ts': [
        "@Controller('api/users')",
        'export class UsersController {',
        "  @Get('me')",
        '  me() {}',
        '}',
        "@Controller('health')",
        'export class HealthController {',
        '  @Get()',
        '  check() {}',
        '}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'GET', path: '/api/users/me', file: 'app.controller.ts', line: 3 },
      { method: 'GET', path: '/health', file: 'app.controller.ts', line: 8 }
    ]);
  });

  it('ignora decoradores de método sin @Controller activo', () => {
    const root = setup({
      'plain.ts': [
        "import { Get } from 'some-other-framework';",
        "  @Get('not-a-nest-route')",
        '  handler() {}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([]);
  });

  it('normaliza slashes sobrantes entre prefijo y subruta', () => {
    const root = setup({
      'x.controller.ts': [
        "@Controller('/users/')",
        'export class XController {',
        "  @Get('/me')",
        '  me() {}',
        '}'
      ].join('\n')
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'GET', path: '/users/me', file: 'x.controller.ts', line: 3 }
    ]);
  });

  it('ignora comentarios y carpetas de dependencias', () => {
    const root = setup({
      'index.ts': [
        '// @Controller("fake")',
        '//   @Get("/fake")'
      ].join('\n'),
      node_modules: { 'dep.controller.ts': "@Controller('x')\nexport class C { @Get('y') g() {} }" },
      dist: { 'bundle.controller.ts': "@Controller('b')\nexport class C { @Get('c') g() {} }" }
    });

    expect(scanNestRoutes(root)).toEqual([]);
  });

  it('devuelve una lista vacía cuando no hay controladores', () => {
    const root = setup({ 'index.ts': 'console.log("sin nest")' });

    expect(scanNestRoutes(root)).toEqual([]);
  });

  it('reporta rutas de subdirectorios con ruta relativa', () => {
    const root = setup({
      src: {
        modules: {
          'cats.controller.ts': [
            "@Controller('cats')",
            'export class CatsController {',
            "  @Get('all')",
            '  all() {}',
            '}'
          ].join('\n')
        }
      }
    });

    expect(scanNestRoutes(root)).toEqual([
      { method: 'GET', path: '/cats/all', file: path.join('src', 'modules', 'cats.controller.ts'), line: 3 }
    ]);
  });
});
