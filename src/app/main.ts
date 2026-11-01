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
import { ListsScreen } from '../screens/lists';
import { SourcePickerScreen } from '../screens/sourcePicker';
import { SourceService } from '../services/sourceService';
import { settings } from '../storage/settings';
import { idbStore, openDb } from '../storage/db';
import { MemoryStore, type Store } from '../storage/store';
import type { Source } from '../playlist/source';
import { t, type I18nKey } from '../services/i18n';

declare const __APP_VERSION__: string;

// seções ainda não implementadas e o marco do plano em que entram
const PENDING: Partial<Record<SectionId, [IconName, I18nKey, number]>> = {
  live: ['live', 'nav.live', 6],
  guide: ['guide', 'nav.guide', 7],
  movies: ['movies', 'nav.movies', 8],
  series: ['series', 'nav.series', 8],
  favorites: ['favorites', 'nav.favorites', 6],
  history: ['history', 'nav.history', 6],
  search: ['search', 'nav.search', 11],
  settings: ['settings', 'nav.settings', 10],
};

class App implements AppContext {
  private router: Router;
  private sidebar: Sidebar;
  private exiting = false;

  constructor(host: HTMLElement, private keys: KeyRegistration, readonly sources: SourceService) {
    const screens = el('main', { class: 'screens' });
    this.sidebar = new Sidebar((id) => this.go(id));
    const shell = el('div', { class: 'shell' }, [this.sidebar.root, screens]);
    host.appendChild(shell);
    this.router = new Router(screens, shell);
    this.router.push(new HomeScreen(this, () => this.confirmExit()));
    if (sources.list().length > 1 && settings.get().askSourceOnStart) this.push(new SourcePickerScreen(this));
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
    const p = PENDING[id] || (['about', 'nav.home', 0] as [IconName, I18nKey, number]);
    return new PendingScreen(t(p[1]), p[0], p[2], back);
  }

  back(): void {
    const cur = this.router.current;
    if (cur && cur.onBack && cur.onBack() === false) return;
    if (this.router.pop() && this.router.depth === 1) this.sidebar.setActive('home');
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

/** IndexedDB; se indisponível, segue em memória e avisa (nada é salvo). */
async function sourceStore(): Promise<{ store: Store<Source>; persistent: boolean }> {
  try {
    await openDb();
    return { store: idbStore<Source>('sources'), persistent: true };
  } catch {
    return { store: new MemoryStore<Source>(), persistent: false };
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) return;
  const keys = registerRemoteKeys();
  const { store, persistent } = await sourceStore();
  const sources = new SourceService(store, settings);
  try {
    await sources.load();
  } catch {
    /* banco ilegível: começa vazio, sem travar a inicialização */
  }
  const app = new App(host, keys, sources);
  if (!persistent) toast(t('storage.unavailable'), 'error', 8000);
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
