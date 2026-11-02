// Navegação espacial pura (sem DOM): dado o retângulo atual e candidatos,
// escolhe o próximo na direção pedida. Testável no Node.

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// peso do desalinhamento lateral: maior = prefere quem está "na mesma linha/coluna"
const CROSS_WEIGHT = 3;
// tolerância para sobreposição (bordas encostadas ou levemente sobrepostas)
const OVERLAP_TOLERANCE = 4;

function gap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (bEnd < aStart) return aStart - bEnd;
  if (bStart > aEnd) return bStart - aEnd;
  return 0; // faixas se sobrepõem
}

/**
 * Retorna o índice do melhor candidato, ou -1 se nenhum estiver na direção.
 * allowDiagonal: aceita quem não está na mesma linha/coluna (só nas exceções de focus.ts).
 */
export function pickNext(from: Rect, candidates: Rect[], dir: Direction, allowDiagonal = false): number {
  const fr = from.left + from.width;
  const fb = from.top + from.height;
  let best = -1;
  let bestScore = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cr = c.left + c.width;
    const cb = c.top + c.height;
    let main: number;
    let cross: number;

    switch (dir) {
      case 'right':
        main = c.left - fr;
        cross = gap(from.top, fb, c.top, cb);
        break;
      case 'left':
        main = from.left - cr;
        cross = gap(from.top, fb, c.top, cb);
        break;
      case 'down':
        main = c.top - fb;
        cross = gap(from.left, fr, c.left, cr);
        break;
      default:
        main = from.top - cb;
        cross = gap(from.left, fr, c.left, cr);
    }
    if (main < -OVERLAP_TOLERANCE) continue; // está atrás ou sobreposto demais
    // navegação linear: ↑/↓ só na mesma coluna e ←/→ só na mesma linha. Antes a
    // diagonal fazia o ↓ cair no menu lateral e o → do último cartão subir/descer
    if (!allowDiagonal && cross > 0) continue;
    const score = Math.max(main, 0) + cross * CROSS_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
