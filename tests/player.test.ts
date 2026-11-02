import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlaybackSession, REOPEN_GAP_MS } from '../src/player/session';
import type { EngineEvent, PlayerEngine } from '../src/player/engine';
import { streamUrl, redactUrl } from '../src/player/streamUrl';
import type { Channel } from '../src/playlist/model';
import type { Source } from '../src/playlist/source';

class FakeEngine implements PlayerEngine {
  name = 'fake';
  opened: string[] = [];
  stops = 0;
  private fn: (e: EngineEvent) => void = () => undefined;
  open(url: string) { this.opened.push(url); }
  stop() { this.stops++; }
  pause() {}
  resume() {}
  state() { return 'x'; }
  info() { return null; }
  setListener(fn: (e: EngineEvent) => void) { this.fn = fn; }
  setRect() {}
  setAspect() {}
  selectTrack() { return false; }
  setBuffer() {}
  seek() {}
  duration() { return 0; }
  suspend() {}
  restore() {}
  emit(e: EngineEvent) { this.fn(e); }
}

describe('PlaybackSession', () => {
  let eng: FakeEngine;
  let s: PlaybackSession;
  beforeEach(() => {
    vi.useFakeTimers();
    eng = new FakeEngine();
    s = new PlaybackSession(eng, { maxAttempts: 3, startTimeoutMs: 1000, stallTimeoutMs: 500, backoffMs: [100, 200] });
  });
  afterEach(() => vi.useRealTimers());

  it('conecta, toca e mede o tempo até o primeiro quadro', () => {
    s.play('http://a/1.ts');
    expect(s.state.status).toBe('connecting');
    vi.advanceTimersByTime(300);
    eng.emit({ type: 'playing' });
    expect(s.state.status).toBe('playing');
    expect(s.state.firstFrameMs).toBe(300);
  });

  it('tenta de novo com espera crescente e desiste após o máximo', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'error', code: 'PLAYER_ERROR_CONNECTION_FAILED' });
    expect(s.state).toMatchObject({ status: 'retrying', attempt: 1 });
    vi.advanceTimersByTime(100);
    expect(s.state).toMatchObject({ status: 'connecting', attempt: 2 });
    eng.emit({ type: 'error', code: 'PLAYER_ERROR_CONNECTION_FAILED' });
    vi.advanceTimersByTime(200);
    expect(s.state.attempt).toBe(3);
    eng.emit({ type: 'error', code: 'PLAYER_ERROR_CONNECTION_FAILED' });
    expect(s.state).toMatchObject({ status: 'failed', error: 'PLAYER_ERROR_CONNECTION_FAILED' });
    expect(eng.opened).toHaveLength(3);
  });

  it('restart fecha, espera um pouco e só então reabre', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'playing' });
    s.restart('http://a/1.ts');
    expect(s.state.status).toBe('connecting');
    expect(eng.opened).toHaveLength(1);
    vi.advanceTimersByTime(REOPEN_GAP_MS);
    expect(eng.opened).toEqual(['http://a/1.ts', 'http://a/1.ts']);
  });

  it('stop ou troca de canal durante a espera do restart cancelam a reabertura', () => {
    s = new PlaybackSession(eng, { startTimeoutMs: 60000, stallTimeoutMs: 60000 });
    s.play('http://a/1.ts');
    s.restart('http://a/1.ts');
    s.play('http://a/2.ts');
    vi.advanceTimersByTime(REOPEN_GAP_MS * 3);
    expect(eng.opened).toEqual(['http://a/1.ts', 'http://a/2.ts']);
    s.restart('http://a/2.ts');
    s.stop();
    vi.advanceTimersByTime(REOPEN_GAP_MS * 5);
    expect(eng.opened).toHaveLength(2);
    expect(s.state.status).toBe('idle');
  });

  it('erro de formato não suportado falha na hora, sem repetir', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'error', code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE' });
    expect(s.state.status).toBe('failed');
    vi.advanceTimersByTime(5000);
    expect(eng.opened).toHaveLength(1);
  });

  it('sem começar dentro do limite conta como falha (timeout)', () => {
    s.play('http://a/1.ts');
    vi.advanceTimersByTime(1000);
    expect(s.state).toMatchObject({ status: 'retrying', error: 'timeout' });
  });

  it('PLAYING sem o tempo andar não conta como imagem na tela (mini janela preta)', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'playing' });
    eng.emit({ type: 'time', ms: 9 });
    expect(s.state).toMatchObject({ status: 'playing', progressing: false });
    eng.emit({ type: 'time', ms: 200 });
    expect(s.state.progressing).toBe(false);
    eng.emit({ type: 'time', ms: 320 });
    expect(s.state.progressing).toBe(true);
    // nova abertura zera
    s.play('http://a/2.ts');
    expect(s.state.progressing).toBe(false);
  });

  it('stream congelado (sem avanço de tempo) é queda e reconecta', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'playing' });
    vi.advanceTimersByTime(400);
    eng.emit({ type: 'time', ms: 1000 });
    vi.advanceTimersByTime(400);
    expect(s.state.status).toBe('playing');
    // vigia vence em t=900; a nova tentativa (100 ms depois) ainda não ocorreu em t=950
    vi.advanceTimersByTime(150);
    expect(s.state).toMatchObject({ status: 'retrying', error: 'stall' });
    vi.advanceTimersByTime(100);
    expect(eng.opened).toHaveLength(2);
  });

  it('fim de stream ao vivo é tratado como queda', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'playing' });
    eng.emit({ type: 'ended' });
    expect(s.state.status).toBe('retrying');
  });

  it('depois de tocar de novo, uma nova queda recomeça a contagem', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'error', code: 'X' });
    vi.advanceTimersByTime(100);
    eng.emit({ type: 'playing' });
    expect(s.state.attempt).toBe(1);
  });

  it('eventos depois do stop são ignorados e timers não disparam', () => {
    s.play('http://a/1.ts');
    s.stop();
    eng.emit({ type: 'error', code: 'X' });
    vi.advanceTimersByTime(5000);
    expect(s.state.status).toBe('idle');
    expect(eng.opened).toHaveLength(1);
  });

  it('pausa suspende o vigia de travamento', () => {
    s.play('http://a/1.ts');
    eng.emit({ type: 'playing' });
    s.togglePause();
    vi.advanceTimersByTime(5000);
    expect(s.state.status).toBe('paused');
    s.togglePause();
    expect(s.state.status).toBe('playing');
  });
});

describe('streamUrl', () => {
  const xt = { kind: 'xtream', server: 'http://s.tv:8080', username: 'u@x', password: 'p/w' } as Source;
  const ch = (p: Partial<Channel>) => ({ id: 'a', gk: 'g', order: 1, num: 1, kind: 'live', name: 'A', q: 'a', group: 'G', ...p }) as Channel;

  it('Xtream ao vivo e VOD com credenciais codificadas', () => {
    expect(streamUrl(ch({ xid: 7 }), xt)).toBe('http://s.tv:8080/live/u%40x/p%2Fw/7.ts');
    expect(streamUrl(ch({ xid: 7 }), xt, 'm3u8')).toBe('http://s.tv:8080/live/u%40x/p%2Fw/7.m3u8');
    expect(streamUrl(ch({ xid: 9, kind: 'movie', ext: 'mkv' }), xt)).toBe('http://s.tv:8080/movie/u%40x/p%2Fw/9.mkv');
  });

  it('M3U usa a URL do item e recusa esquema inválido', () => {
    expect(streamUrl(ch({ url: 'http://a/1.ts' }), { kind: 'm3u' } as Source)).toBe('http://a/1.ts');
    expect(streamUrl(ch({ url: 'javascript:x' }), { kind: 'm3u' } as Source)).toBeNull();
  });

  it('redactUrl esconde usuário e senha', () => {
    expect(redactUrl('http://s.tv/live/joao/segredo/7.ts')).toBe('http://s.tv/live/***/***/7.ts');
    expect(redactUrl('http://s/get.php?username=a&password=b')).toBe('http://s/get.php?username=a&password=***');
  });
});
