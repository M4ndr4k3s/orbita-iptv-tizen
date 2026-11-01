// Declarações mínimas das APIs Tizen/Samsung usadas pelo app.
// Só o que usamos de fato — não é uma tipagem completa das APIs.

interface TizenTvInputDevice {
  registerKey(keyName: string): void;
  registerKeyBatch?(keyNames: string[], onSuccess?: () => void, onError?: (e: Error) => void): void;
  getSupportedKeys(): Array<{ name: string; code: number }>;
}

interface TizenApplication {
  exit(): void;
  hide(): void;
}

interface TizenSystemInfo {
  getCapability(key: string): unknown;
}

interface TizenNamespace {
  tvinputdevice: TizenTvInputDevice;
  application: { getCurrentApplication(): TizenApplication };
  systeminfo: TizenSystemInfo;
}

// acessar sempre via window.tizen: no navegador de desenvolvimento ele não existe
// webapis.avplay é declarado em src/player quando for usado
interface Window {
  tizen?: TizenNamespace;
  webapis?: Record<string, unknown>;
}
