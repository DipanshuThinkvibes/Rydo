import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, isDark } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { Icon } from '@/components/icons';
import { Button, Logo } from '@/components/ui';

/** Dashed lime route made of short bars. */
function Dashes({ x, y, length, vertical }: { x: number; y: number; length: number; vertical?: boolean }) {
  const n = Math.floor(length / 16);
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: vertical ? x - 3 : x + i * 16, top: vertical ? y + i * 16 : y - 3, width: vertical ? 6 : 10, height: vertical ? 10 : 6, borderRadius: 2, backgroundColor: colors.lime }}
        />
      ))}
    </>
  );
}

function Bubble({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <View style={{ position: 'absolute', left: x - 18, top: y - 18, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.onPanel, fontSize: 11, fontWeight: '800' }}>{text}</Text>
    </View>
  );
}

/** Prototype screen 1: the dark welcome page with the shared route. */
export default function Welcome() {
  const { me } = useSession();
  if (me) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <StatusBar style={isDark() ? "light" : "dark"} />
      {/* Street grid and the pickup route */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[60, 170, 280].map((x) => <View key={x} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 10, backgroundColor: colors.panel3 }} />)}
        {[120, 250, 380].map((y) => <View key={y} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 10, backgroundColor: colors.panel3 }} />)}
        <View style={{ position: 'absolute', left: -60, top: 430, width: 600, height: 26, backgroundColor: colors.panel2, transform: [{ rotate: '-24deg' }] }} />
        <Dashes x={180} y={84} length={130} />
        <Dashes x={180} y={90} length={160} vertical />
        <Dashes x={62} y={250} length={118} />
        <Dashes x={62} y={256} length={140} vertical />
        <View style={{ position: 'absolute', left: 306, top: 68, width: 34, height: 34, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="building" size={20} />
        </View>
        <Bubble x={180} y={170} text="VP" />
        <Bubble x={180} y={250} text="AK" />
        <View style={{ position: 'absolute', left: 40, top: 392, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lime }} />
      </View>

      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', padding: 24 }}>
        <Logo light />
        <View style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: colors.onPanel, fontSize: 40, fontWeight: '800', lineHeight: 44, letterSpacing: -0.8 }}>
            Your office{'\n'}commute, shared.
          </Text>
          <Text style={{ color: colors.panelMuted, fontSize: 16, lineHeight: 24 }}>Ride with verified colleagues going your way. Split the running cost. Every ride tracked live.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Verified by your HR', 'Ride PIN + SOS', 'Less traffic, less CO₂'].map((t) => (
              <View key={t} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.panel2, justifyContent: 'center' }}>
                <Text style={{ color: colors.onPanel, fontSize: 13, fontWeight: '700' }}>{t}</Text>
              </View>
            ))}
          </View>
          <Button label="Create an account" variant="lime" onPress={() => router.push('/signup')} style={{ marginTop: 8 }} />
          <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={{ height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.panel2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.onPanel, fontSize: 16, fontWeight: '800' }}>I already have an account</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push('/contact')} style={{ alignSelf: 'center', padding: 6 }}>
            <Text style={{ color: colors.panelMuted, fontSize: 14 }}>
              Company not on RYDO yet? <Text style={{ color: colors.panelAccent, fontWeight: '800', textDecorationLine: 'underline' }}>Contact us</Text>
            </Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push('/info')} style={{ alignSelf: 'center', padding: 6 }}>
            <Text style={{ color: colors.panelMuted, fontSize: 14, textDecorationLine: 'underline' }}>How it works, FAQ and privacy</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
