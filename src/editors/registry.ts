export interface EditorInfo {
  id: string;
  name: string;
  /** Comando CLI usado para detectar y abrir el editor (en PATH). */
  cli?: string;
  buildCliArgs?: (absPath: string, line?: number) => string[];
  buildDeepLink?: (absPath: string, line?: number) => string | null;
}

// Ruta normalizada a URL: barras hacia adelante, slash inicial y %20 para espacios.
// encodeURI conserva "/" y ":", que los esquemas de editor esperan.
function encodePathForUrl(absPath: string): string {
  const forward = absPath.replace(/\\/g, '/');
  return encodeURI(forward.startsWith('/') ? forward : `/${forward}`);
}

function fileDeepLink(scheme: string): (absPath: string, line?: number) => string {
  return (absPath, line) =>
    `${scheme}://file${encodePathForUrl(absPath)}${line ? `:${line}` : ''}`;
}

function fileUrlDeepLink(scheme: string): (absPath: string, line?: number) => string {
  return (absPath, line) =>
    `${scheme}://open?url=file://${encodeURI(absPath)}${line ? `&line=${line}` : ''}`;
}

function lineSuffixArgs(absPath: string, line?: number): string[] {
  return line ? [`${absPath}:${line}`] : [absPath];
}

function gotoArgs(absPath: string, line?: number): string[] {
  return line ? ['--goto', `${absPath}:${line}`] : [absPath];
}

function jetbrainsArgs(absPath: string, line?: number): string[] {
  return line ? ['--line', String(line), absPath] : [absPath];
}

// El orden es también la preferencia por defecto al detectar editores.
export const EDITORS: readonly EditorInfo[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    cli: 'code',
    buildCliArgs: gotoArgs,
    buildDeepLink: fileDeepLink('vscode')
  },
  {
    id: 'cursor',
    name: 'Cursor',
    cli: 'cursor',
    buildCliArgs: gotoArgs,
    buildDeepLink: fileDeepLink('cursor')
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    cli: 'windsurf',
    buildCliArgs: gotoArgs,
    buildDeepLink: fileDeepLink('windsurf')
  },
  {
    id: 'zed',
    name: 'Zed',
    cli: 'zed',
    buildCliArgs: lineSuffixArgs,
    buildDeepLink: fileUrlDeepLink('zed')
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    cli: 'subl',
    buildCliArgs: lineSuffixArgs,
    buildDeepLink: fileUrlDeepLink('sublime')
  },
  { id: 'idea', name: 'IntelliJ IDEA', cli: 'idea', buildCliArgs: jetbrainsArgs },
  { id: 'pycharm', name: 'PyCharm', cli: 'pycharm', buildCliArgs: jetbrainsArgs },
  { id: 'webstorm', name: 'WebStorm', cli: 'webstorm', buildCliArgs: jetbrainsArgs },
  { id: 'goland', name: 'GoLand', cli: 'goland', buildCliArgs: jetbrainsArgs },
  { id: 'clion', name: 'CLion', cli: 'clion', buildCliArgs: jetbrainsArgs },
  { id: 'rider', name: 'Rider', cli: 'rider', buildCliArgs: jetbrainsArgs },
  { id: 'phpstorm', name: 'PhpStorm', cli: 'phpstorm', buildCliArgs: jetbrainsArgs },
  { id: 'datagrip', name: 'DataGrip', cli: 'datagrip', buildCliArgs: jetbrainsArgs },
  { id: 'rubymine', name: 'RubyMine', cli: 'rubymine', buildCliArgs: jetbrainsArgs },
  {
    id: 'xcode',
    name: 'Xcode',
    cli: 'xed',
    buildCliArgs: (absPath, line) => (line ? ['-l', String(line), absPath] : [absPath])
  },
  {
    id: 'visualstudio',
    name: 'Visual Studio',
    cli: 'devenv',
    buildCliArgs: (absPath, line) => (line ? [absPath, '/Command', `Edit.Goto ${line}`] : [absPath])
  }
];

export function buildEditorCommand(
  editorId: string,
  absPath: string,
  line?: number
): { command: string; args: string[] } | null {
  const editor = EDITORS.find((candidate) => candidate.id === editorId);
  if (!editor?.cli || !editor.buildCliArgs) return null;
  return { command: editor.cli, args: editor.buildCliArgs(absPath, line) };
}

export function buildEditorDeepLink(
  editorId: string,
  absPath: string,
  line?: number
): string | null {
  const editor = EDITORS.find((candidate) => candidate.id === editorId);
  if (!editor?.buildDeepLink) return null;
  return editor.buildDeepLink(absPath, line);
}
