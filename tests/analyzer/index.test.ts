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

  it('analiza proyectos Java/Spring Boot y los integra en el resultado', () => {
    currentProject = createTempProject({
      'pom.xml': [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>demo</artifactId>',
        '  <version>1.0.0</version>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>'
      ].join('\n'),
      'src/main/java/com/example/UserController.java': [
        'package com.example;',
        'import com.example.service.UserService;',
        'import org.springframework.web.bind.annotation.*;',
        '@RestController',
        '@RequestMapping("/users")',
        'public class UserController {',
        '  @GetMapping("/{id}")',
        '  public String get() { return "ok"; }',
        '}'
      ].join('\n'),
      'src/main/java/com/example/service/UserService.java': [
        'package com.example.service;',
        'import java.util.List;',
        'public class UserService {}'
      ].join('\n')
    });

    const result = analyzeProject(currentProject);

    expect(result.jvmProjects).toHaveLength(1);
    expect(result.jvmProjects[0].artifactId).toBe('demo');
    expect(result.jvmProjects[0].dependencies).toEqual([
      {
        groupId: 'org.springframework.boot',
        artifactId: 'spring-boot-starter-web',
        version: undefined,
        scope: 'compile'
      }
    ]);

    expect(result.routes).toEqual([
      {
        method: 'GET',
        path: '/users/{id}',
        file: path.join('src', 'main', 'java', 'com', 'example', 'UserController.java'),
        line: 7
      }
    ]);

    expect(result.imports).toEqual([
      {
        file: path.join('src', 'main', 'java', 'com', 'example', 'UserController.java'),
        specifier: 'com.example.service.UserService',
        line: 2,
        target: path.join('src', 'main', 'java', 'com', 'example', 'service', 'UserService.java')
      },
      {
        file: path.join('src', 'main', 'java', 'com', 'example', 'UserController.java'),
        specifier: 'org.springframework.web.bind.annotation.*',
        line: 3,
        target: undefined
      },
      {
        file: path.join('src', 'main', 'java', 'com', 'example', 'service', 'UserService.java'),
        specifier: 'java.util.List',
        line: 2,
        target: undefined
      }
    ]);

    const importEdge = result.graph.edges.find(
      (edge) => edge.type === 'imports' && (edge as any).specifier === 'com.example.service.UserService'
    );
    expect(importEdge?.source).toBe(createFileNodeId('src/main/java/com/example/UserController.java'));
    expect(importEdge?.target).toBe(createFileNodeId('src/main/java/com/example/service/UserService.java'));

    const springDependency = result.graph.nodes.find(
      (node) => node.type === 'dependency' && (node as any).name === 'org.springframework.boot:spring-boot-starter-web'
    );
    expect(springDependency).toBeDefined();
  });

  it('mantiene el análisis JS/TS intacto frente a proyectos mixtos', () => {
    currentProject = createTempProject({
      'package.json': JSON.stringify({ name: 'mixed', version: '1.0.0' }),
      'server.ts': "import { helper } from './util';\napp.get('/health', h);",
      'util.ts': 'export const helper = true;',
      'src/Main.java': [
        'package com.example;',
        '@RestController',
        'public class Main {',
        '  @GetMapping("/java")',
        '  public void x() {}',
        '}'
      ].join('\n'),
      'pom.xml': '<project><groupId>com.example</groupId><artifactId>app</artifactId></project>'
    });

    const result = analyzeProject(currentProject);

    expect(result.routes).toEqual([
      { method: 'GET', path: '/health', file: 'server.ts', line: 2 },
      { method: 'GET', path: '/java', file: 'src/Main.java', line: 4 }
    ]);
    expect(result.imports).toEqual([
      { file: 'server.ts', specifier: './util', line: 1, target: 'util.ts' }
    ]);
    expect(result.jvmProjects).toHaveLength(1);
    expect(result.packages).toHaveLength(1);
  });
});
