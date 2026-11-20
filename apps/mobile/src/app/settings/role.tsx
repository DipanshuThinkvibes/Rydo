import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { colors } from '@/lib/theme';
import { AccountFrame, PERSONA, Section, useAccount, usePersonas, type PersonaKey } from '@/components/account-hub';
import { Icon, type IconName } from '@/components/icons';
import { Badge, Notice, s } from '@/components/ui';

type Tool = { href: Href; icon: IconName; t: string; d: string };

/** What each persona can do and where to do it (same text as the web /settings/role). */
const TOOLS: Record<PersonaKey, { heading: string; can: string[]; tools: Tool[] }> = {
  OWNER: {
    heading: 'You run RYDO',
    can: ['Set up clients and give them licences', 'Block or unblock a person in any company', 'Watch reports and safety across every client', 'See only the numbers you need, never private details'],
    tools: [
      { href: '/platform', icon: 'sparkle', t: 'Overview', d: 'How carpooling is going everywhere' },
      { href: '/platform/clients', icon: 'globe', t: 'Clients', d: 'Companies on RYDO' },
      { href: '/platform/licenses', icon: 'badge', t: 'Licences', d: 'Who can use what, until when' },
      { href: '/platform/people', icon: 'users', t: 'People', d: 'Block or unblock' },
      { href: '/platform/reports', icon: 'flag', t: 'Reports and safety', d: 'Complaints and SOS' },
      { href: '/platform/inquiries', icon: 'clipboard', t: 'Onboarding requests', d: 'Companies asking to join' },
    ],
  },
  SUPPORT: {
    heading: 'You help client companies',
    can: ["Open a company's screens in read-only support view when RYDO allows it", 'Everything you open is logged, with the reason', "You can look, but never change a company's data"],
    tools: [],
  },
  ORG_ADMIN: {
    heading: 'You run your company on RYDO',
    can: ['Change company settings, offices and teams', 'Give people roles', 'See reports and activity', 'Send announcements and surveys'],
    tools: [
      { href: '/manage/company', icon: 'building', t: 'Company', d: 'Rules and settings' },
      { href: '/manage/structure', icon: 'layers', t: 'Offices & teams', d: 'Where people work' },
      { href: '/manage/reports', icon: 'sparkle', t: 'Reports', d: 'Rides, savings, activity' },
      { href: '/manage/announcements', icon: 'megaphone', t: 'Announcements', d: 'Tell everyone' },
      { href: '/manage/activity', icon: 'clock', t: 'Activity log', d: 'Who did what' },
    ],
  },
  HR_ADMIN: {
    heading: 'You look after your people',
    can: ['Approve or reject new employees', 'Pause and bring back employees', 'Verify drivers and their documents', 'Run surveys and read feedback'],
    tools: [
      { href: '/manage/employees', icon: 'users', t: 'Employees', d: 'Approvals and people' },
      { href: '/manage/drivers', icon: 'badge', t: 'Drivers', d: 'Verify documents' },
      { href: '/manage/surveys', icon: 'clipboard', t: 'Surveys', d: 'Ask your team' },
      { href: '/manage/feedback', icon: 'star', t: 'Feedback', d: 'What people say' },
      { href: '/manage/announcements', icon: 'megaphone', t: 'Announcements', d: 'Tell everyone' },
    ],
  },
  OPS_ADMIN: {
    heading: 'You keep rides running',
    can: ['Watch live rides and safety alerts', 'Follow up on reported issues', 'See reports for your company'],
    tools: [
      { href: '/manage/rides', icon: 'route', t: 'Rides', d: 'Live and upcoming' },
      { href: '/manage/issues', icon: 'flag', t: 'Issues', d: 'Reports from riders' },
      { href: '/manage/reports', icon: 'sparkle', t: 'Reports', d: 'How rides are going' },
      { href: '/manage/structure', icon: 'layers', t: 'Offices & teams', d: 'Where people work' },
    ],
  },
  DRIVER: {
    heading: 'You share your seats',
    can: ['Offer rides to the office and back', 'Accept or decline requests', 'Chat with riders on your ride', 'Keep your vehicle and documents up to date'],
    tools: [
      { href: '/drive', icon: 'wheel', t: 'Drive', d: 'Offer a ride, manage your car' },
      { href: '/trips', icon: 'ticket', t: 'My trips', d: 'Upcoming and past' },
      { href: '/messages', icon: 'chat', t: 'Messages', d: 'Talk to your riders' },
    ],
  },
  RIDER: {
    heading: 'You ride with colleagues',
    can: ['Find rides that match your route', 'Book a seat or join a waitlist', 'Plan your week in one go', 'Rate the people you ride with'],
    tools: [
      { href: '/plan', icon: 'search', t: 'Find a ride', d: 'Match with colleagues' },
      { href: '/commute', icon: 'calendar', t: 'My week', d: 'Plan your commute' },
      { href: '/trips', icon: 'ticket', t: 'My trips', d: 'Upcoming and past' },
      { href: '/messages', icon: 'chat', t: 'Messages', d: 'Talk to your driver' },
    ],
  },
};
const PREF_LABEL: Record<string, string> = { ac: 'Air conditioning', noSmoking: 'No smoking', quiet: 'Quiet ride', musicOk: 'Music is fine', womenRidersOnly: 'Women riders only' };
const STATUS_TONE = { VERIFIED: 'success', PENDING: 'warning' } as const;

/** Role tab: one card per persona you hold, with what you can do and shortcuts. */
export default function RoleScreen() {
  return (
    <AccountFrame tab="role">
      <RoleTab />
    </AccountFrame>
  );
}

function RoleTab() {
  const personas = usePersonas();
  const { profile } = useAccount();
  // Skip the plain rider card for people who are also admins (same rule as the web).
  const shown = personas.filter((p) => !(p === 'RIDER' && personas.some((q) => q !== 'RIDER' && q !== 'DRIVER')) || personas.length === 1);
  if (personas.length === 0) return <Notice tone="error">You do not have a role in a company yet. Once your company approves you, your tools appear here.</Notice>;
  return (
    <>
      {shown.map((p) => {
        const t = TOOLS[p];
        const prefs = p === 'DRIVER' ? Object.entries(profile?.driver?.preferences ?? {}).filter(([, v]) => v) : [];
        return (
          <Section
            key={p}
            icon={PERSONA[p].icon}
            title={PERSONA[p].label}
            sub={t.heading}
            aside={p === 'DRIVER' && profile?.driver ? <Badge tone={STATUS_TONE[profile.driver.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{profile.driver.status.toLowerCase()}</Badge> : undefined}
          >
            {t.can.map((c) => (
              <View key={c} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Icon name="check" size={11} color={colors.onLime} />
                </View>
                <Text style={[s.body, { flex: 1 }]}>{c}</Text>
              </View>
            ))}
            {p === 'DRIVER' && prefs.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {prefs.map(([k]) => (
                  <Badge key={k} tone="neutral">{PREF_LABEL[k] ?? k}</Badge>
                ))}
              </View>
            ) : null}
            {p === 'DRIVER' && !profile?.driver ? <Text style={s.small}>You are not registered as a driver yet. Open Drive to start.</Text> : null}
            {t.tools.length === 0 ? (
              <Text style={s.small}>Your tools open when a RYDO super admin gives you access to a client. Until then there is nothing to manage here.</Text>
            ) : (
              t.tools.map((x) => (
                <Pressable key={String(x.href) + x.t} accessibilityRole="link" onPress={() => router.push(x.href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={x.icon} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.strong, { fontSize: 15 }]}>{x.t}</Text>
                    <Text style={[s.small, { fontSize: 12 }]}>{x.d}</Text>
                  </View>
                  <Icon name="next" size={16} color={colors.muted} />
                </Pressable>
              ))
            )}
          </Section>
        );
      })}
    </>
  );
}
