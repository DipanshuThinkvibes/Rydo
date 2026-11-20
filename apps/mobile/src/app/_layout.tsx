import { useEffect, useRef } from 'react';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '@/lib/theme';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

/** Home, Commute, Drive and Admin are tabs: they swap in place without a slide. */
const TAB = { animation: 'none' } as const;

function Navigator() {
  const { loading } = useSession();
  const { effective, ready } = useTheme();
  const path = usePathname();
  const lastPath = useRef(path);
  const shownTheme = useRef(effective);
  lastPath.current = path;

  useEffect(() => {
    if (!loading && ready) SplashScreen.hideAsync();
  }, [loading, ready]);

  // A new theme redraws every screen (the key below); open the page the person was on again.
  useEffect(() => {
    if (shownTheme.current === effective) return;
    shownTheme.current = effective;
    const back = lastPath.current;
    if (back && back !== '/') setTimeout(() => router.replace(back as never), 0);
  }, [effective]);

  if (loading || !ready) return null;
  return (
    <>
      <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
      <Stack key={effective} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="index" options={TAB} />
        <Stack.Screen name="commute" options={TAB} />
        <Stack.Screen name="drive" options={TAB} />
        <Stack.Screen name="admin" options={TAB} />
        <Stack.Screen name="menu" options={TAB} />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="requested" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
