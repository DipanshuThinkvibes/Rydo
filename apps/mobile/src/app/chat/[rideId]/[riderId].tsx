import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtTime, fmtWhen, shortName } from '@/lib/format';
import { useData } from '@/lib/hooks';
import type { ChatMessage, ChatThread } from '@/lib/types';
import { Icon } from '@/components/icons';
import { Avatar, BackButton, Notice, s } from '@/components/ui';

const RIDER_QUICK = ["I'm at the pickup", 'Running 3 min late', 'On my way', 'Thanks!'];
const DRIVER_QUICK = ["I'm at the pickup", 'Running 5 min late', 'Stuck in traffic', 'See you soon'];

interface Meta {
  canSend: boolean;
  archived: boolean;
  blocked: boolean;
  as: 'DRIVER' | 'RIDER';
}

/** Prototype screen 9: private chat between the driver and one rider of a ride. Phone numbers stay hidden. */
export default function Chat() {
  const { rideId, riderId } = useLocalSearchParams<{ rideId: string; riderId: string }>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<FlatList<ChatMessage>>(null);

  const thread = useData(() => api<ChatThread[]>('GET', `/rides/${rideId}/chat`), [rideId]);
  const msgs = useData(() => apiWithMeta<ChatMessage[], Meta>('GET', `/rides/${rideId}/chat/${riderId}/messages?limit=50`), [rideId, riderId], 4000);
  const t = thread.data?.find((x) => riderId === 'me' || x.riderMembershipId === riderId) ?? thread.data?.[0];
  const meta = msgs.data?.meta;
  const items = msgs.data?.data ?? [];

  useEffect(() => {
    if (items.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [items.length]);

  async function send(body: string) {
    const b = body.trim();
    if (!b) return;
    setSending(true);
    setError(undefined);
    try {
      const m = await api<ChatMessage>('POST', `/rides/${rideId}/chat/${riderId}/messages`, { body: b });
      setText('');
      msgs.setData((cur) => (cur ? { ...cur, data: [...cur.data, m] } : cur));
    } catch (e) {
      setError(errText(e));
    } finally {
      setSending(false);
    }
  }

  const other = t ? shortName(t.with.name) : 'Chat';
  const canSend = meta?.canSend ?? t?.canSend ?? false;
  const quick = (meta?.as ?? t?.as) === 'DRIVER' ? DRIVER_QUICK : RIDER_QUICK;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <BackButton />
        <Avatar name={other} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>{other}</Text>
          <Text style={s.small}>{t?.lastMessage ? `Last message ${fmtWhen(t.lastMessage.at)}` : 'Ride chat'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={10}>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8, maxWidth: 320 }}>
              <Icon name="lock" size={14} color={colors.muted} />
              <Text style={[s.small, { flex: 1, textAlign: 'center' }]}>Only people on this ride can read this chat. Phone numbers stay hidden.</Text>
            </View>
          }
          ListEmptyComponent={msgs.data ? <Text style={[s.small, { textAlign: 'center', marginTop: 20 }]}>Say hello. Agree where you will meet.</Text> : undefined}
          renderItem={({ item }) => (
            <View style={{ alignSelf: item.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3 }}>
              <View style={{ backgroundColor: item.mine ? colors.inkBg : colors.surface2, borderRadius: 18, borderBottomRightRadius: item.mine ? 6 : 18, borderBottomLeftRadius: item.mine ? 18 : 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: item.mine ? colors.onInk : colors.ink }}>{item.body}</Text>
              </View>
              <Text style={[s.small, { fontSize: 11, alignSelf: item.mine ? 'flex-end' : 'flex-start' }]}>
                {fmtTime(item.createdAt)}
                {item.mine && item.readAt ? ' · read' : ''}
              </Text>
            </View>
          )}
        />

        {error ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error">{error}</Notice></View> : null}
        {msgs.data && !canSend ? (
          <View style={{ padding: 16 }}>
            <Notice tone="info">{meta?.blocked ? 'You cannot message this person.' : 'This chat is closed because the ride has ended.'}</Notice>
          </View>
        ) : (
          <View style={{ paddingBottom: 8, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
            <FlatList
              horizontal
              data={quick}
              keyExtractor={(q) => q}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" disabled={sending} onPress={() => send(item)} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5, borderColor: colors.lineStrong, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{item}</Text>
                </Pressable>
              )}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={`Message ${other.split(' ')[0]}`}
                placeholderTextColor={colors.muted}
                accessibilityLabel="Message"
                maxLength={1000}
                multiline
                style={{ flex: 1, minHeight: 50, maxHeight: 120, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, fontSize: 16, color: colors.ink }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={sending || !text.trim()}
                onPress={() => send(text)}
                style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: colors.inkBg, alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.5 : 1 }}
              >
                <Icon name="send" size={22} color={colors.lime} />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
