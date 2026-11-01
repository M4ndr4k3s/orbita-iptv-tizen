// Ponto de entrada do app.
import { registerRemoteKeys, toRemoteKey } from '../navigation/keys';
import { DiagnosticsScreen } from '../screens/diagnostics';

declare const __APP_VERSION__: string;

function boot(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const reg = registerRemoteKeys();
  const diag = new DiagnosticsScreen(__APP_VERSION__, reg);
  app.appendChild(diag.root);

  document.addEventListener('keydown', (e) => {
    const key = toRemoteKey(e);
    // impede o comportamento padrão (ex.: Back fechando o app) para teclas que tratamos
    if (key) e.preventDefault();
    diag.onKey(key, e.keyCode);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
