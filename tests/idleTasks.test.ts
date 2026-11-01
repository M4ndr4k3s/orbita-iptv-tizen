import { describe, it, expect } from 'vitest';
import { IdleTasks } from '../src/services/idleTasks';

describe('IdleTasks', () => {
  it('só roda depois do tempo ocioso e cada tarefa uma vez', async () => {
    let t = 0;
    const idle = new IdleTasks(60000, 1e9, () => t);
    let runs = 0;
    idle.schedule('limpeza', async () => { runs++; });
    idle.touch();
    t = 30000;
    await idle.tick();
    expect(runs).toBe(0);
    t = 61000;
    await idle.tick();
    expect(runs).toBe(1);
    await idle.tick();
    expect(runs).toBe(1);
  });

  it('agendar de novo com o mesmo nome substitui (não duplica)', async () => {
    let t = 0;
    const idle = new IdleTasks(1000, 1e9, () => t);
    let runs = 0;
    idle.schedule('limpeza', async () => { runs += 10; });
    idle.schedule('limpeza', async () => { runs += 1; });
    expect(idle.queued).toEqual(['limpeza']);
    t = 2000;
    await idle.tick();
    expect(runs).toBe(1);
  });

  it('tecla durante a pausa adia o restante', async () => {
    let t = 0;
    const idle = new IdleTasks(1000, 1e9, () => t);
    const order: string[] = [];
    idle.schedule('a', async () => { order.push('a'); idle.touch(); });
    idle.schedule('b', async () => { order.push('b'); });
    t = 2000;
    await idle.tick();
    expect(order).toEqual(['a']);
    expect(idle.queued).toEqual(['b']);
  });

  it('falha numa tarefa não impede as outras', async () => {
    let t = 0;
    const idle = new IdleTasks(1000, 1e9, () => t);
    const order: string[] = [];
    idle.schedule('a', async () => { throw new Error('x'); });
    idle.schedule('b', async () => { order.push('b'); });
    t = 2000;
    await idle.tick();
    expect(order).toEqual(['b']);
  });
});
