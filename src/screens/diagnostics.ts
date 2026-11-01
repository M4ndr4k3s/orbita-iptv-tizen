// Tela de diagnóstico (marco 1): mostra o ambiente e as últimas teclas recebidas.
// Continua disponível depois em Configurações > Informações.

import { el, clear } from '../utils/dom';
import { getPlatformInfo } from '../app/platform';
import type { KeyRegistration, RemoteKey } from '../navigation/keys';

const MAX_LOG = 14;

export class DiagnosticsScreen {
  readonly root: HTMLElement;
  private log: HTMLElement;
  private lines: string[] = [];

  constructor(version: string, reg: KeyRegistration) {
    const info = getPlatformInfo();
    const row = (k: string, v: string) =>
      el('div', { class: 'diag-row' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]);

    this.log = el('div', { class: 'diag-log' });
    this.root = el('div', { class: 'diag' }, [
      el('div', { class: 'diag-head' }, [
        el('img', { attrs: { src: 'logo.png', alt: '' } }),
        el('div', {}, [
          el('div', { class: 'diag-title', text: 'Órbita' }),
          el('div', { class: 'diag-sub', text: 'versão ' + version + ' · diagnóstico' }),
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
    ]);
    this.pushLine('aguardando teclas do controle…');
  }

  onKey(key: RemoteKey | null, code: number): void {
    const label = key ? key.action + (key.digit != null ? ' ' + key.digit : '') : 'não mapeada';
    this.pushLine(new Date().toLocaleTimeString() + '  ' + label + '  (código ' + code + ')');
  }

  private pushLine(text: string): void {
    this.lines.unshift(text);
    if (this.lines.length > MAX_LOG) this.lines.length = MAX_LOG;
    clear(this.log);
    for (const l of this.lines) this.log.appendChild(el('div', { text: l }));
  }
}
