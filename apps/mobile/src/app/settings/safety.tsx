import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { AccountFrame, Section, useAccount, usePersonas } from '@/components/account-hub';
import { Icon, type IconName } from '@/components/icons';
import { Badge, Notice, s } from '@/components/ui';

/** Safety and privacy tab (web /settings/safety): what others can see, and who is told when you share a trip. */
export default function SafetySettingsScreen() {
  return (
    <AccountFrame tab="safety">
      <SafetyTab />
    </AccountFrame>
  );
}

function SafetyTab() {
  const { active } = useSession();
  const { profile } = useAccount();
  const personas = usePersonas();
  const isDriver = personas.includes('DRIVER');
  const contacts = profile?.emergencyContacts ?? 0;
  if (!active) return <Notice tone="error">Safety settings belong to a company. Sign in to a company account to see them.</Notice>;
  const facts: { t: string; d: string }[] = [
    { t: 'Your phone number', d: 'Private. It is never shown to other employees.' },
    { t: 'Your ID proof', d: 'Only the last 4 characters are stored, and only your company HR can see them.' },
    { t: 'Your trips', d: 'Only people on the same ride see where you are, and only during the trip.' },
    ...(isDriver ? [{ t: 'Your vehicle', d: 'Riders on your ride see the car, plate and colour so they can find you.' }] : []),
  ];
  const tiles: { href: Href; icon: IconName; t: string; d: string }[] = [
    { href: '/safety', icon: 'chat', t: 'Emergency contacts', d: 'Who we tell if you share a trip' },
    { href: '/safety', icon: 'close', t: 'Blocked people', d: 'Never matched with you' },
    { href: '/issues', icon: 'flag', t: 'Report an issue', d: 'Tell your company or RYDO' },
  ];
  return (
    <>
      <Section icon="user" title="What others can see" sub="You decide nothing here by accident: private things stay private.">
        {facts.map((f) => (
          <View key={f.t} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Icon name="check" size={12} color={colors.successText} />
            </View>
            <Text style={[s.body, { flex: 1 }]}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{f.t}.</Text> {f.d}
            </Text>
          </View>
        ))}
      </Section>
      <Section icon="alert" title="In an emergency" sub="The SOS button on a live ride alerts your company's safety team and your contacts.">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.strong, { fontSize: 15 }]}>Emergency contacts</Text>
            <Text style={[s.small, { fontSize: 12 }]}>{contacts === 0 ? 'You have not added anyone yet.' : `${contacts} ${contacts === 1 ? 'person is' : 'people are'} ready to be told.`}</Text>
          </View>
          <Badge tone={contacts > 0 ? 'success' : 'warning'}>{contacts > 0 ? 'Ready' : 'Add one'}</Badge>
        </View>
      </Section>
      <Section icon="shield" title="Manage" sub="Everything safety-related, in one tap.">
        {tiles.map((t) => (
          <Pressable key={t.t} accessibilityRole="link" onPress={() => router.push(t.href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.icon} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.strong, { fontSize: 15 }]}>{t.t}</Text>
              <Text style={[s.small, { fontSize: 12 }]}>{t.d}</Text>
            </View>
            <Icon name="next" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </Section>
    </>
  );
}
