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
