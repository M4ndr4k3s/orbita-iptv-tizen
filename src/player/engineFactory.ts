// Um único motor por app: o AVPlay só suporta uma reprodução por vez.

import type { PlayerEngine } from './engine';
import { AvplayEngine, getAvplay } from './avplayEngine';
import { Html5Engine } from './html5Engine';

let engine: PlayerEngine | null = null;

export function getEngine(): PlayerEngine {
  if (!engine) {
    const av = getAvplay();
    engine = av ? new AvplayEngine(av) : new Html5Engine();
  }
  return engine;
}
