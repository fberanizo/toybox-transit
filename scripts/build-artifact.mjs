#!/usr/bin/env node
// Build a single self-contained HTML page from the repository code, for publishing as a Claude Artifact.
// Same modules, same rules, same levels as the static site: index.html markup + style.css + src/audio.js +
// an esbuild bundle of src/main.js. three.js r128 loads from cdnjs (allowed by the Artifact CSP);
// any assets/* file referenced by the code or CSS is embedded as a data: URI.
//
// Usage: node scripts/build-artifact.mjs  →  dist/toybox-transit-<buildId>.html (+ dist/latest.html)

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { GEN_VERSION, MILESTONE } from '../src/core/version.js';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

function gitInfo() {
    try {
        const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
        const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim().length > 0;
        return sha + (dirty ? '+' : '');
    } catch {
        return 'nogit';
    }
}

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const buildId = `${MILESTONE.toLowerCase()}-${gitInfo()}-${date}-g${GEN_VERSION}`;

const bundle = await build({
    entryPoints: [join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: true,
    write: false,
    legalComments: 'none'
});
let js = bundle.outputFiles[0].text;
// The generator worker is bundled separately and started from a Blob URL (Artifacts allow blob: workers).
const workerBundle = await build({
    entryPoints: [join(root, 'src/worker/gen-worker.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: true,
    write: false,
    legalComments: 'none'
});
const workerSrc = workerBundle.outputFiles[0].text;
let css = read('style.css');
const audio = read('src/audio.js');

// Body markup from index.html (everything between <body> and the first <script>), and font links from <head>.
const html = read('index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
const fontLinks = (html.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/g) || []).join('\n');

// Embed assets referenced as "assets/<name>" (JS, CSS and markup).
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const assetsDir = join(root, 'assets');
let embedded = 0;
if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
        const mime = MIME[extname(f).toLowerCase()];
        if (!mime) continue;
        const ref = `assets/${f}`;
        if (!js.includes(ref) && !css.includes(ref) && !body.includes(ref)) continue;
        const uri = `data:${mime};base64,${readFileSync(join(assetsDir, f)).toString('base64')}`;
        js = js.split(ref).join(uri);
        css = css.split(ref).join(uri);
        body = body.split(ref).join(uri);
        embedded++;
    }
}

const page = `<title>Toybox Transit</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="description" content="Ad-free toy-vehicle puzzle. Build ${buildId}.">
${fontLinks}
<style>
html, body { height: 100%; }
${css}
</style>
${body.trim()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>window.__BUILD_ID__ = ${JSON.stringify(buildId)};
window.__WORKER_SRC__ = ${JSON.stringify(workerSrc).replace(/<\/script/gi, '<\\/script')};</script>
<script>
${audio}
</script>
<script>
${js}
</script>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `toybox-transit-${buildId}.html`);
writeFileSync(out, page);
copyFileSync(out, join(root, 'dist', 'latest.html'));
console.log(JSON.stringify({ buildId, out, bytes: page.length, embeddedAssets: embedded }));
