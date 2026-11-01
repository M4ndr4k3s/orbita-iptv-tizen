// Contrato dos motores de reprodução (AVPlay na TV, <video> no navegador de dev).

export type EngineEvent =
  | { type: 'buffering'; percent: number }
  | { type: 'playing' }
  | { type: 'time'; ms: number }
  | { type: 'ended' }
  | { type: 'error'; code: string };

export interface StreamInfo {
  width?: number;
  height?: number;
  videoCodec?: string;
  audioTracks: Array<{ index: number; language: string; codec?: string }>;
  subtitleTracks: Array<{ index: number; language: string }>;
}

export interface PlayerEngine {
  readonly name: string;
  /** começa a tocar a URL; eventos chegam pelo listener */
  open(url: string): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** estado bruto do motor (para diagnóstico) */
  state(): string;
  info(): StreamInfo | null;
  setListener(fn: (e: EngineEvent) => void): void;
  /** app foi para segundo plano / voltou */
  suspend(): void;
  restore(): void;
}
