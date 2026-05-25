import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { getInstalledNxPaths } from './nx-installation.mjs';

const execFileAsync = promisify(execFile);

export async function runShowProjectsWithPerf(runLabel = 'stock', rootDir = process.cwd()) {
  const { nxCliPath } = await getInstalledNxPaths(rootDir);
  const artifactsDir = path.join(rootDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const startedAt = performance.now();
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [nxCliPath, 'show', 'projects', '--json'],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        CI: 'true',
        NX_DAEMON: 'false',
        NX_PERF_LOGGING: 'true',
        NX_CACHE_PROJECTS_CONFIG: 'false',
        NX_PROJECT_GLOB_CACHE: 'false',
      },
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const elapsedMs = performance.now() - startedAt;
  const projectNames = JSON.parse(stdout);
  const perfLogPath = path.join(artifactsDir, `${runLabel}-show-projects-perf.log`);
  const projectListPath = path.join(artifactsDir, `${runLabel}-show-projects.json`);

  await writeFile(projectListPath, stdout);
  await writeFile(
    perfLogPath,
    [
      `label: ${runLabel}`,
      `elapsedMs: ${elapsedMs.toFixed(1)}`,
      `projectCount: ${projectNames.length}`,
      '',
      stderr.trim(),
    ]
      .filter(Boolean)
      .join('\n') + '\n'
  );

  return {
    elapsedMs,
    projectCount: projectNames.length,
    perfLogPath,
    projectListPath,
  };
}