import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors as base } from '@rydo/ui-tokens';

/**
 * Light, dark or follow the phone (same choice as the web Settings → Appearance).
 * Screens read `colors` while rendering; the root remounts the screens when the theme changes, so every
 * `colors.x` picks up the new value. Use:
 *   ink / muted       → text on the page
 *   white / surface   → cards / page background
 *   inkBg + onInk     → small dark fills: dark buttons, badges, checkboxes, chips (dark in both themes)
 *   panel + onPanel   → big areas (menu, hero cards, sheets): light in light mode, dark navy in dark mode;
 *                       panelMuted / panel2 / panel3 / panelAccent are the muted text, inner boxes and the
 *                       lime-ish accent text used on them
 *   lime + onLime     → lime areas always use dark ink text
 */
export type ThemeMode = 'system' | 'light' | 'dark';
type Extra = 'inkBg' | 'onInk' | 'onLime' | 'dangerBg' | 'panel' | 'onPanel' | 'panelMuted' | 'panel2' | 'panel3' | 'panelAccent' | 'panelLine';
export type Palette = { [K in keyof typeof base]: string } & Record<Extra, string>;

const light: Palette = {
  ...base,
  inkBg: base.ink,
  onInk: '#FFFFFF',
  onLime: base.ink,
  dangerBg: '#FEF2F2',
  panel: '#FFFFFF',
  onPanel: base.ink,
  panelMuted: base.muted,
  panel2: base.surface2,
  panel3: base.surface,
  panelAccent: '#4D7C0F',
  panelLine: base.line,
};

/** Dark colours from the web (apps/web/src/app/globals.css, [data-theme="dark"]). */
const dark: Palette = {
  ...base,
  ink: '#EEF2FB',
  ink2: '#24304D',
  ink3: '#1B2742',
  muted: '#9AA7BF',
  mutedOnDark: '#B8C2D6',
  surface: '#0A1020',
  surface2: '#1A243D',
  line: '#222D47',
  lineStrong: '#2F3B59',
  white: '#121B31',
  successText: '#6EE7A0',
  successBg: '#0F3A24',
  warningText: '#FCD34D',
  warningBg: '#3B2A0C',
  womenOnlyText: '#F9A8D4',
  womenOnlyBg: '#3D1028',
  danger: '#F87171',
  inkBg: '#16213A',
  onInk: '#FFFFFF',
  onLime: '#0B1426',
  dangerBg: '#3A1215',
  panel: '#16213A',
  onPanel: '#FFFFFF',
  panelMuted: '#B8C2D6',
  panel2: '#24304D',
  panel3: '#1B2742',
  panelAccent: base.lime,
  panelLine: '#16213A',
};

/** The live palette. Its values change in place when the theme changes. */
export const colors: Palette = { ...light };
let current: 'light' | 'dark' = 'light';
const listeners = new Set<() => void>();

export const isDark = () => current === 'dark';
/** Page background of a theme, for the cover shown while the theme switches. */
export const surfaceOf = (t: 'light' | 'dark') => (t === 'dark' ? dark.surface : light.surface);
export function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : mode;
}
/** Switch the palette (and anything registered with onThemeChange, like the shared styles). */
export function applyTheme(effective: 'light' | 'dark') {
  if (effective === current) return;
  current = effective;
  Object.assign(colors, effective === 'dark' ? dark : light);
  for (const l of listeners) l();
}
export function onThemeChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const KEY = 'rydo.theme';
const memory = new Map<string, string>();
export async function loadThemeMode(): Promise<ThemeMode> {
  const v = Platform.OS === 'web' ? (memory.get(KEY) ?? null) : await SecureStore.getItemAsync(KEY).catch(() => null);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}
export async function saveThemeMode(mode: ThemeMode) {
  if (Platform.OS === 'web') memory.set(KEY, mode);
  else await SecureStore.setItemAsync(KEY, mode).catch(() => undefined);
}
