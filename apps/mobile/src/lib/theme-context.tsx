import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Appearance, StyleSheet, View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { applyTheme, loadThemeMode, resolve, saveThemeMode, surfaceOf, type ThemeMode } from './theme';

interface ThemeCtx {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  ready: boolean;
}
const Ctx = createContext<ThemeCtx | null>(null);

const FADE_IN_MS = 140;
/** Long enough for every screen to redraw and the open page to come back. */
const HOLD_MS = 450;
const FADE_OUT_MS = 260;

/**
 * Holds the theme choice; the root uses `effective` as a key so screens redraw with the new colours.
 * The switch happens behind a short cover in the new background colour, so the redraw never flashes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [system, setSystem] = useState(Appearance.getColorScheme());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadThemeMode().then((m) => (setModeState(m), setReady(true)));
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  const wanted = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : resolve(mode);
  // The theme the screens are drawn with. Before the first load it follows `wanted` directly (no cover at start-up).
  const [shown, setShown] = useState<'light' | 'dark'>(wanted);
  const [cover, setCover] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready) {
      setShown(wanted);
      return;
    }
    if (wanted === shown) return;
    setCover(surfaceOf(wanted));
    opacity.stopAnimation();
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start(() => {
      setShown(wanted); // screens redraw under the cover
      setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(({ finished }) => finished && setCover(null));
      }, HOLD_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, ready]);

  applyTheme(shown); // before children render, so they read the right colours
  // The window behind the app: without this Android shows white for a frame while screens redraw.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(surfaceOf(shown)).catch(() => undefined);
  }, [shown]);
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    saveThemeMode(m);
  }, []);

  return (
    <Ctx.Provider value={{ mode, effective: shown, setMode, ready }}>
      <View style={{ flex: 1, backgroundColor: surfaceOf(shown) }}>
        {children}
        {cover ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cover, opacity }]} /> : null}
      </View>
    </Ctx.Provider>
  );
}

export function useTheme() {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTheme outside ThemeProvider');
  return t;
}
