// Tarefas pesadas de manutenção (apagar gerações antigas) só rodam quando o
// usuário está parado. Na TV, apagar 100 mil itens leva ~25 s e, durante esse
// tempo, as consultas de canais esperam a transação: rodar isso logo depois de
// uma atualização deixava a TV ao vivo vazia.

export class IdleTasks {
  private lastInput: number;
  private pending = new Map<string, () => Promise<unknown>>();
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private idleMs = 60000, private checkMs = 15000, private now: () => number = () => Date.now()) {
    this.lastInput = now();
  }

  /** Chamado a cada tecla. */
  touch(): void {
    this.lastInput = this.now();
  }

  /** Agenda (ou substitui) uma tarefa nomeada para o próximo período ocioso. */
  schedule(name: string, task: () => Promise<unknown>): void {
    this.pending.set(name, task);
    if (!this.timer) this.timer = setInterval(() => void this.tick(), this.checkMs);
  }

  get queued(): string[] {
    return Array.from(this.pending.keys());
  }

  async tick(): Promise<void> {
    if (this.running || !this.pending.size || this.now() - this.lastInput < this.idleMs) return;
    this.running = true;
    try {
      for (const [name, task] of Array.from(this.pending.entries())) {
        // o usuário voltou: deixa o resto para a próxima pausa
        if (this.now() - this.lastInput < this.idleMs) break;
        this.pending.delete(name);
        await task().catch(() => undefined);
      }
    } finally {
      this.running = false;
      if (!this.pending.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }
}
