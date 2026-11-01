// Orquestra importações no worker de dados e mantém as fontes atualizadas.

import type { SourceService } from './sourceService';
import { epgUrlFor, type Source } from '../playlist/source';
import type { ImportStats } from '../playlist/model';
import type { ImportErrorCode, ImportProgress } from '../playlist/runImport';
import type { DataClient } from '../storage/dataClient';
import type { IdleTasks } from './idleTasks';

export type ImportOutcome =
  | { ok: true; stats: ImportStats & { truncated: boolean } }
  | { ok: false; code: ImportErrorCode; status: number };

interface Job {
  sourceId: string;
  gk: string;
  resolve: (o: ImportOutcome) => void;
  onProgress?: (p: ImportProgress) => void;
}

// guia é atualizado 1x por dia; uma falha só é tentada de novo depois de 6 h
const EPG_MAX_AGE_MS = 24 * 3600 * 1000;
const EPG_RETRY_MS = 6 * 3600 * 1000;

export class ImportService {
  private jobs = new Map<number, Job>();
  private epgJobs = new Map<number, { sourceId: string; ek: string; resolve: (ok: boolean) => void }>();
  private epgRunning = new Map<string, Promise<boolean>>();
  private running = new Map<string, Promise<ImportOutcome>>();
  private nextId = 1;

  constructor(private sources: SourceService, private data: DataClient, private idle: IdleTasks) {
    data.onImport((m) => {
      const job = this.jobs.get(m.jobId);
      if (!job) return;
      if (m.type === 'progress') {
        if (job.onProgress) job.onProgress(m.progress);
        return;
      }
      this.jobs.delete(m.jobId);
      job.resolve(m.type === 'done' ? { ok: true, stats: m.stats } : { ok: false, code: m.code, status: m.status });
    });
    data.onEpg((m) => {
      const job = this.epgJobs.get(m.jobId);
      if (!job) return;
      this.epgJobs.delete(m.jobId);
      job.resolve(m.type === 'epgDone');
      if (m.type === 'epgDone') void this.sources.setEpg(job.sourceId, { stats: m.stats }).then(() => this.scheduleCleanup());
      else if (m.code !== 'aborted') void this.sources.setEpg(job.sourceId, { error: m.code });
    });
    // worker morreu (ex.: falta de memória): encerra as tarefas com erro
    data.onCrash = () => {
      for (const [id, job] of this.epgJobs) {
        this.epgJobs.delete(id);
        job.resolve(false);
      }
      for (const [id, job] of this.jobs) {
        this.jobs.delete(id);
        job.resolve({ ok: false, code: 'storage', status: 0 });
      }
    };
  }

  isRunning(sourceId: string): boolean {
    return this.running.has(sourceId);
  }

  /** Importa a fonte; se já houver importação dela em andamento, reaproveita. */
  run(source: Source, onProgress?: (p: ImportProgress) => void): { promise: Promise<ImportOutcome>; cancel: () => void } {
    const existing = this.running.get(source.id);
    if (existing) {
      const jobId = this.jobIdOf(source.id);
      if (jobId != null && onProgress) this.jobs.get(jobId)!.onProgress = onProgress;
      return { promise: existing, cancel: () => this.cancel(source.id) };
    }
    const jobId = this.nextId++;
    // geração nova: id da fonte + carimbo (base36)
    const gk = source.id + ':' + Date.now().toString(36);
    const promise = new Promise<ImportOutcome>((resolve) => {
      this.jobs.set(jobId, { sourceId: source.id, gk, resolve, onProgress });
    }).then(async (outcome) => {
      this.running.delete(source.id);
      if (outcome.ok) {
        await this.sources.setImport(source.id, { stats: outcome.stats });
        // a geração anterior deixou de ser referenciada: some quando o usuário estiver parado
        this.scheduleCleanup();
        const fresh = this.sources.get(source.id);
        if (fresh && this.isEpgDue(fresh)) void this.runEpg(fresh);
      } else if (outcome.code !== 'aborted') {
        await this.sources.setImport(source.id, { error: outcome.code });
      }
      return outcome;
    });
    this.running.set(source.id, promise);
    this.data.send({
      type: 'start',
      jobId,
      gk,
      source: { kind: source.kind, url: source.url, server: source.server, username: source.username, password: source.password },
    });
    return { promise, cancel: () => this.cancel(source.id) };
  }

  cancel(sourceId: string): void {
    const jobId = this.jobIdOf(sourceId);
    if (jobId != null) this.data.send({ type: 'cancel', jobId });
  }

  /** Precisa atualizar? (nunca importada, ou intervalo vencido) */
  isDue(s: Source, now = Date.now()): boolean {
    if (!s.import) return true;
    return s.refreshHours > 0 && now - s.import.importedAt > s.refreshHours * 3600 * 1000;
  }

  /** Guia precisa ser baixado? (há URL, e nunca baixou / venceu / falhou há tempo) */
  isEpgDue(s: Source, now = Date.now()): boolean {
    if (!epgUrlFor(s) || this.epgRunning.has(s.id)) return false;
    if (s.epgTriedAt && now - s.epgTriedAt < (s.epgError ? EPG_RETRY_MS : EPG_MAX_AGE_MS)) return false;
    return !s.epg || now - s.epg.importedAt > EPG_MAX_AGE_MS || !!s.epgError;
  }

  isEpgRunning(sourceId: string): boolean {
    return this.epgRunning.has(sourceId);
  }

  /** Baixa o guia em segundo plano (a interface segue usável). */
  runEpg(source: Source): Promise<boolean> {
    const existing = this.epgRunning.get(source.id);
    if (existing) return existing;
    const url = epgUrlFor(source);
    if (!url) return Promise.resolve(false);
    const jobId = this.nextId++;
    const ek = source.id + ':e' + Date.now().toString(36);
    const promise = new Promise<boolean>((resolve) => {
      this.epgJobs.set(jobId, { sourceId: source.id, ek, resolve });
    }).then((ok) => {
      this.epgRunning.delete(source.id);
      return ok;
    });
    this.epgRunning.set(source.id, promise);
    this.data.send({ type: 'epgStart', jobId, ek, url });
    return promise;
  }

  /** Agenda a limpeza para o próximo período sem uso (ver IdleTasks). */
  scheduleCleanup(): void {
    this.idle.schedule('cleanup', () => this.cleanup());
  }

  /** Remove gerações que nenhuma fonte usa (fonte removida, importação interrompida/substituída). */
  cleanup(): Promise<string[]> {
    const keep: string[] = [];
    for (const s of this.sources.list()) {
      if (s.import) keep.push(s.import.gk);
      if (s.epg) keep.push(s.epg.ek);
    }
    const busy: string[] = [];
    for (const j of this.jobs.values()) busy.push(j.gk);
    for (const j of this.epgJobs.values()) busy.push(j.ek);
    return this.data.call('gens.cleanup', keep, busy);
  }

  private jobIdOf(sourceId: string): number | null {
    for (const [id, j] of this.jobs) if (j.sourceId === sourceId) return id;
    return null;
  }
}
