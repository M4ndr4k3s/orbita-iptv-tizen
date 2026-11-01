// Mapeamento do controle remoto Samsung para ações lógicas do app.
// Os códigos vêm da própria TV (getSupportedKeys); o fallback cobre o teclado
// do navegador de desenvolvimento.

export type KeyAction =
  | 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'exit'
  | 'playPause' | 'play' | 'pause' | 'stop' | 'ff' | 'rw'
  | 'chUp' | 'chDown' | 'red' | 'green' | 'yellow' | 'blue'
  | 'info' | 'guide' | 'chList' | 'digit';

// teclas que precisam de registerKey para chegar ao app (setas/OK/Back já chegam)
const REGISTER: Array<[string, KeyAction]> = [
  ['MediaPlayPause', 'playPause'],
  ['MediaPlay', 'play'],
  ['MediaPause', 'pause'],
  ['MediaStop', 'stop'],
  ['MediaFastForward', 'ff'],
  ['MediaRewind', 'rw'],
  ['ChannelUp', 'chUp'],
  ['ChannelDown', 'chDown'],
  ['ColorF0Red', 'red'],
  ['ColorF1Green', 'green'],
  ['ColorF2Yellow', 'yellow'],
  ['ColorF3Blue', 'blue'],
  ['Info', 'info'],
  ['Guide', 'guide'],
  ['ChannelList', 'chList'],
  ['0', 'digit'], ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['4', 'digit'],
  ['5', 'digit'], ['6', 'digit'], ['7', 'digit'], ['8', 'digit'], ['9', 'digit'],
];

// códigos padrão Samsung + teclado (dev). Os da TV sobrescrevem estes.
const DEFAULT_CODES: Record<number, KeyAction> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok',
  10009: 'back', 8: 'back', 27: 'back', 10182: 'exit',
  10252: 'playPause', 32: 'playPause', 415: 'play', 19: 'pause', 413: 'stop',
  417: 'ff', 412: 'rw', 427: 'chUp', 428: 'chDown', 33: 'chUp', 34: 'chDown',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  457: 'info', 458: 'guide', 10073: 'chList',
};

const codeMap: Record<number, KeyAction> = { ...DEFAULT_CODES };

export interface KeyRegistration {
  registered: string[];
  failed: string[];
}

/** Registra as teclas extras na TV. No navegador, não faz nada. */
export function registerRemoteKeys(): KeyRegistration {
  const result: KeyRegistration = { registered: [], failed: [] };
  const input = window.tizen && window.tizen.tvinputdevice;
  if (!input) return result;

  let supported: Record<string, number> = {};
  try {
    for (const k of input.getSupportedKeys()) supported[k.name] = k.code;
  } catch {
    supported = {};
  }
  for (const [name, action] of REGISTER) {
    if (!(name in supported)) { result.failed.push(name); continue; }
    try {
      input.registerKey(name);
      codeMap[supported[name]] = action;
      result.registered.push(name);
    } catch {
      result.failed.push(name);
    }
  }
  return result;
}

export interface RemoteKey {
  action: KeyAction;
  digit?: number;
  code: number;
}

/** Traduz um KeyboardEvent para ação lógica (ou null se não mapeado). */
export function toRemoteKey(e: KeyboardEvent): RemoteKey | null {
  const code = e.keyCode;
  // dígitos: teclado (48-57) e teclado numérico (96-105)
  if (code >= 48 && code <= 57) return { action: 'digit', digit: code - 48, code };
  if (code >= 96 && code <= 105) return { action: 'digit', digit: code - 96, code };
  const action = codeMap[code];
  return action ? { action, code } : null;
}
