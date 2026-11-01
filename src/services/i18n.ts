// Textos da interface. pt-BR é o idioma base; en/es entram no marco 10.
// Chave ausente cai no pt-BR e, em último caso, na própria chave.

const ptBR = {
  'app.name': 'Órbita',
  'nav.home': 'Início',
  'nav.live': 'TV ao vivo',
  'nav.guide': 'Guia',
  'nav.movies': 'Filmes',
  'nav.series': 'Séries',
  'nav.favorites': 'Favoritos',
  'nav.history': 'Histórico',
  'nav.search': 'Pesquisar',
  'nav.lists': 'Listas',
  'nav.settings': 'Configurações',
  'nav.about': 'Sobre',
  'home.welcome': 'Bem-vindo ao Órbita',
  'home.empty': 'Nenhuma lista cadastrada. Adicione uma lista M3U ou uma conta Xtream Codes para começar.',
  'home.addList': 'Adicionar lista',
  'home.shortcuts': 'Acesso rápido',
  'pending.title': 'Em desenvolvimento',
  'pending.body': 'Esta seção ainda não foi implementada. Previsão: marco {m} do plano.',
  'pending.back': 'Voltar',
  'exit.title': 'Sair do Órbita?',
  'exit.confirm': 'Sair',
  'exit.cancel': 'Cancelar',
  'about.title': 'Sobre o Órbita',
  'about.version': 'versão {v}',
} as const;

export type I18nKey = keyof typeof ptBR;
type Dict = Partial<Record<I18nKey, string>>;

const dictionaries: Record<string, Dict> = { 'pt-BR': ptBR };
let current: Dict = ptBR;

export function setLanguage(lang: string): void {
  current = dictionaries[lang] || ptBR;
}

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  let s: string = current[key] || ptBR[key] || key;
  if (params) for (const p of Object.keys(params)) s = s.split('{' + p + '}').join(String(params[p]));
  return s;
}
