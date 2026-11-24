import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { CAR_TYPE_LABEL, CAR_TYPES } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { activeFilters, NO_FILTERS, type Draft } from '@/lib/places';
import { Icon } from './icons';
import { Button, Chip, Label, s, SwitchRow } from './ui';

type Filters = Pick<Draft, 'womenOnly' | 'vehicleType' | 'ac' | 'carTypes'>;

/**
 * Small segmented choice: Car / Bike, AC / Non-AC. Nothing picked = no preference;
 * tapping the picked option again unpicks it (back to `none`).
 */
function Segment<T extends string>({ value, none, options, onChange }: { value: T; none: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.surface2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(on ? none : o.value)} style={[{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, on && { backgroundColor: colors.white, ...s.lift }]}>
            <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.ink : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Filters" button for Find a ride; shows how many filters are on. */
export function FiltersButton({ d, onPress }: { d: Draft; onPress: () => void }) {
  const n = activeFilters(d);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={n ? `Filters, ${n} on` : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: n ? colors.ink : colors.lineStrong, backgroundColor: pressed ? colors.surface2 : colors.white })}
    >
      <Icon name="layers" size={18} />
      <Text style={[s.strong, { flex: 1, fontSize: 15 }]}>Filters</Text>
      {n ? (
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.onLime }}>{n}</Text>
        </View>
      ) : (
        <Text style={s.small}>No filters</Text>
      )}
      <Icon name="next" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Bottom sheet with the ride search filters: vehicle, car type, AC and women-only. Applied with "Show rides". */
export function RideFilters({ visible, d, womenOnlyAllowed, onApply, onClose }: { visible: boolean; d: Draft; womenOnlyAllowed: boolean; onApply: (f: Filters) => void; onClose: () => void }) {
  const [f, setF] = useState<Filters>({ womenOnly: d.womenOnly, vehicleType: d.vehicleType, ac: d.ac, carTypes: d.carTypes });
  useEffect(() => {
    if (visible) setF({ womenOnly: d.womenOnly, vehicleType: d.vehicleType, ac: d.ac, carTypes: d.carTypes });
  }, [visible, d.womenOnly, d.vehicleType, d.ac, d.carTypes]);
  const bike = f.vehicleType === 'BIKE';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close filters" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.45)' }} />
      <View style={{ maxHeight: '85%', backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.h2, { flex: 1 }]}>Filters</Text>
            <Pressable accessibilityRole="button" onPress={() => setF({ ...NO_FILTERS })} hitSlop={8}>
              <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Clear all</Text>
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <Label>Vehicle</Label>
            <Segment
              value={f.vehicleType}
              none="ANY"
              options={[
                { value: 'CAR', label: 'Car' },
                { value: 'BIKE', label: 'Bike' },
              ]}
              onChange={(vehicleType) => setF({ ...f, vehicleType, ...(vehicleType === 'BIKE' ? { carTypes: [], ac: 'ANY' as const } : {}) })}
            />
            {f.vehicleType === 'ANY' ? <Text style={s.small}>Pick one, or leave both off to see cars and bikes.</Text> : null}
          </View>

          {!bike ? (
            <>
              <View style={{ gap: 10 }}>
                <Label>Car type</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CAR_TYPES.map((t) => {
                    const on = f.carTypes.includes(t);
                    return <Chip key={t} tone="lime" label={CAR_TYPE_LABEL[t]} selected={on} onPress={() => setF({ ...f, carTypes: on ? f.carTypes.filter((x) => x !== t) : [...f.carTypes, t] })} />;
                  })}
                </View>
                <Text style={s.small}>{f.carTypes.length ? 'Only these car types. Bikes and cars without a type are hidden.' : 'All car types.'}</Text>
              </View>

              <View style={{ gap: 10 }}>
                <Label>Air conditioning</Label>
                <Segment
                  value={f.ac}
                  none="ANY"
                  options={[
                    { value: 'AC', label: 'AC' },
                    { value: 'NON_AC', label: 'Non-AC' },
                  ]}
                  onChange={(ac) => setF({ ...f, ac })}
                />
                {f.ac === 'ANY' ? <Text style={s.small}>Leave both off to see AC and non-AC rides.</Text> : null}
              </View>
            </>
          ) : null}

          {womenOnlyAllowed ? (
            <View style={{ gap: 4 }}>
              <SwitchRow label="Women-only rides" value={f.womenOnly} onChange={(womenOnly) => setF({ ...f, womenOnly })} />
              <Text style={s.small}>Only rides the driver set for women riders.</Text>
            </View>
          ) : null}

          <Button label="Apply filters" onPress={() => onApply(f)} />
        </ScrollView>
      </View>
    </Modal>
  );
}
