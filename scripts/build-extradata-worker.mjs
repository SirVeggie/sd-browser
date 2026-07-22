import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, '..');
const srcLib = path.join(projectRoot, 'src/lib');
const outDir = path.join(projectRoot, 'build', 'workers');
mkdirSync(outDir, { recursive: true });

const shared = {
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    alias: {
        '$lib': srcLib,
    },
};

await build({
    ...shared,
    entryPoints: [path.join(projectRoot, 'src/lib/server/workers/extradataCompute.worker.ts')],
    outfile: path.join(outDir, 'extradataCompute.js'),
});
console.log('Built extradata worker to build/workers/extradataCompute.js');

await build({
    ...shared,
    entryPoints: [path.join(projectRoot, 'src/lib/server/workers/indexing.worker.ts')],
    outfile: path.join(outDir, 'indexing.js'),
});
console.log('Built indexing worker to build/workers/indexing.js');
