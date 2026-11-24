import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors } from '@/lib/theme';
import { s } from './ui';

/** "HH:mm" (24 h) to what is typed: "8:30" and AM/PM. */
function split(hhmm: string | null, emptyPm = false): { text: string; pm: boolean } {
  if (!hhmm) return { text: '', pm: emptyPm };
  const [h, m] = hhmm.split(':').map(Number);
  return { text: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, pm: h >= 12 };
}

/** "8:30", "830", "8.30", "8" with AM/PM → "HH:mm" (24 h), or null when it is not a real time. */
export function parseTime(text: string, pm: boolean): string | null {
  const t = text.trim().replace(/[.\s]/g, ':');
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return null;
  const h24 = (h % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Type a time (no suggested times): "8:30" plus AM or PM. Calls onChange with "HH:mm" (24 h), or null while the
 * text is not a real time. `error` shows under the field (e.g. "That time has already passed").
 */
export function TimeField({ label, value, onChange, error, pm: startPm = false, placeholder = '8:30' }: { label: string; value: string | null; onChange: (hhmm: string | null) => void; error?: string; /** Start on PM while empty (an evening return). */ pm?: boolean; placeholder?: string }) {
  const start = split(value, startPm);
  const [text, setText] = useState(start.text);
  const [pm, setPm] = useState(start.pm);
  const [focused, setFocused] = useState(false);

  // A new value from outside (e.g. a saved draft) replaces what is shown, unless the person is typing.
  useEffect(() => {
    if (focused) return;
    const next = split(value, startPm);
    if (parseTime(text, pm) !== value) {
      setText(next.text);
      setPm(next.pm);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (t: string, p: boolean) => {
    setText(t);
    setPm(p);
    onChange(parseTime(t, p));
  };
  const invalid = text.trim() !== '' && parseTime(text, pm) === null;
  const message = invalid ? 'Type a time like 8:30' : error;

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={(t) => update(t.replace(/[^\d:.]/g, '').slice(0, 5), pm)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          accessibilityLabel={`${label}, hours and minutes`}
          style={[s.input, { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '800' }, focused && s.inputFocused, message ? { borderColor: colors.danger } : null]}
        />
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.surface2 }}>
          {(['AM', 'PM'] as const).map((k) => {
            const on = (k === 'PM') === pm;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => update(text, k === 'PM')}
                style={[{ width: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, on && { backgroundColor: colors.white, ...s.lift }]}
              >
                <Text style={{ fontSize: 15, fontWeight: on ? '800' : '600', color: on ? colors.ink : colors.muted }}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {message ? <Text style={s.error}>{message}</Text> : null}
    </View>
  );
}
