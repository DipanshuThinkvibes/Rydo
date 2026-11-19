import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { useData } from '@/lib/hooks';
import { appendFile, pick, type Picked } from '@/lib/photo';
import type { DriverDoc, DriverProfile, Vehicle } from '@/lib/types';
import { Icon } from '@/components/icons';
import { BackButton, Badge, Button, Card, Chip, Field, Label, Loading, Notice, s, Switch } from '@/components/ui';

type Prefs = { ac: boolean; quiet: boolean; noSmoking: boolean; musicOk: boolean; womenRidersOnly: boolean };
const PREFS: [keyof Prefs, string][] = [
  ['noSmoking', 'No smoking'],
  ['quiet', 'Quiet rides'],
  ['musicOk', 'Music is fine'],
  ['womenRidersOnly', 'Women riders only'],
];

/**
 * Become a driver on the phone: profile and preferences → vehicle → driving license and RC photos.
 * HR then checks the documents (web admin or the Admin tab) before the driver can publish rides.
 */
export default function DriverSetup() {
  const { data, reload, error } = useData(() => api<DriverProfile | null>('GET', '/driver/profile'), []);
  if (data === undefined) return error ? <Shell><Notice tone="error">{errText(error)}</Notice></Shell> : <Loading />;

  const profile = data;
  const vehicle = profile?.vehicles.find((v) => v.isDefault) ?? profile?.vehicles[0];
  const latest = (kind: DriverDoc['kind']) => profile?.documents.find((d) => d.kind === kind && (kind === 'DRIVING_LICENSE' || d.vehicleId === vehicle?.id));
  const step = !profile ? 1 : !vehicle ? 2 : 3;

  return (
    <Shell>
      <Steps step={step} />
      {profile ? <Status profile={profile} /> : null}
      {!profile ? <StartProfile onDone={reload} /> : null}
      {profile && !vehicle ? <VehicleForm onDone={reload} /> : null}
      {profile && vehicle ? (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="car" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{vehicle.make} {vehicle.model}</Text>
              <Text style={s.small}>{vehicle.color} · {vehicle.plateNumber} · {vehicle.type === 'CAR' ? `${vehicle.seatCapacity} passenger seats${vehicle.hasAc ? ' · AC' : ''}` : 'bike'}</Text>
            </View>
          </Card>
          <DocUpload kind="DRIVING_LICENSE" title="Driving license" current={latest('DRIVING_LICENSE')} onDone={reload} />
          <DocUpload kind="VEHICLE_RC" title={`Vehicle RC · ${vehicle.plateNumber}`} vehicle={vehicle} current={latest('VEHICLE_RC')} onDone={reload} />
        </>
      ) : null}
      {profile?.status === 'VERIFIED' ? <Button label="Go to Drive" variant="lime" onPress={() => router.replace('/drive')} /> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={s.h1}>Become a driver</Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Steps({ step }: { step: number }) {
  const items = ['About you', 'Vehicle', 'Documents'];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const on = n === step;
        return (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? colors.ink : on ? colors.lime : colors.lineStrong }} />
            <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on || done ? colors.ink : colors.muted }}>{n}. {label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Status({ profile }: { profile: DriverProfile }) {
  const t = {
    PENDING: { tone: 'warning' as const, badge: 'Waiting for HR', text: 'Add your vehicle and both documents. Your HR team checks them, usually within a working day.' },
    VERIFIED: { tone: 'success' as const, badge: 'Verified driver', text: 'You can publish rides now. Colleagues on your route can request seats.' },
    REJECTED: { tone: 'danger' as const, badge: 'Re-upload needed', text: 'HR asked you to upload a document again. See the reason below.' },
    EXPIRED: { tone: 'danger' as const, badge: 'Document expired', text: 'Upload the renewed document to drive again.' },
  }[profile.status];
  return (
    <Card style={{ gap: 8 }}>
      <Badge tone={t.tone}>{t.badge}</Badge>
      <Text style={s.small}>{t.text}</Text>
    </Card>
  );
}

// ── 1. Driver profile with ride preferences ──

function StartProfile({ onDone }: { onDone: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>({ ac: true, quiet: false, noSmoking: true, musicOk: true, womenRidersOnly: false });
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      await api('POST', '/driver/profile', { preferences: prefs });
      onDone();
    } catch (e) {
      Alert.alert('Could not start', errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <Text style={s.h2}>Offer your empty seats</Text>
      <Text style={s.body}>Drive colleagues who live on your route and share the running cost. You choose your rides and accept each rider.</Text>
      <Label>Your ride rules</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PREFS.map(([k, l]) => <Chip key={k} tone="lime" label={l} selected={prefs[k]} onPress={() => setPrefs({ ...prefs, [k]: !prefs[k] })} />)}
      </View>
      <Text style={s.small}>Riders see these before they request. You can change them later.</Text>
      <Button label="Continue" loading={busy} onPress={start} />
    </Card>
  );
}

// ── 2. Vehicle ──

function VehicleForm({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState({ type: 'CAR' as Vehicle['type'], carType: 'SEDAN' as 'HATCHBACK' | 'SEDAN' | 'SUV', make: '', model: '', color: '', plateNumber: '', seatCapacity: 3, hasAc: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const car = v.type === 'CAR';
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api('POST', '/driver/vehicles', {
        type: v.type,
        ...(car ? { carType: v.carType } : {}),
        make: v.make.trim(),
        model: v.model.trim(),
        color: v.color.trim(),
        plateNumber: v.plateNumber.trim(),
        seatCapacity: car ? v.seatCapacity : 1,
        hasAc: car ? v.hasAc : false,
      });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <Text style={s.h2}>Your vehicle</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Car" selected={car} onPress={() => setV({ ...v, type: 'CAR' })} />
        <Chip label="Bike" selected={!car} onPress={() => setV({ ...v, type: 'BIKE' })} />
      </View>
      {car ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['HATCHBACK', 'SEDAN', 'SUV'] as const).map((t) => <Chip key={t} tone="lime" label={t === 'SUV' ? 'SUV' : t[0] + t.slice(1).toLowerCase()} selected={v.carType === t} onPress={() => setV({ ...v, carType: t })} />)}
        </View>
      ) : null}
      <Field label="Make" value={v.make} onChangeText={(make) => setV({ ...v, make })} placeholder="Honda" />
      <Field label="Model" value={v.model} onChangeText={(model) => setV({ ...v, model })} placeholder="City" />
      <Field label="Colour" value={v.color} onChangeText={(color) => setV({ ...v, color })} placeholder="White" />
      <Field label="Number plate" value={v.plateNumber} onChangeText={(plateNumber) => setV({ ...v, plateNumber: plateNumber.toUpperCase() })} placeholder="KA 01 AB 1234" autoCapitalize="characters" />
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
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Save vehicle" loading={busy} disabled={v.make.trim().length < 2 || !v.model.trim() || v.color.trim().length < 3 || v.plateNumber.trim().length < 6} onPress={save} />
    </Card>
  );
}

// ── 3. Documents ──

/** Multipart form like the web upload: kind, number, expiresAt, vehicleId?, file. */
async function upload(kind: DriverDoc['kind'], number: string, expiresAt: string, file: Picked, vehicleId?: string) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('number', number.trim());
  form.append('expiresAt', expiresAt.trim());
  if (vehicleId) form.append('vehicleId', vehicleId);
  await appendFile(form, 'file', file);
  return api('POST', '/driver/documents', form);
}

function DocUpload({ kind, title, current, vehicle, onDone }: { kind: DriverDoc['kind']; title: string; current?: DriverDoc; vehicle?: Vehicle; onDone: () => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [redo, setRedo] = useState(false);
  const done = current && current.status !== 'REJECTED' && !redo;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry.trim());

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      await upload(kind, number, expiry, file, vehicle?.id);
      setFile(null);
      setRedo(false);
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[s.strong, { flex: 1 }]}>{title}</Text>
        {current ? (
          <Badge tone={current.status === 'APPROVED' ? 'success' : current.status === 'PENDING' ? 'warning' : 'danger'}>
            {current.status === 'PENDING' ? 'with HR' : current.status === 'APPROVED' ? 'approved' : 'rejected'}
          </Badge>
        ) : null}
      </View>
      {current?.status === 'REJECTED' && current.rejectReason ? <Notice tone="error">HR: “{current.rejectReason}”</Notice> : null}
      {done ? (
        <>
          <Text style={s.small}>No. {current!.number ?? '—'}{current!.expiresAt ? ` · valid till ${current!.expiresAt.slice(0, 10)}` : ''}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRedo(true)}>
            <Text style={[s.small, { textDecorationLine: 'underline' }]}>Upload a new one</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Field label={kind === 'DRIVING_LICENSE' ? 'License number' : 'RC number'} value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder={kind === 'DRIVING_LICENSE' ? 'KA0120190012345' : 'KA01AB1234'} />
          <Field label="Valid till (YYYY-MM-DD)" value={expiry} onChangeText={setExpiry} placeholder="2030-06-30" keyboardType="numbers-and-punctuation" maxLength={10} />
          {file ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image source={{ uri: file.uri }} style={{ width: 84, height: 60, borderRadius: 10, backgroundColor: colors.surface2 }} contentFit="cover" />
              <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{file.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setFile(null)} hitSlop={8}>
                <Icon name="close" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {Platform.OS !== 'web' ? <Button small variant="ghost" label="Take photo" style={{ flex: 1 }} onPress={() => pick(true).then((f) => f && setFile(f))} /> : null}
              <Button small variant="ghost" label="Choose photo" style={{ flex: 1 }} onPress={() => pick(false).then((f) => f && setFile(f))} />
            </View>
          )}
          <Text style={s.small}>A clear photo of the front, all four corners visible. Max 5 MB. Only HR can see it.</Text>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button label="Upload" loading={busy} disabled={!file || number.trim().length < 4 || !validDate} onPress={send} />
        </>
      )}
    </Card>
  );
}
