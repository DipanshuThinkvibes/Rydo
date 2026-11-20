import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AuthResult } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, RequestError } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { Button, Field, Logo, Notice, s } from '@/components/ui';
import { GoogleButton, googleSignInAvailable } from '@/components/google-button';

/** Same three ways in as the web sign-in: password (default), email a code, enter the code. */
type Mode = 'password' | 'email' | 'code';

/** The dashed pickup route from the web hero, built from plain views. */
function RouteArt() {
  return (
    <View style={{ height: 96, justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, borderWidth: 4, borderColor: colors.ink }} />
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={{ width: 14, height: 5, borderRadius: 3, backgroundColor: colors.lime, opacity: 0.35 + i * 0.08 }} />
        ))}
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colors.panel, borderWidth: 3, borderColor: colors.lime }} />
      </View>
      <View style={{ position: 'absolute', top: 10, left: 90, height: 28, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.lime, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.onLime }}>Pickup</Text>
      </View>
    </View>
  );
}

export default function SignIn() {
  const { signedIn, sessionEnded } = useSession();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Can't reach RYDO. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const finish = async (result: AuthResult) => {
    await signedIn(result);
    router.replace('/');
  };

  function submit() {
    if (mode === 'password') {
      run(async () => finish(await api<AuthResult>('POST', '/auth/password/login', { email, password, client: 'MOBILE' })));
    } else if (mode === 'email') {
      run(async () => {
        await api('POST', '/auth/otp/request', { email });
        setMode('code');
      });
    } else {
      run(async () => finish(await api<AuthResult>('POST', '/auth/otp/verify', { email, code, client: 'MOBILE' })));
    }
  }

  /** Continue with Google: signs in people who already have a RYDO account. New employees use Sign up. */
  const withGoogle = (idToken: string) =>
    run(async () => {
      try {
        await finish(await api<AuthResult>('POST', '/auth/google', { idToken, client: 'MOBILE', mode: 'login' }));
      } catch (e) {
        if (e instanceof RequestError && e.code === 'NOT_FOUND') {
          Alert.alert('No RYDO account yet', 'There is no RYDO account for this Google email. Sign up first: find your company and fill in your work details.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Sign up', onPress: () => router.push('/signup') },
          ]);
          return;
        }
        throw e;
      }
    });

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(undefined);
    setCode('');
  };

  const ready = mode === 'password' ? !!email && !!password : mode === 'email' ? !!email : code.length === 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.panel }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Dark hero, like the web side panel */}
          <View style={{ flex: 1, minHeight: 250, padding: 24, paddingTop: 28, gap: 14, justifyContent: 'space-between', overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -90, top: -90, width: 280, height: 280, borderRadius: 140, backgroundColor: colors.lime, opacity: 0.12 }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: -80, bottom: -100, width: 260, height: 260, borderRadius: 130, backgroundColor: '#2563EB', opacity: 0.18 }} />
            <Logo light />
            <RouteArt />
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.onPanel, fontSize: 34, fontWeight: '800', lineHeight: 38 }}>Ride to work{'\n'}with your team.</Text>
              <Text style={{ color: colors.panelMuted, fontSize: 15, lineHeight: 22 }}>Colleagues already driving your way, verified by HR. Share the seat, split the cost.</Text>
            </View>
          </View>

          {/* White sheet with the form, like the web sign-in card */}
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.h1}>{mode === 'code' ? 'Enter the code' : 'Sign in to RYDO'}</Text>
              <Text style={s.body}>{mode === 'code' ? `We sent a 6-digit code to ${email}.` : 'Use your work email. Riders, drivers and admins all sign in here.'}</Text>
            </View>

            {mode !== 'code' && (
              <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
            )}
            {mode === 'password' && (
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" onSubmitEditing={() => ready && submit()} />
            )}
            {mode === 'password' && (
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/forgot-password', params: { email } })} style={{ alignSelf: 'flex-end', marginTop: -6, padding: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' }}>Forgot password?</Text>
              </Pressable>
            )}
            {mode === 'code' && (
              <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
            )}

            {sessionEnded && !error ? <Notice tone="info">Your session ended, for example because 14 days passed since you signed in or you were signed out on another device. Please sign in again.</Notice> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}

            <Button label={mode === 'email' ? 'Send code' : 'Sign in'} loading={busy} disabled={!ready} onPress={submit} />

            <Pressable accessibilityRole="button" onPress={() => switchTo(mode === 'password' ? 'email' : 'password')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' }}>
                {mode === 'password' ? 'Sign in with an email code instead' : 'Sign in with a password instead'}
              </Text>
            </Pressable>
            {googleSignInAvailable && mode !== 'code' ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                  <Text style={{ ...s.body, fontSize: 13 }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                </View>
                <GoogleButton busy={busy} onIdToken={withGoogle} onError={setError} />
              </>
            ) : null}

            <Pressable accessibilityRole="button" onPress={() => router.push('/signup')} style={{ minHeight: 48, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>New to RYDO? Create an account</Text>
            </Pressable>
            <Text style={{ ...s.body, fontSize: 13, textAlign: 'center' }}>Your HR team approves new accounts before the first ride.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
