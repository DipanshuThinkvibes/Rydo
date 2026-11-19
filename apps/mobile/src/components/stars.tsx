import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@rydo/ui-tokens';
import { Button } from './ui';

const TAGS = ['On time', 'Safe driving', 'Friendly', 'Clean car', 'Good chat'];
const RIDER_TAGS = ['On time', 'Friendly', 'At the pickup', 'Polite'];

/** Five star boxes, optional tags, and a Submit button (prototype "How was your ride?"). */
export function Stars({ onRate, busy, forRider, compact }: { onRate: (stars: number, tags: string[]) => void; busy?: boolean; forRider?: boolean; compact?: boolean }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const size = compact ? 44 : 56;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: compact ? 'flex-start' : 'space-between', gap: compact ? 8 : 0 }} accessibilityRole="radiogroup" accessibilityLabel="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            accessibilityState={{ checked: stars === n }}
            onPress={() => setStars(n)}
            style={{ width: size, height: size, borderRadius: 14, borderWidth: 1.5, borderColor: n <= stars ? colors.ink : colors.lineStrong, backgroundColor: n <= stars ? colors.ink : colors.white, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: size * 0.45, color: n <= stars ? colors.lime : colors.muted }}>★</Text>
          </Pressable>
        ))}
      </View>
      {stars > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(forRider ? RIDER_TAGS : TAGS).map((t) => {
            const on = tags.includes(t);
            return (
              <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? colors.ink : colors.surface2 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.white : colors.ink }}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Button label="Submit rating" small={compact} disabled={stars === 0} loading={busy} onPress={() => onRate(stars, tags)} />
    </View>
  );
}
