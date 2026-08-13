import { describe, expect, it } from 'vitest';
import { buildEditorCommand, buildEditorDeepLink, EDITORS } from '../../src/editors/registry';

describe('buildEditorCommand', () => {
  it('abre VS Code, Cursor y Windsurf con --goto path:line', () => {
    for (const id of ['vscode', 'cursor', 'windsurf']) {
      expect(buildEditorCommand(id, '/repo/src/server.ts', 42)).toEqual({
        command: id === 'vscode' ? 'code' : id,
        args: ['--goto', '/repo/src/server.ts:42']
      });
    }
  });

  it('abre editores JetBrains con --line', () => {
    expect(buildEditorCommand('pycharm', '/x/main.py', 7)).toEqual({
      command: 'pycharm',
      args: ['--line', '7', '/x/main.py']
    });
    expect(buildEditorCommand('idea', '/x/Main.java')).toEqual({
      command: 'idea',
      args: ['/x/Main.java']
    });
  });

  it('abre Xcode con -l y Visual Studio con Edit.Goto', () => {
    expect(buildEditorCommand('xcode', '/x/main.swift', 3)).toEqual({
      command: 'xed',
      args: ['-l', '3', '/x/main.swift']
    });
    expect(buildEditorCommand('visualstudio', 'C:\\proj\\main.cs', 5)).toEqual({
      command: 'devenv',
      args: ['C:\\proj\\main.cs', '/Command', 'Edit.Goto 5']
    });
  });

  it('abre Zed y Sublime con path:line', () => {
    expect(buildEditorCommand('zed', '/a/b.ts', 9)).toEqual({
      command: 'zed',
      args: ['/a/b.ts:9']
    });
    expect(buildEditorCommand('sublime', '/a/b.ts', 9)).toEqual({
      command: 'subl',
      args: ['/a/b.ts:9']
    });
  });

  it('devuelve null para editores desconocidos o sin CLI', () => {
    expect(buildEditorCommand('no-existe', '/a/b.ts')).toBeNull();
  });

  it('todo editor con CLI declara args de apertura', () => {
    for (const editor of EDITORS) {
      if (!editor.cli) continue;
      expect(typeof editor.buildCliArgs).toBe('function');
      const args = editor.buildCliArgs!('/a/b.ts', 1);
      expect(args.some((arg) => arg.startsWith('/a/b.ts'))).toBe(true);
    }
  });
});

describe('buildEditorDeepLink', () => {
  it('construye enlaces file:// con la línea', () => {
    expect(buildEditorDeepLink('vscode', '/repo/src/server.ts', 42)).toBe(
      'vscode://file/repo/src/server.ts:42'
    );
    expect(buildEditorDeepLink('cursor', '/a/b.ts', 1)).toBe('cursor://file/a/b.ts:1');
    expect(buildEditorDeepLink('windsurf', '/a/b.ts', 1)).toBe('windsurf://file/a/b.ts:1');
  });

  it('construye enlaces zed://open y sublime://open con file URL', () => {
    expect(buildEditorDeepLink('zed', '/a/b.ts', 12)).toBe(
      'zed://open?url=file:///a/b.ts&line=12'
    );
    expect(buildEditorDeepLink('sublime', '/a/b.ts')).toBe('sublime://open?url=file:///a/b.ts');
  });

  it('codifica espacios y normaliza rutas de Windows', () => {
    expect(buildEditorDeepLink('vscode', '/a b/f.ts', 10)).toBe('vscode://file/a%20b/f.ts:10');
    expect(buildEditorDeepLink('vscode', 'C:\\repo\\file.ts', 3)).toBe(
      'vscode://file/C:/repo/file.ts:3'
    );
  });

  it('devuelve null para editores sin deep link', () => {
    expect(buildEditorDeepLink('idea', '/a/b.ts', 1)).toBeNull();
    expect(buildEditorDeepLink('xcode', '/a/b.ts', 1)).toBeNull();
    expect(buildEditorDeepLink('visualstudio', '/a/b.ts', 1)).toBeNull();
  });
});
