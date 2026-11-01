import { describe, it, expect, beforeEach } from 'vitest';
import { validateSource, emptyInput, describeSource, type ValidSource } from '../src/playlist/source';
import { SourceService } from '../src/services/sourceService';
import { MemoryStore } from '../src/storage/store';
import { SettingsStore, type SettingsBackend } from '../src/storage/settings';

class MemBackend implements SettingsBackend {
  data: Record<string, string> = {};
  getItem(k: string) { return k in this.data ? this.data[k] : null; }
  setItem(k: string, v: string) { this.data[k] = v; }
}

const m3u = (url: string, name = 'Lista'): ValidSource => {
  const r = validateSource({ ...emptyInput('m3u'), name, url });
  if (!r.ok) throw new Error('fixture inválida');
  return r.value;
};

describe('validateSource', () => {
  it('valida M3U e normaliza URL', () => {
    const r = validateSource({ ...emptyInput('m3u'), name: ' Casa ', url: 'srv.tv/lista.m3u' });
    expect(r.ok && r.value).toMatchObject({ kind: 'm3u', name: 'Casa', url: 'http://srv.tv/lista.m3u' });
  });

  it('exige servidor, usuário e senha no Xtream', () => {
    const r = validateSource({ ...emptyInput('xtream'), name: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['password', 'server', 'username']);
  });

  it('rejeita EPG com esquema inválido e intervalo de atualização fora da lista', () => {
    const r = validateSource({ ...emptyInput('m3u'), name: 'A', url: 'http://a.b/c', epgUrl: 'file:///x', refreshHours: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ epgUrl: 'unsupportedScheme', refreshHours: 'invalidChars' });
  });

  it('não expõe a senha na descrição', () => {
    const r = validateSource({ ...emptyInput('xtream'), name: 'X', server: 'http://srv.tv:8080/', username: 'joao', password: 'segredo' });
    if (!r.ok) throw new Error();
    const d = describeSource({ ...r.value, id: '1', createdAt: 0, updatedAt: 0 });
    expect(d).toBe('joao @ srv.tv:8080');
    expect(d).not.toContain('segredo');
  });
});

describe('SourceService', () => {
  let store: MemoryStore<any>;
  let backend: MemBackend;
  let svc: SourceService;

  beforeEach(async () => {
    store = new MemoryStore();
    backend = new MemBackend();
    svc = new SourceService(store, new SettingsStore(backend));
    await svc.load();
  });

  it('primeira fonte vira ativa e persiste no store', async () => {
    const s = await svc.add(m3u('http://a.b/1.m3u'));
    expect(svc.active()?.id).toBe(s.id);
    expect((await store.getAll()).length).toBe(1);
  });

  it('recarrega do armazenamento (simula reinício do app)', async () => {
    const a = await svc.add(m3u('http://a.b/1.m3u', 'A'));
    const b = await svc.add(m3u('http://a.b/2.m3u', 'B'));
    svc.setActive(b.id);
    const again = new SourceService(store, new SettingsStore(backend));
    await again.load();
    expect(again.list().map((s) => s.name)).toEqual(['A', 'B']);
    expect(again.active()?.id).toBe(b.id);
    expect(again.get(a.id)?.url).toBe('http://a.b/1.m3u');
  });

  it('detecta duplicata ignorando maiúsculas e a própria fonte', async () => {
    const a = await svc.add(m3u('http://a.b/1.m3u'));
    expect(svc.findDuplicate({ kind: 'm3u', url: 'HTTP://A.B/1.m3u' })?.id).toBe(a.id);
    expect(svc.findDuplicate({ kind: 'm3u', url: 'http://a.b/1.m3u' }, a.id)).toBeUndefined();
  });

  it('remover a ativa passa a ativa para a próxima', async () => {
    const a = await svc.add(m3u('http://a.b/1.m3u'));
    const b = await svc.add(m3u('http://a.b/2.m3u'));
    await svc.remove(a.id);
    expect(svc.active()?.id).toBe(b.id);
    await svc.remove(b.id);
    expect(svc.active()).toBeUndefined();
  });

  it('editar URL limpa o status da última verificação', async () => {
    const a = await svc.add(m3u('http://a.b/1.m3u'));
    await svc.setStatus(a.id, true);
    expect(svc.get(a.id)?.lastStatus).toBe('ok');
    await svc.update(a.id, m3u('http://a.b/outra.m3u'));
    expect(svc.get(a.id)?.lastStatus).toBeUndefined();
  });

  it('settings corrompidas voltam ao padrão sem quebrar', () => {
    const be = new MemBackend();
    be.data['orbita.settings.v1'] = '{isso não é json';
    expect(new SettingsStore(be).get().activeSourceId).toBeNull();
    be.data['orbita.settings.v1'] = JSON.stringify({ activeSourceId: 42, askSourceOnStart: 'sim', extra: 1 });
    const s = new SettingsStore(be).get();
    expect(s.activeSourceId).toBeNull();
    expect(s.askSourceOnStart).toBe(true);
    expect((s as any).extra).toBeUndefined();
  });
});
