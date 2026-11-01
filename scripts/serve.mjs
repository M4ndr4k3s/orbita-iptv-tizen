// Servidor estático mínimo para pré-visualizar build/ no navegador (só localhost).
// Uso: node scripts/serve.mjs [porta]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(PROJECT, 'build');
// roteiros de teste ficam acessíveis em /e2e/ só neste servidor local de desenvolvimento
const E2E = join(PROJECT, 'scripts', 'e2e');
const PORT = Number(process.argv[2] || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.xml': 'application/xml',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    const base = path.startsWith('/e2e/') ? E2E : ROOT;
    const rel = path.startsWith('/e2e/') ? path.slice(4) : path === '/' ? 'index.html' : path;
    const file = normalize(join(base, rel));
    // bloqueia path traversal para fora da pasta servida
    if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`preview em http://localhost:${PORT}`));
