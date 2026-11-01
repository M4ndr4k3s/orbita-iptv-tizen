// Configurações pequenas em localStorage (limite ~5 MB no Tizen).
// Tudo com try/catch: storage pode estar indisponível ou corrompido.

export interface Settings {
  activeSourceId: string | null;
  askSourceOnStart: boolean;
  language: string;
}

const KEY = 'orbita.settings.v1';

const DEFAULTS: Settings = {
  activeSourceId: null,
  askSourceOnStart: true,
  language: 'pt-BR',
};

export interface SettingsBackend {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class SettingsStore {
  private value: Settings;

  constructor(private backend: SettingsBackend | null) {
    this.value = { ...DEFAULTS };
    try {
      const raw = backend ? backend.getItem(KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        // só aceita chaves conhecidas com o tipo esperado
        for (const k of Object.keys(DEFAULTS) as Array<keyof Settings>) {
          const v = parsed[k];
          if (v !== undefined && (typeof v === typeof DEFAULTS[k] || (k === 'activeSourceId' && (v === null || typeof v === 'string')))) {
            (this.value as unknown as Record<string, unknown>)[k] = v;
          }
        }
      }
    } catch {
      this.value = { ...DEFAULTS };
    }
  }

  get(): Readonly<Settings> {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      if (this.backend) this.backend.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* cota cheia ou storage indisponível: mantém em memória */
    }
  }
}

function localBackend(): SettingsBackend | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const settings = typeof window !== 'undefined' ? new SettingsStore(localBackend()) : new SettingsStore(null);
