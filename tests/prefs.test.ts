import { describe, it, expect, beforeEach } from 'vitest';
import { displayBox, plainText } from '../src/player/avplayEngine';
import { langKey, trackLabel, applyTrackPrefs, aspectPref, liveFormatPref, applyEnginePrefs } from '../src/player/preferences';
import { settings } from '../src/storage/settings';
import type { PlayerEngine, StreamInfo } from '../src/player/engine';

describe('displayBox (proporção)', () => {
  it('auto e preencher usam a tela toda com modos diferentes', () => {
    expect(displayBox(null, 'auto')).toEqual({ x: 0, y: 0, w: 1920, h: 1080, method: 'PLAYER_DISPLAY_MODE_LETTER_BOX' });
    expect(displayBox(null, 'fill').method).toBe('PLAYER_DISPLAY_MODE_FULL_SCREEN');
  });
  it('4:3 vira caixa centralizada de 1440×1080', () => {
    expect(displayBox(null, '4:3')).toEqual({ x: 240, y: 0, w: 1440, h: 1080, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' });
  });
  it('16:9 dentro de um retângulo mais alto fica centrado na vertical', () => {
    expect(displayBox({ x: 100, y: 100, w: 400, h: 400 }, '16:9')).toEqual({ x: 100, y: 188, w: 400, h: 225, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' });
  });
});

describe('plainText (legendas)', () => {
  it('tira marcação e entidades, mantém quebras', () => {
    expect(plainText('<i>Olá</i><br/>mundo &amp; <font color="red">cia</font>')).toBe('Olá\nmundo & cia');
    expect(plainText('<script>alert(1)</script>x')).toBe('alert(1)x');
    expect(plainText(null)).toBe('');
    expect(plainText('Bip!\u0000')).toBe('Bip!');
    expect(plainText('a'.repeat(900)).length).toBe(500);
  });
});

describe('idiomas', () => {
  it('normaliza códigos variados', () => {
    expect(['por', 'pt', 'pt-BR', 'POR', 'Portuguese'].map(langKey)).toEqual(['pt', 'pt', 'pt', 'pt', 'pt']);
    expect(langKey('eng')).toBe('en');
    expect(langKey('')).toBe('');
  });
  it('rótulo amigável', () => {
    expect(trackLabel('por', 1)).toBe('Português');
    expect(trackLabel('', 2)).toBe('Faixa 2');
    expect(trackLabel('und', 3)).toBe('Faixa 3');
    expect(trackLabel('xyz', 1)).toBe('XYZ');
  });
});

class FakeEngine {
  picked: Array<[string, number]> = [];
  aspect = '';
  buffer = -1;
  selectTrack(k: 'audio' | 'text', i: number) { this.picked.push([k, i]); return true; }
  setAspect(a: string) { this.aspect = a; }
  setBuffer(s: number) { this.buffer = s; }
}

const info: StreamInfo = {
  audioTracks: [{ index: 1, language: 'eng' }, { index: 2, language: 'por' }],
  subtitleTracks: [{ index: 3, language: 'spa' }, { index: 4, language: 'pt' }],
  currentAudio: 1,
  currentText: 3,
};

describe('preferências aplicadas ao motor', () => {
  beforeEach(() => settings.set({ audioLang: '', subLang: '', aspect: 'auto', buffer: 'normal', liveFormat: 'ts' }));

  it('escolhe áudio e legenda no idioma salvo', () => {
    settings.set({ audioLang: 'pt-BR', subLang: 'por' });
    const e = new FakeEngine();
    expect(applyTrackPrefs(e as unknown as PlayerEngine, info)).toBe(true);
    expect(e.picked).toEqual([['audio', 2], ['text', 4]]);
  });
  it('sem preferência não mexe; idioma ausente não liga legenda', () => {
    const e = new FakeEngine();
    expect(applyTrackPrefs(e as unknown as PlayerEngine, info)).toBe(false);
    settings.set({ subLang: 'jpn' });
    expect(applyTrackPrefs(e as unknown as PlayerEngine, info)).toBe(false);
    expect(e.picked).toEqual([]);
  });
  it('valores inválidos no storage caem no padrão', () => {
    settings.set({ aspect: 'gigante', liveFormat: 'rtmp' });
    expect(aspectPref()).toBe('auto');
    expect(liveFormatPref()).toBe('ts');
    settings.set({ aspect: '4:3', buffer: 'large' });
    const e = new FakeEngine();
    applyEnginePrefs(e as unknown as PlayerEngine);
    expect([e.aspect, e.buffer]).toEqual(['4:3', 5]);
  });
});
