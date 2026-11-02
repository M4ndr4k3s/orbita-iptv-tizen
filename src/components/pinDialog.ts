// Digitação do PIN: números do controle ou teclado numérico na tela (controles
// sem teclas numéricas). Os dígitos aparecem como pontos e nunca vão para log.

import { el, clear } from '../utils/dom';
import { button } from './button';
import { openOverlay } from './overlay';
import { withBusy } from './busy';
import { alertBox } from './dialog';
import type { RemoteKey } from '../navigation/keys';
import { parental, PIN_LENGTH } from '../services/parental';
import { t } from '../services/i18n';

/** Pede um PIN de 4 dígitos. Back cancela (null). */
export function askPin(title: string, body: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    let pin = '';
    const dots = el('div', { class: 'pin-dots' });
    const paint = () => {
      clear(dots);
      for (let i = 0; i < PIN_LENGTH; i++) dots.appendChild(el('span', { class: 'pin-dot' + (i < pin.length ? ' on' : '') }));
    };
    let close = () => undefined as void;
    const finish = (r: string | null) => {
      close();
      resolve(r);
    };
    const type = (d: string) => {
      if (pin.length >= PIN_LENGTH) return;
      pin += d;
      paint();
      // pequena pausa para o último ponto aparecer antes de fechar
      if (pin.length === PIN_LENGTH) setTimeout(() => finish(pin), 150);
    };
    const pad = el('div', { class: 'pin-pad', attrs: { 'data-focus-group': '' } });
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) pad.appendChild(button(d, { onClick: () => type(d), autofocus: d === '5' }));
    pad.appendChild(button(t('pin.erase'), { onClick: () => { pin = pin.slice(0, -1); paint(); } }));
    pad.appendChild(button('0', { onClick: () => type('0') }));
    pad.appendChild(button(t('common.cancel'), { onClick: () => finish(null) }));
    const box = el('div', { class: 'dlg-box pin-box', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
      el('h2', { class: 'dlg-title', text: title }),
      body ? el('p', { class: 'dlg-body', text: body }) : null,
      dots,
      pad,
    ]);
    paint();
    close = openOverlay(box, {
      onKey: (key: RemoteKey) => {
        if (key.action === 'digit') {
          type(String(key.digit || 0));
          return true;
        }
        return false;
      },
      onBack: () => finish(null),
    });
  });
}

function fmtWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? t('pin.waitMin', { n: Math.ceil(s / 60) }) : t('pin.waitSec', { n: s });
}

/**
 * Libera conteúdo bloqueado: sem PIN ou sessão já liberada passa direto; senão
 * pede o PIN até acertar, cancelar ou cair no bloqueio por erros.
 */
export async function requirePin(body: string | null = null): Promise<boolean> {
  if (parental.isUnlocked()) return true;
  let msg = body;
  for (;;) {
    const wait = parental.waitMs();
    if (wait > 0) {
      await alertBox(t('pin.lockedTitle'), t('pin.locked', { t: fmtWait(wait) }), t('common.ok'));
      return false;
    }
    const pin = await askPin(t('pin.enter'), msg);
    if (pin == null) return false;
    const r = await withBusy(t('pin.checking'), () => parental.verify(pin));
    if (!r) return false;
    if (r.ok) return true;
    if (r.reason === 'locked') {
      await alertBox(t('pin.lockedTitle'), t('pin.locked', { t: fmtWait(r.waitMs) }), t('common.ok'));
      return false;
    }
    msg = t('pin.wrong', { n: r.left });
  }
}

/** Cadastro ou troca: digita duas vezes. Devolve se gravou. */
export async function definePin(): Promise<boolean> {
  let msg: string | null = t('pin.newBody');
  for (;;) {
    const a = await askPin(t('pin.new'), msg);
    if (a == null) return false;
    const b = await askPin(t('pin.confirm'), null);
    if (b == null) return false;
    if (a !== b) {
      msg = t('pin.mismatch');
      continue;
    }
    const ok = await withBusy(t('pin.saving'), async () => {
      await parental.setPin(a);
      return true;
    });
    return !!ok;
  }
}
