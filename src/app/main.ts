// Ponto de entrada: monta o shell (menu + área de telas), roteador e teclado.
import { registerRemoteKeys, toRemoteKey, type KeyRegistration, type RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { Router } from './router';
import { exitApp } from './platform';
import type { Screen } from './screen';
import { el } from '../utils/dom';
import { Sidebar, type SectionId } from '../components/sidebar';
import { choose, isDialogOpen, closeTopDialog } from '../components/dialog';
import type { IconName } from '../components/icons';
import { HomeScreen } from '../screens/home';
import { PendingScreen } from '../screens/pending';
import { AboutScreen } from '../screens/about';
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
  lists: ['lists', 'nav.lists', 3],
  settings: ['settings', 'nav.settings', 10],
};

class App {
  private router: Router;
  private sidebar: Sidebar;
  private exiting = false;

  constructor(host: HTMLElement, private keys: KeyRegistration) {
    const screens = el('main', { class: 'screens' });
    this.sidebar = new Sidebar((id) => this.go(id));
    const shell = el('div', { class: 'shell' }, [this.sidebar.root, screens]);
    host.appendChild(shell);
    this.router = new Router(screens, shell);
    this.router.push(new HomeScreen((id) => this.go(id), () => this.confirmExit()));
  }

  /** Navega para uma seção: a pilha vira [início, seção]. */
  go(id: SectionId): void {
    this.sidebar.setActive(id);
    this.router.popToRoot();
    if (id === 'home') return;
    this.router.push(this.create(id));
  }

  private create(id: SectionId): Screen {
    const back = () => this.back();
    if (id === 'about') return new AboutScreen(__APP_VERSION__, this.keys, back);
    const p = PENDING[id] || (['about', 'nav.home', 0] as [IconName, I18nKey, number]);
    return new PendingScreen(t(p[1]), p[0], p[2], back);
  }

  back(): void {
    const cur = this.router.current;
    if (cur && cur.onBack && cur.onBack() === false) return;
    if (this.router.pop()) {
      if (this.router.depth === 1) this.sidebar.setActive('home');
    }
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
    if (isDialogOpen()) {
      if (key.action === 'back') closeTopDialog();
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

function boot(): void {
  const host = document.getElementById('app');
  if (!host) return;
  const app = new App(host, registerRemoteKeys());
  document.addEventListener('keydown', (e) => {
    const key = toRemoteKey(e);
    if (!key) return;
    // impede o padrão (ex.: Back fechar o app, setas rolarem a página)
    e.preventDefault();
    app.handleKey(key);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
