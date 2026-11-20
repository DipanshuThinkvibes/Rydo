import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText, RequestError } from '@/lib/api';
import { pick } from '@/lib/photo';
import { Select } from '@/components/select';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Blocked, EmailState, EmergencyContact, MyIssue, MyProfile, OpenSurvey } from '@/lib/types';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, BackButton, Badge, Button, Card, Field, Label, Loading, Notice, s } from '@/components/ui';

const MAX_CONTACTS = 5;

interface Data {
  profile: MyProfile;
  contacts: EmergencyContact[];
  blocks: Blocked[];
  issues: MyIssue[];
  surveys: OpenSurvey[];
  email: EmailState | null;
}

const GENDERS = [
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

/** Profile (photo, name, phone, gender), email check, password, emergency contacts, blocked people, reports, links, sign out. */
export default function Account() {
  const { me, membership, signOut } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null);
  const [profileForm, setProfileForm] = useState<{ name: string; phone: string; gender: string } | null>(null);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, setData, reload, error } = useData<Data>(async () => {
    const [profile, contacts, blocks, issues, surveys, email] = await Promise.all([
      api<MyProfile>('GET', '/me/profile'),
      api<EmergencyContact[]>('GET', '/me/emergency-contacts'),
      api<Blocked[]>('GET', '/me/blocks').catch(() => [] as Blocked[]),
      api<MyIssue[]>('GET', '/me/issues').catch(() => [] as MyIssue[]),
      api<OpenSurvey[]>('GET', '/me/surveys').catch(() => [] as OpenSurvey[]),
      api<EmailState>('GET', '/me/email').catch(() => null),
    ]);
    return { profile, contacts, blocks, issues, surveys, email };
  }, []);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', `You are signed in as ${me?.user.email ?? ''}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut().then(() => router.replace('/welcome')) },
    ]);

  if (!data) return error ? <SafeAreaView style={{ flex: 1, padding: 20, gap: 16 }}><BackButton /><Notice tone="error">{errText(error)}</Notice><Button label="Sign out" variant="ghost" onPress={confirmSignOut} /></SafeAreaView> : <Loading />;
  const { profile } = data;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      Alert.alert('That did not work', errText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    if (!profileForm) return;
    setBusy('profile');
    setProfileErrors({});
    try {
      await api('PATCH', '/me', { name: profileForm.name.trim(), gender: profileForm.gender, phone: profileForm.phone.trim() ? profileForm.phone.trim() : null });
      await reload();
      setProfileForm(null);
    } catch (e) {
      if (e instanceof RequestError && e.fields) setProfileErrors(e.fields);
      else Alert.alert('That did not work', errText(e));
    } finally {
      setBusy(null);
    }
  };

  /** Same 3 steps as the web: ask for an upload slot, PUT the photo there, then save it on the profile. */
  const uploadPhoto = async (fromCamera: boolean) => {
    const file = await pick(fromCamera);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Alert.alert('Choose a JPG, PNG or WebP photo.');
    const blob = await (await fetch(file.uri)).blob();
    if (blob.size > 5 * 1024 * 1024) return Alert.alert('The photo must be under 5 MB.');
    await run('photo', async () => {
      const slot = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>('POST', '/me/photo/upload-url', { contentType: file.type });
      const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: blob });
      if (!put.ok) throw new Error('upload failed');
      await api('PUT', '/me/photo', { key: slot.key });
    });
  };
  const photoMenu = () =>
    Alert.alert('Profile photo', 'Colleagues see it on rides, so they know who to look for.', [
      { text: 'Take a photo', onPress: () => uploadPhoto(true) },
      { text: 'Choose from gallery', onPress: () => uploadPhoto(false) },
      ...(profile.photoUrl ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => run('photo', () => api('DELETE', '/me/photo')) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  const removeContact = (c: EmergencyContact) =>
    Alert.alert(`Remove ${c.name}?`, undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(`c${c.id}`, () => api('DELETE', `/me/emergency-contacts/${c.id}`)) },
    ]);
  const unblock = (b: Blocked) => run(`b${b.membershipId}`, () => api<Blocked[]>('DELETE', `/me/blocks/${b.membershipId}`).then((blocks) => setData({ ...data, blocks })));
  const openSurveys = data.surveys.filter((x) => !x.answered);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Account</Text>
            <Pressable accessibilityRole="button" onPress={confirmSignOut} hitSlop={8} style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger, justifyContent: 'center' }}>
              <Text style={{ color: colors.danger, fontWeight: '800' }}>Sign out</Text>
            </Pressable>
          </View>

          <Card style={{ gap: 14 }}>
            <View style={s.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={profile.photoUrl ? 'Change profile photo' : 'Add profile photo'} onPress={photoMenu} disabled={busy === 'photo'}>
                {profile.photoUrl ? <Image source={{ uri: profile.photoUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} /> : <Avatar name={profile.name} size={60} tone="ink" />}
                <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={12} />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{profile.name}</Text>
                <Text style={s.small}>{profile.email}{data.email ? (data.email.verified ? ' · ✓ verified' : ' · not verified') : ''}</Text>
                <Text style={s.small}>{[membership?.organization.name, profile.department].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Mini value={profile.rating.average ? `★ ${profile.rating.average.toFixed(1)}` : '—'} label={`${profile.rating.count} ratings`} />
              <Mini value={String(profile.ridesCompleted.asRider + profile.ridesCompleted.asDriver)} label="rides" />
              <Mini value={`${Math.round(profile.reliabilityScore)}%`} label="reliable" />
            </View>
            {profile.rating.recentComments?.length ? (
              <View style={{ gap: 6 }}>
                <Label>What colleagues said</Label>
                {profile.rating.recentComments.slice(0, 3).map((c, i) => (
                  <Text key={i} style={s.small}>“{c.comment}” · {'★'.repeat(c.stars)}</Text>
                ))}
              </View>
            ) : null}
          </Card>

          {openSurveys.map((sv) => (
            <Card key={sv.id} onPress={() => router.push({ pathname: '/survey/[id]', params: { id: sv.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.lime, borderWidth: 2 }}>
              <Icon name="star" size={22} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{sv.title}</Text>
                <Text style={s.small}>Short survey from your company · answers are anonymous</Text>
              </View>
              <Icon name="next" size={22} color={colors.muted} />
            </Card>
          ))}

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>Profile</Label>
              {profileForm === null ? <Button small variant="ghost" label="Edit" onPress={() => setProfileForm({ name: profile.name, phone: profile.phone ?? '', gender: profile.gender ?? 'UNDISCLOSED' })} /> : null}
            </View>
            {profileForm === null ? (
              <>
                <Text style={s.small}>Name <Text style={s.strong}>{profile.name}</Text></Text>
                <Text style={s.small}>Phone <Text style={s.strong}>{profile.phone ?? 'Not added'}</Text> · private, never shown to drivers or riders</Text>
                <Text style={s.small}>Gender <Text style={s.strong}>{GENDERS.find((g) => g.value === profile.gender)?.label ?? 'Prefer not to say'}</Text> · only used for women-only rides</Text>
              </>
            ) : (
              <>
                <Field label="Name" value={profileForm.name} onChangeText={(name) => setProfileForm({ ...profileForm, name })} autoComplete="name" error={profileErrors.name} />
                <Field label="Phone (private)" value={profileForm.phone} onChangeText={(phone) => setProfileForm({ ...profileForm, phone })} keyboardType="phone-pad" placeholder="+91 98765 43210" autoComplete="tel" error={profileErrors.phone} />
                <Select label="Gender (only used for women-only rides)" value={profileForm.gender} options={GENDERS} onChange={(gender) => setProfileForm({ ...profileForm, gender })} error={profileErrors.gender} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => (setProfileForm(null), setProfileErrors({}))} />
                  <Button small label="Save" style={{ flex: 1 }} loading={busy === 'profile'} onPress={saveProfile} />
                </View>
              </>
            )}
          </Card>

          {data.email ? <EmailCard state={data.email} onVerified={reload} /> : null}
          <PasswordCard />

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>Emergency contacts</Label>
              <Text style={s.small}>{data.contacts.length} of {MAX_CONTACTS}</Text>
            </View>
            <Text style={s.small}>From any trip you can email them your live trip link with one tap. Add an email to make that work.</Text>
            {data.contacts.map((c) =>
              editing !== 'new' && editing?.id === c.id ? (
                <ContactForm key={c.id} initial={c} busy={busy === 'contact'} onCancel={() => setEditing(null)} onSave={(v) => run('contact', () => api('PATCH', `/me/emergency-contacts/${c.id}`, v)).then((ok) => ok && setEditing(null))} />
              ) : (
                <View key={c.id} style={[s.row, { paddingVertical: 4 }]}>
                  <Avatar name={c.name} size={40} tone="pink" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.strong}>{c.name}{c.relation ? ` · ${c.relation}` : ''}</Text>
                    <Text style={s.small}>{c.phone}{c.email ? ` · ${c.email}` : ' · no email'}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`} onPress={() => setEditing(c)} hitSlop={8}>
                    <Text style={{ fontWeight: '800', color: colors.ink }}>Edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`} onPress={() => removeContact(c)} hitSlop={8}>
                    <Icon name="close" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ),
            )}
            {editing === 'new' ? (
              <ContactForm busy={busy === 'contact'} onCancel={() => setEditing(null)} onSave={(v) => run('contact', () => api('POST', '/me/emergency-contacts', v)).then((ok) => ok && setEditing(null))} />
            ) : data.contacts.length < MAX_CONTACTS ? (
              <Button small variant="ghost" label="Add a contact" onPress={() => setEditing('new')} />
            ) : null}
          </Card>

          <Card style={{ gap: 4, paddingVertical: 8 }}>
            <Row icon="bell" title="Notifications" sub="Ride updates and news from your company" onPress={() => router.push('/notifications')} />
            <Row icon="chat" title="Messages" sub="Chats with your drivers and riders" onPress={() => router.push('/messages')} />
            <Row icon="star" title="Preferred drivers" sub="Colleagues you like riding with" onPress={() => router.push('/preferred-drivers')} />
            <Row icon="clock" title="My waitlist" sub="Days you're waiting for a seat" onPress={() => router.push('/waitlist')} />
            <Row icon="chat" title="Send feedback about RYDO" sub="Ideas, problems, what works" onPress={() => router.push('/feedback')} />
            <Row icon="flag" title="Report a problem" sub="Goes to your company's admins" onPress={() => router.push('/report')} />
            <Row icon="alert" title="Help and about RYDO" sub="FAQ, how it works, privacy and terms" onPress={() => router.push('/info')} />
          </Card>

          {data.issues.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Label>My reports</Label>
              {data.issues.slice(0, 5).map((i) => (
                <View key={i.id} style={{ gap: 4, paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.strong}>{i.categoryLabel}</Text>
                    <Badge tone={i.status === 'RESOLVED' ? 'success' : i.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>{i.status === 'IN_PROGRESS' ? 'in progress' : i.status.toLowerCase()}</Badge>
                  </View>
                  <Text numberOfLines={2} style={s.small}>{fmtWhen(i.createdAt)} · {i.description}</Text>
                  {i.resolution ? <Text style={[s.small, { color: colors.ink }]}>Answer: {i.resolution}</Text> : null}
                </View>
              ))}
            </Card>
          )}

          {data.blocks.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Label>Blocked people</Label>
              <Text style={s.small}>You and they don&apos;t see each other&apos;s rides and can&apos;t message each other.</Text>
              {data.blocks.map((b) => (
                <View key={b.membershipId} style={s.row}>
                  <Avatar name={b.name} size={36} />
                  <Text style={[s.strong, { flex: 1 }]}>{b.name}</Text>
                  <Button small variant="ghost" label="Unblock" loading={busy === `b${b.membershipId}`} onPress={() => unblock(b)} />
                </View>
              ))}
            </Card>
          )}

          <Button label="Sign out" variant="ghost" onPress={confirmSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Mini = ({ value, label }: { value: string; label: string }) => (
  <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 10 }}>
    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{value}</Text>
    <Text style={s.small}>{label}</Text>
  </View>
);

function Row({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, { paddingVertical: 10, opacity: pressed ? 0.6 : 1 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{title}</Text>
        <Text style={s.small}>{sub}</Text>
      </View>
      <Icon name="next" size={22} color={colors.muted} />
    </Pressable>
  );
}

function ContactForm({ initial, busy, onSave, onCancel }: { initial?: EmergencyContact; busy: boolean; onSave: (v: { name: string; phone: string; email?: string; relation?: string }) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '', relation: initial?.relation ?? '' });
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
      <Field label="Name" value={v.name} onChangeText={(name) => setV({ ...v, name })} />
      <Field label="Phone" value={v.phone} onChangeText={(phone) => setV({ ...v, phone })} keyboardType="phone-pad" placeholder="+91 98765 43210" />
      <Field label="Email (for the trip link)" value={v.email} onChangeText={(email) => setV({ ...v, email })} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Relation (optional)" value={v.relation} onChangeText={(relation) => setV({ ...v, relation })} placeholder="Sister, friend…" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={onCancel} />
        <Button
          small
          label="Save"
          style={{ flex: 1 }}
          loading={busy}
          disabled={!v.name.trim() || v.phone.trim().length < 7}
          onPress={() => onSave({ name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() || undefined, relation: v.relation.trim() || undefined })}
        />
      </View>
    </View>
  );
}

/** Prove the work email with a 6-digit code (GET/POST /me/email…), same as the web account page. */
function EmailCard({ state, onVerified }: { state: EmailState; onVerified: () => Promise<unknown> }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();

  const send = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      await api('POST', '/me/email/verify/send');
      setSent(true);
      setCode('');
      setMsg({ tone: 'ok', text: `We emailed a 6-digit code to ${state.email}. It expires in a few minutes.` });
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      await api('POST', '/me/email/verify', { code });
      setSent(false);
      await onVerified();
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>Email</Label>
        <Badge tone={state.verified ? 'success' : 'warning'}>{state.verified ? 'verified' : 'not verified'}</Badge>
      </View>
      <Text style={s.strong}>{state.email}</Text>
      {state.verified ? (
        <Text style={s.small}>Your company can trust this account is really yours{state.verifiedAt ? ` (verified ${new Date(state.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}.</Text>
      ) : (
        <>
          <Text style={s.small}>Verify your email so your company knows this account is really yours. We email you a 6-digit code.</Text>
          {sent ? (
            <>
              <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} placeholder="123456" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button small variant="ghost" label="New code" style={{ flex: 1 }} disabled={busy} onPress={send} />
                <Button small label="Verify email" style={{ flex: 1 }} loading={busy} disabled={code.length !== 6} onPress={verify} />
              </View>
            </>
          ) : (
            <Button small label="Send verification code" loading={busy} onPress={send} />
          )}
        </>
      )}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </Card>
  );
}

/** Set or change the password (POST /me/password). The current password is only needed if one is set. */
function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();

  const save = async () => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api('POST', '/me/password', { currentPassword: current || undefined, newPassword: next });
      setCurrent('');
      setNext('');
      setOpen(false);
      setMsg({ tone: 'ok', text: 'Password updated.' });
    } catch (e) {
      if (e instanceof RequestError) setFields(e.fields ?? {});
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>Password</Label>
        {!open ? <Button small variant="ghost" label="Change" onPress={() => (setOpen(true), setMsg(undefined))} /> : null}
      </View>
      <Text style={s.small}>Optional. You can always sign in with an email code instead.</Text>
      {open ? (
        <>
          <Field label="Current password (leave empty if you never set one)" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" error={fields.currentPassword} />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={fields.newPassword} />
          <Text style={s.small}>At least 8 characters with a letter and a number.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => (setOpen(false), setFields({}), setMsg(undefined))} />
            <Button small label="Save password" style={{ flex: 1 }} loading={busy} disabled={!next} onPress={save} />
          </View>
        </>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </Card>
  );
}
