// Tela "Sobre": versão, ambiente de execução e últimas teclas recebidas
// (útil para diagnosticar o controle remoto na TV).

import { el, clear } from '../utils/dom';
import { getPlatformInfo } from '../app/platform';
import type { Screen } from '../app/screen';
import type { KeyRegistration, RemoteKey } from '../navigation/keys';
import { button } from '../components/button';
import { t } from '../services/i18n';

const MAX_LOG = 10;

export class AboutScreen implements Screen {
  readonly root: HTMLElement;
  private log: HTMLElement;
  private lines: string[] = [];

  constructor(version: string, reg: KeyRegistration, back: () => void) {
    const info = getPlatformInfo();
    const row = (k: string, v: string) =>
      el('div', { class: 'diag-row' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]);

    this.log = el('div', { class: 'diag-log' });
    this.root = el('div', { class: 'screen about' }, [
      el('div', { class: 'diag-head' }, [
        el('img', { attrs: { src: 'logo.png', alt: '' } }),
        el('div', {}, [
          el('h1', { class: 'screen-title', text: t('about.title') }),
          el('div', { class: 'diag-sub', text: t('about.version', { v: version }) }),
        ]),
      ]),
      el('div', { class: 'diag-cols' }, [
        el('div', { class: 'diag-panel' }, [
          el('h2', { text: 'Ambiente' }),
          row('Tizen', info.isTizen ? info.platformVersion : 'não (navegador)'),
          row('Modelo', info.model),
          row('Firmware', info.firmware),
          row('AVPlay', info.hasAvplay ? 'disponível' : 'indisponível'),
          row('Viewport', info.viewport),
          row('Teclas registradas', String(reg.registered.length)),
          row('Teclas indisponíveis', reg.failed.length ? reg.failed.join(', ') : 'nenhuma'),
        ]),
        el('div', { class: 'diag-panel' }, [el('h2', { text: 'Últimas teclas' }), this.log]),
      ]),
      el('div', { class: 'about-actions' }, [button(t('pending.back'), { icon: 'back', autofocus: true, onClick: back })]),
    ]);
    this.pushLine('aguardando teclas do controle…');
  }

  /** Só registra; não consome a tecla. */
  onKey(key: RemoteKey): boolean {
    const label = key.action + (key.digit != null ? ' ' + key.digit : '');
    this.pushLine(new Date().toLocaleTimeString() + '  ' + label + '  (código ' + key.code + ')');
    return false;
  }

  private pushLine(text: string): void {
    this.lines.unshift(text);
    if (this.lines.length > MAX_LOG) this.lines.length = MAX_LOG;
    clear(this.log);
    for (const l of this.lines) this.log.appendChild(el('div', { text: l }));
  }
}
