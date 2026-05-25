import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inputDir = path.resolve(process.cwd(), process.argv[2] ?? 'artifacts/downloaded');
const outputDir = path.join(process.cwd(), 'artifacts', 'final');

async function collectSummaryFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSummaryFiles(entryPath)));
    } else if (entry.name === 'summary.json') {
      files.push(entryPath);
    }
  }

  return files;
}

const summaryFiles = await collectSummaryFiles(inputDir);
const summaries = await Promise.all(
  summaryFiles.map(async (filePath) => JSON.parse(await readFile(filePath, 'utf8')))
);

summaries.sort((left, right) => left.key.localeCompare(right.key));

await mkdir(outputDir, { recursive: true });

const markdownLines = [
  '# Cross-Platform Perf Report',
  '',
  '| key | platform | arch | show-projects median ms | build-project-configs saved ms | retrieve-project-configurations saved ms | matcher speedup vs compile | matcher speedup no-rematch |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...summaries.map(
    (summary) =>
      `| ${summary.key} | ${summary.platform} | ${summary.arch} | ${summary.benchmarkShowProjects.medianMs ?? 'n/a'} | ${summary.compareShowProjectsPerf.buildProjectConfigsMedianSavedMs ?? 'n/a'} | ${summary.compareShowProjectsPerf.retrieveProjectConfigurationsMedianSavedMs ?? 'n/a'} | ${summary.benchmarkMatcher.speedupVsCompile ?? 'n/a'}x | ${summary.benchmarkMatcher.speedupNoRematch ?? 'n/a'}x |`
  ),
  '',
  '## Per-Runner Details',
  '',
  ...summaries.flatMap((summary) => [
    `### ${summary.key}`,
    '',
    `- platform: ${summary.platform}`,
    `- arch: ${summary.arch}`,
    `- release: ${summary.release}`,
    `- show-projects median: ${summary.benchmarkShowProjects.medianMs}ms`,
    `- build-project-configs saved: ${summary.compareShowProjectsPerf.buildProjectConfigsMedianSavedMs}ms`,
    `- retrieve-project-configurations saved: ${summary.compareShowProjectsPerf.retrieveProjectConfigurationsMedianSavedMs}ms`,
    `- matcher speedup vs compile: ${summary.benchmarkMatcher.speedupVsCompile}x`,
    `- matcher speedup no-rematch: ${summary.benchmarkMatcher.speedupNoRematch}x`,
    '',
  ]),
];

await writeFile(path.join(outputDir, 'perf-report.json'), JSON.stringify(summaries, null, 2) + '\n');
await writeFile(path.join(outputDir, 'perf-report.md'), markdownLines.join('\n'));

console.log(markdownLines.join('\n'));