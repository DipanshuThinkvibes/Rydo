import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { api, errText, RequestError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { AccountFrame, Section, useAccount, type EmailState, type Msg } from '@/components/account-hub';
import { Icon, type IconName } from '@/components/icons';
import { Select } from '@/components/select';
import { Badge, Button, Field, Notice, s } from '@/components/ui';

const GENDERS = [
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

/** Profile tab (web /account): who you are, how others see you, and what is left to complete. */
export default function AccountScreen() {
  return (
    <AccountFrame tab="profile">
      <ProfileTab />
    </AccountFrame>
  );
}

function ProfileTab() {
  const { me, active, reload } = useSession();
  const { profile, emailState, setEmailState, reloadProfile, removePhoto, photoUrl } = useAccount();
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [pMsg, setPMsg] = useState<Msg>();
  const [pFields, setPFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [eMsg, setEMsg] = useState<Msg>();
  const [eBusy, setEBusy] = useState(false);

  // The form starts from the saved profile and only keeps what the person has changed.
  const nameVal = name ?? profile?.name ?? me?.user.name ?? '';
  const phoneVal = phone ?? profile?.phone ?? '';
  const genderVal = gender ?? profile?.gender ?? 'UNDISCLOSED';

  // Name, phone and gender come from sign-up and are fixed. Only a phone or gender that was never given can be added (once).
  const savedPhone = profile?.phone ?? null;
  const savedGender = profile?.gender ?? 'UNDISCLOSED';
  const canAddPhone = active && !!profile && !savedPhone;
  const canAddGender = active && !!profile && savedGender === 'UNDISCLOSED';
  const adding = (canAddPhone && !!phoneVal.trim()) || (canAddGender && genderVal !== 'UNDISCLOSED');

  const saveProfile = async () => {
    setPFields({});
    setPMsg(undefined);
    setSaving(true);
    try {
      await api('PATCH', '/me', { ...(canAddPhone && phoneVal.trim() ? { phone: phoneVal } : {}), ...(canAddGender && genderVal !== 'UNDISCLOSED' ? { gender: genderVal } : {}) });
      await Promise.all([reloadProfile(), reload()]);
      setName(null);
      setPhone(null);
      setGender(null);
      setPMsg({ tone: 'ok', text: 'Profile saved.' });
    } catch (err) {
      if (err instanceof RequestError) setPFields(err.fields ?? {});
      setPMsg({ tone: 'error', text: errText(err) });
    } finally {
      setSaving(false);
    }
  };
  const sendCode = async () => {
    setEBusy(true);
    setEMsg(undefined);
    try {
      await api('POST', '/me/email/verify/send');
      setCodeSent(true);
      setCode('');
      setEMsg({ tone: 'ok', text: `We emailed a 6-digit code to ${emailState?.email}. It expires in a few minutes.` });
    } catch (err) {
      setEMsg({ tone: 'error', text: errText(err, 'The code could not be sent. Try again.') });
    } finally {
      setEBusy(false);
    }
  };
  const verifyEmail = async () => {
    setEBusy(true);
    setEMsg(undefined);
    try {
      setEmailState(await api<EmailState>('POST', '/me/email/verify', { code }));
      setCodeSent(false);
      setCode('');
      await reload();
    } catch (err) {
      setEMsg({ tone: 'error', text: errText(err, 'That code did not work. Try again.') });
    } finally {
      setEBusy(false);
    }
  };

  const steps: { done: boolean; label: string; hint: string; icon: IconName; href?: Href }[] = [
    { done: !!photoUrl, label: 'Add a profile photo', hint: 'Colleagues trust a face (tap your picture above)', icon: 'user' },
    { done: !!profile?.phone, label: 'Add your phone number', hint: 'Private, never shown to others', icon: 'chat' },
    { done: !!emailState?.verified, label: 'Verify your email', hint: 'Proves the account is yours', icon: 'shield' },
    { done: (profile?.emergencyContacts ?? 0) > 0, label: 'Add an emergency contact', hint: 'Someone to tell if you share a trip', icon: 'alert', href: '/safety' },
  ];
  const left = steps.filter((x) => !x.done).length;
  const pct = Math.round(((steps.length - left + 1) / (steps.length + 1)) * 100);

  return (
    <>
      <Section icon="user" title="Profile" sub={active ? 'This is how colleagues see you. Your phone number stays private.' : 'Your name as RYDO staff and colleagues see it.'}>
        <InfoRow label="Name" value={nameVal} />
        {active ? (canAddPhone ? <Field label="Phone (private)" value={phoneVal} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel" error={pFields.phone} /> : <InfoRow label="Phone (private)" value={savedPhone ?? ''} />) : null}
        {active ? (canAddGender ? <Select label="Gender (only used for women-only rides)" value={genderVal} options={GENDERS} onChange={setGender} /> : <InfoRow label="Gender (only used for women-only rides)" value={GENDERS.find((g) => g.value === savedGender)?.label ?? ''} />) : null}
        <Text style={s.small}>{canAddPhone || canAddGender ? 'You can add a missing phone or gender once. After that, ask your HR team to change your details.' : 'Your name, phone and gender come from sign-up. Ask your HR team if something is wrong.'}</Text>
        {pMsg ? <Notice tone={pMsg.tone}>{pMsg.text}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canAddPhone || canAddGender ? <Button label="Save" loading={saving} disabled={!adding} onPress={saveProfile} style={{ flex: 1 }} /> : null}
          {photoUrl ? <Button label="Remove photo" variant="ghost" onPress={removePhoto} /> : null}
        </View>
      </Section>

      <Section icon="shield" title="Email" sub={emailState?.email ?? me?.user.email} aside={emailState ? <Badge tone={emailState.verified ? 'success' : 'warning'}>{emailState.verified ? 'Verified' : 'Not verified'}</Badge> : undefined}>
        {emailState?.verified ? (
          <Notice tone="ok">
            Your email is verified{emailState.verifiedAt ? ` (${new Date(emailState.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}. Your company can trust it is really yours.
          </Notice>
        ) : emailState ? (
          <>
            <Text style={s.small}>Verify your email so your company knows this account is really yours. We email you a 6-digit code.</Text>
            {codeSent ? (
              <>
                <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} placeholder="123456" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label="Verify email" loading={eBusy} disabled={code.length !== 6} onPress={verifyEmail} style={{ flex: 1 }} />
                  <Button label="Send a new code" variant="ghost" disabled={eBusy} onPress={sendCode} />
                </View>
              </>
            ) : (
              <Button label="Send verification code" loading={eBusy} onPress={sendCode} />
            )}
          </>
        ) : null}
        {eMsg ? <Notice tone={eMsg.tone}>{eMsg.text}</Notice> : null}
      </Section>

      {active && profile ? (
        <Section icon="sparkle" title="Profile strength" aside={<Ring pct={pct} />}>
          <Text style={s.small}>{left === 0 ? 'All done. Nice work.' : `${left} ${left === 1 ? 'step' : 'steps'} to go.`}</Text>
          {steps.map((x) => (
            <Pressable key={x.label} accessibilityRole={x.href && !x.done ? 'link' : undefined} disabled={x.done || !x.href} onPress={() => x.href && router.push(x.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: x.done ? colors.successBg : colors.surface }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: x.done ? colors.successText : colors.white }}>
                <Icon name={x.done ? 'check' : x.icon} size={15} color={x.done ? colors.white : colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.strong, { fontSize: 15, color: x.done ? colors.successText : colors.ink }]}>{x.label}</Text>
                {!x.done ? <Text style={[s.small, { fontSize: 12 }]}>{x.hint}</Text> : null}
              </View>
              {!x.done && x.href ? <Icon name="next" size={16} color={colors.muted} /> : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {profile && profile.rating.recentComments.length > 0 ? (
        <Section icon="star" title="What people said">
          {profile.rating.recentComments.map((c, i) => (
            <Text key={i} style={s.body}>
              <Text style={{ color: '#F59E0B' }}>{'★'.repeat(c.stars)}</Text> {c.comment}
            </Text>
          ))}
        </Section>
      ) : null}

      {!active ? (
        <Section icon="shield" title="Your access">
          <Text style={s.body}>
            You are signed in as RYDO staff. Owner tools are under the <Text style={{ fontWeight: '800', color: colors.ink }}>RYDO owner</Text> tab, and your devices and password are under{' '}
            <Text style={{ fontWeight: '800', color: colors.ink }}>Security</Text>.
          </Text>
        </Section>
      ) : null}
    </>
  );
}

/** Round percent badge (web Ring). */
function Ring({ pct }: { pct: number }) {
  return (
    <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 5, borderColor: pct >= 100 ? colors.lime : colors.surface2, borderTopColor: colors.lime, borderRightColor: pct >= 50 ? colors.lime : colors.surface2, borderBottomColor: pct >= 75 ? colors.lime : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }}>{pct}%</Text>
    </View>
  );
}

/** A detail that cannot be edited here: label and value, no input. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View accessible accessibilityLabel={`${label}: ${value || 'not given'}`} style={{ minHeight: 52, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 16, color: value ? colors.ink : colors.muted }}>{value || 'Not given'}</Text>
        <Icon name="lock" size={16} color={colors.muted} />
      </View>
    </View>
  );
}
