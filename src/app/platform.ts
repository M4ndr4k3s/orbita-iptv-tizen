// Informações do ambiente de execução (TV ou navegador de desenvolvimento).

export interface PlatformInfo {
  isTizen: boolean;
  platformVersion: string;
  model: string;
  firmware: string;
  hasAvplay: boolean;
  viewport: string;
  userAgent: string;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

interface ProductInfo {
  getRealModel(): string;
  getFirmware(): string;
}

export function getPlatformInfo(): PlatformInfo {
  const tz = window.tizen;
  const webapis = window.webapis as { productinfo?: ProductInfo; avplay?: unknown } | undefined;
  return {
    isTizen: !!tz,
    platformVersion: tz
      ? safe(() => String(tz.systeminfo.getCapability('http://tizen.org/feature/platform.version')), '?')
      : '-',
    model: safe(() => webapis!.productinfo!.getRealModel(), '-'),
    firmware: safe(() => webapis!.productinfo!.getFirmware(), '-'),
    hasAvplay: !!(webapis && webapis.avplay),
    viewport: window.innerWidth + 'x' + window.innerHeight,
    userAgent: navigator.userAgent,
  };
}

/** Fecha o app (na TV). No navegador, não faz nada. */
export function exitApp(): void {
  try {
    if (window.tizen) window.tizen.application.getCurrentApplication().exit();
  } catch {
    /* sem tizen: ambiente de desenvolvimento */
  }
}
