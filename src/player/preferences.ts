// Preferências de reprodução (proporção, buffer, idiomas) aplicadas ao motor.
// Valores vêm do localStorage: tudo validado contra listas fechadas.

import { settings } from '../storage/settings';
import { ASPECT_MODES, type AspectMode, type PlayerEngine, type StreamInfo } from './engine';
import type { LiveFormat } from './streamUrl';

// 'large': 8 s levou ~26 s para reabrir um HLS na TV; 5 s é o meio-termo medido
export const BUFFER_SECONDS: Record<string, number> = { normal: 0, large: 5 };

export function aspectPref(): AspectMode {
  const a = settings.get().aspect as AspectMode;
  return ASPECT_MODES.indexOf(a) >= 0 ? a : 'auto';
}

export function liveFormatPref(): LiveFormat {
  return settings.get().liveFormat === 'm3u8' ? 'm3u8' : 'ts';
}

/** Antes de abrir um stream: proporção e buffer guardados. */
export function applyEnginePrefs(engine: PlayerEngine): void {
  engine.setAspect(aspectPref());
  engine.setBuffer(BUFFER_SECONDS[settings.get().buffer] || 0);
}

/** 'pt', 'por', 'pt-BR', 'Portuguese' → 'pt' (comparação de idioma entre streams). */
export function langKey(code: string): string {
  const c = (code || '').toLowerCase().trim();
  if (!c) return '';
  const base = c.split(/[-_]/)[0];
  const map: Record<string, string> = {
    por: 'pt', portuguese: 'pt', português: 'pt', portugues: 'pt', pob: 'pt', ptb: 'pt',
    eng: 'en', english: 'en', inglês: 'en', ingles: 'en',
    spa: 'es', spanish: 'es', espanhol: 'es', esp: 'es',
    fre: 'fr', fra: 'fr', french: 'fr', ger: 'de', deu: 'de', german: 'de', ita: 'it', italian: 'it',
    jpn: 'ja', japanese: 'ja', kor: 'ko', chi: 'zh', zho: 'zh',
  };
  return map[c] || map[base] || base;
}

const NAMES: Record<string, string> = {
  pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês',
};

/** Nome amigável da faixa ("Português", "Faixa 2" se o stream não disser). */
export function trackLabel(lang: string, n: number): string {
  const k = langKey(lang);
  if (!k || k === 'und') return 'Faixa ' + n;
  return NAMES[k] || lang.toUpperCase().slice(0, 12);
}

/**
 * Depois que o stream começa: escolhe as faixas no idioma preferido, se houver.
 * Devolve se a legenda deve aparecer.
 */
export function applyTrackPrefs(engine: PlayerEngine, info: StreamInfo | null): boolean {
  const s = settings.get();
  if (!info) return false;
  if (s.audioLang) {
    const want = langKey(s.audioLang);
    const t = info.audioTracks.find((a) => langKey(a.language) === want);
    if (t && t.index !== info.currentAudio) engine.selectTrack('audio', t.index);
  }
  if (s.subLang) {
    const want = langKey(s.subLang);
    const t = info.subtitleTracks.find((a) => langKey(a.language) === want);
    if (t) {
      if (t.index !== info.currentText) engine.selectTrack('text', t.index);
      return true;
    }
  }
  return false;
}
