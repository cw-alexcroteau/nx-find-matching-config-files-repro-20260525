import { readFile, writeFile } from 'node:fs/promises';
import { getInstalledNxPaths } from './nx-installation.mjs';
import { runShowProjectsWithPerf } from './show-projects-perf-lib.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '3', 10);
const { projectConfigurationUtilsPath } = await getInstalledNxPaths();
const originalSource = await readFile(projectConfigurationUtilsPath, 'utf8');

if (!Number.isInteger(iterations) || iterations <= 0) {
  throw new Error('Iteration count must be a positive integer.');
}

function applyPatternMatcherPatch(source) {
  return source.replace(
    [
      '    for (const file of projectFiles) {',
      '        if ((0, minimatch_1.minimatch)(file, pattern, { dot: true })) {',
      '            if (!includes(file)) {',
      '                continue;',
      '            }',
      '            if (excludes(file)) {',
      '                continue;',
      '            }',
      '            matchingConfigFiles.push(file);',
      '        }',
      '    }',
    ].join('\n'),
    [
      '    for (const file of projectFiles) {',
      '        if (!includes(file)) {',
      '            continue;',
      '        }',
      '        if (excludes(file)) {',
      '            continue;',
      '        }',
      '        matchingConfigFiles.push(file);',
      '    }',
    ].join('\n')
  );
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function readTiming(logContent, metricName) {
  const cleanLogContent = stripAnsi(logContent);
  const escapedMetricName = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cleanLogContent.match(
    new RegExp(`Time taken for '${escapedMetricName}' ([0-9.]+)ms`)
  );
  return match ? Number.parseFloat(match[1]) : null;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function collectMetrics(labelPrefix) {
  const results = [];

  for (let index = 0; index < iterations; index += 1) {
    const label = `${labelPrefix}-${String(index + 1).padStart(2, '0')}`;
    const runResult = await runShowProjectsWithPerf(label);
    const logContent = await readFile(runResult.perfLogPath, 'utf8');

    results.push({
      elapsedMs: runResult.elapsedMs,
      buildProjectConfigsMs: readTiming(logContent, 'build-project-configs'),
      retrieveProjectConfigurationsMs: readTiming(
        logContent,
        'createProjectGraphAsync >> retrieve-project-configurations'
      ),
    });
  }

  return results;
}

const patchedSource = applyPatternMatcherPatch(originalSource);

if (patchedSource === originalSource) {
  throw new Error('Unable to patch installed Nx. The built file shape no longer matches the expected source.');
}

try {
  const stockResults = await collectMetrics('stock');
  await writeFile(projectConfigurationUtilsPath, patchedSource);
  const patchedResults = await collectMetrics('patched');

  const stockElapsedMs = median(stockResults.map((result) => result.elapsedMs));
  const patchedElapsedMs = median(patchedResults.map((result) => result.elapsedMs));

  const stockBuildProjectConfigsValues = stockResults
    .map((result) => result.buildProjectConfigsMs)
    .filter((value) => value !== null);
  const patchedBuildProjectConfigsValues = patchedResults
    .map((result) => result.buildProjectConfigsMs)
    .filter((value) => value !== null);
  const stockRetrieveConfigsValues = stockResults
    .map((result) => result.retrieveProjectConfigurationsMs)
    .filter((value) => value !== null);
  const patchedRetrieveConfigsValues = patchedResults
    .map((result) => result.retrieveProjectConfigurationsMs)
    .filter((value) => value !== null);

  console.log('');
  console.log(`iterationsPerMode: ${iterations}`);
  console.log(`stockElapsedMedianMs: ${stockElapsedMs.toFixed(1)}`);
  console.log(`patchedElapsedMedianMs: ${patchedElapsedMs.toFixed(1)}`);
  console.log(`elapsedMedianSavedMs: ${(stockElapsedMs - patchedElapsedMs).toFixed(1)}`);
  console.log(`elapsedMedianSpeedup: ${(stockElapsedMs / patchedElapsedMs).toFixed(2)}x`);

  if (stockBuildProjectConfigsValues.length && patchedBuildProjectConfigsValues.length) {
    const stockBuildProjectConfigsMedianMs = median(stockBuildProjectConfigsValues);
    const patchedBuildProjectConfigsMedianMs = median(
      patchedBuildProjectConfigsValues
    );

    console.log(
      `buildProjectConfigsStockMedianMs: ${stockBuildProjectConfigsMedianMs.toFixed(1)}`
    );
    console.log(
      `buildProjectConfigsPatchedMedianMs: ${patchedBuildProjectConfigsMedianMs.toFixed(1)}`
    );
    console.log(
      `buildProjectConfigsMedianSavedMs: ${(
        stockBuildProjectConfigsMedianMs - patchedBuildProjectConfigsMedianMs
      ).toFixed(1)}`
    );
  }

  if (stockRetrieveConfigsValues.length && patchedRetrieveConfigsValues.length) {
    const stockRetrieveConfigsMedianMs = median(stockRetrieveConfigsValues);
    const patchedRetrieveConfigsMedianMs = median(patchedRetrieveConfigsValues);

    console.log(
      `retrieveProjectConfigurationsStockMedianMs: ${stockRetrieveConfigsMedianMs.toFixed(1)}`
    );
    console.log(
      `retrieveProjectConfigurationsPatchedMedianMs: ${patchedRetrieveConfigsMedianMs.toFixed(1)}`
    );
    console.log(
      `retrieveProjectConfigurationsMedianSavedMs: ${(
        stockRetrieveConfigsMedianMs - patchedRetrieveConfigsMedianMs
      ).toFixed(1)}`
    );
  }
} finally {
  await writeFile(projectConfigurationUtilsPath, originalSource);
}