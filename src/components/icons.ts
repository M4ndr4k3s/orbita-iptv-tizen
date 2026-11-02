// Ícones próprios da Órbita: traço único, grade 24x24, criados via DOM (sem innerHTML).

const PATHS = {
  home: 'M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10',
  live: 'M3 7h18v12H3zM8 3l4 4 4-4',
  guide: 'M3 5h18v15H3zM3 10h18M8 5v15',
  movies: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  series: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5',
  favorites: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  history: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 3',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15M16 16l5 5',
  lists: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
  about: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5',
  plus: 'M12 5v14M5 12h14',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  back: 'M15 5l-7 7 7 7',
  pause: 'M8 5v14M16 5v14',
  rewind: 'M11 6 4 12l7 6zM20 6l-7 6 7 6z',
  forward: 'M13 6l7 6-7 6zM4 6l7 6-7 6z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  record: 'M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12',
} as const;

export type IconName = keyof typeof PATHS;

const NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, cls = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.appendChild(path);
  return svg;
}
