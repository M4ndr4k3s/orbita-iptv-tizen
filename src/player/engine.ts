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

export interface VideoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerEngine {
  readonly name: string;
  /** começa a tocar a URL (VOD: a partir de startMs); eventos chegam pelo listener */
  open(url: string, startMs?: number): void;
  /** VOD: pula para a posição (ms) */
  seek(ms: number): void;
  /** VOD: duração em ms (0 se desconhecida / ao vivo) */
  duration(): number;
  stop(): void;
  pause(): void;
  resume(): void;
  /** estado bruto do motor (para diagnóstico) */
  state(): string;
  info(): StreamInfo | null;
  setListener(fn: (e: EngineEvent) => void): void;
  /** área do vídeo em px da tela 1920×1080; null = tela cheia */
  setRect(r: VideoRect | null): void;
  /** app foi para segundo plano / voltou */
  suspend(): void;
  restore(): void;
}
