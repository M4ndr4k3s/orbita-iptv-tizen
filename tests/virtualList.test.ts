import { describe, it, expect } from 'vitest';
import { scrollWindow } from '../src/components/virtualList';

describe('scrollWindow (rolagem da lista virtual)', () => {
  it('não rola enquanto a seleção fica longe das bordas', () => {
    expect(scrollWindow(0, 5, 10, 100)).toBe(0);
  });
  it('rola mantendo uma linha de margem embaixo', () => {
    expect(scrollWindow(0, 9, 10, 100)).toBe(1);
  });
  it('rola mantendo uma linha de margem em cima', () => {
    expect(scrollWindow(10, 10, 10, 100)).toBe(9);
  });
  it('não passa do fim nem do começo da lista', () => {
    expect(scrollWindow(0, 99, 10, 100)).toBe(90);
    expect(scrollWindow(5, 0, 10, 100)).toBe(0);
  });
  it('lista menor que a janela nunca rola', () => {
    expect(scrollWindow(0, 4, 10, 5)).toBe(0);
  });
});
