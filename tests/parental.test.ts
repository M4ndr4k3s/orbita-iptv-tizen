import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ParentalService, lockDuration, isValidPin, FREE_ATTEMPTS, type ParentalBackend } from '../src/services/parental';
import { buildBackup, parseBackup } from '../src/services/backup';
import { settings } from '../src/storage/settings';
import { en } from '../src/services/i18n.en';
import { es } from '../src/services/i18n.es';
import { t, setLanguage, BASE_KEYS } from '../src/services/i18n';
import type { Source } from '../src/playlist/source';

if (!(globalThis as { crypto?: unknown }).crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

class Mem implements ParentalBackend {
  m: Record<string, string> = {};
  getItem(k: string) { return k in this.m ? this.m[k] : null; }
  setItem(k: string, v: string) { this.m[k] = v; }
  removeItem(k: string) { delete this.m[k]; }
}

// derivação barata nos testes (o PBKDF2 real é testado à parte)
const fakeDerive = async (pin: string, salt: Uint8Array) => {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = (pin.charCodeAt(i % pin.length) + salt[i % salt.length] + i) & 255;
  return out;
};

describe('ParentalService', () => {
  let mem: Mem;
  let now: number;
  let p: ParentalService;
  const make = () => new ParentalService({ backend: mem, now: () => now, derive: fakeDerive });
  beforeEach(() => {
    mem = new Mem();
    now = 1000000;
    p = make();
  });

  it('sem PIN tudo fica liberado', async () => {
    expect(p.hasPin()).toBe(false);
    expect(p.isUnlocked()).toBe(true);
    expect(p.isBlocked('live', 'Adultos')).toBe(false);
    expect(await p.verify('0000')).toEqual({ ok: true });
  });

  it('guarda só hash e salt, nunca o PIN', async () => {
    await p.setPin('4321');
    const raw = mem.m['orbita.parental.v1'];
    expect(raw).not.toContain('4321');
    const st = JSON.parse(raw);
    expect(st.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(st.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('dois PINs iguais geram hashes diferentes (salt aleatório)', async () => {
    await p.setPin('1111');
    const h1 = JSON.parse(mem.m['orbita.parental.v1']).hash;
    await p.setPin('1111');
    expect(JSON.parse(mem.m['orbita.parental.v1']).hash).not.toBe(h1);
  });

  it('PIN inválido é recusado ao cadastrar', async () => {
    for (const bad of ['', '123', '12345', 'abcd', '12 4', '١٢٣٤']) expect(isValidPin(bad)).toBe(false);
    await expect(p.setPin('12a4')).rejects.toThrow();
  });

  it('bloqueia categorias até digitar o PIN, que vale para a sessão', async () => {
    await p.setPin('2468');
    p.setGroupLocked('live', 'Adultos', true);
    p.setGroupLocked('movie', 'Terror', true);
    p = make(); // app reaberto: sessão travada
    expect(p.isBlocked('live', 'Adultos')).toBe(true);
    expect(p.isBlocked('live', 'Esportes')).toBe(false);
    expect(p.isBlocked('movie', 'Adultos')).toBe(false);
    expect(p.hiddenGroups('live')).toEqual(['Adultos']);
    expect(p.hiddenGroups('movie')).toEqual(['Terror']);
    expect(await p.verify('2468')).toEqual({ ok: true });
    expect(p.isBlocked('live', 'Adultos')).toBe(false);
    expect(p.hiddenGroups('live')).toEqual([]);
    p.lockSession();
    expect(p.isBlocked('live', 'Adultos')).toBe(true);
  });

  it('erros seguidos bloqueiam por tempo crescente, mesmo reabrindo o app', async () => {
    await p.setPin('2468');
    p = make();
    for (let i = 1; i < FREE_ATTEMPTS; i++) expect(await p.verify('0000')).toMatchObject({ ok: false, reason: 'wrong', left: FREE_ATTEMPTS - i });
    expect(await p.verify('0000')).toMatchObject({ ok: false, reason: 'locked', waitMs: 30000 });
    // nem o PIN certo passa durante o bloqueio
    expect(await p.verify('2468')).toMatchObject({ ok: false, reason: 'locked' });
    p = make();
    expect(p.waitMs()).toBe(30000);
    now += 30000;
    expect(await p.verify('1111')).toMatchObject({ reason: 'locked', waitMs: 60000 });
    now += 60000;
    expect(await p.verify('2468')).toEqual({ ok: true });
    // acerto zera a contagem
    expect(await p.verify('0000')).toMatchObject({ reason: 'wrong', left: FREE_ATTEMPTS - 1 });
  });

  it('tempo de bloqueio tem teto', () => {
    expect(lockDuration(FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockDuration(FREE_ATTEMPTS)).toBe(30000);
    expect(lockDuration(40)).toBe(15 * 60000);
  });

  it('storage adulterado não derruba nem libera nada estranho', () => {
    mem.m['orbita.parental.v1'] = '{"salt":"zz","hash":"<script>"}';
    expect(make().hasPin()).toBe(false);
    mem.m['orbita.parental.v1'] = 'não é json';
    expect(make().hasPin()).toBe(false);
    mem.m['orbita.parental.v1'] = JSON.stringify({ salt: 'ab'.repeat(16), hash: 'cd'.repeat(32), iter: 1, fails: -5, locked: ['live:A', 'x:B', 7] });
    const q = make();
    expect(q.hasPin()).toBe(true);
    expect(q.lockedCount()).toBe(1);
    expect(q.waitMs()).toBe(0);
  });

  it('desativar apaga PIN e bloqueios', async () => {
    await p.setPin('2468');
    p.setGroupLocked('live', 'A', true);
    p.clear();
    expect(p.hasPin()).toBe(false);
    expect(mem.m['orbita.parental.v1']).toBeUndefined();
    expect(p.isBlocked('live', 'A')).toBe(false);
  });

  it('PBKDF2 real confere o PIN certo e recusa o errado', async () => {
    const real = new ParentalService({ backend: new Mem() });
    await real.setPin('9753');
    real.lockSession();
    expect(await real.verify('9753')).toEqual({ ok: true });
    expect((await real.verify('9754')).ok).toBe(false);
  }, 20000);
});

const src = (o: Partial<Source>): Source => ({ id: 'x', kind: 'm3u', name: 'Casa', refreshHours: 24, createdAt: 0, updatedAt: 0, ...o });

describe('backup', () => {
  it('ida e volta mantém listas e ajustes, sem estado interno', () => {
    settings.set({ language: 'es', livePreview: false, aspect: '4:3' });
    const text = buildBackup(
      [
        src({ url: 'http://a.test/l.m3u', lastError: 'x', import: { gk: 'g' } as unknown as Source['import'] }),
        src({ kind: 'xtream', name: 'Conta', server: 'http://b.test:8080', username: 'u', password: 'p' }),
      ],
      settings.get(),
    );
    expect(text).not.toContain('lastError');
    expect(text).not.toContain('"gk"');
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sources).toHaveLength(2);
    expect(r.value.sources[1]).toMatchObject({ kind: 'xtream', server: 'http://b.test:8080', username: 'u', password: 'p' });
    expect(r.value.settings).toMatchObject({ language: 'es', livePreview: false, aspect: '4:3' });
    expect(r.value.settings).not.toHaveProperty('activeSourceId');
  });

  it('recusa arquivos que não são backup', () => {
    expect(parseBackup('x'.repeat(2 * 1024 * 1024))).toEqual({ ok: false, error: 'tooBig' });
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'notJson' });
    expect(parseBackup('{"app":"outro","type":"backup","version":1}')).toEqual({ ok: false, error: 'notBackup' });
    expect(parseBackup('{"app":"orbita","type":"backup","version":9}')).toEqual({ ok: false, error: 'newerVersion' });
    expect(parseBackup('{"app":"orbita","type":"backup","version":1}')).toEqual({ ok: false, error: 'empty' });
  });

  it('revalida cada lista e cada ajuste como entrada não confiável', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'orbita',
        type: 'backup',
        version: 1,
        settings: { language: 'xx', aspect: '4:3', buffer: 'gigante', subLang: '<b>', audioLang: 'por', activeSourceId: 'hack', livePreview: 'sim' },
        sources: [
          { kind: 'm3u', name: 'Boa', url: 'http://ok.test/a.m3u', refreshHours: 6 },
          { kind: 'm3u', name: 'JS', url: 'javascript:alert(1)' },
          { kind: 'm3u', name: '', url: 'http://ok.test/b.m3u' },
          { kind: 'ftp', name: 'X', url: 'ftp://x' },
          { kind: 'xtream', name: 'Sem senha', server: 'http://s.test', username: 'u' },
          null,
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sources.map((s) => s.name)).toEqual(['Boa']);
    expect(r.skipped).toBe(5);
    expect(r.value.settings).toEqual({ aspect: '4:3', audioLang: 'por' });
  });
});

describe('idiomas', () => {
  const keys = BASE_KEYS;
  it('en e es têm todas as chaves do pt-BR, com os mesmos marcadores', () => {
    setLanguage('pt-BR');
    for (const [name, dict] of [['en', en], ['es', es]] as const) {
      for (const k of keys) expect(dict, name + ' ' + k).toHaveProperty(k);
      for (const k of Object.keys(dict) as Array<keyof typeof dict>) {
        const marks = (s: string) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
        expect(marks(dict[k] as string), name + ' ' + k).toBe(marks(t(k)));
      }
    }
  });
  it('troca de idioma e cai no pt-BR para idioma desconhecido', () => {
    setLanguage('en');
    expect(t('nav.settings')).toBe('Settings');
    setLanguage('es');
    expect(t('nav.settings')).toBe('Ajustes');
    setLanguage('klingon');
    expect(t('nav.settings')).toBe('Configurações');
  });
});
