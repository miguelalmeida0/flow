import { copyFileSync, writeFileSync } from 'node:fs';
copyFileSync('dist/index.html','dist/404.html');
writeFileSync('dist/.nojekyll','');
await import('./verify-pages-build.mjs');
