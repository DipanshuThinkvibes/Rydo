import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { useSession } from '@/lib/session';
import { Icon, type IconName } from './icons';

export type Tab = 'home' | 'commute' | 'drive' | 'admin';

const TABS: { key: Tab; label: string; icon: IconName; href: '/' | '/commute' | '/drive' | '/admin' }[] = [
  { key: 'home', label: 'Home', icon: 'home', href: '/' },
  { key: 'commute', label: 'Commute', icon: 'calendar', href: '/commute' },
  { key: 'drive', label: 'Drive', icon: 'wheel', href: '/drive' },
  { key: 'admin', label: 'Admin', icon: 'shield', href: '/admin' },
];

/** Bottom tabs: Home, Commute, Drive, and Admin for company admins. */
export function TabBar({ active, dark }: { active: Tab; dark?: boolean }) {
  const { isAdmin } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: dark ? colors.ink : colors.white,
        borderTopWidth: 1,
        borderTopColor: dark ? colors.ink2 : colors.line,
      }}
    >
      {TABS.filter((t) => t.key !== 'admin' || isAdmin).map((t) => {
        const on = t.key === active;
        const fg = on ? colors.ink : dark ? colors.mutedOnDark : colors.muted;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => !on && router.replace(t.href)}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            <View style={{ width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.lime : 'transparent' }}>
              <Icon name={t.icon} size={22} color={fg} />
            </View>
            <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? (dark ? colors.white : colors.ink) : fg }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
