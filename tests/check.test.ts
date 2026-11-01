import { describe, it, expect } from 'vitest';
import { parseAuth, apiUrl } from '../src/services/xtreamApi';
import { inspectM3uHead } from '../src/services/sourceCheck';

describe('apiUrl', () => {
  it('codifica usuário e senha com caracteres especiais', () => {
    const u = apiUrl({ server: 'http://s.tv', username: 'a&b', password: 'p@ss/#?' }, { action: 'get_live_categories' });
    expect(u).toBe('http://s.tv/player_api.php?username=a%26b&password=p%40ss%2F%23%3F&action=get_live_categories');
  });
});

describe('parseAuth', () => {
  it('aceita conta ativa com números como string', () => {
    const r = parseAuth({ user_info: { auth: 1, status: 'Active', exp_date: '1893456000', max_connections: '2', active_cons: '0', is_trial: '0' } });
    expect(r).toEqual({
      ok: true,
      account: { status: 'Active', expiresAt: 1893456000000, maxConnections: 2, activeConnections: 0, isTrial: false },
    });
  });

  it('exp_date nulo significa sem expiração', () => {
    const r = parseAuth({ user_info: { auth: '1', status: 'Active', exp_date: null } });
    expect(r.ok && r.account.expiresAt).toBeNull();
  });

  it('distingue credencial negada, conta inativa e resposta inválida', () => {
    expect(parseAuth({ user_info: { auth: 0 } })).toEqual({ ok: false, reason: 'denied' });
    expect(parseAuth({ user_info: { auth: 1, status: 'Expired' } })).toEqual({ ok: false, reason: 'inactive', status: 'Expired' });
    expect(parseAuth('<html>')).toEqual({ ok: false, reason: 'badResponse' });
    expect(parseAuth({})).toEqual({ ok: false, reason: 'badResponse' });
    expect(parseAuth(null)).toEqual({ ok: false, reason: 'badResponse' });
  });
});

describe('inspectM3uHead', () => {
  it('reconhece cabeçalho com BOM e espaços', () => {
    expect(inspectM3uHead('﻿  #EXTM3U url-tvg="x"\n#EXTINF:-1,A\nhttp://a\n#EXTINF:-1,B\nhttp://b')).toEqual({ isM3u: true, sample: 2 });
  });

  it('rejeita HTML e JSON', () => {
    expect(inspectM3uHead('<!DOCTYPE html><html>').isM3u).toBe(false);
    expect(inspectM3uHead('{"user_info":{}}').isM3u).toBe(false);
  });
});
