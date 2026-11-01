import { describe, it, expect, beforeAll } from 'vitest';
import { AvplayEngine, type AVPlay } from '../src/player/avplayEngine';

// AVPlay falso que registra as chamadas e falha (como a TV) se receber
// open/stop/close com um prepareAsync pendente
class FakeAv {
  calls: string[] = [];
  state = 'NONE';
  pending: { ok: () => void; err: (e: { name?: string }) => void } | null = null;
  violations = 0;
  private guard(name: string) {
    this.calls.push(name);
    if (this.pending && name !== 'setListener' && name !== 'getState') this.violations++;
  }
  open(url: string) { this.guard('open:' + url.slice(-2)); this.state = 'IDLE'; }
  close() { this.guard('close'); this.state = 'NONE'; }
  stop() { this.guard('stop'); this.state = 'IDLE'; }
  prepareAsync(ok: () => void, err: (e: { name?: string }) => void) { this.calls.push('prepare'); this.pending = { ok, err }; }
  play() { this.calls.push('play'); this.state = 'PLAYING'; }
  pause() {}
  getState() { return this.state; }
  setListener() {}
  setDisplayRect(x: number, y: number, w: number, h: number) { this.guard('rect:' + [x, y, w, h].join(',')); }
  setDisplayMethod() {}
  getCurrentStreamInfo() { return []; }
  suspend() {}
  restore() {}
  finish(ok = true) {
    const p = this.pending!;
    this.pending = null;
    this.state = ok ? 'READY' : 'IDLE';
    if (ok) p.ok(); else p.err({ name: 'PLAYER_ERROR_CONNECTION_FAILED' });
  }
}

beforeAll(() => {
  // o motor procura/cria o <object> do AVPlay
  (globalThis as unknown as { document: unknown }).document = {
    getElementById: () => ({}),
  };
});

describe('AvplayEngine: fila durante o preparo', () => {
  it('troca rápida: só abre o último pedido, e só depois do preparo responder', () => {
    const av = new FakeAv();
    const e = new AvplayEngine(av as unknown as AVPlay);
    e.open('http://a/01');
    e.stop();
    e.open('http://a/02');
    e.stop();
    e.open('http://a/03');
    expect(av.violations).toBe(0);
    expect(av.calls.filter((c) => c.startsWith('open'))).toEqual(['open:01']);
    av.finish();
    // o 01 não chega a tocar: fecha e abre o 03
    expect(av.calls.slice(-1)[0]).toBe('prepare');
    expect(av.calls.filter((c) => c.startsWith('open'))).toEqual(['open:01', 'open:03']);
    expect(av.calls).not.toContain('play');
    av.finish();
    expect(av.calls.slice(-1)[0]).toBe('play');
    expect(av.violations).toBe(0);
  });

  it('stop durante o preparo fecha quando o preparo responde', () => {
    const av = new FakeAv();
    const e = new AvplayEngine(av as unknown as AVPlay);
    e.open('http://a/01');
    e.stop();
    av.finish();
    expect(av.calls).not.toContain('play');
    expect(av.state).toBe('NONE');
  });

  it('erro de um preparo abandonado não chega à sessão', () => {
    const av = new FakeAv();
    const e = new AvplayEngine(av as unknown as AVPlay);
    const events: string[] = [];
    e.setListener((ev) => events.push(ev.type));
    e.open('http://a/01');
    e.open('http://a/02');
    av.finish(false);
    expect(events).toEqual([]);
    av.finish();
    expect(av.calls.slice(-1)[0]).toBe('play');
  });

  it('retângulo da mini janela só é aplicado fora do preparo', () => {
    const av = new FakeAv();
    const e = new AvplayEngine(av as unknown as AVPlay);
    e.open('http://a/01');
    e.setRect({ x: 10, y: 20, w: 300, h: 200 });
    expect(av.violations).toBe(0);
    av.finish();
    expect(av.calls).toContain('rect:10,20,300,200');
    e.setRect(null);
    expect(av.calls.slice(-1)[0]).toBe('rect:0,0,1920,1080');
  });
});
