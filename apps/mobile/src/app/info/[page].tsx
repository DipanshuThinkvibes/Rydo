import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { INFO_PAGES, type InfoBlock, type InfoSlug } from '@/lib/info-pages';
import { BackButton, Button, s } from '@/components/ui';

/** Text with **bold** parts. */
function Rich({ text, style }: { text: string; style?: object }) {
  return (
    <Text style={[{ fontSize: 15, lineHeight: 23, color: colors.muted }, style]}>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') ? (
          <Text key={i} style={{ fontWeight: '800', color: colors.ink }}>{part.slice(2, -2)}</Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

const H2 = ({ children }: { children: string }) => <Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: colors.ink }}>{children}</Text>;

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={[s.strong, { flex: 1 }]}>{q}</Text>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: open ? '45deg' : '0deg' }] }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>+</Text>
        </View>
      </View>
      {open ? <Rich text={a} style={{ fontSize: 14, lineHeight: 21 }} /> : null}
    </Pressable>
  );
}

function Block({ b }: { b: InfoBlock }) {
  switch (b.kind) {
    case 'section':
      return (
        <View style={{ gap: 8 }}>
          <H2>{b.title}</H2>
          {b.text ? <Rich text={b.text} /> : null}
          {b.list?.map((x) => (
            <View key={x} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontSize: 15, lineHeight: 23, color: colors.ink }}>•</Text>
              <Rich text={x} style={{ flex: 1 }} />
            </View>
          ))}
        </View>
      );
    case 'steps':
      return (
        <View style={{ gap: 12 }}>
          <H2>{b.title}</H2>
          {b.steps.map(([t, d], i) => (
            <View key={t} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.lime, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.strong}>{t}</Text>
                <Text style={s.small}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case 'cards':
      return (
        <View style={{ gap: 10 }}>
          {b.items.map(([t, d]) => (
            <View key={t} style={{ padding: 16, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, gap: 4 }}>
              <Text style={s.strong}>{t}</Text>
              <Text style={s.small}>{d}</Text>
            </View>
          ))}
        </View>
      );
    case 'faq':
      return (
        <View style={{ gap: 10 }}>
          {b.items.map(([q, a]) => <Faq key={q} q={q} a={a} />)}
        </View>
      );
    case 'price':
      return (
        <View style={{ padding: 22, borderRadius: 24, backgroundColor: colors.ink, gap: 10 }}>
          <Text style={{ color: colors.mutedOnDark, fontWeight: '700' }}>{b.label}</Text>
          <Text style={{ color: colors.lime, fontSize: 44, fontWeight: '800' }}>{b.price}</Text>
          <Text style={{ color: colors.white, fontSize: 15, lineHeight: 22 }}>{b.text}</Text>
          {b.list.map((x) => (
            <Text key={x} style={{ color: colors.white, fontSize: 15 }}>
              <Text style={{ color: colors.lime, fontWeight: '800' }}>✓ </Text>
              {x}
            </Text>
          ))}
        </View>
      );
  }
}

/** One of the web's text pages (how it works, FAQ, for companies, pricing, about, privacy, terms). */
export default function InfoPageScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  if (!page || !(page in INFO_PAGES)) return <Redirect href="/info" />;
  const p: (typeof INFO_PAGES)[InfoSlug] & { updated?: string; draft?: boolean; footer?: string } = INFO_PAGES[page as InfoSlug];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
        <BackButton />
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34, fontWeight: '800', color: colors.ink }}>{p.title}</Text>
          <Text style={{ fontSize: 16, lineHeight: 24, color: colors.muted }}>{p.intro}</Text>
          {p.updated ? <Text style={[s.small, { fontSize: 12 }]}>Last updated {p.updated}</Text> : null}
          {p.draft ? (
            <View accessibilityRole="text" style={{ padding: 12, borderRadius: 14, backgroundColor: colors.warningBg }}>
              <Text style={{ color: colors.warningText, fontSize: 13, lineHeight: 19 }}>Draft for review. This text describes how RYDO works today. Have your legal team review it before launch.</Text>
            </View>
          ) : null}
        </View>
        {p.blocks.map((b, i) => <Block key={i} b={b} />)}
        {p.footer ? <Text style={s.small}>{p.footer}</Text> : null}
        <Button label={page === 'how-it-works' || page === 'about' || page === 'for-companies' || page === 'pricing' ? 'Bring RYDO to your company' : 'Questions? Contact us'} variant="ghost" onPress={() => router.push('/contact')} />
      </ScrollView>
    </SafeAreaView>
  );
}
