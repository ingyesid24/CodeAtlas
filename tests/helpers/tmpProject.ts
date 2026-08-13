import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type FixtureTree = { [name: string]: string | FixtureTree };

export function createTempProject(tree: FixtureTree): string {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'codeatlas-test-'));
  writeTree(rootPath, tree);
  return rootPath;
}

function writeTree(basePath: string, tree: FixtureTree): void {
  for (const [name, value] of Object.entries(tree)) {
    const fullPath = path.join(basePath, name);

    if (typeof value === 'string') {
      fs.writeFileSync(fullPath, value, 'utf-8');
      continue;
    }

    fs.mkdirSync(fullPath, { recursive: true });
    writeTree(fullPath, value);
  }
}

export function cleanupTempProject(rootPath: string): void {
  fs.rmSync(rootPath, { recursive: true, force: true });
}
