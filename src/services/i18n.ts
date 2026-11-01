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

  'home.activeList': 'Lista ativa',
  'home.contentSoon': 'O carregamento de canais, filmes e séries desta lista chega no marco 4.',
  'home.switchList': 'Trocar lista',
  'home.manageLists': 'Gerenciar listas',

  'kb.del': 'Apagar',
  'kb.done': 'Concluir',
  'kb.shift': 'Maiúsculas',
  'kb.space': 'Espaço',
  'kb.clear': 'Limpar',
  'kb.show': 'Mostrar',
  'kb.hide': 'Ocultar',

  'lists.title': 'Listas',
  'lists.subtitle': 'Listas M3U e contas Xtream Codes cadastradas nesta TV',
  'lists.add': 'Adicionar lista',
  'lists.empty': 'Nenhuma lista cadastrada.',
  'lists.active': 'Ativa',
  'lists.status.ok': 'Conexão verificada',
  'lists.status.error': 'Falha na última verificação',
  'lists.status.none': 'Não verificada',
  'lists.action.use': 'Usar esta lista',
  'lists.action.test': 'Testar conexão',
  'lists.action.edit': 'Editar',
  'lists.action.remove': 'Remover',
  'lists.action.cancel': 'Cancelar',
  'lists.remove.title': 'Remover "{name}"?',
  'lists.remove.body': 'A lista e as configurações dela serão apagadas desta TV.',
  'lists.removed': 'Lista removida',
  'lists.activated': 'Lista ativa: {name}',

  'edit.titleNew': 'Nova lista',
  'edit.titleEdit': 'Editar lista',
  'edit.type': 'Tipo',
  'edit.kind.m3u': 'Lista M3U (URL)',
  'edit.kind.xtream': 'Xtream Codes',
  'edit.name': 'Nome',
  'edit.name.ph': 'Ex.: Casa',
  'edit.url': 'URL da lista',
  'edit.url.ph': 'http://servidor/lista.m3u',
  'edit.server': 'Servidor',
  'edit.server.ph': 'http://servidor:porta',
  'edit.username': 'Usuário',
  'edit.password': 'Senha',
  'edit.epg': 'Guia XMLTV (opcional)',
  'edit.epg.ph': 'http://servidor/epg.xml',
  'edit.refresh': 'Atualização automática',
  'edit.refresh.off': 'Desligada',
  'edit.refresh.every': 'A cada {h} h',
  'edit.test': 'Testar conexão',
  'edit.save': 'Salvar',
  'edit.cancel': 'Cancelar',
  'edit.httpWarning': 'Servidor sem HTTPS: usuário e senha trafegam sem criptografia na rede.',
  'edit.duplicate.title': 'Lista já cadastrada',
  'edit.duplicate.body': 'Já existe a lista "{name}" com o mesmo endereço. Salvar outra mesmo assim?',
  'edit.saveAnyway.title': 'A verificação falhou',
  'edit.saveAnyway.body': '{error} Salvar mesmo assim? O servidor pode estar fora do ar temporariamente.',
  'edit.saveAnyway.yes': 'Salvar assim mesmo',
  'edit.fix': 'Corrigir',
  'edit.saved': 'Lista salva',
  'edit.fixErrors': 'Corrija os campos destacados',

  'check.running': 'Testando conexão…',
  'check.ok.m3u': 'Lista M3U válida ({n} canais na amostra inicial).',
  'check.ok.xtream': 'Conta ativa. {exp} Conexões: {cons}.',
  'check.exp.never': 'Sem data de expiração.',
  'check.exp.date': 'Expira em {d}.',
  'check.ok.title': 'Conexão OK',
  'check.fail.title': 'Falha na conexão',
  'check.err.timeout': 'O servidor não respondeu a tempo.',
  'check.err.network': 'Não foi possível conectar ao servidor. Confira o endereço e a internet da TV.',
  'check.err.http': 'O servidor respondeu com erro HTTP {s}.',
  'check.err.notM3u': 'O endereço respondeu, mas o conteúdo não é uma lista M3U.',
  'check.err.denied': 'Usuário ou senha recusados pelo servidor.',
  'check.err.inactive': 'A conta não está ativa (status: {s}).',
  'check.err.badResponse': 'O servidor não respondeu como uma API Xtream Codes.',
  'check.err.tooLarge': 'A resposta do servidor é grande demais.',
  'check.err.aborted': 'Teste cancelado.',

  'err.required': 'Campo obrigatório',
  'err.tooLong': 'Texto longo demais',
  'err.invalidChars': 'Contém caracteres não permitidos',
  'err.invalidUrl': 'Endereço inválido',
  'err.unsupportedScheme': 'Use um endereço http:// ou https://',

  'picker.title': 'Qual lista você quer usar?',
  'picker.manage': 'Gerenciar listas',

  'common.ok': 'OK',
  'common.cancel': 'Cancelar',
  'storage.unavailable': 'Armazenamento indisponível: as listas não serão salvas nesta sessão.',
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
