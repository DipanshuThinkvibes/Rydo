import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Place, PlaceSuggestion, SavedPlace } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { errText } from '@/lib/api';
import { autocomplete, newPlaceSession, officePlace, placeFromSuggestion, savedPlace } from '@/lib/places';
import type { Office } from '@/lib/types';
import { Icon, type IconName } from './icons';
import { Label, Notice, RoundButton } from './ui';

export interface Saved {
  key: string;
  title: string;
  sub?: string;
  icon: IconName;
  place: Place;
}

/** Current location first, then my saved addresses (defaults first), then company offices I have not saved. */
export function buildSaved(places: SavedPlace[], offices: Office[], current?: Place | null): Saved[] {
  const kindName = { HOME: 'Home', OFFICE: 'Office', OTHER: 'Saved' } as const;
  const mine: Saved[] = places.map((p) => ({
    key: p.id,
    title: `${kindName[p.label]} · ${p.name}${p.isDefault && p.label !== 'OTHER' ? ' (default)' : ''}`,
    sub: p.address,
    icon: p.label === 'OFFICE' ? 'building' : p.label === 'HOME' ? 'house' : 'pin',
    place: savedPlace(p),
  }));
  const company: Saved[] = offices
    .filter((o) => !places.some((p) => Math.abs(p.lat - o.lat) < 0.0005 && Math.abs(p.lng - o.lng) < 0.0005))
    .map((o) => ({ key: o.id, title: `Office · ${o.name}`, sub: o.address ?? undefined, icon: 'building', place: officePlace(o) }));
  return [...(current ? [{ key: 'here', title: 'Current location', sub: 'Where you are now', icon: 'pin' as const, place: current }] : []), ...mine, ...company];
}

/** Full-screen search for a place: saved places first, then Google suggestions from the API. */
export function PlacePicker({ visible, title, saved, onPick, onClose }: { visible: boolean; title: string; saved: Saved[]; onPick: (p: Place) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const session = useRef(newPlaceSession());

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setItems([]);
    setError(undefined);
    session.current = newPlaceSession();
  }, [visible]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      setBusy(true);
      autocomplete(q.trim(), session.current)
        .then((r) => (setItems(r), setError(undefined)))
        .catch((e) => setError(errText(e, 'Place search is not available right now.')))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (s: PlaceSuggestion) => {
    setBusy(true);
    try {
      onPick(await placeFromSuggestion(s, session.current));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const row = (key: string, icon: IconName, main: string, sub: string | undefined, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: icon === 'building' ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={icon === 'building' ? colors.lime : colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{main}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <RoundButton icon="close" label="Close" onPress={onClose} size={44} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{title}</Text>
        </View>
        <View style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 14 }}>
          <Icon name="search" size={20} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Search a place, gate or landmark"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search a place"
            style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink }}
          />
          {busy ? <ActivityIndicator color={colors.ink} /> : null}
        </View>
        {error ? <View style={{ margin: 16 }}><Notice tone="error">{error}</Notice></View> : null}
        <FlatList
          data={items}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          keyExtractor={(i) => i.placeId}
          ListHeaderComponent={
            q.trim().length < 2 && saved.length ? (
              <View style={{ paddingTop: 18 }}>
                <Label>Saved</Label>
                {saved.map((sv) => row(sv.key, sv.icon, sv.title, sv.sub, () => onPick(sv.place)))}
              </View>
            ) : undefined
          }
          renderItem={({ item }) => row(item.placeId, 'pin', item.main, item.secondary, () => pick(item))}
        />
      </SafeAreaView>
    </Modal>
  );
}
