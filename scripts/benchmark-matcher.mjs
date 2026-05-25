import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Minimatch, minimatch } from 'minimatch';

const pattern = '**/project.json';
const iterations = Number.parseInt(process.argv[2] ?? '100', 10);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error('Iteration count must be a positive integer.');
  process.exit(1);
}

const libsDir = path.join(process.cwd(), 'libs');
const entries = await readdir(libsDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => `libs/${entry.name}/project.json`);

if (files.length === 0) {
  console.error('No generated projects found. Run `yarn generate 1356` first.');
  process.exit(1);
}

function measureSlowPath() {
  const startedAt = performance.now();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const matches = [];
    for (const file of files) {
      if (minimatch(file, pattern, { dot: true })) {
        matches.push(file);
      }
    }
    if (matches.length !== files.length) {
      throw new Error('Slow-path benchmark produced an unexpected match count.');
    }
  }

  return performance.now() - startedAt;
}

function measureFastPath() {
  const startedAt = performance.now();
  const matcher = new Minimatch(pattern, { dot: true });

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const matches = [];
    for (const file of files) {
      if (matcher.match(file)) {
        matches.push(file);
      }
    }
    if (matches.length !== files.length) {
      throw new Error('Fast-path benchmark produced an unexpected match count.');
    }
  }

  return performance.now() - startedAt;
}

function measureNoRematchPath() {
  const startedAt = performance.now();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const matches = [];
    for (const file of files) {
      matches.push(file);
    }
    if (matches.length !== files.length) {
      throw new Error('No-rematch benchmark produced an unexpected match count.');
    }
  }

  return performance.now() - startedAt;
}

const slowPathMs = measureSlowPath();
const fastPathMs = measureFastPath();
const noRematchMs = measureNoRematchPath();
const compileOnceDeltaMs = slowPathMs - fastPathMs;
const compileOnceSpeedup = slowPathMs / fastPathMs;
const noRematchDeltaMs = slowPathMs - noRematchMs;
const noRematchSpeedup = slowPathMs / noRematchMs;

console.log(`projects: ${files.length}`);
console.log(`iterations: ${iterations}`);
console.log(`compile-inside-loop: ${slowPathMs.toFixed(1)}ms`);
console.log(`compile-once:        ${fastPathMs.toFixed(1)}ms`);
console.log(`saved-vs-compile:    ${compileOnceDeltaMs.toFixed(1)}ms`);
console.log(`speedup-vs-compile:  ${compileOnceSpeedup.toFixed(2)}x`);
console.log(`no-rematch:          ${noRematchMs.toFixed(1)}ms`);
console.log(`saved-vs-no-rematch: ${noRematchDeltaMs.toFixed(1)}ms`);
console.log(`speedup-no-rematch:  ${noRematchSpeedup.toFixed(2)}x`);