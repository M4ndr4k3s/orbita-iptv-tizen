// Downloads de filmes/episódios e gravação de canais ao vivo no pendrive.
// Usa a API de Download nativa do Tizen: o sistema grava direto no disco
// (9 MB/s medidos na TV), no caminho real do pendrive. Escrever pelo JS (FileHandle.writeData) ficou em
// ~0,65 MB/s e travava a interface. Gravar = baixar o stream TS sem fim;
// parar = cancelar, e o cancelamento mantém o que já foi gravado (conferido na TV).

export type JobKind = 'download' | 'record';
export type JobState = 'running' | 'paused' | 'done' | 'stopped' | 'failed';

export interface Job {
  id: number;
  kind: JobKind;
  title: string;
  fileName: string;
  /** pasta (raiz virtual do Tizen) onde o arquivo fica */
  dir: string;
  /** chave do item (canal/filme) para a tela saber se ele está gravando */
  key: string;
  startedAt: number;
  received: number;
  total: number;
  state: JobState;
  error?: string;
}

export type StartError = 'noUsb' | 'unsupported' | 'busy' | 'failed';

const MAX_RUNNING = 3;
const FOLDER = 'Orbita';

interface DownloadCallbacks {
  onprogress?(id: number, received: number, total: number): void;
  oncompleted?(id: number, path: string): void;
  onfailed?(id: number, e: { name?: string; message?: string }): void;
  oncanceled?(id: number): void;
}
interface TizenDownload {
  start(req: unknown, cb?: DownloadCallbacks): number;
  cancel(id: number): void;
  pause(id: number): void;
  resume(id: number): void;
}
interface TizenLike {
  DownloadRequest: new (url: string, destination: string, fileName: string) => unknown;
  download: TizenDownload;
  filesystem: {
    listStorages(ok: (s: Array<{ label: string; type: string; state: string }>) => void, err?: (e: Error) => void): void;
    createDirectory?(path: string, makeParents?: boolean, ok?: () => void, err?: (e: Error) => void): void;
    resolve(location: string, ok: (dir: { fullPath: string }) => void, err?: (e: Error) => void, mode?: string): void;
    deleteFile?(path: string, ok?: () => void, err?: (e: Error) => void): void;
  };
}

function tz(): TizenLike | null {
  const t = (window as unknown as { tizen?: TizenLike }).tizen;
  return t && t.download && t.filesystem && t.DownloadRequest ? t : null;
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

/**
 * Nome de arquivo seguro: só letras/números/espaço/-/_ (sem acento nem barras,
 * então não há como sair da pasta), até 60 caracteres + data + extensão.
 */
export function safeFileName(title: string, ext: string, now = Date.now()): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .trim() || 'orbita';
  const d = new Date(now);
  const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  const e = /^[a-z0-9]{2,4}$/i.test(ext) ? ext.toLowerCase() : 'ts';
  return base + ' ' + stamp + '.' + e;
}

/** Extensão do arquivo pela URL (filmes do Xtream: mp4/mkv/avi...). */
export function urlExt(url: string): string {
  const m = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'ts';
}

/** Gravação ao vivo só funciona com stream TS contínuo (HLS é uma lista de pedaços). */
export function recordable(url: string): boolean {
  return /^https?:\/\//i.test(url) && !/\.m3u8?(?:[?#]|$)/i.test(url);
}

class RecorderService {
  private jobs: Job[] = [];
  private nativeIds = new Map<number, number>();
  private listeners: Array<() => void> = [];
  private seq = 0;

  list(): Job[] {
    return this.jobs.slice();
  }

  running(key: string): Job | undefined {
    return this.jobs.find((j) => j.key === key && j.state === 'running');
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /**
   * Caminho real do primeiro pendrive montado (ex.: /opt/media/USBDriveA1).
   * A API de Download recusa o nome virtual ("removable_sda1": InvalidValuesError,
   * visto na TV); com o caminho real grava normalmente.
   */
  usbRoot(): Promise<string | null> {
    const t = tz();
    if (!t) return Promise.resolve(null);
    const fs = t.filesystem;
    return new Promise<string | null>((resolve) => {
      try {
        fs.listStorages(
          (list) => {
            const usb = list.find((s) => s.type === 'EXTERNAL' && s.state === 'MOUNTED');
            resolve(usb ? usb.label : null);
          },
          () => resolve(null),
        );
      } catch {
        resolve(null);
      }
    }).then(
      (label) =>
        label &&
        new Promise<string | null>((resolve) => {
          try {
            fs.resolve(label, (d) => resolve(d && d.fullPath ? d.fullPath : null), () => resolve(null), 'rw');
          } catch {
            resolve(null);
          }
        }),
    );
  }

  async start(kind: JobKind, key: string, title: string, url: string): Promise<{ ok: true; job: Job } | { ok: false; error: StartError }> {
    const t = tz();
    if (!t) return { ok: false, error: 'failed' };
    if (kind === 'record' ? !recordable(url) : !/^https?:\/\//i.test(url)) return { ok: false, error: 'unsupported' };
    if (this.jobs.filter((j) => j.state === 'running').length >= MAX_RUNNING || this.running(key)) return { ok: false, error: 'busy' };
    const root = await this.usbRoot();
    if (!root) return { ok: false, error: 'noUsb' };
    const dir = await this.ensureFolder(t, root);
    const job: Job = {
      id: ++this.seq,
      kind,
      title,
      fileName: safeFileName(title, kind === 'record' ? 'ts' : urlExt(url)),
      dir,
      key,
      startedAt: Date.now(),
      received: 0,
      total: 0,
      state: 'running',
    };
    try {
      const nid = t.download.start(new t.DownloadRequest(url, dir, job.fileName), {
        onprogress: (_i, rec, tot) => {
          job.received = rec;
          job.total = tot;
          this.emit();
        },
        oncompleted: () => this.finish(job, 'done'),
        onfailed: (_i, e) => this.finish(job, 'failed', (e && e.name) || 'erro'),
        // gravação parada pelo usuário: o arquivo fica; download cancelado: apaga o pedaço
        oncanceled: () => this.finish(job, 'stopped'),
      });
      this.nativeIds.set(job.id, nid);
    } catch {
      return { ok: false, error: 'failed' };
    }
    this.jobs.unshift(job);
    this.emit();
    return { ok: true, job };
  }

  stop(id: number): void {
    const job = this.jobs.find((j) => j.id === id);
    const nid = this.nativeIds.get(id);
    const t = tz();
    if (!job || (job.state !== 'running' && job.state !== 'paused' && job.state !== 'failed') || nid == null || !t) return;
    if (job.state === 'failed') {
      // já caiu: só apaga o pedaço e tira a chance de continuar
      this.nativeIds.delete(id);
      job.state = 'stopped';
      if (job.kind === 'download') this.remove(job);
      this.emit();
      return;
    }
    try {
      t.download.cancel(nid);
    } catch {
      /* já tinha parado */
    }
    // a TV não chama oncanceled depois do cancel() (visto na UN50AU7700): marca aqui
    this.finish(job, 'stopped');
  }

  /** Download: pausa mantendo o que já baixou (Continuar retoma do mesmo ponto). */
  pause(id: number): boolean {
    const job = this.jobs.find((j) => j.id === id);
    const nid = this.nativeIds.get(id);
    const t = tz();
    if (!job || job.kind !== 'download' || job.state !== 'running' || nid == null || !t) return false;
    try {
      t.download.pause(nid);
    } catch {
      return false;
    }
    job.state = 'paused';
    this.emit();
    return true;
  }

  /** Continua um download pausado ou que caiu no meio (rede, servidor). */
  resume(id: number): boolean {
    const job = this.jobs.find((j) => j.id === id);
    const nid = this.nativeIds.get(id);
    const t = tz();
    if (!job || job.kind !== 'download' || (job.state !== 'paused' && job.state !== 'failed') || nid == null || !t) return false;
    if (this.jobs.filter((j) => j.state === 'running').length >= MAX_RUNNING) return false;
    try {
      t.download.resume(nid);
    } catch {
      return false;
    }
    job.state = 'running';
    job.error = undefined;
    this.emit();
    return true;
  }

  private finish(job: Job, state: JobState, error?: string): void {
    if (job.state !== 'running' && job.state !== 'paused') return;
    job.state = state;
    job.error = error;
    // download que caiu: guarda o id nativo para o Continuar retomar do mesmo ponto
    if (!(state === 'failed' && job.kind === 'download')) this.nativeIds.delete(job.id);
    // download interrompido não serve para nada: apaga o arquivo pela metade
    if (state === 'stopped' && job.kind === 'download') this.remove(job);
    this.emit();
  }

  private remove(job: Job): void {
    const t = tz();
    try {
      if (t && t.filesystem.deleteFile) t.filesystem.deleteFile(job.dir + '/' + job.fileName, () => undefined, () => undefined);
    } catch {
      /* fica o arquivo parcial */
    }
  }

  /** Pasta Orbita no pendrive (criar dá IOError se já existe: segue igual). */
  private ensureFolder(t: TizenLike, root: string): Promise<string> {
    const dir = root + '/' + FOLDER;
    const mk = t.filesystem.createDirectory;
    if (!mk) return Promise.resolve(root);
    return new Promise((resolve) => {
      try {
        mk.call(t.filesystem, dir, true, () => resolve(dir), () => resolve(dir));
      } catch {
        // já existe (lança na hora em alguns firmwares) ou sem permissão
        resolve(dir);
      }
    });
  }

  private emit(): void {
    for (const l of this.listeners.slice()) l();
  }
}

export const recorder = new RecorderService();
