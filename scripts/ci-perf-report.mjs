import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getInstalledNxPaths } from './nx-installation.mjs';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const reportKey = process.argv[2] ?? process.env.PERF_REPORT_KEY ?? 'local';
const reportDir = path.join(rootDir, 'artifacts', 'ci', reportKey);

await mkdir(reportDir, { recursive: true });

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseFloatMetric(text, label) {
  const match = stripAnsi(text).match(new RegExp(`${label}:\\s+([0-9.]+)`));
  return match ? Number.parseFloat(match[1]) : null;
}

function parseIntMetric(text, label) {
  const match = stripAnsi(text).match(new RegExp(`${label}:\\s+([0-9]+)`));
  return match ? Number.parseInt(match[1], 10) : null;
}

async function runNodeScript(scriptPath, args = []) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      CI: 'true',
    },
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    stdout,
    stderr,
    combinedOutput: [stdout.trim(), stderr.trim()].filter(Boolean).join('\n'),
  };
}

async function runNxReport() {
  const { nxCliPath } = await getInstalledNxPaths(rootDir);
  const { stdout, stderr } = await execFileAsync(process.execPath, [nxCliPath, 'report'], {
    cwd: rootDir,
    env: {
      ...process.env,
      CI: 'true',
    },
    maxBuffer: 20 * 1024 * 1024,
  });

  return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') + '\n';
}

const benchmarkShowProjects = await runNodeScript('./scripts/benchmark-show-projects.mjs');
const captureShowProjectsPerf = await runNodeScript('./scripts/capture-show-projects-perf.mjs', [reportKey]);
const compareShowProjectsPerf = await runNodeScript('./scripts/compare-show-projects-perf.mjs', ['3']);
const benchmarkMatcher = await runNodeScript('./scripts/benchmark-matcher.mjs');
const nxReport = await runNxReport();

await writeFile(path.join(reportDir, 'benchmark-show-projects.txt'), benchmarkShowProjects.combinedOutput + '\n');
await writeFile(path.join(reportDir, 'capture-show-projects-perf.txt'), captureShowProjectsPerf.combinedOutput + '\n');
await writeFile(path.join(reportDir, 'compare-show-projects-perf.txt'), compareShowProjectsPerf.combinedOutput + '\n');
await writeFile(path.join(reportDir, 'benchmark-matcher.txt'), benchmarkMatcher.combinedOutput + '\n');
await writeFile(path.join(reportDir, 'nx-report.txt'), nxReport);

const rootArtifactsDir = path.join(rootDir, 'artifacts');
for (const suffix of ['show-projects-perf.log', 'show-projects.json']) {
  const stockPath = path.join(rootArtifactsDir, `${reportKey}-${suffix}`);
  try {
    await cp(stockPath, path.join(reportDir, path.basename(stockPath)));
  } catch {}
}

const summary = {
  key: reportKey,
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  benchmarkShowProjects: {
    medianMs: parseFloatMetric(benchmarkShowProjects.combinedOutput, 'median'),
    averageMs: parseFloatMetric(benchmarkShowProjects.combinedOutput, 'average'),
    projectCount: parseIntMetric(benchmarkShowProjects.combinedOutput, 'projects') ?? parseIntMetric(captureShowProjectsPerf.combinedOutput, 'projectCount'),
  },
  benchmarkMatcher: {
    compileInsideLoopMs: parseFloatMetric(benchmarkMatcher.combinedOutput, 'compile-inside-loop'),
    compileOnceMs: parseFloatMetric(benchmarkMatcher.combinedOutput, 'compile-once'),
    speedupVsCompile: parseFloatMetric(benchmarkMatcher.combinedOutput, 'speedup-vs-compile'),
    noRematchMs: parseFloatMetric(benchmarkMatcher.combinedOutput, 'no-rematch'),
    speedupNoRematch: parseFloatMetric(benchmarkMatcher.combinedOutput, 'speedup-no-rematch'),
  },
  compareShowProjectsPerf: {
    iterationsPerMode: parseIntMetric(compareShowProjectsPerf.combinedOutput, 'iterationsPerMode'),
    stockElapsedMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'stockElapsedMedianMs'),
    patchedElapsedMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'patchedElapsedMedianMs'),
    elapsedMedianSavedMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'elapsedMedianSavedMs'),
    elapsedMedianSpeedup: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'elapsedMedianSpeedup'),
    buildProjectConfigsStockMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'buildProjectConfigsStockMedianMs'),
    buildProjectConfigsPatchedMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'buildProjectConfigsPatchedMedianMs'),
    buildProjectConfigsMedianSavedMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'buildProjectConfigsMedianSavedMs'),
    retrieveProjectConfigurationsStockMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'retrieveProjectConfigurationsStockMedianMs'),
    retrieveProjectConfigurationsPatchedMedianMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'retrieveProjectConfigurationsPatchedMedianMs'),
    retrieveProjectConfigurationsMedianSavedMs: parseFloatMetric(compareShowProjectsPerf.combinedOutput, 'retrieveProjectConfigurationsMedianSavedMs'),
  },
};

const markdown = [
  `# Perf Report: ${reportKey}`,
  '',
  `- platform: ${summary.platform}`,
  `- arch: ${summary.arch}`,
  `- release: ${summary.release}`,
  '',
  '## benchmark-show-projects',
  '',
  `- medianMs: ${summary.benchmarkShowProjects.medianMs}`,
  `- averageMs: ${summary.benchmarkShowProjects.averageMs}`,
  `- projectCount: ${summary.benchmarkShowProjects.projectCount}`,
  '',
  '## benchmark-matcher',
  '',
  `- compileInsideLoopMs: ${summary.benchmarkMatcher.compileInsideLoopMs}`,
  `- compileOnceMs: ${summary.benchmarkMatcher.compileOnceMs}`,
  `- speedupVsCompile: ${summary.benchmarkMatcher.speedupVsCompile}x`,
  `- noRematchMs: ${summary.benchmarkMatcher.noRematchMs}`,
  `- speedupNoRematch: ${summary.benchmarkMatcher.speedupNoRematch}x`,
  '',
  '## compare-show-projects-perf',
  '',
  `- iterationsPerMode: ${summary.compareShowProjectsPerf.iterationsPerMode}`,
  `- stockElapsedMedianMs: ${summary.compareShowProjectsPerf.stockElapsedMedianMs}`,
  `- patchedElapsedMedianMs: ${summary.compareShowProjectsPerf.patchedElapsedMedianMs}`,
  `- elapsedMedianSavedMs: ${summary.compareShowProjectsPerf.elapsedMedianSavedMs}`,
  `- elapsedMedianSpeedup: ${summary.compareShowProjectsPerf.elapsedMedianSpeedup}x`,
  `- buildProjectConfigsStockMedianMs: ${summary.compareShowProjectsPerf.buildProjectConfigsStockMedianMs}`,
  `- buildProjectConfigsPatchedMedianMs: ${summary.compareShowProjectsPerf.buildProjectConfigsPatchedMedianMs}`,
  `- buildProjectConfigsMedianSavedMs: ${summary.compareShowProjectsPerf.buildProjectConfigsMedianSavedMs}`,
  `- retrieveProjectConfigurationsStockMedianMs: ${summary.compareShowProjectsPerf.retrieveProjectConfigurationsStockMedianMs}`,
  `- retrieveProjectConfigurationsPatchedMedianMs: ${summary.compareShowProjectsPerf.retrieveProjectConfigurationsPatchedMedianMs}`,
  `- retrieveProjectConfigurationsMedianSavedMs: ${summary.compareShowProjectsPerf.retrieveProjectConfigurationsMedianSavedMs}`,
].join('\n') + '\n';

await writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await writeFile(path.join(reportDir, 'summary.md'), markdown);

console.log(markdown);