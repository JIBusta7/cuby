import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/sora/400.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

if (import.meta.env.DEV) {
  void Promise.all([
    import('./store/cubeStore'),
    import('./store/gameStore'),
    import('./store/appStore'),
    import('./store/showStore'),
  ]).then(([cube, game, app, show]) => {
    (window as unknown as Record<string, unknown>).__RGBCUBE__ = {
      link: cube.cubeLink,
      game: game.useGame,
      app: app.useApp,
      show: show.useShow,
    };
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root en index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
