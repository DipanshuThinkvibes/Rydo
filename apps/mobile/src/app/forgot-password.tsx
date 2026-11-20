import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText, RequestError } from '@/lib/api';
import { BackButton, Button, Field, Logo, Notice, s } from '@/components/ui';

/** Reset a forgotten password with an email code (same as the web /forgot-password): /auth/otp/request, then /auth/password/reset. */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      const e = email.trim().toLowerCase();
      if (step === 'email') {
        await api('POST', '/auth/otp/request', { email: e });
        setStep('reset');
      } else {
        await api('POST', '/auth/password/reset', { email: e, code, newPassword: password });
        setStep('done');
      }
    } catch (err) {
      setError(errText(err));
      if (err instanceof RequestError) setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  const ready = step === 'email' ? !!email.trim() : code.length === 6 && password.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <BackButton />
          <Logo />
          <Text accessibilityRole="header" style={[s.h1, { marginTop: 8 }]}>{step === 'done' ? 'Password changed' : 'Reset your password'}</Text>
          {step === 'done' ? (
            <>
              <Text style={s.body}>You&apos;ve been signed out everywhere else. Sign in with your new password.</Text>
              <Button label="Go to sign in" onPress={() => router.replace('/sign-in')} />
            </>
          ) : (
            <>
              <Text style={s.body}>{step === 'email' ? "We'll email you a 6-digit code." : `Enter the code sent to ${email.trim().toLowerCase()} and choose a new password.`}</Text>
              {step === 'email' ? (
                <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" error={fields.email} />
              ) : (
                <>
                  <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} error={fields.code} />
                  <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={fields.newPassword} />
                  <Text style={s.small}>At least 8 characters with a letter and a number.</Text>
                </>
              )}
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Button label={step === 'email' ? 'Send code' : 'Set new password'} loading={busy} disabled={!ready} onPress={submit} />
              <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={{ alignSelf: 'center', padding: 8 }}>
                <Text style={{ fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' }}>Back to sign in</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
