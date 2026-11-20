import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CLASSES_FOR, DRIVER_STEPS, LICENCE_CLASSES, LICENCE_CLASS_LABEL, type DriverStepName, type LicenceClass } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText, RequestError } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { isIsoDate, latestOf, mainVehicle, STEP_INFO, uploadDocument, type DriverDocument, type DriverSignup, type DriverVehicle } from '@/lib/driver-signup';
import { useData } from '@/lib/hooks';
import { pick, type Picked } from '@/lib/photo';
import type { MyProfile } from '@/lib/types';
import { CheckNotes, DocPhoto } from '@/components/doc-photo';
import { Icon } from '@/components/icons';
import { Avatar, BackButton, Badge, Button, Card, Chip, Field, Label, Loading, Notice, s, Switch } from '@/components/ui';

/** One step of becoming a driver (opened from the checklist). Each step saves on its own and goes back. */
export default function DriverStepScreen() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const { data: profile, reload, error } = useData(() => api<DriverSignup | null>('GET', '/driver/profile'), []);
  if (!step || !(DRIVER_STEPS as readonly string[]).includes(step)) return <Redirect href="/driver-setup" />;
  const key = step as DriverStepName;
  const info = STEP_INFO[key];
  const current = profile?.checklist.find((x) => x.key === key);
  const vehicle = profile ? mainVehicle(profile.vehicles) : undefined;
  const needsVehicle = ['RC', 'INSURANCE', 'VEHICLE_PHOTOS'].includes(key) && !vehicle;
  const done = () => (router.canGoBack() ? router.back() : router.replace('/driver-setup'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={[s.h2, { flex: 1 }]}>{info.title}</Text>
          </View>
          {error && !profile ? <Notice tone="error">{errText(error)}</Notice> : null}
          {profile === undefined && !error ? <Loading /> : null}
          {profile === null ? <Notice tone="info">Open “Become a driver” first.</Notice> : null}
          {current?.status === 'NEEDS_ATTENTION' && current.note ? <Notice tone="error">{current.note}</Notice> : null}
          {current?.status === 'IN_REVIEW' ? <Notice tone="info">This is with HR now. You can still replace it below.</Notice> : null}
          {needsVehicle ? (
            <>
              <Notice tone="info">Add your vehicle details first.</Notice>
              <Button label="Add vehicle details" onPress={() => router.replace({ pathname: '/driver-step/[step]', params: { step: 'VEHICLE' } })} />
            </>
          ) : profile ? (
            <>
              {key === 'PHOTO' ? <PhotoStep onDone={done} /> : null}
              {key === 'LICENCE' ? <LicenceStep profile={profile} onDone={done} /> : null}
              {key === 'VEHICLE' ? <VehicleStep vehicle={vehicle} onDone={done} /> : null}
              {key === 'RC' && vehicle ? <PaperStep kind="VEHICLE_RC" profile={profile} vehicle={vehicle} onDone={done} /> : null}
              {key === 'INSURANCE' && vehicle ? <PaperStep kind="VEHICLE_INSURANCE" profile={profile} vehicle={vehicle} onDone={done} /> : null}
              {key === 'VEHICLE_PHOTOS' && vehicle ? <VehiclePhotosStep profile={profile} vehicle={vehicle} onChanged={reload} onDone={done} /> : null}
              {key === 'GUIDELINES' ? <GuidelinesStep profile={profile} onDone={done} /> : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Shows what is on file for a document: number, expiry, HR status and the records check. */
function OnFile({ doc }: { doc?: DriverDocument }) {
  if (!doc) return null;
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.strong, { flex: 1 }]}>On file{doc.number ? ` · ${doc.number}` : ''}</Text>
        <Badge tone={doc.status === 'APPROVED' ? 'success' : doc.status === 'PENDING' ? 'warning' : 'danger'}>{doc.status === 'PENDING' ? 'with HR' : doc.status.toLowerCase()}</Badge>
      </View>
      {doc.expiresAt ? <Text style={s.small}>Valid till {doc.expiresAt}{doc.expired ? ' · expired' : doc.expiringSoon ? ' · expires soon' : ''}</Text> : null}
      {doc.check ? (
        <View style={{ gap: 4 }}>
          <Text style={[s.small, { fontWeight: '700', color: colors.ink }]}>Government records check</Text>
          <CheckNotes notes={doc.check.notes} />
        </View>
      ) : null}
    </Card>
  );
}

/** After an upload: show the records check, then go back to the checklist. */
function afterUpload(doc: DriverDocument, onDone: () => void) {
  const notes = doc.check?.notes.map((n) => `${n.startsWith('✓') ? '✓' : n.startsWith('✗') ? '✗' : '!'} ${n.slice(2)}`).join('\n');
  if (doc.check?.status === 'FAILED') {
    Alert.alert('Please check this', `${notes}\n\nFix the number or upload again. HR will also look at it.`, [{ text: 'OK' }]);
    return;
  }
  if (notes && doc.check?.status !== 'UNAVAILABLE') Alert.alert('Uploaded', notes, [{ text: 'OK', onPress: onDone }]);
  else onDone();
}

// ── Profile photo (Uber's rules) ──

function PhotoStep({ onDone }: { onDone: () => void }) {
  const { data: me } = useData(() => api<MyProfile>('GET', '/me/profile'), []);
  const [busy, setBusy] = useState(false);
  const upload = async (camera: boolean) => {
    const file = await pick(camera);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Alert.alert('Choose a JPG, PNG or WebP photo.');
    setBusy(true);
    try {
      const blob = await (await fetch(file.uri)).blob();
      if (blob.size > 5 * 1024 * 1024) return Alert.alert('The photo must be under 5 MB.');
      const slot = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>('POST', '/me/photo/upload-url', { contentType: file.type });
      const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: blob });
      if (!put.ok) throw new Error('upload');
      await api('PUT', '/me/photo', { key: slot.key });
      onDone();
    } catch (e) {
      Alert.alert('Could not upload', errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card style={{ alignItems: 'center', gap: 12 }}>
        {me?.photoUrl ? <Image source={{ uri: me.photoUrl }} style={{ width: 120, height: 120, borderRadius: 60 }} accessibilityLabel="Your photo" /> : <Avatar name={me?.name ?? '?'} size={120} tone="ink" />}
        <Text style={s.small}>{me?.photoUrl ? 'This photo is on your profile.' : 'No photo yet.'}</Text>
      </Card>
      <Card style={{ gap: 8 }}>
        <Label>A good photo</Label>
        {['Your face and the top of your shoulders, facing the camera', 'Good light, not blurry, only you in the picture', 'No sunglasses or hats (glasses and religious wear are fine)', 'Not a photo of your ID card'].map((t) => (
          <Text key={t} style={s.small}>
            • {t}
          </Text>
        ))}
      </Card>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Platform.OS !== 'web' ? <Button label="Take a selfie" style={{ flex: 1 }} loading={busy} onPress={() => upload(true)} /> : null}
        <Button label="Choose photo" variant="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => upload(false)} />
      </View>
      {me?.photoUrl ? <Button label="Keep this photo" variant="soft" onPress={onDone} /> : null}
    </>
  );
}

// ── Driving licence: both sides, number, expiry, date of birth, classes ──

function LicenceStep({ profile, onDone }: { profile: DriverSignup; onDone: () => void }) {
  const doc = latestOf(profile.documents, 'DRIVING_LICENSE');
  const types = [...new Set(profile.vehicles.map((v) => v.type))];
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [dob, setDob] = useState('');
  const [classes, setClasses] = useState<LicenceClass[]>(doc?.vehicleClasses.length ? (doc.vehicleClasses as LicenceClass[]) : types.includes('BIKE') && !types.includes('CAR') ? ['MCWG'] : ['LMV']);
  const [front, setFront] = useState<Picked | null>(null);
  const [back, setBack] = useState<Picked | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const covers = types.every((t) => CLASSES_FOR[t].some((c) => classes.includes(c)));

  const send = async () => {
    if (!front || !back) return;
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      const d = await uploadDocument({ kind: 'DRIVING_LICENSE', number: number.replace(/\s/g, '').toUpperCase(), expiresAt: expiry, dateOfBirth: dob, vehicleClasses: classes }, front, back);
      afterUpload(d, onDone);
    } catch (e) {
      if (e instanceof RequestError && e.fields) setFields(e.fields);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <OnFile doc={doc} />
      <Card style={{ gap: 12 }}>
        <Label>{doc ? 'Upload a new licence' : 'Your licence'}</Label>
        <Field label="Licence number" value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder="KA0120190012345" error={fields.number} />
        <Field label="Valid till (YYYY-MM-DD)" value={expiry} onChangeText={setExpiry} placeholder="2035-06-30" keyboardType="numbers-and-punctuation" maxLength={10} error={fields.expiresAt} />
        <Field label="Your date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="1994-08-21" keyboardType="numbers-and-punctuation" maxLength={10} error={fields.dateOfBirth} />
        <Text style={s.small}>Needed to check the licence with the RTO. Not shown to anyone.</Text>
        <Text style={s.label}>What your licence covers</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LICENCE_CLASSES.map((c) => (
            <Chip key={c} tone="lime" label={LICENCE_CLASS_LABEL[c]} selected={classes.includes(c)} onPress={() => setClasses((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} />
          ))}
        </View>
        {fields.vehicleClasses ? <Text style={s.error}>{fields.vehicleClasses}</Text> : null}
        {!covers ? <Notice tone="error">Your licence must cover your vehicle ({types.map((t) => (t === 'CAR' ? 'LMV for a car' : 'MCWG or MCWOG for a bike')).join(', ')}).</Notice> : null}
        <DocPhoto label="Front side" hint="All four corners visible, no glare, text readable." value={front} onChange={setFront} />
        <DocPhoto label="Back side" hint="Uber-style tip: upload the licence first; it speeds up the check of your other papers." value={back} onChange={setBack} />
        {fields.back ? <Text style={s.error}>{fields.back}</Text> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button label="Upload licence" loading={busy} disabled={!front || !back || number.trim().length < 6 || !isIsoDate(expiry) || !isIsoDate(dob) || !classes.length} onPress={send} />
      </Card>
    </>
  );
}

// ── Vehicle details ──

function VehicleStep({ vehicle, onDone }: { vehicle?: DriverVehicle; onDone: () => void }) {
  const [v, setV] = useState({
    type: vehicle?.type ?? ('CAR' as DriverVehicle['type']),
    carType: (vehicle?.carType ?? 'SEDAN') as 'HATCHBACK' | 'SEDAN' | 'SUV',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    color: vehicle?.color ?? '',
    plateNumber: vehicle?.plateNumber ?? '',
    seatCapacity: vehicle?.seatCapacity ?? 3,
    hasAc: vehicle?.hasAc ?? true,
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const car = v.type === 'CAR';
  const save = async () => {
    setBusy(true);
    setError(undefined);
    setFields({});
    const body = {
      type: v.type,
      ...(car ? { carType: v.carType } : {}),
      make: v.make.trim(),
      model: v.model.trim(),
      color: v.color.trim(),
      plateNumber: v.plateNumber.trim(),
      seatCapacity: car ? v.seatCapacity : 1,
      hasAc: car ? v.hasAc : false,
      isDefault: true,
    };
    try {
      if (vehicle) await api('PATCH', `/driver/vehicles/${vehicle.id}`, body);
      else await api('POST', '/driver/vehicles', body);
      onDone();
    } catch (e) {
      if (e instanceof RequestError && e.fields) setFields(e.fields);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Car" selected={car} onPress={() => setV({ ...v, type: 'CAR' })} />
        <Chip label="Bike" selected={!car} onPress={() => setV({ ...v, type: 'BIKE' })} />
      </View>
      {car ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['HATCHBACK', 'SEDAN', 'SUV'] as const).map((t) => (
            <Chip key={t} tone="lime" label={t === 'SUV' ? 'SUV' : t[0] + t.slice(1).toLowerCase()} selected={v.carType === t} onPress={() => setV({ ...v, carType: t })} />
          ))}
        </View>
      ) : null}
      <Field label="Make" value={v.make} onChangeText={(make) => setV({ ...v, make })} placeholder="Honda" error={fields.make} />
      <Field label="Model" value={v.model} onChangeText={(model) => setV({ ...v, model })} placeholder="City" error={fields.model} />
      <Field label="Colour" value={v.color} onChangeText={(color) => setV({ ...v, color })} placeholder="White" error={fields.color} />
      <Field label="Number plate" value={v.plateNumber} onChangeText={(plateNumber) => setV({ ...v, plateNumber: plateNumber.toUpperCase() })} placeholder="KA 01 AB 1234" autoCapitalize="characters" error={fields.plateNumber} />
      {car ? (
        <>
          <Label>Passenger seats</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: v.seatCapacity === n }} onPress={() => setV({ ...v, seatCapacity: n })} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: v.seatCapacity === n ? colors.ink : colors.white, borderWidth: 1.5, borderColor: v.seatCapacity === n ? colors.ink : colors.lineStrong }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: v.seatCapacity === n ? colors.white : colors.ink }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.strong}>Air conditioning</Text>
            <Switch label="Air conditioning" value={v.hasAc} onChange={(hasAc) => setV({ ...v, hasAc })} />
          </View>
        </>
      ) : null}
      {vehicle ? <Text style={s.small}>Changing the number plate needs a new RC, insurance and photos.</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={vehicle ? 'Save changes' : 'Save vehicle'} loading={busy} disabled={v.make.trim().length < 2 || !v.model.trim() || v.color.trim().length < 3 || v.plateNumber.trim().length < 6} onPress={save} />
    </Card>
  );
}

// ── RC and insurance ──

function PaperStep({ kind, profile, vehicle, onDone }: { kind: 'VEHICLE_RC' | 'VEHICLE_INSURANCE'; profile: DriverSignup; vehicle: DriverVehicle; onDone: () => void }) {
  const rc = kind === 'VEHICLE_RC';
  const doc = latestOf(profile.documents, kind, vehicle.id);
  const [number, setNumber] = useState(rc ? vehicle.plateNumber.replace(/\s/g, '') : '');
  const [expiry, setExpiry] = useState('');
  const [front, setFront] = useState<Picked | null>(null);
  const [back, setBack] = useState<Picked | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    if (!front) return;
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      const d = await uploadDocument({ kind, number: number.toUpperCase(), expiresAt: expiry, vehicleId: vehicle.id }, front, rc ? back : null);
      afterUpload(d, onDone);
    } catch (e) {
      if (e instanceof RequestError && e.fields) setFields(e.fields);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="car" size={24} />
        <Text style={[s.strong, { flex: 1 }]}>{vehicle.color} {vehicle.make} {vehicle.model} · {vehicle.plateNumber}</Text>
      </Card>
      <OnFile doc={doc} />
      <Card style={{ gap: 12 }}>
        <Label>{doc ? 'Upload a new one' : rc ? 'Your RC' : 'Your insurance policy'}</Label>
        <Field label={rc ? 'Registration number' : 'Policy number'} value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder={rc ? 'KA01AB1234' : 'OG-25-1234-5678-0000001'} error={fields.number} />
        <Field label="Valid till (YYYY-MM-DD)" value={expiry} onChangeText={setExpiry} placeholder={rc ? '2038-03-31' : '2027-03-31'} keyboardType="numbers-and-punctuation" maxLength={10} error={fields.expiresAt} />
        <DocPhoto label={rc ? 'Front side' : 'Policy page with your vehicle number'} hint={rc ? 'Smart-card RC or the paper RC. All corners visible.' : 'The page that shows the policy number, vehicle number and dates.'} value={front} onChange={setFront} />
        {rc ? <DocPhoto label="Back side (smart-card RC)" hint="Skip if your RC is a single page." value={back} onChange={setBack} /> : null}
        {!rc ? <Text style={s.small}>We check the insurance with government records (Vahan) when that is switched on for your company.</Text> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button label={rc ? 'Upload RC' : 'Upload insurance'} loading={busy} disabled={!front || number.trim().length < 4 || !isIsoDate(expiry)} onPress={send} />
      </Card>
    </>
  );
}

// ── Vehicle photos (instead of Uber's in-person inspection) ──

const PHOTO_SLOTS = [
  { kind: 'VEHICLE_PHOTO_FRONT', label: 'Front, number plate readable', hint: 'Stand 2–3 metres in front of the vehicle.' },
  { kind: 'VEHICLE_PHOTO_SIDE', label: 'Side, whole vehicle', hint: 'From the left or right, in daylight.' },
  { kind: 'VEHICLE_PHOTO_INSIDE', label: 'Inside, seats visible', hint: 'From the back door, so riders see the seats.' },
] as const;

function VehiclePhotosStep({ profile, vehicle, onChanged, onDone }: { profile: DriverSignup; vehicle: DriverVehicle; onChanged: () => Promise<unknown>; onDone: () => void }) {
  const [picked, setPicked] = useState<Record<string, Picked | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const send = async (kind: (typeof PHOTO_SLOTS)[number]['kind']) => {
    const file = picked[kind];
    if (!file) return;
    setBusy(kind);
    setError(undefined);
    try {
      await uploadDocument({ kind, vehicleId: vehicle.id }, file);
      setPicked((p) => ({ ...p, [kind]: null }));
      await onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };
  const allIn = PHOTO_SLOTS.every((x) => latestOf(profile.documents, x.kind, vehicle.id));
  return (
    <>
      <Text style={s.small}>Three photos of {vehicle.plateNumber} let HR check the vehicle without an inspection visit.</Text>
      {PHOTO_SLOTS.map((x) => {
        const doc = latestOf(profile.documents, x.kind, vehicle.id);
        return (
          <Card key={x.kind} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.strong, { flex: 1 }]}>{x.label}</Text>
              {doc ? <Badge tone={doc.status === 'APPROVED' ? 'success' : doc.status === 'PENDING' ? 'warning' : 'danger'}>{doc.status === 'PENDING' ? 'uploaded' : doc.status.toLowerCase()}</Badge> : <Badge tone="neutral">to do</Badge>}
            </View>
            {doc?.status === 'REJECTED' && doc.rejectReason ? <Notice tone="error">HR: “{doc.rejectReason}”</Notice> : null}
            <DocPhoto label={doc ? 'Replace photo' : 'Photo'} hint={x.hint} value={picked[x.kind] ?? null} onChange={(p) => setPicked((v) => ({ ...v, [x.kind]: p }))} />
            {picked[x.kind] ? <Button small label="Upload" loading={busy === x.kind} disabled={!!busy && busy !== x.kind} onPress={() => send(x.kind)} /> : null}
          </Card>
        );
      })}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={allIn ? 'Done' : 'Back to checklist'} variant={allIn ? 'primary' : 'ghost'} onPress={onDone} />
    </>
  );
}

// ── Safety basics and the driver guidelines ──

const SAFETY = [
  { title: 'Check the PIN', text: 'Every rider has a 4-digit PIN. Ask for it before they get in; the ride starts only with the right PIN.' },
  { title: 'SOS is one tap away', text: "If something feels wrong, press SOS in the trip screen. Your company's admins are alerted at once with your location. In an emergency, call 112 first." },
  { title: 'Respect women-only rides', text: 'If you offer women-only rides, only women riders can book them. Never pressure anyone about a seat.' },
  { title: 'Costs are shared, not charged', text: 'RYDO does not take payments. Any cost-share figure is an estimate to agree together. No cash demands, no surge.' },
  { title: 'Drive safely and on time', text: 'Valid licence, insurance and a roadworthy vehicle, always. No phone while driving. Late cancellations lower your reliability score.' },
];

function GuidelinesStep({ profile, onDone }: { profile: DriverSignup; onDone: () => void }) {
  const [agree, setAgree] = useState(!!profile.guidelinesAcceptedAt);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await api('POST', '/driver/guidelines');
      onDone();
    } catch (e) {
      Alert.alert('Could not save', errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {SAFETY.map((x, i) => (
        <Card key={x.title} style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.lime, fontWeight: '800' }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.strong}>{x.title}</Text>
            <Text style={s.small}>{x.text}</Text>
          </View>
        </Card>
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'terms' } })}>
        <Text style={[s.small, { textDecorationLine: 'underline', color: colors.ink, fontWeight: '700' }]}>Read the full terms of use</Text>
      </Pressable>
      {profile.guidelinesAcceptedAt ? (
        <Notice tone="ok">You agreed on {new Date(profile.guidelinesAcceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</Notice>
      ) : (
        <>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: agree ? colors.ink : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {agree ? <Icon name="check" size={14} color={colors.lime} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink }}>I have read the safety basics and agree to follow the RYDO driver guidelines.</Text>
          </Pressable>
          <Button label="I agree" loading={busy} disabled={!agree} onPress={accept} />
        </>
      )}
    </>
  );
}
