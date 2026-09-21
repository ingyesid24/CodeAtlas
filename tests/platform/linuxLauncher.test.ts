import { describe, expect, it } from 'vitest';
import {
  buildDesktopEntry,
  buildLauncherScript,
  launcherPath
} from '../../src/platform/linuxLauncher';

describe('buildLauncherScript', () => {
  it('embebe el directorio base de instalación', () => {
    const script = buildLauncherScript('/home/user/Applications');
    expect(script).toContain('BASE_DIR="/home/user/Applications"');
  });

  it('busca el AppImage más reciente y lo ejecuta', () => {
    const script = buildLauncherScript('/home/user/Applications');
    expect(script).toContain('find_latest_appimage');
    expect(script).toContain('"$dir"/CodeAtlas-*.AppImage');
    expect(script).toContain('exec "$APPIMAGE_PATH" --no-sandbox "$@"');
  });

  it('no contiene ninguna referencia a un nombre de archivo versionado', () => {
    const script = buildLauncherScript('/home/user/Applications');
    expect(script).not.toMatch(/CodeAtlas-\d+\.\d+\.\d+\.AppImage/);
  });

  it('avisa con un mensaje claro si no encuentra ningún AppImage', () => {
    const script = buildLauncherScript('/home/user/Applications');
    expect(script).toContain('no se encontro ningun CodeAtlas-*.AppImage instalado');
    expect(script).toContain('https://github.com/ingyesid24/CodeAtlas/releases/latest');
  });
});

describe('buildDesktopEntry', () => {
  it('apunta al launcher estable y no a un AppImage versionado', () => {
    const entry = buildDesktopEntry('/home/user/.local/bin/codeatlas');
    expect(entry).toContain('Exec=/home/user/.local/bin/codeatlas %U');
    expect(entry).not.toMatch(/CodeAtlas-\d+\.\d+\.\d+\.AppImage/);
    expect(entry).not.toContain('--no-sandbox');
  });

  it('incluye los campos esenciales del escritorio', () => {
    const entry = buildDesktopEntry('/home/user/.local/bin/codeatlas');
    expect(entry).toContain('[Desktop Entry]');
    expect(entry).toContain('Name=CodeAtlas');
    expect(entry).toContain('Type=Application');
    expect(entry).toContain('Icon=codeatlas');
  });
});

describe('launcherPath', () => {
  it('resuelve la ruta dentro de ~/.local/bin', () => {
    expect(launcherPath('/home/user')).toBe('/home/user/.local/bin/codeatlas');
  });
});