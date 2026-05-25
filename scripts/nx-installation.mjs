import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function getInstalledNxPaths(rootDir = process.cwd()) {
  const nxPackageJson = JSON.parse(
    await readFile(path.join(rootDir, 'node_modules', 'nx', 'package.json'), 'utf8')
  );

  return {
    rootDir,
    nxCliPath: path.join(
      rootDir,
      'node_modules',
      'nx',
      nxPackageJson.bin.nx.replace(/^\.\//, '')
    ),
    projectConfigurationUtilsPath: path.join(
      rootDir,
      'node_modules',
      'nx',
      'dist',
      'src',
      'project-graph',
      'utils',
      'project-configuration-utils.js'
    ),
  };
}