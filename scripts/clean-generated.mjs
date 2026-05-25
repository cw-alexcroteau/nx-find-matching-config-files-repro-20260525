import { rm } from 'node:fs/promises';
import path from 'node:path';

await rm(path.join(process.cwd(), 'libs'), { recursive: true, force: true });
console.log('Removed generated libs/.');