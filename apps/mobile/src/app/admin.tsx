import { useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ID_PROOF_LABELS, type IdProofType } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtTime, fmtWhen, isoDay, shortName } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { AdminDriver, Issue, Member, SosAlert } from '@/lib/types';
import { AccountButton } from '@/components/account-button';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Badge, Button, Empty, Label, Loading, Notice, s } from '@/components/ui';

type Tab = 'employees' | 'drivers' | 'issues';

interface Data {
  sos: SosAlert[];
  members: Member[] | null;
  drivers: AdminDriver[] | null;
  issues: Issue[] | null;
  openIssues: number | null;
  ridesToday: number | null;
  onRoad: number | null;
}

const ok = <T,>(p: Promise<T>) => p.catch(() => null);

/** Prototype screen 14: company admin on the phone. SOS first, approvals, drivers to check, open issues. */
export default function Admin() {
  const { isAdmin, roles, membership } = useSession();
  const hr = roles.includes('ORG_ADMIN') || roles.includes('HR_ADMIN');
  const [tab, setTab] = useState<Tab>(hr ? 'employees' : 'issues');
  const [refreshing, setRefreshing] = useState(false);
  const [resolving, setResolving] = useState<{ kind: 'sos' | 'issue'; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);

  const { data, reload } = useData<Data>(
    async () => {
      const [sos, members, drivers, issues, rides, live] = await Promise.all([
        ok(api<SosAlert[]>('GET', '/admin/sos')),
        hr ? ok(api<Member[]>('GET', '/admin/members?status=PENDING')) : null,
        hr ? ok(api<AdminDriver[]>('GET', '/admin/drivers?status=PENDING')) : null,
        ok(apiWithMeta<Issue[], { counts?: Record<string, number> }>('GET', '/admin/issues?status=OPEN&limit=30')),
        ok(api<unknown[]>('GET', `/admin/rides?date=${isoDay(0)}`)),
        ok(api<unknown[]>('GET', '/admin/rides/live')),
      ]);
      return {
        sos: (sos ?? []).filter((x) => x.status !== 'RESOLVED'),
        members,
        drivers,
        issues: issues?.data ?? null,
        openIssues: issues ? (issues.meta.counts?.OPEN ?? issues.data.length) : null,
        ridesToday: rides?.length ?? null,
        onRoad: live?.length ?? null,
      };
    },
    [hr],
    15_000,
  );

  if (!isAdmin) return <Redirect href="/" />;
  if (!data) return <Loading />;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await reload();
    } catch (e) {
      Alert.alert('That did not work', errText(e));
    } finally {
      setBusy(null);
    }
  };

  const roleName = roles.includes('ORG_ADMIN') ? 'Org admin' : roles.includes('HR_ADMIN') ? 'HR' : 'Ops';
  const tabs: { key: Tab; label: string; count: number | null }[] = [
    ...(hr ? [{ key: 'employees' as const, label: 'Employees', count: data.members?.length ?? null }, { key: 'drivers' as const, label: 'Drivers', count: data.drivers?.length ?? null }] : []),
    { key: 'issues', label: 'Issues', count: data.openIssues },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>Admin · {roleName}</Text>
              <Text accessibilityRole="header" style={s.h1}>{membership?.organization.name}</Text>
            </View>
            <AccountButton />
          </View>

          {data.sos.map((a) => (
            <View key={a.id} accessibilityRole="alert" style={{ backgroundColor: colors.danger, borderRadius: 22, padding: 18, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.white }} />
                <Text style={{ color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>SOS {a.status === 'ACTIVE' ? 'ACTIVE' : 'ACKNOWLEDGED'} · {fmtTime(a.createdAt)}</Text>
              </View>
              <Text style={{ color: colors.white, fontSize: 20, fontWeight: '800' }}>
                {a.byDriver ? `${shortName(a.driverName)} raised an SOS while driving` : `${shortName(a.raisedBy)} raised an SOS in ${shortName(a.driverName)}'s car`}
              </Text>
              <Text style={{ color: '#FFE4E4', fontSize: 14 }}>{a.plateNumber} · {a.from.split(',')[0]} → {a.to.split(',')[0]} · live location on the web Ops map</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {a.status === 'ACTIVE' ? (
                  <Button small variant="white" label="Acknowledge" style={{ flex: 1 }} loading={busy === `ack${a.id}`} onPress={() => act(`ack${a.id}`, () => api('POST', `/admin/sos/${a.id}/ack`))} />
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setResolving({ kind: 'sos', id: a.id })} style={{ flex: 1, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.white, fontWeight: '800' }}>Mark resolved</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {data.onRoad != null ? (
            <View style={[s.pillDark, { height: 36 }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }} />
              <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13 }}>{data.onRoad} on the road now</Text>
            </View>
          ) : null}

          {hr ? (
            <Button small variant="ghost" label="Send an announcement" onPress={() => setAnnouncing(true)} />
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile value={data.members?.length} label="To approve" />
            <Tile value={data.ridesToday} label="Rides today" />
            <Tile value={data.openIssues} label="Open issues" />
          </View>

          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.surface2 }}>
            {tabs.map((t) => (
              <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={[{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, tab === t.key && { backgroundColor: colors.white, ...s.lift }]}>
                <Text style={{ fontSize: 15, fontWeight: tab === t.key ? '800' : '600', color: tab === t.key ? colors.ink : colors.muted }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'employees' && (
            <>
              {data.members === null ? <Notice tone="error">Could not load employees.</Notice> : null}
              {data.members?.length === 0 ? <Empty title="Nobody waiting">New sign-ups from your company appear here for approval.</Empty> : null}
              {data.members?.map((m) => (
                <View key={m.id} style={{ backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 12 }}>
                  <View style={s.row}>
                    <Avatar name={m.name} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.strong}>{m.name}</Text>
                      <Text numberOfLines={1} style={s.small}>{m.email}{m.department ? ` · ${m.department}` : ''}</Text>
                    </View>
                  </View>
                  {m.employeeId ? (
                    <View style={{ gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
                      <Text style={s.small}>
                        Employee ID <Text style={{ color: colors.ink, fontWeight: '800' }}>{m.employeeId}</Text>
                        {m.phone ? <> · <Text style={{ color: colors.ink, fontWeight: '700' }}>{m.phone}</Text></> : null}
                      </Text>
                      {m.jobTitle || m.department || m.office ? <Text style={s.small}>{[m.jobTitle, m.department, m.office].filter(Boolean).join(' · ')}</Text> : null}
                      {m.managerName ? <Text style={s.small}>Manager <Text style={{ color: colors.ink, fontWeight: '700' }}>{m.managerName}</Text>{m.managerEmail ? ` · ${m.managerEmail}` : m.managerEmployeeId ? ` (${m.managerEmployeeId})` : ''}</Text> : null}
                      {m.idProofType ? (
                        <Text style={s.small}>
                          {ID_PROOF_LABELS[m.idProofType as IdProofType] ?? m.idProofType} <Text style={{ color: colors.ink, fontWeight: '700' }}>{m.idProofNumber}</Text>
                        </Text>
                      ) : null}
                      {m.hasIdProof ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => api<{ url: string }>('GET', `/admin/members/${m.id}/id-proof-url`).then((r) => Linking.openURL(r.url), (e) => Alert.alert('Could not open', errText(e)))}
                          style={{ alignSelf: 'flex-start', marginTop: 4, height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.lineStrong, justifyContent: 'center' }}
                        >
                          <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13 }}>View ID proof</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button small variant="ghost" label="Reject" style={{ flex: 1 }} disabled={!!busy} loading={busy === `r${m.id}`} onPress={() => act(`r${m.id}`, () => api('POST', `/admin/members/${m.id}/reject`))} />
                    <Button small label="Approve" style={{ flex: 1 }} disabled={!!busy} loading={busy === `a${m.id}`} onPress={() => act(`a${m.id}`, () => api('POST', `/admin/members/${m.id}/approve`))} />
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'drivers' && (
            <>
              {data.drivers?.length === 0 ? <Empty title="No documents to check">Driver licenses and RCs waiting for review appear here.</Empty> : null}
              {data.drivers?.map((d) => {
                const v = d.vehicles[0];
                return (
                  <View key={d.id} style={{ backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 12 }}>
                    <View style={s.row}>
                      <Avatar name={d.name} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.strong}>{d.name}</Text>
                        <Text numberOfLines={1} style={s.small}>{v ? `${v.color} ${v.make} ${v.model} · ${v.plateNumber}` : 'No vehicle yet'}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {d.documents.map((doc) => (
                        <Pressable
                          key={doc.id}
                          accessibilityRole="link"
                          onPress={() => api<{ url: string }>('GET', `/admin/documents/${doc.id}/view-url`).then((r) => Linking.openURL(r.url), (e) => Alert.alert('Could not open', errText(e)))}
                          style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface2, justifyContent: 'center' }}
                        >
                          <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 13 }}>View {doc.kind === 'DRIVING_LICENSE' ? 'license' : 'RC'} · {doc.status.toLowerCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Button
                      small
                      label="Verify driver"
                      disabled={!!busy || d.documents.length < 2}
                      loading={busy === `v${d.id}`}
                      onPress={() =>
                        Alert.alert(`Verify ${d.name}?`, 'Only after you have opened and checked the license and the RC.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Verify', onPress: () => act(`v${d.id}`, () => api('POST', `/admin/drivers/${d.id}/verify`)) },
                        ])
                      }
                    />
                    <Text style={s.small}>To ask for a re-upload with a reason, use the web admin (Drivers).</Text>
                  </View>
                );
              })}
            </>
          )}

          {tab === 'issues' && (
            <>
              {data.issues === null ? <Notice tone="error">Could not load issues.</Notice> : null}
              {data.issues?.length === 0 ? <Empty title="No open issues">Reports from riders and drivers appear here.</Empty> : null}
              {data.issues?.map((i) => (
                <View key={i.id} style={{ backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge tone={['UNSAFE_DRIVING', 'HARASSMENT'].includes(i.category) ? 'danger' : 'neutral'}>{i.categoryLabel}</Badge>
                    <Text style={s.small}>{fmtWhen(i.createdAt)}</Text>
                  </View>
                  <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 21 }}>{i.description}</Text>
                  <Text style={s.small}>
                    From {i.reporter?.name ?? 'a member'}
                    {i.against ? ` · about ${i.against.name}` : ''}
                    {i.assignedTo ? ` · ${i.assignedTo.name} is on it` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button small variant="ghost" label="Take it" style={{ flex: 1 }} loading={busy === `t${i.id}`} disabled={!!busy} onPress={() => act(`t${i.id}`, () => api('PATCH', `/admin/issues/${i.id}`, { status: 'IN_PROGRESS', assignToMe: true }))} />
                    <Button small label="Resolve" style={{ flex: 1 }} disabled={!!busy} onPress={() => setResolving({ kind: 'issue', id: i.id })} />
                  </View>
                </View>
              ))}
            </>
          )}
          <Label style={{ textAlign: 'center', marginTop: 8 }}>Reports, ride map and settings are on the web admin</Label>
        </ScrollView>
      </SafeAreaView>
      <TabBar active="admin" />

      <AnnounceModal
        visible={announcing}
        onClose={() => setAnnouncing(false)}
        onSend={async (v) => {
          try {
            const r = await api<{ recipients: number }>('POST', '/admin/announcements', v);
            setAnnouncing(false);
            Alert.alert('Announcement sent', `Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.`);
          } catch (e) {
            Alert.alert('Could not send', errText(e));
          }
        }}
      />
      <ResolveModal
        target={resolving}
        onClose={() => setResolving(null)}
        onSubmit={(notes) => {
          const r = resolving!;
          setResolving(null);
          act(`res${r.id}`, () => (r.kind === 'sos' ? api('POST', `/admin/sos/${r.id}/resolve`, { notes }) : api('PATCH', `/admin/issues/${r.id}`, { status: 'RESOLVED', resolution: notes })));
        }}
      />
    </View>
  );
}

function Tile({ value, label }: { value: number | null | undefined; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 2 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{value ?? '—'}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
}

/** Notes are required to close an SOS or an issue (they go to the activity log and the reporter). */
function ResolveModal({ target, onClose, onSubmit }: { target: { kind: 'sos' | 'issue' } | null; onClose: () => void; onSubmit: (notes: string) => void }) {
  const [notes, setNotes] = useState('');
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose} onShow={() => setNotes('')}>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.5)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 14 }}>
          <Text style={s.h2}>{target?.kind === 'sos' ? 'Close this SOS' : 'Resolve this issue'}</Text>
          <Text style={s.small}>{target?.kind === 'sos' ? 'What happened and what you did. Saved to the activity log.' : 'The reporter sees this answer.'}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            autoFocus
            accessibilityLabel="Notes"
            placeholder="For example: called Priya, she is safe; driver took a detour for roadworks."
            placeholderTextColor={colors.muted}
            style={{ minHeight: 110, borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, padding: 14, fontSize: 15, color: colors.ink, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={onClose} />
            <Button small label="Save" style={{ flex: 1 }} disabled={notes.trim().length < 3} onPress={() => onSubmit(notes.trim())} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Push + in-app message to everyone (or riders / drivers only), optional email too. POST /admin/announcements. */
function AnnounceModal({ visible, onClose, onSend }: { visible: boolean; onClose: () => void; onSend: (v: { title: string; body: string; audience: { roles?: ('RIDER' | 'DRIVER')[] }; email: boolean }) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [who, setWho] = useState<'ALL' | 'RIDER' | 'DRIVER'>('ALL');
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = { borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, padding: 14, fontSize: 15, color: colors.ink } as const;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => (setTitle(''), setBody(''), setWho('ALL'), setEmail(false))}>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 12 }}>
          <Text style={s.h2}>Send an announcement</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="Title" placeholderTextColor={colors.muted} accessibilityLabel="Title" style={field} />
          <TextInput value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Message" placeholderTextColor={colors.muted} accessibilityLabel="Message" style={[field, { minHeight: 100, textAlignVertical: 'top' }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['ALL', 'Everyone'],
                ['RIDER', 'Riders'],
                ['DRIVER', 'Drivers'],
              ] as const
            ).map(([k, l]) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: who === k }} onPress={() => setWho(k)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: who === k ? colors.ink : colors.surface2 }}>
                <Text style={{ fontWeight: '700', color: who === k ? colors.white : colors.ink }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: email }} onPress={() => setEmail(!email)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: email ? colors.ink : colors.white, alignItems: 'center', justifyContent: 'center' }}>
              {email ? <Text style={{ color: colors.lime, fontWeight: '800' }}>✓</Text> : null}
            </View>
            <Text style={s.strong}>Also send by email</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={onClose} />
            <Button
              small
              label="Send"
              style={{ flex: 1 }}
              loading={busy}
              disabled={title.trim().length < 3 || body.trim().length < 3}
              onPress={async () => {
                setBusy(true);
                await onSend({ title: title.trim(), body: body.trim(), audience: who === 'ALL' ? {} : { roles: [who] }, email });
                setBusy(false);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
