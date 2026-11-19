import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { BackButton, Button, Chip, Label, Notice, s } from '@/components/ui';

/** Same categories as ISSUE_CATEGORIES in packages/shared (kept here so the app works with an older shared build). */
const CATEGORIES = [
  ['UNSAFE_DRIVING', 'Unsafe driving'],
  ['HARASSMENT', 'Harassment'],
  ['LATE_OR_NO_SHOW', 'Late or no-show'],
  ['ROUTE', 'Route'],
  ['COST', 'Cost'],
  ['APP_BUG', 'App problem'],
  ['OTHER', 'Other'],
] as const;

/** Report a problem with a ride (or the app). Goes to the company's admins at once. */
export default function Report() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await api('POST', '/me/issues', { category, description: text.trim(), ...(rideId ? { rideId } : {}) });
      Alert.alert('Report sent', 'Your company’s admins have it now. You’ll get a notification when they update it.');
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
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={s.h1}>Report a problem</Text>
          </View>
          <Text style={s.body}>{rideId ? 'About this ride. ' : ''}Only your company’s admins see this report.</Text>
          <View style={{ gap: 10 }}>
            <Label>What happened</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(([k, l]) => <Chip key={k} label={l} selected={category === k} onPress={() => setCategory(k)} />)}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Label>Details</Label>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              placeholder="Tell us what happened (at least 10 characters)"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Details"
              style={{ minHeight: 140, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, padding: 16, fontSize: 16, color: colors.ink, textAlignVertical: 'top' }}
            />
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button label="Send report" loading={busy} disabled={!category || text.trim().length < 10} onPress={submit} />
          <Text style={[s.small, { textAlign: 'center' }]}>In danger right now? Use Safety on the trip screen or call 112.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
