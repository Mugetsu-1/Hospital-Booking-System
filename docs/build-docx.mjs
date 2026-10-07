// @ts-check
/**
 * Build docs/LAB_REPORT.docx from the canonical docs/LAB_REPORT.md — pure Node,
 * no system dependencies (pandoc not required).
 *
 * Pipeline:
 *   1. mermaid-cli (mmdc) renders every ```mermaid block in the report to a PNG
 *      and rewrites the markdown to reference those images.
 *   2. marked converts the rewritten markdown to HTML; diagram PNGs (and any
 *      screenshots/*.png) are inlined as sized base64 <img> tags.
 *   3. @turbodocx/html-to-docx converts the HTML to a Word .docx.
 *
 * The report markdown stays the single source of truth — nothing is duplicated,
 * so the .docx can never drift from the diagrams rendered on GitHub.
 *
 * Setup (once):   cd docs && npm install
 * Build:          cd docs && npm run build:docx   (or: node docs/build-docx.mjs)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import htmlToDocx from '@turbodocx/html-to-docx';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(DOCS_DIR, '..');
const ASSETS_DIR = join(DOCS_DIR, 'assets');
const SHOTS_DIR = join(REPO_ROOT, 'screenshots');

const SOURCE_MD = join(DOCS_DIR, 'LAB_REPORT.md');
const RENDERED_MD = join(ASSETS_DIR, 'LAB_REPORT.rendered.md');
const OUT_DOCX = join(DOCS_DIR, 'LAB_REPORT.docx');

const isWin = process.platform === 'win32';
const DIAGRAM_MAX_W = 620; // px — keeps diagrams inside an A4/Letter text column
const SHOT_MAX_W = 640;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Intrinsic PNG size from the IHDR chunk (bytes 16-23 after the signature). */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Scale to a max width, preserving aspect ratio. */
function fit(buf, maxW) {
  const { width, height } = pngSize(buf);
  if (!width || width <= maxW) return { width, height };
  return { width: maxW, height: Math.round((height * maxW) / width) };
}

/** Read a PNG and return a sized base64 <img> tag. */
function imgTag(file, maxW) {
  const buf = readFileSync(file);
  const { width, height } = fit(buf, maxW);
  const uri = `data:image/png;base64,${buf.toString('base64')}`;
  return `<img src="${uri}"${width ? ` width="${width}" height="${height}"` : ''} />`;
}

// --- 0. Preconditions ------------------------------------------------------
if (!existsSync(SOURCE_MD)) fail(`Cannot find ${relative(REPO_ROOT, SOURCE_MD)}`);
mkdirSync(ASSETS_DIR, { recursive: true });

const mmdc = join(DOCS_DIR, 'node_modules', '.bin', isWin ? 'mmdc.cmd' : 'mmdc');
if (!existsSync(mmdc)) fail('mermaid-cli not installed — run `npm install` in docs/.');

// --- 1. Render mermaid blocks to PNG (one Chromium session for all) --------
const puppeteerCfg = join(ASSETS_DIR, '_puppeteer.json');
writeFileSync(puppeteerCfg, JSON.stringify({ args: ['--no-sandbox'] }));
const mermaidCfg = join(ASSETS_DIR, '_mermaid.json');
writeFileSync(mermaidCfg, JSON.stringify({ theme: 'neutral', flowchart: { useMaxWidth: false } }));

console.log('→ Rendering Mermaid diagrams to PNG…');
const render = spawnSync(
  mmdc,
  ['-i', SOURCE_MD, '-o', RENDERED_MD, '-e', 'png', '-s', '3', '-b', 'white', '-p', puppeteerCfg, '-c', mermaidCfg],
  { stdio: 'inherit', shell: isWin, cwd: ASSETS_DIR },
);
if (render.status !== 0) fail('mermaid-cli render failed.');

// --- 2. Markdown -> HTML ---------------------------------------------------
let md = readFileSync(RENDERED_MD, 'utf8');
md = md.replace(/<!--[\s\S]*?-->/g, '');       // drop the top HTML comment
md = md.replace(/^\s*<\/?div[^>]*>\s*$/gm, ''); // unwrap the centered cover block so its table parses

let bodyHtml = marked.parse(md, { gfm: true });

// Inline each rendered diagram as a sized base64 image.
bodyHtml = bodyHtml.replace(/<img[^>]*\ssrc="([^"]+)"[^>]*>/g, (whole, src) => {
  if (src.startsWith('data:')) return whole;
  // Resolve against the rendered-diagram dir, the report's own dir (so
  // markdown-relative paths like ../screenshots/*.png work regardless of cwd),
  // then the raw path. First match wins.
  const candidate = [join(ASSETS_DIR, src), join(DOCS_DIR, src), src].find(existsSync) || null;
  return candidate ? imgTag(candidate, DIAGRAM_MAX_W) : whole;
});

// --- 3. Screenshots ---------------------------------------------------------
// Screenshots are embedded inline in the report body (resolved above via
// DOCS_DIR — e.g. ../screenshots/*.png), so no separate appendix is appended.
const appendix = '';

// --- 4. HTML -> .docx ------------------------------------------------------
const css = `
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 20pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; } h4 { font-size: 12pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 10pt; }
  pre { background: #f6f6f6; padding: 8px; border: 1px solid #ddd; }
  img { max-width: 100%; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}${appendix}</body></html>`;

console.log('→ Converting to .docx…');
const result = await htmlToDocx(html, null, {
  table: { row: { cantSplit: true } },
  footer: true,
  pageNumber: true,
});
const out = Buffer.isBuffer(result) ? result : Buffer.from(await result.arrayBuffer());
writeFileSync(OUT_DOCX, out);

console.log(`\n✓ Built ${relative(REPO_ROOT, OUT_DOCX)} (${(out.length / 1024).toFixed(0)} KB)`);
