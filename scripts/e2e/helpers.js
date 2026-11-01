// Ajudantes injetados na página (TV ou preview) pelos roteiros de teste.
// Simulam o controle remoto disparando keydown com os códigos Samsung.
window.T = (() => {
  // mesmos códigos de src/navigation/keys.ts
  const K = {
    left: 37, up: 38, right: 39, down: 40, ok: 13, back: 10009, red: 403, green: 404, yellow: 405, blue: 406,
    chUp: 427, chDown: 428, info: 457, guide: 458, playPause: 10252, play: 415, pause: 19, stop: 413, ff: 417, rw: 412,
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (k, n = 1) => {
    for (let i = 0; i < n; i++) {
      const code = typeof k === 'number' ? k : K[k];
      if (!code) throw new Error('tecla desconhecida no roteiro: ' + k);
      document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, bubbles: true }));
    }
  };
  const focused = () => {
    const e = [...document.querySelectorAll('.is-focused')];
    if (e.length !== 1) return '!! ' + e.length + ' focos';
    return e[0].textContent.trim().slice(0, 50);
  };
  const screen = () => {
    const s = [...document.querySelectorAll('.screen')].filter((x) => !x.classList.contains('hidden')).pop();
    const title = s && s.querySelector('.screen-title, .picker-title, .hero-title');
    return title ? title.textContent : s ? s.className : '-';
  };
  const dialog = () => {
    const d = document.querySelector('.dlg-layer .dlg-box, .kb-box');
    return d ? d.textContent.trim().slice(0, 120) : null;
  };
  // digita pelo teclado virtual clicando nas teclas (mesmo caminho do OK do controle)
  const SHORT = ['http://', 'https://', '.m3u', '.com', 'www.'];
  const type = (s) => {
    let i = 0;
    while (i < s.length) {
      const tok = SHORT.find((x) => s.startsWith(x, i)) || s[i];
      const label = tok === ' ' ? 'Espaço' : tok;
      const find = () => [...document.querySelectorAll('.kb-key')].find((x) => x.textContent === label);
      let key = find();
      if (!key) {
        // símbolo na outra página do teclado: alterna (#+= / abc) e procura de novo
        const page = document.querySelector('.kb-key.kb-page');
        if (page) page.click();
        key = find();
      }
      if (!key) throw new Error('tecla não encontrada: ' + tok);
      key.click();
      i += tok.length;
    }
  };
  // "aperta OK" no elemento focável visível cujo texto contém `text` (equivale a navegar até ele e confirmar)
  const activate = async (text) => {
    const all = [...document.querySelectorAll('[data-focusable]')].filter((e) => e.offsetParent !== null);
    const target = all.find((e) => e.textContent.indexOf(text) >= 0);
    if (!target) throw new Error('elemento não encontrado: ' + text);
    target.click();
    await sleep(120);
  };
  const until = async (fn, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(100);
    }
    return false;
  };
  // espera o resultado de um carregamento de lista e fecha o aviso; devolve o texto
  const afterImport = async (ms = 600000) => {
    await until(() => /Lista carregada|Não foi possível carregar/.test(dialog() || ''), ms);
    const text = dialog();
    press('ok');
    await sleep(150);
    return text;
  };
  return { press, sleep, focused, screen, dialog, type, activate, until, afterImport };
})();
