// Cadastro/edição de uma fonte (M3U ou Xtream).

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { button } from '../components/button';
import { TextField } from '../components/textField';
import { choose, alertBox } from '../components/dialog';
import { withBusy } from '../components/busy';
import { toast } from '../components/toast';
import { focus } from '../navigation/focus';
import { LIMITS } from '../utils/validate';
import {
  validateSource, emptyInput, inputFromSource, REFRESH_OPTIONS,
  type Source, type SourceInput, type SourceKind, type SourceField, type ValidSource,
} from '../playlist/source';
import { checkSource } from '../services/sourceCheck';
import { checkMessage, validationMessage } from '../services/messages';
import { t } from '../services/i18n';

export class SourceEditScreen implements Screen {
  readonly root: HTMLElement;
  private input: SourceInput;
  private form: HTMLElement;
  private fields: Partial<Record<SourceField, TextField>> = {};
  private kindButtons: Record<SourceKind, HTMLElement>;
  private refreshBtn: HTMLElement;
  private warning: HTMLElement;
  private busy = false;

  constructor(private ctx: AppContext, private existing?: Source) {
    this.input = existing ? inputFromSource(existing) : emptyInput('m3u');
    this.kindButtons = {
      m3u: this.kindButton('m3u', t('edit.kind.m3u')),
      xtream: this.kindButton('xtream', t('edit.kind.xtream')),
    };
    this.refreshBtn = el('div', { class: 'btn btn-ghost opt-btn', attrs: { 'data-focusable': '', role: 'button' } });
    this.refreshBtn.addEventListener('click', () => this.cycleRefresh());
    this.warning = el('p', { class: 'form-warning' });
    this.form = el('div', { class: 'form-fields' });

    this.root = el('div', { class: 'screen edit' }, [
      el('h1', { class: 'screen-title', text: existing ? t('edit.titleEdit') : t('edit.titleNew') }),
      el('div', { class: 'form' }, [
        el('div', { class: 'form-row' }, [el('div', { class: 'tf-label', text: t('edit.type') }), el('div', { class: 'seg' }, [this.kindButtons.m3u, this.kindButtons.xtream])]),
        this.form,
        el('div', { class: 'form-row' }, [el('div', { class: 'tf-label', text: t('edit.refresh') }), this.refreshBtn]),
        this.warning,
        el('div', { class: 'form-actions' }, [
          button(t('edit.save'), { icon: 'plus', variant: 'primary', onClick: () => this.save() }),
          button(t('edit.test'), { onClick: () => this.test() }),
          button(t('edit.cancel'), { icon: 'back', onClick: () => ctx.back() }),
        ]),
      ]),
    ]);
    this.renderKind();
    this.renderRefresh();
  }

  private kindButton(kind: SourceKind, label: string): HTMLElement {
    const b = el('div', { class: 'btn btn-ghost seg-btn', text: label, attrs: { 'data-focusable': '', role: 'button' } });
    b.addEventListener('click', () => {
      if (this.input.kind === kind) return;
      this.collect();
      this.input.kind = kind;
      this.renderKind();
    });
    return b;
  }

  /** Recria os campos do tipo escolhido preservando o que já foi digitado. */
  private renderKind(): void {
    const k = this.input.kind;
    this.kindButtons.m3u.classList.toggle('selected', k === 'm3u');
    this.kindButtons.xtream.classList.toggle('selected', k === 'xtream');
    clear(this.form);
    this.fields = {};
    const add = (f: SourceField, tf: TextField) => {
      this.fields[f] = tf;
      this.form.appendChild(tf.root);
    };
    const onChange = () => this.updateWarning();
    add('name', new TextField({ label: t('edit.name'), value: this.input.name, placeholder: t('edit.name.ph'), maxLength: LIMITS.name }));
    if (k === 'm3u') {
      add('url', new TextField({ label: t('edit.url'), value: this.input.url, placeholder: t('edit.url.ph'), url: true, maxLength: LIMITS.url, onChange }));
    } else {
      add('server', new TextField({ label: t('edit.server'), value: this.input.server, placeholder: t('edit.server.ph'), url: true, maxLength: LIMITS.url, onChange }));
      add('username', new TextField({ label: t('edit.username'), value: this.input.username, maxLength: LIMITS.credential }));
      add('password', new TextField({ label: t('edit.password'), value: this.input.password, masked: true, maxLength: LIMITS.credential }));
    }
    add('epgUrl', new TextField({ label: t('edit.epg'), value: this.input.epgUrl, placeholder: t('edit.epg.ph'), url: true, maxLength: LIMITS.url }));
    this.updateWarning();
  }

  private renderRefresh(): void {
    const h = this.input.refreshHours;
    this.refreshBtn.textContent = h ? t('edit.refresh.every', { h }) : t('edit.refresh.off');
  }

  private cycleRefresh(): void {
    const i = REFRESH_OPTIONS.indexOf(this.input.refreshHours);
    this.input.refreshHours = REFRESH_OPTIONS[(i + 1) % REFRESH_OPTIONS.length];
    this.renderRefresh();
  }

  /** Aviso quando credenciais Xtream vão trafegar sem TLS. */
  private updateWarning(): void {
    this.collect();
    const s = this.input.server.trim().toLowerCase();
    // sem esquema o app assume http://, então também é inseguro
    const insecure = this.input.kind === 'xtream' && !!s && s.indexOf('https://') !== 0;
    this.warning.textContent = insecure ? t('edit.httpWarning') : '';
  }

  private collect(): void {
    for (const f of Object.keys(this.fields) as SourceField[]) {
      const tf = this.fields[f];
      if (tf) (this.input as unknown as Record<string, unknown>)[f] = tf.get();
    }
  }

  /** Valida e mostra erros nos campos. Retorna a fonte limpa ou null. */
  private validate(): ValidSource | null {
    this.collect();
    const r = validateSource(this.input);
    for (const f of Object.keys(this.fields) as SourceField[]) {
      const tf = this.fields[f];
      if (tf) tf.setError(!r.ok && r.errors[f] ? validationMessage(r.errors[f]!) : null);
    }
    if (r.ok) return r.value;
    const firstBad = (Object.keys(this.fields) as SourceField[]).find((f) => r.errors[f]);
    const tf = firstBad && this.fields[firstBad];
    if (tf) focus.focus(tf.root.querySelector<HTMLElement>('[data-focusable]'));
    toast(t('edit.fixErrors'), 'error');
    return null;
  }

  private async test(): Promise<void> {
    const v = this.validate();
    if (!v || this.busy) return;
    this.busy = true;
    try {
      const r = await withBusy(t('check.running'), (signal) => checkSource(v, signal));
      if (r && (r.ok || r.error !== 'aborted')) await alertBox(r.ok ? t('check.ok.title') : t('check.fail.title'), checkMessage(r), t('common.ok'));
    } finally {
      this.busy = false;
    }
  }

  private async save(): Promise<void> {
    const v = this.validate();
    if (!v || this.busy) return;
    this.busy = true;
    try {
      const dup = this.ctx.sources.findDuplicate(v, this.existing && this.existing.id);
      if (dup) {
        const go = await choose(t('edit.duplicate.title'), t('edit.duplicate.body', { name: dup.name }), [
          { id: 'no', label: t('common.cancel'), primary: true },
          { id: 'yes', label: t('edit.save') },
        ]);
        if (go !== 'yes') return;
      }
      const r = await withBusy(t('check.running'), (signal) => checkSource(v, signal));
      if (!r) return; // cancelado
      if (!r.ok) {
        if (r.error === 'aborted') return;
        const go = await choose(t('edit.saveAnyway.title'), t('edit.saveAnyway.body', { error: checkMessage(r) }), [
          { id: 'fix', label: t('edit.fix'), primary: true },
          { id: 'save', label: t('edit.saveAnyway.yes') },
        ]);
        if (go !== 'save') return;
      }
      const saved = this.existing ? await this.ctx.sources.update(this.existing.id, v) : await this.ctx.sources.add(v);
      await this.ctx.sources.setStatus(saved.id, r.ok, r.ok ? undefined : r.error);
      toast(t('edit.saved'));
      this.ctx.back();
    } finally {
      this.busy = false;
    }
  }
}
