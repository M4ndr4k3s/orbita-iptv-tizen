import type { RemoteKey } from '../navigation/keys';

/** Contrato de uma tela. O roteador cuida de montar/esconder e do foco. */
export interface Screen {
  readonly root: HTMLElement;
  /** chamada ao entrar na pilha */
  mount?(): void;
  /** chamada ao sair da pilha: liberar timers, listeners, players */
  unmount?(): void;
  /** chamada sempre que a tela volta a ficar visível */
  show?(): void;
  /** tecla antes do tratamento padrão; retornar true para consumir */
  onKey?(key: RemoteKey): boolean;
  /** retornar false para impedir o Back padrão (ex.: tela inicial pede confirmação) */
  onBack?(): boolean;
}
