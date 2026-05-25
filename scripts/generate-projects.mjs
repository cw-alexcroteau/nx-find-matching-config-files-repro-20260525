import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const libsDir = path.join(rootDir, 'libs');
const countArg = process.argv[2];
const projectCount = Number.parseInt(countArg ?? '1356', 10);

if (!Number.isInteger(projectCount) || projectCount <= 0) {
  console.error('Project count must be a positive integer.');
  process.exit(1);
}

await rm(libsDir, { recursive: true, force: true });
await mkdir(libsDir, { recursive: true });

for (let index = 1; index <= projectCount; index += 1) {
  const projectName = `repro-lib-${String(index).padStart(4, '0')}`;
  const projectRoot = path.join(libsDir, projectName);
  const sourceRoot = path.join(projectRoot, 'src');

  await mkdir(sourceRoot, { recursive: true });

  await writeFile(
    path.join(projectRoot, 'project.json'),
    JSON.stringify(
      {
        name: projectName,
        root: `libs/${projectName}`,
        sourceRoot: `libs/${projectName}/src`,
        projectType: 'library',
        tags: ['scope:repro'],
      },
      null,
      2
    ) + '\n'
  );

  await writeFile(
    path.join(sourceRoot, 'index.ts'),
    `export const ${projectName.replace(/-/g, '_')} = '${projectName}';\n`
  );
}

console.log(`Generated ${projectCount} projects under libs/.`);