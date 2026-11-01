// Build da Órbita: bundle TS/CSS com esbuild (alvo Chromium 76 = Tizen 6.0),
// monta build/, e opcionalmente empacota (.wgt), instala e abre na TV.
// Uso: node scripts/build.mjs [--dev] [--wgt] [--install]
// Ambiente: TIZEN_TARGET (ip:porta da TV), TIZEN_PROFILE (perfil de assinatura), TIZEN_HOME
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');
const TIZEN_HOME = process.env.TIZEN_HOME || 'C:\\tizen-studio';
const TIZEN = join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen.bat');
const SDB = join(TIZEN_HOME, 'tools', 'sdb.exe');
const PROFILE = process.env.TIZEN_PROFILE || 'LiteLauncher';
const TARGET_TV = process.env.TIZEN_TARGET || '192.168.4.171:26101';
const APP_ID = 'OrbitaTV01.Orbita';
const WGT = 'Orbita.wgt';
// Tizen 6.0 (TVs 2021) = Chromium 76
const TARGET = 'chrome76';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const release = args.has('--release');

// lista de teste local (dev/lista-teste.json, fora do Git): só em builds de teste
function devSeed() {
  const file = join(ROOT, 'dev', 'lista-teste.json');
  if (release || !existsSync(file)) return null;
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const allowed = ['kind', 'name', 'url', 'server', 'username', 'password', 'epgUrl'];
  if (s.kind !== 'm3u' && s.kind !== 'xtream') throw new Error('dev/lista-teste.json: kind deve ser m3u ou xtream');
  const clean = {};
  for (const k of allowed) if (typeof s[k] === 'string') clean[k] = s[k];
  // não imprime URL/credenciais
  console.log(`lista de teste incluída: "${clean.name || '(sem nome)'}" (${clean.kind}) — use --release para gerar sem ela`);
  return clean;
}
const seed = devSeed();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// validação simples: estes valores vão para linha de comando
if (!/^[\w.-]+:\d{1,5}$/.test(TARGET_TV)) throw new Error('TIZEN_TARGET inválido: ' + TARGET_TV);
if (!/^[\w-]+$/.test(PROFILE)) throw new Error('TIZEN_PROFILE inválido: ' + PROFILE);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
await build({
  entryPoints: { app: join(ROOT, 'src/app/main.ts'), worker: join(ROOT, 'src/workers/data.worker.ts') },
  outdir: OUT,
  bundle: true,
  format: 'iife',
  target: TARGET,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  charset: 'utf8',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEV_SEED__: JSON.stringify(seed) },
  logLevel: 'warning',
});
await build({
  entryPoints: { app: join(ROOT, 'src/styles/app.css') },
  outdir: OUT,
  bundle: true,
  target: TARGET,
  minify: !dev,
  charset: 'utf8',
  logLevel: 'warning',
});

copyFileSync(join(ROOT, 'src/index.html'), join(OUT, 'index.html'));
copyFileSync(join(ROOT, 'src/assets/logo.png'), join(OUT, 'logo.png'));
copyFileSync(join(ROOT, 'tizen/icon.png'), join(OUT, 'icon.png'));
// versão do config.xml segue o package.json
const config = readFileSync(join(ROOT, 'tizen/config.xml'), 'utf8')
  .replace(/(<widget[^>]*\sversion=")[^"]*"/, `$1${pkg.version}"`);
writeFileSync(join(OUT, 'config.xml'), config);

console.log(`build ok (${Date.now() - t0} ms) -> ${OUT}`);

// tizen.bat precisa do cmd.exe; argumentos são fixos ou validados acima (sem aspas/metacaracteres).
// Caminhos com espaço (ex.: "IPTV SAMSUNG") vão entre aspas.
const run = (cmd, a) => {
  if (!cmd.endsWith('.bat')) return execFileSync(cmd, a, { stdio: 'inherit' });
  const q = (s) => (/[\s]/.test(s) ? `"${s}"` : s);
  const line = [cmd, ...a].map(q).join(' ');
  execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
    stdio: 'inherit',
    windowsVerbatimArguments: true,
  });
};

if (args.has('--wgt') || args.has('--install')) {
  run(TIZEN, ['package', '-t', 'wgt', '-s', PROFILE, '--', OUT]);
  // o CLI nomeia o .wgt pelo <name>; padroniza
  const produced = ['Órbita.wgt', 'Orbita.wgt'].map((n) => join(OUT, n)).find(existsSync);
  if (!produced) throw new Error('.wgt não encontrado em ' + OUT);
  if (!produced.endsWith(WGT)) { copyFileSync(produced, join(OUT, WGT)); rmSync(produced); }
}
if (args.has('--install')) {
  // sem conexão ativa o CLI falha com "[target]: null"
  run(SDB, ['connect', TARGET_TV]);
  run(TIZEN, ['install', '-n', WGT, '-s', TARGET_TV, '--', OUT]);
  run(TIZEN, ['run', '-p', APP_ID, '-s', TARGET_TV]);
}
