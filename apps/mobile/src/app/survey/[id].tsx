import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { useData } from '@/lib/hooks';
import type { OpenSurvey } from '@/lib/types';
import { BackButton, Button, Chip, Empty, Label, Loading, Notice, s } from '@/components/ui';

/** Answer one company survey (GET /me/surveys, POST /me/surveys/:id/responses). Answers are anonymous. */
export default function Survey() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useData(() => api<OpenSurvey[]>('GET', '/me/surveys'), []);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!data) return <Loading />;
  const survey = data.find((x) => x.id === id);
  if (!survey || survey.answered)
    return (
      <SafeAreaView style={{ flex: 1, padding: 20, gap: 16, backgroundColor: colors.white }}>
        <BackButton />
        <Empty title={survey?.answered ? 'Already answered' : 'Survey closed'}>{survey?.answered ? 'Thanks, your answers are in.' : 'This survey is no longer open.'}</Empty>
      </SafeAreaView>
    );

  const required = survey.questions.filter((q) => q.type !== 'TEXT');
  const ready = required.every((q) => answers[q.id] !== undefined);
  const set = (qid: string, v: number | string) => setAnswers((a) => ({ ...a, [qid]: v }));

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== ''));
      await api('POST', `/me/surveys/${survey!.id}/responses`, { answers: clean });
      Alert.alert('Thank you', 'Your answers are in. Nobody can see who answered what.');
      router.back();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={[s.h2, { flex: 1 }]}>{survey.title}</Text>
          </View>
          {survey.description ? <Text style={s.body}>{survey.description}</Text> : null}
          <Notice tone="info">Anonymous: your company sees totals only, never who answered.</Notice>
          {survey.questions.map((q, i) => (
            <View key={q.id} style={{ gap: 10 }}>
              <Label>Question {i + 1}{q.type === 'TEXT' ? ' · optional' : ''}</Label>
              <Text style={s.strong}>{q.text}</Text>
              {q.type === 'RATING' && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = answers[q.id] === n;
                    return (
                      <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n} of 5`} onPress={() => set(q.id, n)} style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.ink : colors.white, borderWidth: 1.5, borderColor: on ? colors.ink : colors.lineStrong }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: on ? colors.lime : colors.ink }}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {q.type === 'CHOICE' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {q.options.map((o) => <Chip key={o} label={o} selected={answers[q.id] === o} onPress={() => set(q.id, o)} />)}
                </View>
              )}
              {q.type === 'TEXT' && (
                <TextInput
                  value={(answers[q.id] as string) ?? ''}
                  onChangeText={(t) => set(q.id, t)}
                  multiline
                  maxLength={2000}
                  accessibilityLabel={q.text}
                  placeholder="Your answer"
                  placeholderTextColor={colors.muted}
                  style={{ minHeight: 100, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, padding: 14, fontSize: 16, color: colors.ink, textAlignVertical: 'top' }}
                />
              )}
            </View>
          ))}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button label="Send answers" loading={busy} disabled={!ready} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
