// Marco 5: pausa/retomada com Play/Pause, conferindo o estado do AVPlay.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until } = T;
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const status = () => (P() ? P().session.status : 'sem player');

  await activate('Início');
  await activate('Assistir TV');
  for (let i = 0; i < 6; i++) {
    await until(() => ['playing', 'failed'].indexOf(status()) >= 0, 45000);
    if (status() === 'playing') break;
    press('chUp'); await sleep(600);
  }
  check('canal tocando', status() === 'playing', P());
  await sleep(2000);
  press('playPause'); await sleep(1000);
  check('Play/Pause pausa (sessão e AVPlay)', status() === 'paused' && P().engineState === 'PAUSED', [status(), P().engineState]);
  await sleep(20000);
  check('pausado 20 s não dispara reconexão', status() === 'paused', status());
  press('playPause');
  await until(() => status() === 'playing' && P().engineState === 'PLAYING', 15000);
  check('Play/Pause retoma', status() === 'playing' && P().engineState === 'PLAYING', [status(), P().engineState]);
  press('back'); await sleep(500);
  check('Back fecha o player e para o AVPlay', !P(), null);
  return out;
})();
