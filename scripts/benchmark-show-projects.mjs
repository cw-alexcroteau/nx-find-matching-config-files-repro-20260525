import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { getInstalledNxPaths } from './nx-installation.mjs';

const execFileAsync = promisify(execFile);
const iterations = Number.parseInt(process.argv[2] ?? '7', 10);
const minimumProjectCount = Number.parseInt(process.argv[3] ?? '1000', 10);
const { rootDir, nxCliPath } = await getInstalledNxPaths();

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error('Iteration count must be a positive integer.');
  process.exit(1);
}

if (!Number.isInteger(minimumProjectCount) || minimumProjectCount <= 0) {
  console.error('Minimum project count must be a positive integer.');
  process.exit(1);
}

const timings = [];

for (let index = 0; index < iterations; index += 1) {
  const startedAt = performance.now();
  const { stdout } = await execFileAsync(
    process.execPath,
    [nxCliPath, 'show', 'projects', '--json'],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        CI: 'true',
        NX_DAEMON: 'false',
        NX_CACHE_PROJECTS_CONFIG: 'false',
        NX_PROJECT_GLOB_CACHE: 'false',
      },
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const elapsedMs = performance.now() - startedAt;
  const projectNames = JSON.parse(stdout);
  if (projectNames.length < minimumProjectCount) {
    console.error(
      `Expected at least ${minimumProjectCount} projects, found ${projectNames.length}. Run \`yarn generate 1356\` first.`
    );
    process.exit(1);
  }
  timings.push(elapsedMs);
  console.log(
    `run ${String(index + 1).padStart(2, '0')}: ${elapsedMs.toFixed(1)}ms (${projectNames.length} projects)`
  );
}

const sorted = [...timings].sort((left, right) => left - right);
const median = sorted[Math.floor(sorted.length / 2)];
const average = timings.reduce((sum, value) => sum + value, 0) / timings.length;

console.log('');
console.log(`median: ${median.toFixed(1)}ms`);
console.log(`average: ${average.toFixed(1)}ms`);