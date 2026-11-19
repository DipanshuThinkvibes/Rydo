import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '@rydo/ui-tokens';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

/** Home, Commute, Drive and Admin are tabs: they swap in place without a slide. */
const TAB = { animation: 'none' } as const;

function Navigator() {
  const { loading } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
        <Stack.Screen name="index" options={TAB} />
        <Stack.Screen name="commute" options={TAB} />
        <Stack.Screen name="drive" options={TAB} />
        <Stack.Screen name="admin" options={TAB} />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="requested" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <Navigator />
    </SessionProvider>
  );
}
