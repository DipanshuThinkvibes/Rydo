import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { DOCUMENT_LABEL, type DocumentKindName } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText, RequestError } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { latestOf, mainVehicle, STATUS_LOOK, STEP_INFO, type DriverDocument, type DriverForReview } from '@/lib/driver-signup';
import { CheckNotes } from './doc-photo';
import { Avatar, Badge, Button, Chip, Field, s } from './ui';

const ORDER: DocumentKindName[] = ['DRIVING_LICENSE', 'VEHICLE_RC', 'VEHICLE_INSURANCE', 'VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE'];
const CHECK_LOOK = { PASSED: { label: 'records match', tone: 'success' }, WARNING: { label: 'check the notes', tone: 'warning' }, FAILED: { label: "records don't match", tone: 'danger' }, UNAVAILABLE: { label: 'not checked', tone: 'neutral' } } as const;

/**
 * HR's review of one driver on the phone (Admin → Drivers): the checklist, every document with its
 * government-records check, links to the photos, "Ask to upload again" and "Verify driver".
 */
export function DriverReviewCard({ driver, onChanged }: { driver: DriverForReview; onChanged: () => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const vehicle = mainVehicle(driver.vehicles);
  const docs = ORDER.map((k) => latestOf(driver.documents, k, vehicle?.id)).filter((d): d is DriverDocument => !!d);
  const missing = driver.checklist.filter((x) => x.status === 'TODO');

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      Alert.alert('That did not work', errText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const open = (doc: DriverDocument) =>
    api<{ url: string; backUrl: string | null }>('GET', `/admin/documents/${doc.id}/view-url`).then(
      (r) =>
        r.backUrl
          ? Alert.alert(DOCUMENT_LABEL[doc.kind], 'Which side?', [
              { text: 'Front', onPress: () => Linking.openURL(r.url) },
              { text: 'Back', onPress: () => Linking.openURL(r.backUrl!) },
              { text: 'Cancel', style: 'cancel' },
            ])
          : Linking.openURL(r.url),
      (e) => Alert.alert('Could not open', errText(e)),
    );

  const verify = async (ignoreFailedChecks = false) => {
    setBusy('verify');
    try {
      await api('POST', `/admin/drivers/${driver.id}/verify`, { ignoreFailedChecks });
      await onChanged();
      Alert.alert('Driver verified', `${driver.name} can publish rides now.`);
    } catch (e) {
      if (e instanceof RequestError && e.code === 'CHECK_FAILED') {
        Alert.alert('Records did not match', `${e.message}`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify anyway', style: 'destructive', onPress: () => verify(true) },
        ]);
      } else Alert.alert('Not yet', errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 12 }}>
      <View style={s.row}>
        <Avatar name={driver.name} />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>{driver.name}</Text>
          <Text numberOfLines={1} style={s.small}>{vehicle ? `${vehicle.color} ${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}` : 'No vehicle yet'}</Text>
        </View>
        {driver.hasExpiryWarning ? <Badge tone="warning">expiry</Badge> : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {driver.checklist.map((x) => (
          <Badge key={x.key} tone={STATUS_LOOK[x.status].tone}>{`${STEP_INFO[x.key].title.split(' (')[0]} · ${STATUS_LOOK[x.status].label}`}</Badge>
        ))}
      </View>

      {docs.map((d) => (
        <View key={d.id} style={{ gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.strong, { flex: 1 }]}>{DOCUMENT_LABEL[d.kind]}</Text>
            {d.check ? <Badge tone={CHECK_LOOK[d.check.status].tone}>{CHECK_LOOK[d.check.status].label}</Badge> : null}
            <Badge tone={d.status === 'APPROVED' ? 'success' : d.status === 'PENDING' ? 'warning' : 'danger'}>{d.status.toLowerCase()}</Badge>
          </View>
          {d.number || d.expiresAt ? (
            <Text style={s.small}>
              {d.number ? `No. ${d.number}` : ''}
              {d.expiresAt ? `${d.number ? ' · ' : ''}valid till ${d.expiresAt}${d.expired ? ' (expired)' : d.expiringSoon ? ' (soon)' : ''}` : ''}
              {d.vehicleClasses.length ? ` · ${d.vehicleClasses.join(', ')}` : ''}
            </Text>
          ) : null}
          {d.check ? <CheckNotes notes={d.check.notes} /> : null}
          {d.rejectReason && d.status === 'REJECTED' ? <Text style={[s.small, { color: colors.danger }]}>Asked to re-upload: {d.rejectReason}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="link" onPress={() => open(d)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.lineStrong, justifyContent: 'center' }}>
              <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13 }}>{d.hasBack ? 'View both sides' : 'View'}</Text>
            </Pressable>
            {d.check ? (
              <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => run(`c${d.id}`, () => api('POST', `/admin/documents/${d.id}/check`))} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', opacity: busy === `c${d.id}` ? 0.5 : 1 }}>
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13, textDecorationLine: 'underline' }}>{busy === `c${d.id}` ? 'Checking…' : 'Check again'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      {!driver.hasPhoto || !driver.guidelinesAcceptedAt ? (
        <Text style={s.small}>
          {[!driver.hasPhoto && 'No profile photo yet', !driver.guidelinesAcceptedAt && 'Guidelines not accepted yet'].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      {asking ? (
        <Reupload docs={docs} busy={busy === 'reupload'} onCancel={() => setAsking(false)} onSend={(documentIds, reason) => run('reupload', () => api('POST', `/admin/drivers/${driver.id}/request-reupload`, { documentIds, reason })).then((ok) => ok && setAsking(false))} />
      ) : (
        <Button small variant="ghost" label="Ask to upload again" disabled={!docs.length || !!busy} onPress={() => setAsking(true)} />
      )}
      <Button
        small
        label={missing.length ? `${missing.length} ${missing.length === 1 ? 'step' : 'steps'} still missing` : 'Verify driver'}
        disabled={!!busy || missing.length > 0}
        loading={busy === 'verify'}
        onPress={() =>
          Alert.alert(`Verify ${driver.name}?`, 'Only after you have opened and checked every document and photo.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Verify', onPress: () => verify(false) },
          ])
        }
      />
    </View>
  );
}

function Reupload({ docs, busy, onSend, onCancel }: { docs: DriverDocument[]; busy: boolean; onSend: (documentIds: string[], reason: string) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
      <Text style={s.strong}>Which documents need a new upload?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {docs.map((d) => (
          <Chip key={d.id} label={DOCUMENT_LABEL[d.kind]} selected={picked.includes(d.id)} onPress={() => setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))} />
        ))}
      </View>
      <Field label="Reason (the driver sees this)" value={reason} onChangeText={setReason} placeholder="The photo is blurry" maxLength={300} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={onCancel} />
        <Button small label="Send request" style={{ flex: 1 }} loading={busy} disabled={!picked.length || reason.trim().length < 3} onPress={() => onSend(picked, reason.trim())} />
      </View>
    </View>
  );
}
