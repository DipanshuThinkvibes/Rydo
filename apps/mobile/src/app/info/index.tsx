import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { INFO_ORDER, INFO_PAGES } from '@/lib/info-pages';
import { Icon } from '@/components/icons';
import { BackButton, Card, s } from '@/components/ui';

/** Help and about: the web's public pages, plus Contact us. Works signed in or out. */
export default function InfoHub() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Help and about</Text>
        </View>
        <Card style={{ gap: 2, paddingVertical: 6 }}>
          {INFO_ORDER.map(({ slug, sub }, i) => (
            <Pressable
              key={slug}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/info/[page]', params: { page: slug } })}
              style={({ pressed }) => [s.row, { paddingVertical: 12, opacity: pressed ? 0.6 : 1, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{INFO_PAGES[slug].title}</Text>
                <Text style={s.small}>{sub}</Text>
              </View>
              <Icon name="next" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
        <Card onPress={() => router.push('/contact')} style={[s.row, { backgroundColor: colors.ink }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.strong, { color: colors.white }]}>Contact us</Text>
            <Text style={[s.small, { color: colors.mutedOnDark }]}>Bring RYDO to your company</Text>
          </View>
          <Icon name="next" size={22} color={colors.lime} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
