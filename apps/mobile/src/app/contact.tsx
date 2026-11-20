import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COMPANY_SIZES, inquiryCreateSchema } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText, RequestError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Select } from '@/components/select';
import { BackButton, Button, Field, Notice, s } from '@/components/ui';

const STEPS = [
  { title: 'You send this form', text: 'Tell us who you are and how big your company is.' },
  { title: 'We reach out within 2 working days', text: 'A short call to understand your offices and rules.' },
  { title: 'We set everything up', text: 'Your company, offices and first admin are created for you.' },
  { title: 'Your employees join', text: 'They sign in with their work email; your HR approves them.' },
];
const SIZE_LABEL: Record<(typeof COMPANY_SIZES)[number], string> = { '1-50': '1–50 employees', '51-200': '51–200 employees', '201-1000': '201–1,000 employees', '1000+': 'More than 1,000 employees' };

type Form = { companyName: string; contactName: string; workEmail: string; phone: string; companySize: string; city: string; message: string; consent: boolean };

/** "Bring RYDO to your company" (same as the web Contact us page): POST /public/contact. */
export default function Contact() {
  const [f, setF] = useState<Form>({ companyName: '', contactName: '', workEmail: '', phone: '', companySize: '', city: '', message: '', consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function send() {
    setError(undefined);
    // Same rules as the API (packages/shared), so mistakes show next to each field.
    const parsed = inquiryCreateSchema.safeParse(f);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      setError('Check the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      await api('POST', '/public/contact', parsed.data);
      setSent(true);
    } catch (e) {
      if (e instanceof RequestError && e.fields) setErrors(e.fields);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 22 }} keyboardShouldPersistTaps="handled">
          <BackButton />

          <View style={{ gap: 12 }}>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.lime }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: colors.ink }}>CONTACT US</Text>
            </View>
            <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', color: colors.ink }}>Bring RYDO to your company.</Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: colors.muted }}>
              Fill in the form and the RYDO team will get in touch to onboard your organisation. RYDO is free for companies and employees right now.
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            {STEPS.map((x, i) => (
              <View key={x.title} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.lime, fontWeight: '800', fontSize: 15 }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{x.title}</Text>
                  <Text style={s.small}>{x.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ padding: 20, gap: 14, borderRadius: 26, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
            {sent ? (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={36} />
                </View>
                <Text accessibilityRole="header" style={[s.h2, { textAlign: 'center' }]}>Thanks, we got it</Text>
                <Text style={[s.body, { textAlign: 'center' }]}>The RYDO team will contact {f.workEmail.trim().toLowerCase()} within 2 working days.</Text>
                <Button label="Done" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ alignSelf: 'stretch' }} />
              </View>
            ) : (
              <>
                <Field label="Company name" value={f.companyName} onChangeText={(v) => set('companyName', v)} autoCapitalize="words" error={errors.companyName} />
                <Field label="Your name" value={f.contactName} onChangeText={(v) => set('contactName', v)} autoComplete="name" textContentType="name" error={errors.contactName} />
                <Field label="Work email" value={f.workEmail} onChangeText={(v) => set('workEmail', v)} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" error={errors.workEmail} />
                <Field label="Phone (optional)" value={f.phone} onChangeText={(v) => set('phone', v)} placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel" error={errors.phone} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Select label="Company size" value={f.companySize || null} options={COMPANY_SIZES.map((x) => ({ value: x, label: SIZE_LABEL[x] }))} onChange={(v) => set('companySize', v)} error={errors.companySize} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="City (optional)" value={f.city} onChangeText={(v) => set('city', v)} autoCapitalize="words" error={errors.city} />
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={s.label}>Anything we should know? (optional)</Text>
                  <TextInput
                    value={f.message}
                    onChangeText={(v) => set('message', v)}
                    multiline
                    maxLength={1500}
                    accessibilityLabel="Anything we should know"
                    style={[s.input, { height: 120, paddingTop: 14, textAlignVertical: 'top' }]}
                  />
                  {errors.message ? <Text style={s.error}>{errors.message}</Text> : <Text style={s.small}>For example: number of offices, when you would like to start.</Text>}
                </View>

                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.consent }} onPress={() => set('consent', !f.consent)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: errors.consent ? colors.danger : colors.ink, backgroundColor: f.consent ? colors.ink : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    {f.consent ? <Icon name="check" size={14} color={colors.lime} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink }}>
                    I agree that RYDO may contact me about setting up my company. See our <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'privacy' } })} style={{ fontWeight: '800', textDecorationLine: 'underline' }}>privacy policy</Text>.
                  </Text>
                </Pressable>
                {errors.consent ? <Text style={s.error}>{errors.consent}</Text> : null}

                {error ? <Notice tone="error">{error}</Notice> : null}
                <Button label="Request onboarding" loading={busy} onPress={send} />
              </>
            )}
          </View>

          <View style={{ padding: 18, gap: 6, borderRadius: 18, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>Other ways to reach us</Text>
            <Text style={s.small}>
              We reply within 2 working days. Quick answers are in the{' '}
              <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'faq' } })} style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>FAQ</Text>, and you can read about{' '}
              <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'about' } })} style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>who we are</Text>.
            </Text>
          </View>

          <Text style={[s.small, { textAlign: 'center' }]}>
            Already part of a company on RYDO?{' '}
            <Text accessibilityRole="link" onPress={() => router.replace('/signup')} style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Sign up</Text> or{' '}
            <Text accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>log in</Text> instead.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
