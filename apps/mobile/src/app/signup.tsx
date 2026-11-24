import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ID_PROOF_TYPES, registrationSchema, type AuthResult, type CompanyInfo, type IdProofType } from '@rydo/shared';
import { colors, isDark } from '@/lib/theme';
import { api, errText, RequestError, tokens } from '@/lib/api';
import { useSession } from '@/lib/session';
import { GoogleButton, googleSignInAvailable } from '@/components/google-button';
import { Icon } from '@/components/icons';
import { Select } from '@/components/select';
import { Button, Chip, Field, Logo, Notice, s } from '@/components/ui';

type Step = 'company' | 'details' | 'verify' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'company', label: 'Your company' },
  { key: 'details', label: 'Your details' },
  { key: 'verify', label: 'Verify email' },
  { key: 'done', label: 'Done' },
];

const ID_LABEL: Record<IdProofType, string> = { AADHAAR: 'Aadhaar card', PAN: 'PAN card', PASSPORT: 'Passport', DRIVING_LICENCE: 'Driving licence', VOTER_ID: 'Voter ID card' };
/** Shape of each full ID number, checked on the phone only: just the last 4 characters are ever sent. */
const ID_FORMAT: Record<IdProofType, { re: RegExp; hint: string }> = {
  AADHAAR: { re: /^\d{12}$/, hint: '12 digits' },
  PAN: { re: /^[A-Z]{5}\d{4}[A-Z]$/, hint: '10 characters, like ABCDE1234F' },
  PASSPORT: { re: /^[A-Z]\d{7}$/, hint: 'Like A1234567' },
  DRIVING_LICENCE: { re: /^[A-Z]{2}\d{2}[A-Z0-9]{8,14}$/, hint: 'Like KA0120190012345' },
  VOTER_ID: { re: /^[A-Z]{3}\d{7}$/, hint: 'Like ABC1234567' },
};
const cleanId = (n: string) => n.toUpperCase().replace(/[\s-]/g, '');
const GENDER_CHOICES = [
  ['FEMALE', 'Female'],
  ['MALE', 'Male'],
  ['OTHER', 'Other'],
  ['UNDISCLOSED', 'Prefer not to say'],
] as const;

type Form = {
  name: string;
  email: string;
  phone: string;
  /** '' until chosen. Used only for women-only rides; fixed after sign-up. */
  gender: '' | 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';
  idProofType: IdProofType;
  idProofNumber: string;
  employeeId: string;
  jobTitle: string;
  department: string;
  office: string;
  managerName: string;
  managerEmail: string;
  acceptTerms: boolean;
};

/**
 * Join your team on RYDO (mobile), using the same sign-up API as the web:
 * 1. find your company (GET /public/companies, same as the web — it must be on RYDO),
 * 2. your details (checked here with the shared registrationSchema),
 * 3. verify your work email with a code (POST /auth/otp/verify), or Google (POST /auth/google, mode "signup"),
 *    then POST /me/registration, 4. done — HR approves before the first ride.
 */
export default function Signup() {
  // Coming from "Continue with Google" on the sign-in screen for a new employee.
  const params = useLocalSearchParams<{ email?: string }>();
  const { signedIn } = useSession();
  const [step, setStep] = useState<Step>('company');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  // Set once the email is proven (code or Google): the account exists and is waiting for these details.
  const [account, setAccount] = useState<AuthResult | null>(null);
  const [viaGoogle, setViaGoogle] = useState(false);
  const [f, setF] = useState<Form>({
    name: '',
    email: params.email ?? '',
    phone: '',
    gender: '',
    idProofType: 'AADHAAR',
    idProofNumber: '',
    employeeId: '',
    jobTitle: '',
    department: '',
    office: '',
    managerName: '',
    managerEmail: '',
    acceptTerms: false,
  });
  const index = STEPS.findIndex((x) => x.key === step);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={isDark() ? "light" : "dark"} />
      {/* Dark header with the four steps (left panel of the prototype) */}
      <View style={{ backgroundColor: colors.panel, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -80, top: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.lime, opacity: 0.1 }} />
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
            <Logo light />
            <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')} hitSlop={8}>
              <Text style={{ color: colors.panelMuted, fontSize: 14 }}>
                Already registered? <Text style={{ color: colors.panelAccent, fontWeight: '800', textDecorationLine: 'underline' }}>Log in</Text>
              </Text>
            </Pressable>
          </View>
          {step === 'company' ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.onPanel, fontSize: 28, fontWeight: '800', lineHeight: 32 }}>Join your team{'\n'}on RYDO.</Text>
              <Text style={{ color: colors.panelMuted, fontSize: 14, lineHeight: 20 }}>Register once with your work details. Your company&apos;s HR approves you before your first ride.</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${index + 1} of 4: ${STEPS[index].label}`}>
            {STEPS.map((x, i) => {
              const done = i < index;
              const on = i === index;
              return (
                <View key={x.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.lime : 'transparent', borderWidth: 2, borderColor: done || on ? colors.lime : colors.panel2 }}>
                    {done ? <Icon name="check" size={14} color={colors.onLime} /> : <Text style={{ color: on ? colors.onPanel : colors.panelMuted, fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>}
                  </View>
                  <Text numberOfLines={1} style={{ color: on || done ? colors.onPanel : colors.panelMuted, fontSize: 11, fontWeight: on ? '800' : '600' }}>{x.label}</Text>
                </View>
              );
            })}
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
          <View style={[s.card, { padding: 20, gap: 14, borderRadius: 26 }]}>
            {step === 'company' ? (
              <FindCompany
                selected={company}
                onSelect={setCompany}
                onContinue={() => setStep('details')}
                onGoogle={async (r) => {
                  await tokens.save(r);
                  setAccount(r);
                  setViaGoogle(true);
                  setF((x) => ({ ...x, email: r.user.email, name: x.name || r.user.name }));
                  setStep('details');
                }}
              />
            ) : null}
            {step === 'details' && company ? (
              <Details
                company={company}
                form={f}
                setForm={setF}
                emailLocked={!!account}
                viaGoogle={viaGoogle}
                onChangeCompany={
                  account
                    ? undefined
                    : () => {
                        setF((x) => ({ ...x, email: '', department: '', office: '' }));
                        setStep('company');
                      }
                }
                onNext={async () => {
                  if (account) {
                    // Email already proven (Google, or a code earlier): just send the details.
                    await register(f);
                    setStep('done');
                  } else {
                    await api('POST', '/auth/otp/request', { email: f.email.trim().toLowerCase() });
                    setStep('verify');
                  }
                }}
              />
            ) : null}
            {step === 'verify' && company ? (
              <Verify
                email={f.email.trim().toLowerCase()}
                onBack={() => setStep('details')}
                onCode={async (code) => {
                  const r = await api<AuthResult>('POST', '/auth/otp/verify', { email: f.email.trim().toLowerCase(), code, client: 'MOBILE' });
                  await tokens.save(r);
                  setAccount(r);
                  try {
                    await register(f);
                  } catch (e) {
                    // The account exists now; fix the details and send them again (no new code needed).
                    setStep('details');
                    throw e;
                  }
                  setStep('done');
                }}
              />
            ) : null}
            {step === 'done' && company ? (
              <Done
                company={company.name}
                onOpen={async () => {
                  if (account) await signedIn(account);
                  router.replace('/');
                }}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** POST /me/registration: the details HR checks. Only the last 4 characters of the ID number are sent. */
async function register(f: Form) {
  await api('POST', '/me/registration', {
    fullName: f.name.trim(),
    phone: f.phone,
    gender: f.gender,
    idType: f.idProofType,
    idLast4: cleanId(f.idProofNumber).slice(-4),
    employeeId: f.employeeId.trim(),
    designation: f.jobTitle.trim(),
    department: f.department,
    office: f.office,
    managerName: f.managerName.trim(),
    managerEmail: f.managerEmail.trim().toLowerCase(),
  });
}

// ── 1. Find your company ──

function FindCompany({
  selected,
  onSelect,
  onContinue,
  onGoogle,
}: {
  selected: CompanyInfo | null;
  onSelect: (c: CompanyInfo | null) => void;
  onContinue: () => void;
  onGoogle: (r: AuthResult) => Promise<void>;
}) {
  const [q, setQ] = useState(selected?.name ?? '');
  const [matches, setMatches] = useState<CompanyInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (selected && selected.name === text) return;
    onSelect(null);
    setMatches(null);
    if (text.length < 2) return;
    const t = setTimeout(() => {
      setSearching(true);
      api<CompanyInfo[]>('GET', `/public/companies?q=${encodeURIComponent(text)}`)
        .then((r) => {
          setMatches(r);
          setError(undefined);
          // One clear match: pick it, like the prototype's green confirmation.
          const exact = r.find((c) => c.name.toLowerCase() === text.toLowerCase()) ?? (r.length === 1 ? r[0] : undefined);
          if (exact) onSelect(exact);
        })
        .catch((e) => setError(errText(e)))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
    // onSelect is stable enough (state setter); re-run only when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const domains = selected?.domains.map((d) => `@${d}`).join(' or ') ?? '';

  const withGoogle = async (idToken: string) => {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      // The server checks the token with Google and refuses any account outside the company's domain.
      const r = await api<AuthResult>('POST', '/auth/google', { idToken, client: 'MOBILE', mode: 'signup', expectDomain: selected.domains[0] });
      await onGoogle(r);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={s.h2}>Find your company</Text>
        <Text style={s.small}>Type the name of the company you work for. It must already be on RYDO.</Text>
      </View>
      <Field label="Company name" value={q} onChangeText={setQ} placeholder="For example Acme Tech" autoCorrect={false} autoCapitalize="words" />

      {searching ? <Text style={s.small}>Looking for {q.trim()}…</Text> : null}
      {selected ? (
        <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.successBg }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.successText, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={14} color={colors.onInk} />
          </View>
          <Text style={{ flex: 1, color: colors.successText, fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '800' }}>{selected.name} is on RYDO.</Text> Use your work email ending in <Text style={{ fontWeight: '800' }}>{domains}</Text> to register.
          </Text>
        </View>
      ) : matches && matches.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text style={s.small}>Which one is yours?</Text>
          {matches.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => (setQ(c.name), onSelect(c))} style={{ padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong }}>
              <Text style={s.strong}>{c.name}</Text>
              <Text style={s.small}>{c.domains.map((d) => `@${d}`).join(', ')}</Text>
            </Pressable>
          ))}
        </View>
      ) : matches && matches.length === 0 ? (
        <Notice tone="error">We couldn&apos;t find {q.trim()} on RYDO. Check the spelling, or ask your HR team to contact RYDO.</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button label="Continue with the form" disabled={!selected} onPress={onContinue} />

      {googleSignInAvailable ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.muted }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          <GoogleButton label="Sign up with Google" busy={busy} disabled={!selected} onIdToken={withGoogle} onError={setError} />
          {selected ? <Text style={[s.small, { textAlign: 'center' }]}>Use your <Text style={{ fontWeight: '800', color: colors.ink }}>{domains}</Text> Google account. Other Google accounts are not accepted.</Text> : null}
        </>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/contact')} style={{ alignSelf: 'center', padding: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Not on RYDO yet? <Text style={{ color: colors.ink, fontWeight: '800', textDecorationLine: 'underline' }}>Contact us</Text>
        </Text>
      </Pressable>
    </>
  );
}

// ── 2. Your details ──

function Details({
  company,
  form: f,
  setForm,
  emailLocked,
  viaGoogle,
  onChangeCompany,
  onNext,
}: {
  company: CompanyInfo;
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  emailLocked: boolean;
  viaGoogle: boolean;
  /** Missing once the account exists: the company can't change any more. */
  onChangeCompany?: () => void;
  onNext: () => Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showId, setShowId] = useState(false);
  const domain = company.domains[0] ?? 'company.com';

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function next() {
    setError(undefined);
    const email = f.email.trim().toLowerCase();
    // Same rules as the API (packages/shared), so mistakes show next to each field.
    const id = cleanId(f.idProofNumber);
    const parsed = registrationSchema.safeParse({
      fullName: f.name,
      phone: f.phone,
      gender: f.gender || undefined,
      idType: f.idProofType,
      idLast4: id.slice(-4),
      employeeId: f.employeeId,
      designation: f.jobTitle,
      department: f.department,
      office: f.office,
      managerName: f.managerName,
      managerEmail: f.managerEmail,
    });
    // Schema field -> form field, where the names differ.
    const field: Record<string, keyof Form> = { fullName: 'name', idType: 'idProofType', idLast4: 'idProofNumber', designation: 'jobTitle' };
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[field[String(i.path[0])] ?? String(i.path[0])] ??= i.message;
    if (!ID_FORMAT[f.idProofType].re.test(id)) errs.idProofNumber = `Enter a valid ${ID_LABEL[f.idProofType]} number (${ID_FORMAT[f.idProofType].hint})`;
    const domains = company.domains.map((d) => `@${d}`).join(' or ');
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter your work email';
    else if (!company.domains.some((d) => email.endsWith(`@${d}`))) errs.email = `Use your work email ending in ${domains}`;
    const manager = f.managerEmail.trim().toLowerCase();
    if (!errs.managerEmail && !company.domains.some((d) => manager.endsWith(`@${d}`))) errs.managerEmail = `Use a ${domains} address`;
    else if (!errs.managerEmail && manager === email) errs.managerEmail = "Use your manager's email, not yours";
    if (!f.acceptTerms) errs.acceptTerms = 'Tick this to continue';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setError('Check the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      await onNext();
    } catch (e) {
      if (e instanceof RequestError && e.fields) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [({ fullName: 'name', idLast4: 'idProofNumber', designation: 'jobTitle' } as Record<string, string>)[k] ?? k, String(v)])));
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const section = (t: string) => <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: colors.muted, marginTop: 6 }}>{t}</Text>;

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={s.h2}>Your details</Text>
        <Text style={s.small}>
          Registering with <Text style={{ fontWeight: '800', color: colors.ink }}>{company.name}</Text>.{' '}
          {onChangeCompany ? <Text accessibilityRole="link" onPress={onChangeCompany} style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Change company</Text> : null}
        </Text>
      </View>

      {section('ABOUT YOU')}
      <Field label="Full name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="As on your ID" autoComplete="name" textContentType="name" error={errors.name} />
      <Field
        label="Work email"
        value={f.email}
        onChangeText={(v) => set('email', v)}
        placeholder={`name@${domain}`}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!emailLocked}
        error={errors.email}
      />
      {emailLocked ? <Text style={s.small}>{viaGoogle ? 'Confirmed with Google.' : 'Verified.'}</Text> : null}

      <View style={{ gap: 6 }}>
        <Text style={s.label}>Phone number</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ height: 52, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface2, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>+91</Text>
          </View>
          <TextInput
            value={f.phone}
            onChangeText={(v) => set('phone', v.replace(/[^\d ]/g, '').slice(0, 12))}
            placeholder="98765 43210"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            accessibilityLabel="Phone number"
            style={[s.input, { flex: 1 }, errors.phone ? { borderColor: colors.danger } : null]}
          />
        </View>
        {errors.phone ? <Text style={s.error}>{errors.phone}</Text> : <Text style={s.small}>Private. Never shown to other employees.</Text>}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={s.label}>Gender</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GENDER_CHOICES.map(([v, l]) => (
            <Chip key={v} label={l} selected={f.gender === v} onPress={() => set('gender', v)} />
          ))}
        </View>
        {errors.gender ? <Text style={s.error}>{errors.gender}</Text> : <Text style={s.small}>Used only for women-only rides. You cannot change it later.</Text>}
      </View>

      <Select label="ID proof" value={f.idProofType} options={ID_PROOF_TYPES.map((t) => ({ value: t, label: ID_LABEL[t] }))} onChange={(v) => (set('idProofType', v as IdProofType), set('idProofNumber', ''))} />
      <View style={{ gap: 6 }}>
        <Text style={s.label}>{ID_LABEL[f.idProofType]} number</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={f.idProofNumber}
            onChangeText={(v) => set('idProofNumber', v.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 24))}
            secureTextEntry={!showId}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType={f.idProofType === 'AADHAAR' ? 'number-pad' : 'default'}
            accessibilityLabel={`${ID_LABEL[f.idProofType]} number`}
            style={[s.input, { flex: 1 }, errors.idProofNumber ? { borderColor: colors.danger } : null]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={showId ? 'Hide ID number' : 'Show ID number'} onPress={() => setShowId(!showId)} style={{ height: 52, width: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={showId ? 'eyeOff' : 'eye'} size={22} color={colors.ink} />
          </Pressable>
        </View>
        {errors.idProofNumber ? <Text style={s.error}>{errors.idProofNumber}</Text> : <Text style={s.small}>{ID_FORMAT[f.idProofType].hint}. Only the last 4 characters are sent to RYDO.</Text>}
      </View>

      {section('AT WORK')}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Employee ID" value={f.employeeId} onChangeText={(v) => set('employeeId', v)} placeholder="For example AT-10234" autoCapitalize="characters" error={errors.employeeId} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Job title" value={f.jobTitle} onChangeText={(v) => set('jobTitle', v)} placeholder="Software engineer" error={errors.jobTitle} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {/* A list when HR has set one up; otherwise typed in. */}
        <View style={{ flex: 1 }}>
          {company.departments.length ? (
            <Select label="Department" value={f.department || null} options={company.departments.map((d) => ({ value: d, label: d }))} onChange={(v) => set('department', v)} error={errors.department} />
          ) : (
            <Field label="Department" value={f.department} onChangeText={(v) => set('department', v)} placeholder="Engineering" error={errors.department} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {company.offices.length ? (
            <Select label="Office" value={f.office || null} options={company.offices.map((o) => ({ value: o, label: o }))} onChange={(v) => set('office', v)} error={errors.office} />
          ) : (
            <Field label="Office" value={f.office} onChangeText={(v) => set('office', v)} placeholder="City or campus" error={errors.office} />
          )}
        </View>
      </View>

      {section('REPORTING MANAGER')}
      <Field label="Manager's name" value={f.managerName} onChangeText={(v) => set('managerName', v)} error={errors.managerName} />
      <Field label="Manager's work email" value={f.managerEmail} onChangeText={(v) => set('managerEmail', v)} placeholder={`manager@${domain}`} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={errors.managerEmail} />

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.acceptTerms }} onPress={() => set('acceptTerms', !f.acceptTerms)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: errors.acceptTerms ? colors.danger : colors.ink, backgroundColor: f.acceptTerms ? colors.inkBg : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {f.acceptTerms ? <Icon name="check" size={14} color={colors.lime} /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink }}>
          I confirm these details are correct, and I agree to the <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'terms' } })} style={{ fontWeight: '800', textDecorationLine: 'underline' }}>terms</Text> and <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'privacy' } })} style={{ fontWeight: '800', textDecorationLine: 'underline' }}>privacy policy</Text>.
        </Text>
      </Pressable>
      {errors.acceptTerms ? <Text style={s.error}>{errors.acceptTerms}</Text> : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {onChangeCompany ? <Button label="Back" variant="ghost" onPress={onChangeCompany} style={{ paddingHorizontal: 22 }} /> : null}
        <Button label={emailLocked ? 'Create account' : 'Send verification code'} loading={busy} onPress={next} style={{ flex: 1 }} />
      </View>
    </>
  );
}

// ── 3. Verify email ──

function Verify({ email, onBack, onCode }: { email: string; onBack: () => void; onCode: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [resent, setResent] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onCode(code);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={s.h2}>Verify your email</Text>
        <Text style={s.small}>
          We sent a 6-digit code to <Text style={{ fontWeight: '800', color: colors.ink }}>{email}</Text>. It expires in 10 minutes.
        </Text>
      </View>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        accessibilityLabel="6-digit code"
        placeholder="••••••"
        placeholderTextColor={colors.lineStrong}
        style={{ height: 64, borderRadius: 18, borderWidth: 2, borderColor: colors.ink, textAlign: 'center', fontSize: 30, fontWeight: '800', letterSpacing: 12, color: colors.ink }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Pressable
        accessibilityRole="button"
        disabled={resent}
        onPress={() => api('POST', '/auth/otp/request', { email }).then(() => setResent(true), (e) => setError(errText(e)))}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ fontWeight: '700', color: colors.ink, textDecorationLine: resent ? 'none' : 'underline' }}>{resent ? 'New code sent' : 'Send the code again'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Back" variant="ghost" onPress={onBack} style={{ paddingHorizontal: 22 }} />
        <Button label="Create account" loading={busy} disabled={code.length !== 6} onPress={go} style={{ flex: 1 }} />
      </View>
    </>
  );
}

// ── 4. Done ──

function Done({ company, onOpen }: { company: string; onOpen: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 10 }}>
      <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={44} color={colors.onLime} />
      </View>
      <Text accessibilityRole="header" style={[s.h2, { textAlign: 'center' }]}>You&apos;re registered</Text>
      <Text style={[s.body, { textAlign: 'center' }]}>{company}&apos;s HR team will check your details and approve your account. We&apos;ll email you; then you can find or offer rides.</Text>
      <Button label="Open RYDO" variant="lime" onPress={onOpen} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
