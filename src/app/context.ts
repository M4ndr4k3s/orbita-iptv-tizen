// Dependências compartilhadas que as telas recebem (sem singletons escondidos).

import type { Screen } from './screen';
import type { SourceService } from '../services/sourceService';
import type { SectionId } from '../components/sidebar';

export interface AppContext {
  sources: SourceService;
  push(screen: Screen): void;
  back(): void;
  go(section: SectionId): void;
}
