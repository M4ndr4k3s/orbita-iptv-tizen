// Ponto de entrada: monta o shell (menu + área de telas), serviços, roteador e teclado.
import { registerRemoteKeys, toRemoteKey, type KeyRegistration, type RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { Router } from './router';
import { exitApp } from './platform';
import type { Screen } from './screen';
import type { AppContext } from './context';
import { el } from '../utils/dom';
import { Sidebar, type SectionId } from '../components/sidebar';
import { choose } from '../components/dialog';
import { isOverlayOpen, topOverlay } from '../components/overlay';
import { toast } from '../components/toast';
import type { IconName } from '../components/icons';
import { HomeScreen } from '../screens/home';
import { PendingScreen } from '../screens/pending';
import { AboutScreen } from '../screens/about';
import { SearchScreen } from '../screens/search';
import { RecordingsScreen } from '../screens/recordings';
import { watchRecorder } from '../components/recordActions';
import { ListsScreen } from '../screens/lists';
import { LiveScreen } from '../screens/live';
import { VodScreen } from '../screens/vod';
import { SettingsScreen } from '../screens/settings';
import { SourcePickerScreen } from '../screens/sourcePicker';
import { SourceService } from '../services/sourceService';
import { settings, applyTheme } from '../storage/settings';
import { DataClient } from '../storage/dataClient';
import { ensureDevSeed } from './devSeed';
import { LibraryService } from '../services/library';
import { IdleTasks } from '../services/idleTasks';
import { MemoryStore, type Store } from '../storage/store';
import type { Source } from '../playlist/source';
import { t, setLanguage, type I18nKey } from '../services/i18n';
import { ImportService } from '../services/importService';
import { importWithProgress, importInBackground } from '../screens/importFlow';

declare const __DEV__: boolean;
declare const __APP_VERSION__: string;

// seções ainda não implementadas e o marco do plano em que entram
const PENDING: Partial<Record<SectionId, [IconName, I18nKey, number]>> = {
  guide: ['guide', 'nav.guide', 7],
  movies: ['movies', 'nav.movies', 8],
  series: ['series', 'nav.series', 8],
};

class App implements AppContext {
  private router: Router;
  private sidebar: Sidebar;
  private exiting = false;

  readonly imports: ImportService;
  readonly library: LibraryService;
  readonly idle = new IdleTasks();

  constructor(host: HTMLElement, private keys: KeyRegistration, readonly sources: SourceService, readonly data: DataClient) {
    this.imports = new ImportService(sources, data, this.idle);
    this.library = new LibraryService(data);
    watchRecorder();
    const screens = el('main', { class: 'screens' });
    this.sidebar = new Sidebar((id) => this.go(id));
    const shell = el('div', { class: 'shell' }, [this.sidebar.root, screens]);
    host.appendChild(shell);
    this.router = new Router(screens, shell);
    this.router.push(new HomeScreen(this, () => this.confirmExit()));
  }

  /** Abre a escolha de lista (se houver mais de uma) e só então inicia o carregamento automático. */
  startWhenReady(): void {
    if (this.sources.list().length > 1 && settings.get().askSourceOnStart) {
      this.push(new SourcePickerScreen(this, () => this.startAutoRefresh()));
    } else this.startAutoRefresh();
  }

  /** Navega para uma seção: a pilha vira [início, seção]. */
  go(id: SectionId): void {
    this.sidebar.setActive(id);
    this.router.popToRoot();
    if (id === 'home') return;
    this.router.push(this.create(id));
  }

  push(screen: Screen): void {
    this.router.push(screen);
  }

  private create(id: SectionId): Screen {
    const back = () => this.back();
    if (id === 'about') return new AboutScreen(__APP_VERSION__, this.keys, back);
    if (id === 'lists') return new ListsScreen(this);
    if (id === 'settings') return new SettingsScreen(this);
    if (id === 'search') return new SearchScreen(this);
    if (id === 'downloads') return new RecordingsScreen();
    // Favoritos e Histórico são a TV ao vivo aberta na categoria correspondente
    if (id === 'live') return new LiveScreen(this, 'all');
    if (id === 'guide') return new LiveScreen(this, 'guide');
    if (id === 'movies') return new VodScreen(this, 'movie');
    if (id === 'series') return new VodScreen(this, 'series');
    if (id === 'favorites') return new LiveScreen(this, 'fav');
    if (id === 'history') return new LiveScreen(this, 'recent');
    const p = PENDING[id] || (['about', 'nav.home', 0] as [IconName, I18nKey, number]);
    return new PendingScreen(t(p[1]), p[0], p[2], back);
  }

  back(): void {
    const cur = this.router.current;
    if (cur && cur.onBack && cur.onBack() === false) return;
    if (this.router.pop() && this.router.depth === 1) this.sidebar.setActive('home');
  }

  /**
   * Na abertura e a cada 30 min: lista ativa nunca carregada abre o progresso;
   * intervalo de atualização vencido atualiza em segundo plano.
   */
  startAutoRefresh(): void {
    // só em builds de teste: estado do guia para os roteiros (sem URL nem credenciais)
    if (__DEV__) {
      (window as unknown as Record<string, unknown>).__orbitaEpg = () =>
        this.sources.list().map((s) => ({ name: s.name, epg: s.epg, error: s.epgError, running: this.imports.isEpgRunning(s.id) }));
    }
    const check = (atBoot: boolean) => {
      const s = this.sources.active();
      if (!s || this.imports.isRunning(s.id)) return;
      if (!this.imports.isDue(s)) {
        // lista em dia: o guia pode estar vencido sozinho
        if (s.import && this.imports.isEpgDue(s)) void this.imports.runEpg(s);
        return;
      }
      if (!s.import && atBoot && !isOverlayOpen()) void importWithProgress(this.imports, s);
      else if (s.import) importInBackground(this.imports, s);
    };
    // limpeza de gerações órfãs: só com o usuário parado (ver IdleTasks)
    this.imports.scheduleCleanup();
    check(true);
    setInterval(() => check(false), 30 * 60 * 1000);
  }

  private async confirmExit(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    const r = await choose(t('exit.title'), null, [
      { id: 'cancel', label: t('exit.cancel'), primary: true },
      { id: 'exit', label: t('exit.confirm') },
    ]);
    this.exiting = false;
    if (r === 'exit') exitApp();
  }

  handleKey(key: RemoteKey): void {
    this.idle.touch();
    if (isOverlayOpen()) {
      const o = topOverlay()!;
      if (o.onKey && o.onKey(key)) return;
      if (key.action === 'back') o.onBack();
      else this.defaultKey(key);
      return;
    }
    const cur = this.router.current;
    if (cur && cur.onKey && cur.onKey(key)) return;
    if (key.action === 'back') this.back();
    else this.defaultKey(key);
  }

  private defaultKey(key: RemoteKey): void {
    switch (key.action) {
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        focus.move(key.action);
        break;
      case 'ok':
        focus.activate();
        break;
      default:
        break;
    }
  }
}

/** IndexedDB via worker; se indisponível, segue em memória e avisa (nada é salvo). */
async function sourceStore(data: DataClient): Promise<{ store: Store<Source>; persistent: boolean }> {
  try {
    await data.call('ping');
    return { store: data.sourceStore(), persistent: true };
  } catch {
    return { store: new MemoryStore<Source>(), persistent: false };
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) return;
  setLanguage(settings.get().language);
  applyTheme(settings.get().theme);
  const keys = registerRemoteKeys();
  const data = new DataClient();
  const { store, persistent } = await sourceStore(data);
  const sources = new SourceService(store, settings);
  try {
    await sources.load();
    await ensureDevSeed(sources);
  } catch {
    /* banco ilegível: começa vazio, sem travar a inicialização */
  }
  const app = new App(host, keys, sources, data);
  if (!persistent) toast(t('storage.unavailable'), 'error', 8000);
  else app.startWhenReady();
  document.addEventListener('keydown', (e) => {
    const key = toRemoteKey(e);
    if (!key) return;
    // impede o padrão (ex.: Back fechar o app, setas rolarem a página)
    e.preventDefault();
    app.handleKey(key);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
