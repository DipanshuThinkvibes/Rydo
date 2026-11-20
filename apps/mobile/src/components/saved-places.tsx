import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Place, SavedPlace } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { officePlace } from '@/lib/places';
import type { Office } from '@/lib/types';
import { Icon } from './icons';
import { PlacePicker, type Saved } from './place-picker';
import { Badge, Button, Label, s, SwitchRow } from './ui';

type Kind = 'HOME' | 'OFFICE';

/** First part of an address, used as the default name ("27th Main, HSR Layout, …" → "27th Main"). */
const shortLabel = (address: string) => address.split(',')[0].trim().slice(0, 60) || address.slice(0, 60);

/**
 * Home | Office tabs on the Home screen: search an address and save it, keep several, edit, delete,
 * and choose the default one (used for "Find rides" and the commute planner).
 */
export function SavedPlaces({
  places,
  offices,
  onChange,
  kind,
  selectedId,
  onSelect,
}: {
  places: SavedPlace[];
  offices: Office[];
  onChange: () => void;
  /** Fixed kind: no Home | Office tabs (the To office / To home screens). */
  kind?: Kind;
  /** Highlighted address (the one this trip uses). */
  selectedId?: string | null;
  /** Tap an address to use it for this trip; a new or company address is passed too once saved. */
  onSelect?: (p: SavedPlace) => void;
}) {
  const [tabState, setTab] = useState<Kind>(kind ?? 'HOME');
  const tab = kind ?? tabState;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavedPlace | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = places.filter((p) => p.label === tab);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChange();
    } catch (e) {
      Alert.alert('That did not work', errText(e));
    } finally {
      setBusy(null);
    }
  };

  const add = (p: Place, name?: string) =>
    run('add', async () => {
      const saved = await api<SavedPlace>('POST', '/me/places', { label: tab, name: name ?? shortLabel(p.label), address: p.label, lat: p.lat, lng: p.lng });
      onSelect?.(saved);
    });

  const remove = (p: SavedPlace) =>
    Alert.alert(`Delete ${p.name}?`, p.isDefault ? 'This is your default. The next saved address becomes the default.' : undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(`d${p.id}`, () => api('DELETE', `/me/places/${p.id}`)) },
    ]);

  // Company offices the person has not saved yet: one tap to add.
  const suggestions = tab === 'OFFICE' ? offices.filter((o) => !mine.some((p) => Math.abs(p.lat - o.lat) < 0.0005 && Math.abs(p.lng - o.lng) < 0.0005)) : [];
  const noun = tab === 'HOME' ? 'home' : 'office';

  return (
    <View style={{ gap: 12 }}>
      {!kind ? (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.surface2 }}>
        {(['HOME', 'OFFICE'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[{ flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, tab === k && { backgroundColor: colors.white, ...s.lift }]}>
            <Icon name={k === 'HOME' ? 'house' : 'building'} size={18} color={tab === k ? colors.ink : colors.muted} />
            <Text style={{ fontSize: 15, fontWeight: tab === k ? '800' : '600', color: tab === k ? colors.ink : colors.muted }}>{k === 'HOME' ? 'Home' : 'Office'}</Text>
          </Pressable>
        ))}
      </View>
      ) : null}

      <Pressable
        accessibilityRole="search"
        accessibilityLabel={`Search an address to save as ${noun}`}
        onPress={() => setAdding(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, paddingHorizontal: 14, backgroundColor: colors.white }}
      >
        <Icon name="search" size={20} color={colors.muted} />
        <Text style={{ flex: 1, fontSize: 15, color: colors.muted, fontWeight: '600' }}>Search an address to save as {noun}</Text>
        <Icon name="plus" size={20} />
      </Pressable>

      {mine.length === 0 && suggestions.length === 0 ? <Text style={s.small}>No {noun} address saved yet. Your default {noun} is used to find rides.</Text> : null}
      {mine.length > 1 ? <Text style={s.small}>Your default {noun} is used for quick rides and for My week. Tap “Set as default” to change it.</Text> : null}

      {mine.map((p) => {
        const picked = selectedId ? p.id === selectedId : p.isDefault;
        return (
        <Pressable
          key={p.id}
          accessibilityRole={onSelect ? 'radio' : undefined}
          accessibilityState={onSelect ? { checked: picked } : undefined}
          disabled={!onSelect}
          onPress={() => onSelect?.(p)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: picked ? 2 : 1, borderColor: picked ? colors.ink : colors.line, backgroundColor: colors.white }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.isDefault ? colors.inkBg : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={tab === 'HOME' ? 'house' : 'building'} size={18} color={p.isDefault ? colors.lime : colors.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={[s.strong, { flexShrink: 1 }]}>{p.name}</Text>
              {p.isDefault ? <Badge tone="lime">Default</Badge> : null}
            </View>
            <Text numberOfLines={1} style={s.small}>{p.address}</Text>
            {!p.isDefault ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Make ${p.name} your default ${noun}`}
                disabled={!!busy}
                onPress={() => run(`m${p.id}`, () => api('POST', `/me/places/${p.id}/default`))}
                hitSlop={6}
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.lineStrong }}
              >
                <Icon name="star" size={13} color={colors.ink} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{busy === `m${p.id}` ? 'Saving…' : 'Set as default'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} onPress={() => setEditing(p)} hitSlop={6} style={{ padding: 6 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>Edit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} onPress={() => remove(p)} hitSlop={6} style={{ padding: 6 }}>
            <Icon name="close" size={18} color={colors.danger} />
          </Pressable>
        </Pressable>
        );
      })}

      {suggestions.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Label>Your company&apos;s offices</Label>
          {suggestions.map((o) => (
            <Pressable key={o.id} accessibilityRole="button" disabled={busy === 'add'} onPress={() => add(officePlace(o), o.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong }}>
              <Icon name="building" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{o.name}</Text>
                {o.address ? <Text numberOfLines={1} style={s.small}>{o.address}</Text> : null}
              </View>
              <Text style={{ fontWeight: '800', color: colors.ink }}>+ Save</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <PlacePicker visible={adding} title={`Save a ${noun} address`} saved={[]} onClose={() => setAdding(false)} onPick={(p) => (setAdding(false), add(p))} />
      <EditPlace place={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), onChange())} />
    </View>
  );
}

/** Rename, change the address, switch between home, office and other, and make it the default. */
function EditPlace({ place, onClose, onSaved }: { place: SavedPlace | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [addr, setAddr] = useState<Place | null>(null);
  const [kind, setKind] = useState<SavedPlace['label']>('HOME');
  const [makeDefault, setMakeDefault] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!place) return;
    setBusy(true);
    try {
      await api('PATCH', `/me/places/${place.id}`, {
        name: name.trim(),
        label: kind,
        ...(addr ? { address: addr.label, lat: addr.lat, lng: addr.lng } : {}),
        // Only "make it the default": the old default stops being one. "Other" places have no default.
        ...(makeDefault && kind !== 'OTHER' && !(place.isDefault && kind === place.label) ? { isDefault: true } : {}),
      });
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', errText(e));
    } finally {
      setBusy(false);
    }
  };

  const saved: Saved[] = [];
  return (
    <Modal
      visible={!!place}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => {
        setName(place?.name ?? '');
        setAddr(null);
        setKind(place?.label ?? 'HOME');
        setMakeDefault(!!place?.isDefault);
      }}
    >
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.45)' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28 }} contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 14 }}>
        <Text style={s.h2}>Edit address</Text>
        <Label>Name</Label>
        <TextInput value={name} onChangeText={setName} maxLength={60} accessibilityLabel="Name" placeholder="Home, Mom's place, Acme Tech…" placeholderTextColor={colors.muted} style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.ink }} />
        <Label>Address</Label>
        <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={{ minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="pin" size={18} />
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, color: colors.ink }}>{addr?.label ?? place?.address}</Text>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Change</Text>
        </Pressable>
        <Label>Type</Label>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
          {(['HOME', 'OFFICE', 'OTHER'] as const).map((k) => {
            const on = kind === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setKind(k);
                  if (k === 'OTHER') setMakeDefault(false);
                }}
                hitSlop={4}
                style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 14, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.inkBg : pressed ? colors.surface2 : colors.white })}
              >
                <Icon name={k === 'HOME' ? 'house' : k === 'OFFICE' ? 'building' : 'pin'} size={16} color={on ? colors.lime : colors.ink} />
                <Text style={{ fontWeight: '800', color: on ? colors.onInk : colors.ink }}>{k === 'HOME' ? 'Home' : k === 'OFFICE' ? 'Office' : 'Other'}</Text>
              </Pressable>
            );
          })}
        </View>
        {kind === 'OTHER' ? (
          <Text style={s.small}>Other places show up when you search, but are never the default.</Text>
        ) : place?.isDefault && kind === place.label ? (
          <Text style={s.small}>This is your default {kind === 'HOME' ? 'home' : 'office'}. To change it, make another address the default.</Text>
        ) : (
          <SwitchRow label={`Make this my default ${kind === 'HOME' ? 'home' : 'office'}`} value={makeDefault} onChange={setMakeDefault} />
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={onClose} />
          <Button small label="Save" style={{ flex: 1 }} loading={busy} disabled={!name.trim()} onPress={save} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <PlacePicker visible={picking} title="New address" saved={saved} onClose={() => setPicking(false)} onPick={(p) => (setAddr(p), setPicking(false))} />
    </Modal>
  );
}
