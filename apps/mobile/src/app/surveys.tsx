import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { dayOf } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import type { OpenSurvey } from '@/lib/types';
import { BackButton, Badge, Button, Card, Empty, Loading, s } from '@/components/ui';

/** Web /surveys: surveys your company asked you to answer (answering opens the survey screen). */
export default function Surveys() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: items, reload } = useData(() => api<OpenSurvey[]>('GET', '/me/surveys').catch(() => [] as OpenSurvey[]), []);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Surveys</Text>
        </View>
        <Text style={s.small}>A minute of your time helps improve commuting at your company. Answers are anonymous in the results.</Text>
        {!items ? <Loading /> : null}
        {items?.length === 0 ? <Empty title="No open surveys">When your company sends one, you will get a notification.</Empty> : null}
        {items?.map((sv) => (
          <Card key={sv.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.strong, { flex: 1 }]}>{sv.title}</Text>
              {sv.answered ? <Badge tone="success">answered</Badge> : <Badge tone="lime">new</Badge>}
            </View>
            {sv.closesAt ? <Text style={[s.small, { fontSize: 12 }]}>Closes {dayOf(sv.closesAt)}</Text> : null}
            {sv.description ? <Text style={s.body}>{sv.description}</Text> : null}
            {!sv.answered ? <Button small label="Answer survey" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: sv.id } })} /> : null}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
