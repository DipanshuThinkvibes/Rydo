import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import type { FeedbackItem } from '@/lib/types';
import { BackButton, Badge, Button, Card, Chip, Label, Notice, s } from '@/components/ui';

/** Same as FEEDBACK_CATEGORIES in packages/shared. */
const CATEGORIES = [
  ['USABILITY', 'Using the app'],
  ['MATCHING', 'Ride matching'],
  ['COMMUNICATION', 'Chat & messages'],
  ['COST_SHARING', 'Cost sharing'],
  ['GENERAL', 'Something else'],
] as const;
const LABEL = Object.fromEntries(CATEGORIES) as Record<string, string>;

/** Feedback form (POST /me/feedback) and what I sent before (GET /me/feedback). */
export default function Feedback() {
  const [category, setCategory] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const mine = useData(() => api<FeedbackItem[]>('GET', '/me/feedback'), []);

  async function send() {
    setBusy(true);
    setMsg(undefined);
    try {
      await api('POST', '/me/feedback', { category, comment: comment.trim(), ...(rating ? { rating } : {}) });
      setCategory(null);
      setRating(0);
      setComment('');
      setMsg({ tone: 'ok', text: 'Thanks! Your company and the RYDO team read every message.' });
      mine.reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={s.h1}>Feedback</Text>
          </View>
          <View style={{ gap: 10 }}>
            <Label>About</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(([k, l]) => <Chip key={k} label={l} selected={category === k} onPress={() => setCategory(k)} />)}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Label>How is RYDO for you? (optional)</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} stars`} accessibilityState={{ selected: rating === n }} onPress={() => setRating(rating === n ? 0 : n)} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: n <= rating ? colors.ink : colors.white, borderWidth: 1.5, borderColor: n <= rating ? colors.ink : colors.lineStrong }}>
                  <Text style={{ fontSize: 22, color: n <= rating ? colors.lime : colors.muted }}>★</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            placeholder="What should we keep, fix or add?"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Your feedback"
            style={{ minHeight: 130, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, padding: 16, fontSize: 16, color: colors.ink, textAlignVertical: 'top' }}
          />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button label="Send feedback" loading={busy} disabled={!category || comment.trim().length < 3} onPress={send} />

          {mine.data?.length ? (
            <View style={{ gap: 10 }}>
              <Label>Sent before</Label>
              {mine.data.map((f) => (
                <Card key={f.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.strong}>{LABEL[f.category] ?? f.category}{f.rating ? ` · ${'★'.repeat(f.rating)}` : ''}</Text>
                    <Badge tone={f.status === 'NEW' ? 'neutral' : 'success'}>{f.status === 'NEW' ? 'sent' : f.status.toLowerCase()}</Badge>
                  </View>
                  <Text style={s.small}>{fmtWhen(f.createdAt)}</Text>
                  <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 21 }}>{f.comment}</Text>
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
