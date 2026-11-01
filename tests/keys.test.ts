import { describe, it, expect } from 'vitest';
import { toRemoteKey } from '../src/navigation/keys';

const ev = (keyCode: number) => ({ keyCode }) as KeyboardEvent;

describe('toRemoteKey', () => {
  it('mapeia setas, OK e Back do controle Samsung', () => {
    expect(toRemoteKey(ev(37))?.action).toBe('left');
    expect(toRemoteKey(ev(13))?.action).toBe('ok');
    expect(toRemoteKey(ev(10009))?.action).toBe('back');
  });

  it('mapeia teclas de mídia e canal pelos códigos padrão', () => {
    expect(toRemoteKey(ev(10252))?.action).toBe('playPause');
    expect(toRemoteKey(ev(427))?.action).toBe('chUp');
    expect(toRemoteKey(ev(428))?.action).toBe('chDown');
  });

  it('converte dígitos do teclado e do teclado numérico', () => {
    expect(toRemoteKey(ev(53))).toEqual({ action: 'digit', digit: 5, code: 53 });
    expect(toRemoteKey(ev(96))).toEqual({ action: 'digit', digit: 0, code: 96 });
  });

  it('retorna null para tecla desconhecida', () => {
    expect(toRemoteKey(ev(5))).toBeNull();
  });
});
