import { AnimatePresence, MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { useApp, type Screen } from './store/appStore';
import { useCube } from './store/cubeStore';
import { useSettings } from './store/settingsStore';
import { LinkToasts } from './ui/components/LinkToasts';
import { Stage } from './ui/components/Stage';
import { useReducedMotion } from './ui/hooks/useMotionPref';
import { HomeScreen } from './ui/screens/HomeScreen';
import { LightsScreen } from './ui/screens/LightsScreen';
import { handleSpotifyRedirect } from './store/showStore';
import { LeaderboardScreen } from './ui/screens/LeaderboardScreen';
import { ModeSelectScreen } from './ui/screens/ModeSelectScreen';
import { PlayerSetupScreen } from './ui/screens/PlayerSetupScreen';
import { PlayScreen } from './ui/screens/PlayScreen';
import { ResultsScreen } from './ui/screens/ResultsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { PALETTE } from './ui/theme/palette';

const BACKGROUND: Record<Screen, string> = {
  home: PALETTE.grape,
  modes: PALETTE.night,
  setup: PALETTE.ocean,
  play: PALETTE.night,
  results: PALETTE.night,
  leaderboard: PALETTE.grape,
  settings: PALETTE.night,
  lights: PALETTE.night,
};

let autoConnected = false;

export function App() {
  const screen = useApp((s) => s.screen);
  const reduce = useReducedMotion();

  // El simulador se conecta solo (no necesita permiso). El cubo real requiere
  // un clic del usuario: Web Bluetooth no permite abrir el selector sin gesto.
  useEffect(() => {
    if (autoConnected) return;
    autoConnected = true;
    // Si volvemos del login de Spotify, ir directo a LUCES → Música.
    void handleSpotifyRedirect().then((back) => {
      if (back) useApp.getState().go('lights');
    });
    const { transport } = useSettings.getState();
    if (transport === 'mock' && useCube.getState().status === 'idle') void useCube.getState().connect('mock');
  }, []);

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      <Stage background={BACKGROUND[screen]}>
        <AnimatePresence>
          {screen === 'home' && <HomeScreen key="home" />}
          {screen === 'modes' && <ModeSelectScreen key="modes" />}
          {screen === 'setup' && <PlayerSetupScreen key="setup" />}
          {screen === 'play' && <PlayScreen key="play" />}
          {screen === 'results' && <ResultsScreen key="results" />}
          {screen === 'leaderboard' && <LeaderboardScreen key="leaderboard" />}
          {screen === 'settings' && <SettingsScreen key="settings" />}
          {screen === 'lights' && <LightsScreen key="lights" />}
        </AnimatePresence>
        <LinkToasts />
      </Stage>
    </MotionConfig>
  );
}
