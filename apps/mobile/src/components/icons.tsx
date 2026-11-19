import { Text, View, type ViewStyle } from 'react-native';
import { colors } from '@rydo/ui-tokens';

/**
 * Small line icons drawn with plain views (the app has no icon or SVG package yet).
 * Every icon fits a `size` box and uses one `color`.
 */
export type IconName =
  | 'home' | 'calendar' | 'wheel' | 'shield' | 'bell' | 'search' | 'clock' | 'building' | 'house'
  | 'chat' | 'share' | 'car' | 'lock' | 'back' | 'swap' | 'check' | 'star' | 'send' | 'close'
  | 'plus' | 'minus' | 'turn' | 'pin' | 'flag' | 'alert' | 'next';

const GLYPH: Partial<Record<IconName, string>> = {
  back: '‹',
  next: '›',
  swap: '⇅',
  check: '✓',
  star: '★',
  send: '→',
  close: '✕',
  plus: '+',
  minus: '−',
  turn: '↱',
  alert: '!',
};

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  const u = size / 24; // drawing unit
  const box: ViewStyle = { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
  const line = Math.max(1.6, 2 * u);
  const glyph = GLYPH[name];
  if (glyph) {
    const big = name === 'back' || name === 'next' ? 1.5 : name === 'plus' || name === 'minus' ? 1.2 : 0.95;
    return (
      <View style={box} accessible={false}>
        <Text style={{ color, fontSize: size * big, lineHeight: size * big * 1.08, fontWeight: '800', marginTop: name === 'back' || name === 'next' ? -size * 0.12 : 0 }}>{glyph}</Text>
      </View>
    );
  }
  const abs = (s: ViewStyle): ViewStyle => ({ position: 'absolute', ...s });

  switch (name) {
    case 'home':
    case 'house':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, width: 12 * u, height: 12 * u, borderLeftWidth: line, borderTopWidth: line, borderColor: color, transform: [{ rotate: '45deg' }] })} />
          <View style={abs({ top: 10 * u, width: 14 * u, height: 11 * u, borderWidth: line, borderTopWidth: 0, borderColor: color, borderBottomLeftRadius: 2 * u, borderBottomRightRadius: 2 * u })} />
          <View style={abs({ top: 14 * u, width: 4 * u, height: 7 * u, borderWidth: line, borderBottomWidth: 0, borderColor: color })} />
        </View>
      );
    case 'calendar':
      return (
        <View style={box}>
          <View style={abs({ top: 5 * u, width: 18 * u, height: 16 * u, borderWidth: line, borderColor: color, borderRadius: 3 * u })} />
          <View style={abs({ top: 10 * u, width: 18 * u, height: line, backgroundColor: color })} />
          <View style={abs({ top: 2.5 * u, left: 7.5 * u, width: line, height: 5 * u, backgroundColor: color, borderRadius: 1 })} />
          <View style={abs({ top: 2.5 * u, right: 7.5 * u, width: line, height: 5 * u, backgroundColor: color, borderRadius: 1 })} />
          <View style={abs({ top: 13.5 * u, left: 8 * u, width: 3 * u, height: 3 * u, backgroundColor: color, borderRadius: 1 })} />
        </View>
      );
    case 'wheel':
      return (
        <View style={box}>
          <View style={abs({ width: 19 * u, height: 19 * u, borderRadius: 10 * u, borderWidth: line, borderColor: color })} />
          <View style={abs({ width: 5 * u, height: 5 * u, borderRadius: 3 * u, borderWidth: line, borderColor: color })} />
          <View style={abs({ top: 11 * u, left: 3 * u, width: 6.5 * u, height: line, backgroundColor: color })} />
          <View style={abs({ top: 11 * u, right: 3 * u, width: 6.5 * u, height: line, backgroundColor: color })} />
          <View style={abs({ top: 14 * u, width: line, height: 6.5 * u, backgroundColor: color })} />
        </View>
      );
    case 'shield':
      return (
        <View style={box}>
          <View style={abs({ top: 2.5 * u, width: 16 * u, height: 19 * u, borderWidth: line, borderColor: color, borderTopLeftRadius: 3 * u, borderTopRightRadius: 3 * u, borderBottomLeftRadius: 9 * u, borderBottomRightRadius: 9 * u })} />
        </View>
      );
    case 'bell':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, width: 14 * u, height: 14 * u, borderWidth: line, borderBottomWidth: 0, borderColor: color, borderTopLeftRadius: 7 * u, borderTopRightRadius: 7 * u })} />
          <View style={abs({ top: 16 * u, width: 18 * u, height: line, backgroundColor: color, borderRadius: 1 })} />
          <View style={abs({ top: 18.5 * u, width: 5 * u, height: 3 * u, backgroundColor: color, borderBottomLeftRadius: 3 * u, borderBottomRightRadius: 3 * u })} />
        </View>
      );
    case 'search':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, left: 3 * u, width: 13 * u, height: 13 * u, borderRadius: 7 * u, borderWidth: line, borderColor: color })} />
          <View style={abs({ top: 17 * u, left: 14 * u, width: 7 * u, height: line, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] })} />
        </View>
      );
    case 'clock':
      return (
        <View style={box}>
          <View style={abs({ width: 18 * u, height: 18 * u, borderRadius: 9 * u, borderWidth: line, borderColor: color })} />
          <View style={abs({ top: 7 * u, left: 11.5 * u, width: line, height: 5.5 * u, backgroundColor: color })} />
          <View style={abs({ top: 12 * u, left: 11.5 * u, width: 4 * u, height: line, backgroundColor: color })} />
        </View>
      );
    case 'building':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, width: 14 * u, height: 18 * u, borderWidth: line, borderColor: color, borderRadius: 2 * u })} />
          {[0, 1].map((r) =>
            [0, 1].map((c) => <View key={`${r}${c}`} style={abs({ top: (7 + r * 5) * u, left: (8.5 + c * 5) * u, width: 2.4 * u, height: 2.4 * u, backgroundColor: color })} />),
          )}
        </View>
      );
    case 'chat':
      return (
        <View style={box}>
          <View style={abs({ top: 4 * u, width: 18 * u, height: 13 * u, borderWidth: line, borderColor: color, borderRadius: 6 * u })} />
          <View style={abs({ top: 15 * u, left: 6 * u, width: 5 * u, height: 5 * u, borderLeftWidth: line, borderBottomWidth: line, borderColor: color, transform: [{ skewY: '-30deg' }] })} />
        </View>
      );
    case 'share':
      return (
        <View style={box}>
          <View style={abs({ top: 8.5 * u, left: 7 * u, width: 10 * u, height: line, backgroundColor: color, transform: [{ rotate: '-30deg' }] })} />
          <View style={abs({ top: 14.5 * u, left: 7 * u, width: 10 * u, height: line, backgroundColor: color, transform: [{ rotate: '30deg' }] })} />
          <View style={abs({ top: 9 * u, left: 3 * u, width: 6 * u, height: 6 * u, borderRadius: 3 * u, borderWidth: line, borderColor: color, backgroundColor: 'transparent' })} />
          <View style={abs({ top: 3 * u, right: 3 * u, width: 6 * u, height: 6 * u, borderRadius: 3 * u, borderWidth: line, borderColor: color })} />
          <View style={abs({ bottom: 3 * u, right: 3 * u, width: 6 * u, height: 6 * u, borderRadius: 3 * u, borderWidth: line, borderColor: color })} />
        </View>
      );
    case 'car':
      return (
        <View style={box}>
          <View style={abs({ top: 5 * u, width: 14 * u, height: 7 * u, borderWidth: line, borderBottomWidth: 0, borderColor: color, borderTopLeftRadius: 4 * u, borderTopRightRadius: 4 * u })} />
          <View style={abs({ top: 11 * u, width: 20 * u, height: 7 * u, borderWidth: line, borderColor: color, borderRadius: 3 * u })} />
          <View style={abs({ top: 17 * u, left: 4.5 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: color })} />
          <View style={abs({ top: 17 * u, right: 4.5 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: color })} />
        </View>
      );
    case 'lock':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, width: 10 * u, height: 10 * u, borderWidth: line, borderColor: color, borderRadius: 5 * u })} />
          <View style={abs({ top: 10 * u, width: 15 * u, height: 11 * u, backgroundColor: color, borderRadius: 2.5 * u })} />
        </View>
      );
    case 'pin':
      return (
        <View style={box}>
          <View style={abs({ top: 2 * u, width: 14 * u, height: 14 * u, borderRadius: 7 * u, borderBottomRightRadius: 0, borderWidth: line, borderColor: color, transform: [{ rotate: '45deg' }] })} />
          <View style={abs({ top: 7 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: color })} />
        </View>
      );
    case 'flag':
      return (
        <View style={box}>
          <View style={abs({ top: 3 * u, left: 5 * u, width: line, height: 18 * u, backgroundColor: color })} />
          <View style={abs({ top: 3.5 * u, left: 6 * u, width: 13 * u, height: 9 * u, backgroundColor: color, borderTopRightRadius: 2 * u, borderBottomRightRadius: 2 * u })} />
        </View>
      );
    default:
      return <View style={box} />;
  }
}
