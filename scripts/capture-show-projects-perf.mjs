const rootDir = process.cwd();
const label = process.argv[2] ?? 'stock';
import { runShowProjectsWithPerf } from './show-projects-perf-lib.mjs';

const result = await runShowProjectsWithPerf(label, rootDir);

console.log(`label: ${label}`);
console.log(`elapsedMs: ${result.elapsedMs.toFixed(1)}`);
console.log(`projectCount: ${result.projectCount}`);
console.log(`perfLog: ${result.perfLogPath}`);
console.log(`projectList: ${result.projectListPath}`);