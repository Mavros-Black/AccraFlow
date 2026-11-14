import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('maplibre-gl/package.json'));
await mkdir(new URL('../public/vendor/maplibre/', import.meta.url), {recursive:true});
for(const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
 await copyFile(join(source,'dist',file),new URL('../public/vendor/maplibre/'+file,import.meta.url));
}
await copyFile(join(source,'LICENSE.txt'),new URL('../public/vendor/maplibre/LICENSE.txt',import.meta.url));
