import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AuthResult } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, RequestError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Field, s } from '@/components/ui';

export default function SignIn() {
  const { signedIn } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ padding: 24, paddingTop: 40, gap: 14, flex: 1, justifyContent: 'flex-end' }}>
            <Text style={{ color: colors.lime, fontSize: 22, fontWeight: '800', letterSpacing: 4 }}>RYDO</Text>
            <Text style={{ color: colors.white, fontSize: 36, fontWeight: '800', lineHeight: 40 }}>Your office commute, shared.</Text>
            <Text style={{ color: colors.mutedOnDark, fontSize: 16, lineHeight: 24 }}>Ride with verified colleagues going your way.</Text>
          </View>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40, gap: 16 }}>
            {step === 'email' ? (
              <>
                <Text style={s.h1}>Sign in with your work email</Text>
                <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
                {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
                <Button label="Send code" loading={busy} disabled={!email} onPress={() => run(async () => { await api('POST', '/auth/otp/request', { email }); setStep('code'); })} />
                <Text style={{ ...s.body, fontSize: 13 }}>After you verify, your HR team approves your account before your first ride.</Text>
              </>
            ) : (
              <>
                <Text style={s.h1}>Enter the code</Text>
                <Text style={s.body}>6 digits sent to {email}</Text>
                <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
                {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
                <Button
                  label="Verify"
                  loading={busy}
                  disabled={code.length !== 6}
                  onPress={() =>
                    run(async () => {
                      await signedIn(await api<AuthResult>('POST', '/auth/otp/verify', { email, code, client: 'MOBILE' }));
                      router.replace('/');
                    })
                  }
                />
                <Button label="Change email" variant="ghost" onPress={() => { setStep('email'); setCode(''); setError(undefined); }} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}