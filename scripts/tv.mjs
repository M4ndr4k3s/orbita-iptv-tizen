// Ferramenta de teste na TV via Chrome DevTools Protocol (sem dependências).
// Abre o app em modo debug pelo SDB, faz port-forward e conversa com o inspector.
//
// Uso:
//   node scripts/tv.mjs debug                 relança o app em modo debug e grava a porta em build/.debug
//   node scripts/tv.mjs eval "<expressão JS>" avalia na página e imprime o resultado (JSON)
//   node scripts/tv.mjs key <ação|código> ... simula teclas do controle (ex.: down down ok back)
// Screenshot (Page.captureScreenshot) não é suportado pelo inspector da TV (Tizen 6.0: timeout);
// para conferir o visual use o preview local: npm run preview
//   node scripts/tv.mjs logs [segundos]       mostra console/erros da página por N segundos
//   node scripts/tv.mjs mem                   uso de heap JS + contagem de nós do DOM
//   node scripts/tv.mjs run <roteiro.js>      roteiro e2e (scripts/e2e); variáveis E2E_X viram window.__X__
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SDB = join(process.env.TIZEN_HOME || 'C:\\tizen-studio', 'tools', 'sdb.exe');
const TARGET_TV = process.env.TIZEN_TARGET || '192.168.4.171:26101';
const APP_ID = 'OrbitaTV01.Orbita';
const LOCAL_PORT = Number(process.env.TV_DEBUG_PORT || 9333);
const STATE = join(ROOT, 'build', '.debug');

// mesmos códigos de src/navigation/keys.ts
const KEYS = {
  left: 37, up: 38, right: 39, down: 40, ok: 13, back: 10009,
  playpause: 10252, play: 415, pause: 19, stop: 413, ff: 417, rw: 412,
  chup: 427, chdown: 428, red: 403, green: 404, yellow: 405, blue: 406,
  info: 457, guide: 458, chlist: 10073,
};

const sdb = (...a) => execFileSync(SDB, ['-s', TARGET_TV, ...a], { encoding: 'utf8', timeout: 45000 });

function debugLaunch() {
  execFileSync(SDB, ['connect', TARGET_TV], { encoding: 'utf8', timeout: 15000 });
  // com o app já aberto o "debug" fica pendurado: encerra antes
  sdb('shell', '0', 'was_kill', APP_ID.split('.')[0]);
  const out = sdb('shell', '0', 'debug', APP_ID);
  const m = out.match(/port:\s*(\d+)/);
  if (!m) throw new Error('porta de debug não encontrada:\n' + out);
  sdb('forward', `tcp:${LOCAL_PORT}`, `tcp:${m[1]}`);
  writeFileSync(STATE, JSON.stringify({ remote: Number(m[1]), local: LOCAL_PORT }));
  console.log(`debug ativo: TV porta ${m[1]} -> localhost:${LOCAL_PORT}`);
}

async function connect() {
  if (!existsSync(STATE)) throw new Error('rode antes: node scripts/tv.mjs debug');
  const { local } = JSON.parse(readFileSync(STATE, 'utf8'));
  const list = await (await fetch(`http://127.0.0.1:${local}/json`)).json();
  const page = list.find((t) => t.type === 'page') || list[0];
  if (!page) throw new Error('nenhuma página no inspector');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('falha no websocket')); });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}, timeoutMs = 20000) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); rej(new Error(`timeout em ${method}`)); }, timeoutMs);
    pending.set(i, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, Number(process.env.TV_EVAL_TIMEOUT_MS || 20000));
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function pressKey(cdp, code) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'debug') {
  debugLaunch();
} else {
  const cdp = await connect();
  try {
    if (cmd === 'eval') {
      console.log(JSON.stringify(await evaluate(cdp, rest.join(' ')), null, 2));
    } else if (cmd === 'key') {
      for (const k of rest) {
        const code = /^\d+$/.test(k) ? Number(k) : KEYS[k.toLowerCase()];
        if (!code) throw new Error('tecla desconhecida: ' + k);
        await pressKey(cdp, code);
        await sleep(Number(process.env.KEY_DELAY || 250));
      }
      console.log('teclas enviadas:', rest.join(' '));
    } else if (cmd === 'run') {
      // roteiro e2e: injeta helpers.js e avalia o arquivo (que retorna uma Promise de verificações)
      const vars = Object.entries(process.env).filter(([k]) => k.startsWith('E2E_'))
        .map(([k, v]) => `window.__${k.slice(4)}__=${JSON.stringify(v)};`).join('');
      // exceção no roteiro vira uma verificação com a pilha (em vez de só a mensagem)
      const code = vars + readFileSync(join(ROOT, 'scripts/e2e/helpers.js'), 'utf8') + ';' + readFileSync(rest[0], 'utf8') +
        ";window.__E2E__.catch(function(e){return [{ok:false,step:'exceção no roteiro',got:String(e&&e.stack||e)}]})";
      const r = await cdp.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true }, Number(process.env.E2E_TIMEOUT_MS || 900000));
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      const checks = r.result.value || [];
      for (const c of checks) {
        const showGot = !c.ok || c.step.indexOf('métricas') === 0;
        console.log(c.ok ? 'PASSOU' : 'FALHOU', '-', c.step, showGot ? '→ ' + JSON.stringify(c.got, null, c.ok ? 2 : 0) : '');
      }
      const failed = checks.filter((c) => !c.ok).length;
      console.log(`${checks.length - failed}/${checks.length} verificações passaram`);
      if (failed) process.exitCode = 1;
    } else if (cmd === 'logs') {
      await cdp.send('Runtime.enable');
      cdp.on((m) => {
        if (m.method === 'Runtime.consoleAPICalled') {
          console.log(`[${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(' '));
        } else if (m.method === 'Runtime.exceptionThrown') {
          console.log('[exceção]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        }
      });
      await sleep(Number(rest[0] || 10) * 1000);
    } else if (cmd === 'mem') {
      const r = await evaluate(cdp, `(() => { const m = performance.memory || {}; return {
        usedMB: +(m.usedJSHeapSize / 1048576).toFixed(1), totalMB: +(m.totalJSHeapSize / 1048576).toFixed(1),
        limitMB: +(m.jsHeapSizeLimit / 1048576).toFixed(1), domNodes: document.getElementsByTagName('*').length }; })()`);
      // performance.memory é arredondado e atualiza pouco; o CDP dá o valor exato
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await cdp.send('Performance.enable');
      const pm = await cdp.send('Performance.getMetrics');
      const get = (n) => (pm.metrics.find((x) => x.name === n) || {}).value;
      r.heapExactMB = +(get('JSHeapUsedSize') / 1048576).toFixed(2);
      r.nodes = get('Nodes');
      r.listeners = get('JSEventListeners');
      console.log(JSON.stringify(r));
    } else {
      console.log('comandos: debug | eval | key | logs | mem');
    }
  } finally {
    cdp.close();
  }
}
