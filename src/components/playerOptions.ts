// Opções de reprodução (botão verde no player): áudio, legendas, proporção,
// buffer e formato ao vivo do Xtream. Escolhas ficam salvas para os próximos vídeos.

import { el } from '../utils/dom';
import { choose, type DialogAction } from './dialog';
import { settings } from '../storage/settings';
import { ASPECT_MODES, type AspectMode, type PlayerEngine } from '../player/engine';
import { aspectPref, langKey, trackLabel } from '../player/preferences';
import { t } from '../services/i18n';

export interface OptionsHost {
  engine: PlayerEngine;
  /** reabre o stream (buffer/formato só valem numa nova abertura) */
  reopen(): void;
  /** liga/desliga a exibição de legendas */
  setSubtitles(on: boolean): void;
  subtitlesOn(): boolean;
  /** item ao vivo de conta Xtream: oferece TS/HLS */
  liveXtream: boolean;
}

type Main = 'audio' | 'subs' | 'aspect' | 'buffer' | 'format';

const ASPECT_LABEL: Record<AspectMode, () => string> = {
  auto: () => t('opt.aspect.auto'),
  fill: () => t('opt.aspect.fill'),
  '16:9': () => '16:9',
  '4:3': () => '4:3',
};

export async function openPlayerOptions(h: OptionsHost): Promise<void> {
  for (;;) {
    const info = h.engine.info();
    const audio = info ? info.audioTracks : [];
    const subs = info ? info.subtitleTracks : [];
    const curAudio = audio.find((a) => a.index === info!.currentAudio);
    const curSub = h.subtitlesOn() ? subs.find((s) => s.index === info!.currentText) : undefined;
    const items: DialogAction<Main>[] = [
      { id: 'audio', label: t('opt.audio', { v: curAudio ? trackLabel(curAudio.language, audio.indexOf(curAudio) + 1) : audio.length ? trackLabel('', 1) : t('opt.none') }), primary: true },
      { id: 'subs', label: t('opt.subs', { v: curSub ? trackLabel(curSub.language, subs.indexOf(curSub) + 1) : subs.length ? t('opt.off') : t('opt.none') }) },
      { id: 'aspect', label: t('opt.aspect', { v: ASPECT_LABEL[aspectPref()]() }) },
      { id: 'buffer', label: t('opt.buffer', { v: settings.get().buffer === 'large' ? t('opt.buffer.large') : t('opt.buffer.normal') }) },
    ];
    if (h.liveXtream) items.push({ id: 'format', label: t('opt.format', { v: settings.get().liveFormat === 'm3u8' ? 'HLS' : 'TS' }) });
    const pick = await choose(t('opt.title'), null, items, true);
    if (!pick) return;

    if (pick === 'audio') {
      if (audio.length < 2) {
        await choose(t('opt.audio.title'), audio.length ? t('opt.audio.single') : t('opt.audio.noneBody'), [{ id: 'ok', label: t('opt.back'), primary: true }]);
        continue;
      }
      const r = await choose(t('opt.audio.title'), null, audio.map((a, i) => ({ id: String(a.index), label: trackLabel(a.language, i + 1), primary: a.index === info!.currentAudio })), true);
      if (r != null) {
        const tr = audio.find((a) => String(a.index) === r)!;
        if (h.engine.selectTrack('audio', tr.index)) settings.set({ audioLang: tr.language || '' });
      }
    } else if (pick === 'subs') {
      if (!subs.length) {
        await choose(t('opt.subs.title'), t('opt.subs.noneBody'), [{ id: 'ok', label: t('opt.back'), primary: true }]);
        continue;
      }
      const acts: DialogAction<string>[] = [{ id: 'off', label: t('opt.off'), primary: !h.subtitlesOn() }];
      subs.forEach((s, i) => acts.push({ id: String(s.index), label: trackLabel(s.language, i + 1), primary: h.subtitlesOn() && s.index === info!.currentText }));
      const r = await choose(t('opt.subs.title'), null, acts, true);
      if (r === 'off') {
        h.setSubtitles(false);
        settings.set({ subLang: '' });
      } else if (r != null) {
        const tr = subs.find((s) => String(s.index) === r)!;
        h.engine.selectTrack('text', tr.index);
        h.setSubtitles(true);
        // sem idioma informado não dá para lembrar entre streams: liga só neste
        settings.set({ subLang: langKey(tr.language) && langKey(tr.language) !== 'und' ? tr.language : '' });
      }
    } else if (pick === 'aspect') {
      const cur = aspectPref();
      const r = await choose(t('opt.aspect.title'), null, ASPECT_MODES.map((m) => ({ id: m, label: ASPECT_LABEL[m](), primary: m === cur })), true);
      if (r) {
        settings.set({ aspect: r });
        h.engine.setAspect(r);
      }
    } else if (pick === 'buffer') {
      const cur = settings.get().buffer;
      const r = await choose(t('opt.buffer.title'), t('opt.buffer.body'), [
        { id: 'normal', label: t('opt.buffer.normal'), primary: cur !== 'large' },
        { id: 'large', label: t('opt.buffer.large'), primary: cur === 'large' },
      ], true);
      if (r && r !== cur) {
        settings.set({ buffer: r });
        h.reopen();
        return;
      }
    } else if (pick === 'format') {
      const cur = settings.get().liveFormat === 'm3u8' ? 'm3u8' : 'ts';
      const r = await choose(t('opt.format.title'), t('opt.format.body'), [
        { id: 'ts', label: 'TS', primary: cur === 'ts' },
        { id: 'm3u8', label: 'HLS (m3u8)', primary: cur === 'm3u8' },
      ], true);
      if (r && r !== cur) {
        settings.set({ liveFormat: r });
        h.reopen();
        return;
      }
    }
  }
}

/** Faixa de legenda sobre o vídeo; some sozinha após a duração informada. */
export class SubtitleView {
  readonly root = el('div', { class: 'subs hidden' });
  private timer: ReturnType<typeof setTimeout> | null = null;
  on = false;

  show(text: string, durationMs: number): void {
    if (!this.on) return;
    if (this.timer) clearTimeout(this.timer);
    if (!text) return this.clear();
    // texto puro (o motor já tirou a marcação); quebras viram linhas
    this.root.textContent = text;
    this.root.classList.remove('hidden');
    this.timer = setTimeout(() => this.clear(), Math.max(800, Math.min(15000, durationMs || 4000)));
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.clear();
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root.classList.add('hidden');
    this.root.textContent = '';
  }
}
