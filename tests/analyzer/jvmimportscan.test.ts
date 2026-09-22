import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { scanJvmImports } from '../../src/analyzer/jvmimportscan';
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

describe('scanJvmImports', () => {
  it('detecta imports de Java y resuelve clases locales por paquete', () => {
    const root = setup({
      'src/main/java/com/example/app/Main.java': [
        'package com.example.app;',
        "import com.example.util.Helper;",
        "import java.util.List;",
        'public class Main {}'
      ].join('\n'),
      'src/main/java/com/example/util/Helper.java': [
        'package com.example.util;',
        'public class Helper {}'
      ].join('\n')
    });

    const imports = scanJvmImports(root);

    expect(imports).toEqual([
      {
        file: path.join('src', 'main', 'java', 'com', 'example', 'app', 'Main.java'),
        specifier: 'com.example.util.Helper',
        line: 2,
        target: path.join('src', 'main', 'java', 'com', 'example', 'util', 'Helper.java')
      },
      {
        file: path.join('src', 'main', 'java', 'com', 'example', 'app', 'Main.java'),
        specifier: 'java.util.List',
        line: 3,
        target: undefined
      }
    ]);
  });

  it('resuelve imports static a la clase que los define', () => {
    const root = setup({
      'src/Service.java': [
        'package com.example;',
        "import static com.example.Constants.MAX;",
        'class Service {}'
      ].join('\n'),
      'src/Constants.java': [
        'package com.example;',
        'public class Constants { public static final int MAX = 10; }'
      ].join('\n')
    });

    const imports = scanJvmImports(root);
    expect(imports).toEqual([
      {
        file: 'src/Service.java',
        specifier: 'com.example.Constants.MAX',
        line: 2,
        target: 'src/Constants.java'
      }
    ]);
  });

  it('detecta imports de Kotlin sin punto y coma', () => {
    const root = setup({
      'src/main/kotlin/com/example/app/Main.kt': [
        'package com.example.app',
        'import com.example.util.Helper',
        'fun main() {}'
      ].join('\n'),
      'src/main/kotlin/com/example/util/Helper.kt': [
        'package com.example.util',
        'class Helper'
      ].join('\n')
    });

    const imports = scanJvmImports(root);
    expect(imports).toEqual([
      {
        file: path.join('src', 'main', 'kotlin', 'com', 'example', 'app', 'Main.kt'),
        specifier: 'com.example.util.Helper',
        line: 2,
        target: path.join('src', 'main', 'kotlin', 'com', 'example', 'util', 'Helper.kt')
      }
    ]);
  });

  it('conserva los imports wildcard sin target', () => {
    const root = setup({
      'src/Main.java': [
        'package com.example;',
        'import com.example.util.*;',
        'class Main {}'
      ].join('\n')
    });

    const imports = scanJvmImports(root);
    expect(imports).toEqual([
      {
        file: 'src/Main.java',
        specifier: 'com.example.util.*',
        line: 2,
        target: undefined
      }
    ]);
  });

  it('ignora comentarios que mencionan imports', () => {
    const root = setup({
      'src/Main.java': [
        'package com.example;',
        '// import com.example.fake.Fake;',
        'class Main {}'
      ].join('\n')
    });

    expect(scanJvmImports(root)).toEqual([]);
  });

  it('no resuelve imports de la JDK ni de librerías externas', () => {
    const root = setup({
      'src/Main.java': [
        'package com.example;',
        'import org.springframework.web.bind.annotation.GetMapping;',
        'import java.util.ArrayList;',
        'class Main {}'
      ].join('\n')
    });

    const imports = scanJvmImports(root);
    expect(imports.map((i) => i.target)).toEqual([undefined, undefined]);
  });

  it('devuelve lista vacía en un proyecto sin archivos Java/Kotlin', () => {
    const root = setup({ 'src/app.ts': 'console.log("hola");' });

    expect(scanJvmImports(root)).toEqual([]);
  });
});