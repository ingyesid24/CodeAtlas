import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { scanSpringRoutes } from '../../src/analyzer/springscan';
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

describe('scanSpringRoutes', () => {
  it('detecta @RestController con @GetMapping y compone prefijo + subruta', () => {
    const root = setup({
      'src/main/java/com/example/UserController.java': [
        'package com.example;',
        'import org.springframework.web.bind.annotation.*;',
        '@RestController',
        "@RequestMapping(\"/users\")",
        'public class UserController {',
        '  @GetMapping("/{id}")',
        '  public String get(@PathVariable Long id) { return "user"; }',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'GET', path: '/users/{id}', file: path.join('src', 'main', 'java', 'com', 'example', 'UserController.java'), line: 6 }
    ]);
  });

  it('detecta @Controller con @PostMapping y @DeleteMapping', () => {
    const root = setup({
      'OrderController.java': [
        '@Controller',
        '@RequestMapping("/orders")',
        'public class OrderController {',
        '  @PostMapping',
        '  public void create() {}',
        '  @DeleteMapping("/{id}")',
        '  public void delete(@PathVariable Long id) {}',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'POST', path: '/orders', file: 'OrderController.java', line: 4 },
      { method: 'DELETE', path: '/orders/{id}', file: 'OrderController.java', line: 6 }
    ]);
  });

  it('soporta @RequestMapping de método con method = RequestMethod.GET', () => {
    const root = setup({
      'AuthController.java': [
        '@RestController',
        'public class AuthController {',
        '  @RequestMapping(value = "/login", method = RequestMethod.POST)',
        '  public void login() {}',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'POST', path: '/login', file: 'AuthController.java', line: 3 }
    ]);
  });

  it('detecta controladores Kotlin', () => {
    const root = setup({
      'src/main/kotlin/com/example/HealthController.kt': [
        'package com.example',
        'import org.springframework.web.bind.annotation.GetMapping',
        'import org.springframework.web.bind.annotation.RestController',
        '@RestController',
        'class HealthController {',
        '  @GetMapping("/health")',
        '  fun check(): String = "ok"',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'GET', path: '/health', file: path.join('src', 'main', 'kotlin', 'com', 'example', 'HealthController.kt'), line: 6 }
    ]);
  });

  it('soporta anotaciones multilínea', () => {
    const root = setup({
      'ReportController.java': [
        '@RestController',
        '@RequestMapping({',
        '  "/reports"',
        '})',
        'public class ReportController {',
        '  @GetMapping("/summary")',
        '  public void summary() {}',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'GET', path: '/reports/summary', file: 'ReportController.java', line: 6 }
    ]);
  });

  it('ignora clases sin anotaciones de controlador', () => {
    const root = setup({
      'PlainService.java': [
        'package com.example;',
        'public class PlainService {',
        '  @GetMapping("/not-a-controller")',
        '  public void x() {}',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([]);
  });

  it('ignora comentarios y no escanea node_modules ni target', () => {
    const root = setup({
      'src/Main.java': [
        '// @RestController',
        '// @GetMapping("/fake")'
      ].join('\n'),
      node_modules: { 'x.controller.java': '@RestController\npublic class C { @GetMapping("/x") void g() {} }' },
      target: { 'bundle.controller.java': '@RestController\npublic class C { @GetMapping("/b") void g() {} }' }
    });

    expect(scanSpringRoutes(root)).toEqual([]);
  });

  it('normaliza slashes entre prefijo y subruta', () => {
    const root = setup({
      'XController.java': [
        '@RestController',
        '@RequestMapping("/api/")',
        'public class XController {',
        '  @GetMapping("/ping")',
        '  public void ping() {}',
        '}'
      ].join('\n')
    });

    expect(scanSpringRoutes(root)).toEqual([
      { method: 'GET', path: '/api/ping', file: 'XController.java', line: 4 }
    ]);
  });

  it('devuelve lista vacía en un proyecto sin Spring', () => {
    const root = setup({ 'src/Main.java': 'package com.example;\npublic class Main {}' });

    expect(scanSpringRoutes(root)).toEqual([]);
  });
});