import { describe, it, expect } from 'vitest';
import { safeFileName, urlExt, recordable } from '../src/services/recorder';

const NOW = new Date(2026, 10, 2, 21, 5).getTime();

describe('safeFileName', () => {
  it('tira acentos e símbolos e acrescenta data e extensão', () => {
    expect(safeFileName('Ação: O Filme (2026)', 'mp4', NOW)).toBe('Acao O Filme 2026 20261102-2105.mp4');
  });
  it('não deixa sair da pasta (barras e ..)', () => {
    const n = safeFileName('../../etc/passwd', 'ts', NOW);
    expect(n).not.toMatch(/[/\\]/);
    expect(n).not.toContain('..');
  });
  it('título vazio ou só símbolos vira "orbita"', () => {
    expect(safeFileName('★★★', 'ts', NOW)).toBe('orbita 20261102-2105.ts');
  });
  it('extensão estranha vira ts', () => {
    expect(safeFileName('x', 'exe/../a', NOW)).toBe('x 20261102-2105.ts');
  });
  it('limita o tamanho do nome', () => {
    expect(safeFileName('a'.repeat(300), 'mkv', NOW).length).toBeLessThanOrEqual(60 + 1 + 13 + 4);
  });
});

describe('urlExt / recordable', () => {
  it('pega a extensão da URL, com ou sem query', () => {
    expect(urlExt('http://s/movie/u/p/10.mkv')).toBe('mkv');
    expect(urlExt('http://s/a.mp4?token=x')).toBe('mp4');
    expect(urlExt('http://s/stream')).toBe('ts');
  });
  it('grava só stream TS http(s); HLS e outros esquemas não', () => {
    expect(recordable('http://s/live/u/p/1.ts')).toBe(true);
    expect(recordable('http://s/live/u/p/1.m3u8')).toBe(false);
    expect(recordable('https://cdn/x/index.m3u8?a=1')).toBe(false);
    expect(recordable('rtsp://cam/1')).toBe(false);
  });
});

describe('recorder: pausar, continuar e cancelar downloads', () => {
  type Cb = { onprogress?: (i: number, r: number, t: number) => void; onfailed?: (i: number, e: { name: string }) => void };
  const calls: string[] = [];
  let cbs: Cb = {};
  const fakeTizen = {
    DownloadRequest: function (this: Record<string, string>, url: string, dir: string, name: string) {
      this.url = url; this.dir = dir; this.name = name;
    },
    download: {
      start: (_r: unknown, cb: Cb) => { cbs = cb; calls.push('start'); return 7; },
      cancel: (id: number) => calls.push('cancel ' + id),
      pause: (id: number) => calls.push('pause ' + id),
      resume: (id: number) => calls.push('resume ' + id),
    },
    filesystem: {
      listStorages: (ok: (l: Array<{ label: string; type: string; state: string }>) => void) => ok([{ label: 'removable_sda1', type: 'EXTERNAL', state: 'MOUNTED' }]),
      resolve: (_l: string, ok: (d: { fullPath: string }) => void) => ok({ fullPath: '/opt/media/USBDriveA1' }),
      createDirectory: (_p: string, _m: boolean, ok: () => void) => ok(),
      deleteFile: (p: string, ok: () => void) => { calls.push('delete ' + p); ok(); },
    },
  };
  (globalThis as unknown as { window: unknown }).window = { tizen: fakeTizen };

  it('grava no caminho real do pendrive, pausa, continua e cancela apagando o pedaço', async () => {
    const { recorder } = await import('../src/services/recorder');
    const r = await recorder.start('download', 'filme:1', 'Filme', 'http://s/movie/u/p/1.mkv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.dir).toBe('/opt/media/USBDriveA1/Orbita');
    expect(recorder.pause(r.job.id)).toBe(true);
    expect(r.job.state).toBe('paused');
    expect(recorder.resume(r.job.id)).toBe(true);
    expect(r.job.state).toBe('running');
    recorder.stop(r.job.id);
    expect(r.job.state).toBe('stopped');
    expect(calls).toEqual(['start', 'pause 7', 'resume 7', 'cancel 7', 'delete /opt/media/USBDriveA1/Orbita/' + r.job.fileName]);
  });

  it('download que caiu pode continuar; gravação não pausa', async () => {
    const { recorder } = await import('../src/services/recorder');
    calls.length = 0;
    const r = await recorder.start('download', 'filme:2', 'Outro', 'http://s/movie/u/p/2.mp4');
    if (!r.ok) throw new Error('não começou');
    cbs.onfailed!(7, { name: 'NetworkError' });
    expect(r.job.state).toBe('failed');
    expect(recorder.resume(r.job.id)).toBe(true);
    expect(r.job.state).toBe('running');
    const rec = await recorder.start('record', 'canal:1', 'Canal', 'http://s/live/u/p/1.ts');
    if (!rec.ok) throw new Error('não gravou');
    expect(recorder.pause(rec.job.id)).toBe(false);
  });
});
