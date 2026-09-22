import { afterEach, describe, expect, it } from 'vitest';
import { scanJvmProjects } from '../../src/analyzer/jvmdepscan';
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

describe('scanJvmProjects — Maven', () => {
  it('parsa pom.xml con groupId, artifactId, version y dependencias', () => {
    const root = setup({
      'pom.xml': [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>demo</artifactId>',
        '  <version>1.0.0</version>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '      <version>3.2.0</version>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>org.junit.jupiter</groupId>',
        '      <artifactId>junit-jupiter</artifactId>',
        '      <scope>test</scope>',
        '    </dependency>',
        '  </dependencies>',
        '</project>'
      ].join('\n')
    });

    const projects = scanJvmProjects(root);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      path: 'pom.xml',
      buildTool: 'maven',
      groupId: 'com.example',
      artifactId: 'demo',
      version: '1.0.0',
      dependencies: [
        {
          groupId: 'org.springframework.boot',
          artifactId: 'spring-boot-starter-web',
          version: '3.2.0',
          scope: 'compile'
        },
        {
          groupId: 'org.junit.jupiter',
          artifactId: 'junit-jupiter',
          version: undefined,
          scope: 'test'
        }
      ]
    });
  });

  it('ignora pom.xml inválido', () => {
    const root = setup({ 'pom.xml': '<project>' });

    expect(scanJvmProjects(root)).toEqual([]);
  });
});

describe('scanJvmProjects — Gradle', () => {
  it('parsa build.gradle (Groovy) con notación group:artifact:version', () => {
    const root = setup({
      'build.gradle': [
        "plugins { id 'org.springframework.boot' version '3.2.0' }",
        "group = 'com.example'",
        "version = '1.0.0'",
        "repositories { mavenCentral() }",
        "dependencies {",
        "  implementation 'org.springframework.boot:spring-boot-starter-web'",
        "  testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'",
        "}"
      ].join('\n')
    });

    const projects = scanJvmProjects(root);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      path: 'build.gradle',
      buildTool: 'gradle',
      groupId: 'com.example',
      artifactId: undefined,
      version: '1.0.0',
      dependencies: [
        {
          groupId: 'org.springframework.boot',
          artifactId: 'spring-boot-starter-web',
          version: undefined,
          scope: 'implementation'
        },
        {
          groupId: 'org.junit.jupiter',
          artifactId: 'junit-jupiter',
          version: '5.10.0',
          scope: 'test'
        }
      ]
    });
  });

  it('parsa build.gradle.kts (Kotlin DSL)', () => {
    const root = setup({
      'build.gradle.kts': [
        'plugins { java }',
        "group = \"com.example\"",
        "version = \"2.0.0\"",
        'dependencies {',
        '  implementation("org.springframework.boot:spring-boot-starter-web:3.2.0")',
        '  testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.10.0")',
        '}'
      ].join('\n')
    });

    const projects = scanJvmProjects(root);

    expect(projects).toHaveLength(1);
    expect(projects[0].buildTool).toBe('gradle');
    expect(projects[0].dependencies).toEqual([
      {
        groupId: 'org.springframework.boot',
        artifactId: 'spring-boot-starter-web',
        version: '3.2.0',
        scope: 'implementation'
      },
      {
        groupId: 'org.junit.jupiter',
        artifactId: 'junit-jupiter-engine',
        version: '5.10.0',
        scope: 'test'
      }
    ]);
  });
});

describe('scanJvmProjects — general', () => {
  it('detecta múltiples módulos y excluye node_modules y carpetas de build', () => {
    const root = setup({
      'pom.xml': '<project><groupId>a</groupId><artifactId>root</artifactId></project>',
      'backend/pom.xml': '<project><groupId>b</groupId><artifactId>api</artifactId></project>',
      node_modules: { 'pom.xml': '<project><groupId>x</groupId><artifactId>dep</artifactId></project>' },
      target: { 'pom.xml': '<project><groupId>y</groupId><artifactId>build</artifactId></project>' }
    });

    const projects = scanJvmProjects(root);

    expect(projects.map((p) => p.path).sort()).toEqual(['backend/pom.xml', 'pom.xml']);
  });

  it('devuelve lista vacía cuando no hay manifiestos JVM', () => {
    const root = setup({ 'package.json': JSON.stringify({ name: 'web' }) });

    expect(scanJvmProjects(root)).toEqual([]);
  });
});