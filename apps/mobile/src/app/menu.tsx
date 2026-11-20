import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OrgRoleName } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme-context';
import { Alert } from '@/lib/dialog';
import { Icon, type IconName } from '@/components/icons';
import { LicenceBanner } from '@/components/licence-banner';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Badge, Button, Logo, s } from '@/components/ui';

/** member: riding and driving pages, never shown to admin accounts (they can't ride or drive). */
type Item = { href: Href; label: string; icon: IconName; member?: boolean; orgOnly?: boolean; platformOnly?: boolean; roles?: OrgRoleName[] };

/** Same groups, names and order as the web side menu (apps/web/src/components/app-shell.tsx). */
const GROUPS: { title?: string; items: Item[] }[] = [
  {
    items: [
      { href: '/dashboard', label: 'Home', icon: 'sparkle', member: true },
      { href: '/plan', label: 'Find a ride', icon: 'search', member: true },
      { href: '/trips', label: 'My trips', icon: 'ticket', member: true },
      { href: '/commute', label: 'My week', icon: 'calendar', member: true },
      { href: '/drive', label: 'Drive', icon: 'wheel', member: true },
      { href: '/messages', label: 'Messages', icon: 'chat', member: true },
    ],
  },
  {
    title: 'Help & safety',
    items: [
      { href: '/safety', label: 'Safety', icon: 'shield', member: true },
      { href: '/issues', orgOnly: true, label: 'Report an issue', icon: 'flag' },
      { href: '/feedback', orgOnly: true, label: 'Feedback', icon: 'star' },
      { href: '/surveys', label: 'Surveys', icon: 'clipboard', member: true },
      { href: '/notifications', orgOnly: true, label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/admin', label: 'Admin home', icon: 'home', roles: ['ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN'] },
      { href: '/manage/rides', label: 'Rides', icon: 'route', roles: ['ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN'] },
      { href: '/manage/employees', label: 'Employees', icon: 'users', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
      { href: '/manage/drivers', label: 'Drivers', icon: 'badge', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
      { href: '/manage/company', label: 'Company', icon: 'building', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/structure', label: 'Offices & teams', icon: 'layers', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/reports', label: 'Reports', icon: 'sparkle', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/activity', label: 'Activity', icon: 'clock', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
      { href: '/manage/issues', label: 'Issues', icon: 'flag', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/feedback', label: 'Feedback', icon: 'star', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/surveys', label: 'Surveys', icon: 'clipboard', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] },
      { href: '/manage/announcements', label: 'Announcements', icon: 'megaphone', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
    ],
  },
  {
    title: 'RYDO owner',
    items: [
      { href: '/platform', label: 'Overview', icon: 'sparkle', platformOnly: true },
      { href: '/platform/clients', label: 'Clients', icon: 'globe', platformOnly: true },
      { href: '/platform/licenses', label: 'Licences', icon: 'badge', platformOnly: true },
      { href: '/platform/people', label: 'People', icon: 'users', platformOnly: true },
      { href: '/platform/reports', label: 'Reports and safety', icon: 'flag', platformOnly: true },
      { href: '/platform/inquiries', label: 'Onboarding requests', icon: 'clipboard', platformOnly: true },
      { href: '/platform/activity', label: 'Activity', icon: 'clock', platformOnly: true },
    ],
  },
  {
    items: [
      { href: '/account', label: 'My account', icon: 'user' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/info', label: 'Help and about', icon: 'alert' },
    ],
  },
];

/** The web's side menu as a phone screen: every page grouped the same way, filtered by role. */
export default function Menu() {
  const { me, membership, active, roles, orgs, chooseOrg, isPlatformAdmin, isAdmin, features, signOut, support, endSupport } = useSession();
  const { effective, setMode } = useTheme();
  const can = (r: OrgRoleName[]) => r.some((x) => roles.includes(x));
  const visible = (n: Item) => (n.platformOnly ? isPlatformAdmin : n.orgOnly ? active && !support : n.member ? active && !support && !isAdmin && features.share !== false : n.roles ? active && can(n.roles) : true);

  const switchCompany = () =>
    Alert.alert('Company', 'Which company do you want to use?', [
      ...orgs.map((m) => ({ text: m.organization.name, onPress: () => chooseOrg(m.organization.id) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  const leave = () =>
    Alert.alert('Sign out?', `You are signed in as ${me?.user.email ?? ''}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut().then(() => router.replace('/welcome')) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 30 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo light />
            <Pressable accessibilityRole="button" accessibilityLabel={effective === 'dark' ? 'Use light theme' : 'Use dark theme'} onPress={() => setMode(effective === 'dark' ? 'light' : 'dark')} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={effective === 'dark' ? 'sun' : 'moon'} size={20} color={colors.onPanel} />
            </Pressable>
          </View>

          {/* Company (web header): a switch when the person belongs to more than one; in support view, the client being viewed */}
          {support ? (
            <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.warningBg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="shield" size={18} color={colors.warningText} />
                <Text style={{ flex: 1, color: colors.warningText, fontWeight: '800' }} numberOfLines={1}>{support.orgName}</Text>
                <Badge tone="warning">support view · read-only</Badge>
              </View>
              <Button
                small
                variant="white"
                label="End support view"
                onPress={() => {
                  const id = support.orgId;
                  endSupport();
                  router.replace({ pathname: '/platform/clients/[id]', params: { id } } as Href);
                }}
              />
            </View>
          ) : (
          <Pressable accessibilityRole="button" disabled={orgs.length < 2} onPress={switchCompany} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.panel2 }}>
            <Icon name="building" size={18} color={colors.panelAccent} />
            <Text style={{ flex: 1, color: colors.onPanel, fontWeight: '800' }} numberOfLines={1}>{membership?.organization.name ?? 'RYDO platform'}</Text>
            {orgs.length > 1 ? <Text style={{ color: colors.panelMuted, fontWeight: '700' }}>Change</Text> : null}
          </Pressable>
          )}
          <LicenceBanner />

          {/* Admin accounts see the Admin group first: it is their whole app. */}
          {(isAdmin ? [...GROUPS.filter((g) => g.title === 'Admin'), ...GROUPS.filter((g) => g.title !== 'Admin')] : GROUPS).map((g, i) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <View key={i} style={{ gap: 4 }}>
                {g.title ? <Text style={{ color: colors.panelMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>{g.title}</Text> : null}
                {items.map((n) => (
                  <Pressable key={String(n.href)} accessibilityRole="link" onPress={() => router.push(n.href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 14, backgroundColor: pressed ? colors.panel2 : 'transparent' })}>
                    <Icon name={n.icon} size={20} color={colors.onPanel} />
                    <Text style={{ flex: 1, color: colors.onPanel, fontSize: 16, fontWeight: '700' }}>{n.label}</Text>
                    <Icon name="next" size={18} color={colors.panelMuted} />
                  </Pressable>
                ))}
              </View>
            );
          })}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.panel2 }}>
            <Avatar name={me?.user.name ?? me?.user.email ?? '?'} tone="lime" size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onPanel, fontWeight: '800' }} numberOfLines={1}>{me?.user.name}</Text>
              <Text style={{ color: colors.panelMuted, fontSize: 13 }} numberOfLines={1}>{me?.user.email}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={leave} hitSlop={8}>
              <Icon name="logout" size={20} color={colors.onPanel} />
            </Pressable>
          </View>
          <Text style={[s.small, { color: colors.panelMuted, textAlign: 'center' }]}>RYDO · ride to work with your team</Text>
        </ScrollView>
      </SafeAreaView>
      <TabBar active="menu" dark />
    </View>
  );
}
