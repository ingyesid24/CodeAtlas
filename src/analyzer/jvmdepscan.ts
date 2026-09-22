import * as fs from 'fs';
import * as path from 'path';
import { findJvmManifestFiles } from './scanner';
import type { JvmBuildTool, JvmProject } from './types';

/** Devuelve el contenido de un archivo o undefined si es ilegible. */
function readFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

/** Devuelve el contenido de un tag XML simple (sin anidar el mismo nombre). */
function firstTag(tag: string, xml: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return match ? match[1].trim() : undefined;
}

/**
 * Parsea un pom.xml de Maven: groupId, artifactId, version y las
 * dependencias (groupId, artifactId, version y scope).
 */
function parseMavenPom(content: string): JvmProject | null {
  const dependencies: JvmProject['dependencies'] = [];

  const dependencyBlock = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match: RegExpExecArray | null;
  while ((match = dependencyBlock.exec(content)) !== null) {
    const block = match[1];
    const groupId = firstTag('groupId', block);
    const artifactId = firstTag('artifactId', block);
    if (!groupId || !artifactId) continue;
    dependencies.push({
      groupId,
      artifactId,
      version: firstTag('version', block),
      scope: firstTag('scope', block) ?? 'compile'
    });
  }

  const groupId = firstTag('groupId', content);
  const artifactId = firstTag('artifactId', content);
  // Sin identificadores no hay proyecto útil: pom inválido o incompleto.
  if (!groupId && !artifactId && dependencies.length === 0) return null;

  return {
    path: '',
    buildTool: 'maven',
    groupId,
    artifactId,
    version: firstTag('version', content),
    dependencies
  };
}

// Líneas de dependencias en build.gradle (Groovy) y build.gradle.kts (Kotlin).
// implementation 'g:a:v' | implementation("g:a:v") | implementation("g:a") | testImplementation "g:a:v"
const GRADLE_DEP_REGEX =
  /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly|annotationProcessor|classpath)\s*(?:\(|\s)\s*['"]([^:]+):([^:]+)(?::([^'"]*))?['"]/;

const TEST_SCOPES = new Set(['testImplementation', 'testCompileOnly', 'testRuntimeOnly']);

/**
 * Parsea un build.gradle / build.gradle.kts: project group/version (best-effort)
 * y las dependencias con notación group:artifact:version.
 */
function parseGradleBuild(content: string): JvmProject {
  const dependencies: JvmProject['dependencies'] = [];

  const groupMatch = /^(?:group\s*=\s*|val\s+group\s*=\s*)['"]([^'"]+)['"]/m.exec(content);
  const versionMatch = /^(?:version\s*=\s*|val\s+version\s*=\s*)['"]([^'"]+)['"]/m.exec(content);

  for (const line of content.split('\n')) {
    GRADLE_DEP_REGEX.lastIndex = 0;
    const match = GRADLE_DEP_REGEX.exec(line);
    if (!match) continue;
    const [, config, groupId, artifactId, version] = match;
    dependencies.push({
      groupId,
      artifactId,
      version: version && version.length > 0 ? version : undefined,
      scope: TEST_SCOPES.has(config) ? 'test' : config ?? 'implementation'
    });
  }

  return {
    path: '',
    buildTool: 'gradle',
    groupId: groupMatch?.[1],
    artifactId: undefined,
    version: versionMatch?.[1],
    dependencies
  };
}

/**
 * Detecta los proyectos JVM del árbol leyendo pom.xml, build.gradle y
 * build.gradle.kts. Devuelve un JvmProject por manifiesto con sus
 * dependencias y metadatos disponibles.
 */
export function scanJvmProjects(
  rootPath: string,
  manifestFiles?: string[]
): JvmProject[] {
  const manifests = manifestFiles ?? findJvmManifestFiles(rootPath);
  const projects: JvmProject[] = [];

  for (const relPath of manifests) {
    const fullPath = path.join(rootPath, relPath);
    const content = readFile(fullPath);
    if (content === undefined) continue;

    const fileName = relPath.split('/').pop() ?? relPath;
    const buildTool: JvmBuildTool = fileName === 'pom.xml' ? 'maven' : 'gradle';

    const project = buildTool === 'maven' ? parseMavenPom(content) : parseGradleBuild(content);
    if (!project) continue;
    project.path = relPath;
    projects.push(project);
  }

  return projects;
}