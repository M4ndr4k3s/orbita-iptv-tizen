// Lista de teste fixa (só em builds de teste; a de produção recebe null).
// Garante que ela exista e esteja ativa a cada abertura, mesmo após zerar o banco.

import type { SourceService } from '../services/sourceService';
import { validateSource, emptyInput, type SourceKind } from '../playlist/source';

declare const __DEV_SEED__: null | {
  kind: SourceKind;
  name?: string;
  url?: string;
  server?: string;
  username?: string;
  password?: string;
  epgUrl?: string;
};

export async function ensureDevSeed(sources: SourceService): Promise<void> {
  const seed = __DEV_SEED__;
  if (!seed) return;
  const r = validateSource({
    ...emptyInput(seed.kind),
    name: seed.name || 'Lista de teste',
    url: seed.url || '',
    server: seed.server || '',
    username: seed.username || '',
    password: seed.password || '',
    epgUrl: seed.epgUrl || '',
  });
  if (!r.ok) return; // semente inválida: ignora em silêncio (não derruba o app)
  const existing = sources.findDuplicate(r.value);
  const s = existing || (await sources.add(r.value));
  sources.setActive(s.id);
}
