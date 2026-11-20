import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ID_PROOF_LABEL, ORG_ROLES, type OrgRoleName } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { api, errText } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Member } from '@/lib/types';
import { ManageScreen } from '@/components/manage-screen';
import { Select } from '@/components/select';
import { Avatar, Badge, Button, Card, Chip, ChipRow, Empty, Label, Loading, Notice, s } from '@/components/ui';

const FILTERS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: '', label: 'Everyone' },
] as const;
const ROLE_LABEL: Record<OrgRoleName, string> = { ORG_ADMIN: 'Org Admin', HR_ADMIN: 'HR Admin', OPS_ADMIN: 'Ops Admin', RIDER: 'Rider', DRIVER: 'Driver' };

interface Department {
  id: string;
  name: string;
}

/** All employees (web Employees page): filter, search, approve, department, roles, suspend and reactivate. */
export default function Employees() {
  const { roles, membership } = useSession();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('PENDING');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const { data, reload, error: loadError } = useData(async () => {
    const qs = [filter && `status=${filter}`, search && `q=${encodeURIComponent(search)}`].filter(Boolean).join('&');
    const [members, departments] = await Promise.all([api<Member[]>('GET', `/admin/members${qs ? `?${qs}` : ''}`), api<Department[]>('GET', '/admin/departments').catch(() => [] as Department[])]);
    return { members, departments };
  }, [filter, search]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(undefined);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ManageScreen title="Employees" sub="New sign-ups wait here until HR approves them. Approved people can book and offer rides." roles={['ORG_ADMIN', 'HR_ADMIN']} onRefresh={reload}>
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => (setFilter(f.key), setOpen(null))} />
        ))}
      </ChipRow>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSearch(query.trim())}
          returnKeyType="search"
          placeholder="Search name or email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          accessibilityLabel="Search by name or email"
          style={[s.input, { flex: 1 }]}
        />
        <Button small variant="ghost" label="Search" onPress={() => setSearch(query.trim())} />
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loadError && !data ? <Notice tone="error">{errText(loadError)}</Notice> : null}
      {!data && !loadError ? <Loading /> : null}
      {data?.members.length === 0 ? <Empty title={filter === 'PENDING' && !search ? 'No one is waiting' : 'No employees match'}>{filter === 'PENDING' && !search ? 'New sign-ups will appear here.' : undefined}</Empty> : null}
      {data?.members.map((m) => {
        const isBusy = busy === m.id;
        const isOpen = open === m.id;
        return (
          <Card key={m.id} style={{ gap: 12, opacity: isBusy ? 0.6 : 1 }}>
            <View style={s.row}>
              <Avatar name={m.name} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{m.name}</Text>
                <Text numberOfLines={2} style={s.small}>
                  {m.email}
                  {m.department ? ` · ${m.department}` : ''} · {m.roles.map((r) => ROLE_LABEL[r]).join(', ')}
                </Text>
              </View>
              {m.status !== 'PENDING' ? <Badge tone={m.status === 'ACTIVE' ? 'success' : m.status === 'SUSPENDED' ? 'warning' : 'neutral'}>{m.status.toLowerCase()}</Badge> : null}
            </View>

            {m.status === 'PENDING' && m.registration ? (
              <View style={{ gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
                <Text style={s.small}>Employee ID <Text style={s.strong}>{m.registration.employeeId}</Text> · {m.registration.designation}</Text>
                <Text style={s.small}>{m.registration.department} · {m.registration.office}</Text>
                <Text style={s.small}>Manager <Text style={s.strong}>{m.registration.managerName}</Text> ({m.registration.managerEmail})</Text>
                <Text style={s.small}>+91 {m.registration.phone} · {ID_PROOF_LABEL[m.registration.idType] ?? m.registration.idType} ending {m.registration.idLast4}</Text>
              </View>
            ) : null}

            {m.status === 'PENDING' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button small variant="ghost" label="Reject" style={{ flex: 1 }} disabled={isBusy} onPress={() => act(m.id, () => api('POST', `/admin/members/${m.id}/reject`))} />
                <Button small label="Approve" style={{ flex: 1 }} disabled={isBusy} onPress={() => act(m.id, () => api('POST', `/admin/members/${m.id}/approve`))} />
              </View>
            ) : (
              <Button small variant="ghost" label={isOpen ? 'Close' : 'Manage'} onPress={() => setOpen(isOpen ? null : m.id)} />
            )}
            {isOpen ? (
              <MemberPanel
                member={m}
                departments={data.departments}
                canEditRoles={roles.includes('ORG_ADMIN')}
                isMe={m.id === membership?.id}
                busy={isBusy}
                act={(fn) => act(m.id, fn)}
              />
            ) : null}
          </Card>
        );
      })}
    </ManageScreen>
  );
}

function MemberPanel({ member, departments, canEditRoles, isMe, busy, act }: { member: Member; departments: Department[]; canEditRoles: boolean; isMe: boolean; busy: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const [roles, setRoles] = useState<OrgRoleName[]>(member.roles);
  // Admin accounts can't ride or drive: picking an admin role drops Rider and Driver, and the other way round.
  const toggle = (r: OrgRoleName) =>
    setRoles((rs) => {
      if (rs.includes(r)) return rs.filter((x) => x !== r);
      const admin = (x: OrgRoleName) => x.endsWith('_ADMIN');
      return [...rs.filter((x) => admin(x) === admin(r)), r];
    });
  const changed = roles.length !== member.roles.length || roles.some((r) => !member.roles.includes(r));
  const suspend = () =>
    Alert.alert(`Suspend ${member.name}?`, 'Suspending removes access to RYDO at once. Ride history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => act(() => api('POST', `/admin/members/${member.id}/suspend`)) },
    ]);

  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      <Select
        label="Department"
        value={member.departmentId ?? ''}
        options={[{ value: '', label: 'No department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        onChange={(v) => act(() => api('PATCH', `/admin/members/${member.id}`, { departmentId: v || null }))}
        disabled={busy}
      />
      {canEditRoles ? (
        <View style={{ gap: 8 }}>
          <Label>Roles</Label>
          <ChipRow>
            {ORG_ROLES.map((r) => (
              <Chip key={r} label={ROLE_LABEL[r]} selected={roles.includes(r)} onPress={() => toggle(r)} />
            ))}
          </ChipRow>
          <Text style={[s.small, { fontSize: 12 }]}>Admin roles are for running the company: an admin account can't ride or drive. To carpool, they sign up with their own work email.</Text>
          {changed ? <Button small label="Save roles" disabled={busy || roles.length === 0} onPress={() => act(() => api('PATCH', `/admin/members/${member.id}/roles`, { roles }))} /> : null}
        </View>
      ) : null}
      {!isMe && (member.status === 'ACTIVE' || member.status === 'SUSPENDED') ? (
        <View style={{ gap: 8 }}>
          <Text style={s.small}>{member.status === 'ACTIVE' ? 'Suspending removes access to RYDO at once. Ride history is kept.' : 'Reactivating restores their access.'}</Text>
          {member.status === 'ACTIVE' ? (
            <Button small variant="danger" label="Suspend" disabled={busy} onPress={suspend} />
          ) : (
            <Button small label="Reactivate" disabled={busy} onPress={() => act(() => api('POST', `/admin/members/${member.id}/reactivate`))} />
          )}
        </View>
      ) : null}
    </View>
  );
}
