import { describe, it, expect } from 'vitest';
import { normalizeHttpUrl, cleanText, cleanCredential } from '../src/utils/validate';

describe('normalizeHttpUrl', () => {
  it('aceita http/https e adiciona http:// quando falta esquema', () => {
    expect(normalizeHttpUrl('exemplo.com:8080/lista.m3u')).toEqual({ ok: true, value: 'http://exemplo.com:8080/lista.m3u' });
    expect(normalizeHttpUrl('  https://a.b/c ')).toEqual({ ok: true, value: 'https://a.b/c' });
  });

  it('remove barra final quando pedido (servidor Xtream)', () => {
    expect(normalizeHttpUrl('http://srv.tv:80/', { stripTrailingSlash: true })).toEqual({ ok: true, value: 'http://srv.tv' });
  });

  it('rejeita esquemas perigosos ou não suportados', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'ftp://a.b/c']) {
      const r = normalizeHttpUrl(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('rejeita vazio, espaços internos, caracteres de controle e tamanho excessivo', () => {
    expect(normalizeHttpUrl('')).toEqual({ ok: false, error: 'required' });
    expect(normalizeHttpUrl('http://a b.com')).toEqual({ ok: false, error: 'invalidChars' });
    expect(normalizeHttpUrl('http://a.com/\u0000')).toEqual({ ok: false, error: 'invalidChars' });
    expect(normalizeHttpUrl('http://a.com/' + 'x'.repeat(3000))).toEqual({ ok: false, error: 'tooLong' });
  });

  it('rejeita URL malformada', () => {
    expect(normalizeHttpUrl('http://').ok).toBe(false);
    expect(normalizeHttpUrl('http://[::zz]').ok).toBe(false);
  });
});

describe('cleanText / cleanCredential', () => {
  it('limita tamanho e remove espaços das pontas do nome', () => {
    expect(cleanText('  Minha lista ', 60)).toEqual({ ok: true, value: 'Minha lista' });
    expect(cleanText('x'.repeat(61), 60)).toEqual({ ok: false, error: 'tooLong' });
    expect(cleanText('', 60, false)).toEqual({ ok: true, value: '' });
  });

  it('preserva a senha como digitada, mas bloqueia controle e excesso', () => {
    expect(cleanCredential(' a b ')).toEqual({ ok: true, value: ' a b ' });
    expect(cleanCredential('a\nb').ok).toBe(false);
    expect(cleanCredential('x'.repeat(200)).ok).toBe(false);
    expect(cleanCredential('').ok).toBe(false);
  });
});
