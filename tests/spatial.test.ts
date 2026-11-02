import { describe, it, expect } from 'vitest';
import { pickNext, type Rect } from '../src/navigation/spatial';

const r = (left: number, top: number, width = 100, height = 100): Rect => ({ left, top, width, height });

describe('pickNext', () => {
  // grade 3x2:  A B C / D E F
  const grid = [r(0, 0), r(120, 0), r(240, 0), r(0, 120), r(120, 120), r(240, 120)];

  it('move para a direita na mesma linha', () => {
    expect(pickNext(grid[0], grid.filter((_, i) => i !== 0), 'right')).toBe(0); // B (índice 0 após filtro)
  });

  it('move para baixo na mesma coluna', () => {
    const others = [grid[0], grid[2], grid[3], grid[4], grid[5]];
    expect(others[pickNext(grid[1], others, 'down')]).toBe(grid[4]);
  });

  it('retorna -1 quando não há nada na direção', () => {
    expect(pickNext(grid[0], [grid[1], grid[3]], 'left')).toBe(-1);
    expect(pickNext(grid[0], [grid[1], grid[3]], 'up')).toBe(-1);
  });

  it('prefere alinhado a mais próximo porém desalinhado', () => {
    const from = r(0, 0);
    const aligned = r(400, 0);
    const diagonal = r(150, 300);
    expect(pickNext(from, [diagonal, aligned], 'right')).toBe(1);
  });

  it('do menu lateral alto escolhe o item da linha correspondente', () => {
    const menuItem = r(0, 500, 120, 80);
    const rows = [r(200, 100, 300, 200), r(200, 450, 300, 200), r(200, 800, 300, 200)];
    expect(pickNext(menuItem, rows, 'right')).toBe(1);
  });

  it('↑/↓ não pula na diagonal para outra coluna (ex.: menu lateral)', () => {
    const lastRow = { left: 400, top: 900, width: 1200, height: 80 };
    const sidebarBelow = { left: 0, top: 960, width: 300, height: 60 };
    expect(pickNext(lastRow, [sidebarBelow], 'down')).toBe(-1);
    const sidebarAbove = { left: 0, top: 100, width: 300, height: 60 };
    expect(pickNext(lastRow, [sidebarAbove], 'up')).toBe(-1);
  });
  it('←/→ não sobe nem desce: último cartão de um carrossel não pula para o de baixo', () => {
    const lastCard = r(1600, 300, 180, 270);
    const nextRowCard = r(1700, 650, 180, 270);
    expect(pickNext(lastCard, [nextRowCard], 'right')).toBe(-1);
    expect(pickNext(r(400, 650, 180, 270), [r(200, 300, 180, 270)], 'left')).toBe(-1);
  });
  it('ignora candidatos atrás da origem', () => {
    expect(pickNext(r(200, 0), [r(0, 0), r(400, 0)], 'right')).toBe(1);
  });
});
