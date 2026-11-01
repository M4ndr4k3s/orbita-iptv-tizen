// Dependências compartilhadas que as telas recebem (sem singletons escondidos).

import type { Screen } from './screen';
import type { SourceService } from '../services/sourceService';
import type { SectionId } from '../components/sidebar';
import type { ImportService } from '../services/importService';
import type { DataClient } from '../storage/dataClient';

export interface AppContext {
  sources: SourceService;
  imports: ImportService;
  /** consultas ao IndexedDB (sempre via worker) */
  data: DataClient;
  push(screen: Screen): void;
  back(): void;
  go(section: SectionId): void;
}
