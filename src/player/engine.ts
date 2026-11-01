// Contrato dos motores de reprodução (AVPlay na TV, <video> no navegador de dev).

export type EngineEvent =
  | { type: 'buffering'; percent: number }
  | { type: 'playing' }
  | { type: 'time'; ms: number }
  | { type: 'ended' }
  | { type: 'error'; code: string }
  /** legenda a exibir agora (texto puro) por durationMs */
  | { type: 'subtitle'; text: string; durationMs: number };

/** auto = proporção do vídeo com faixas pretas; fill = esticar; 16:9 / 4:3 = forçar */
export type AspectMode = 'auto' | 'fill' | '16:9' | '4:3';
export const ASPECT_MODES: AspectMode[] = ['auto', 'fill', '16:9', '4:3'];

export interface StreamInfo {
  width?: number;
  height?: number;
  videoCodec?: string;
  audioTracks: Array<{ index: number; language: string; codec?: string }>;
  subtitleTracks: Array<{ index: number; language: string }>;
  /** faixa de áudio/legenda em uso (índice do motor), se souber */
  currentAudio?: number;
  currentText?: number;
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
  /** proporção em tela cheia (a mini janela é sempre automática) */
  setAspect(mode: AspectMode): void;
  /** troca a faixa de áudio ou de legenda (índice de info()) */
  selectTrack(kind: 'audio' | 'text', index: number): boolean;
  /** segundos de buffer antes de começar (0 = padrão do motor); vale no próximo open */
  setBuffer(seconds: number): void;
  /** app foi para segundo plano / voltou */
  suspend(): void;
  restore(): void;
}
