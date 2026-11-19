import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import type { MemberCard as Card } from '@/lib/types';
import { Avatar, Badge, Button, Label, Notice, s } from './ui';

/** A colleague's card (GET /members/:id/card) with a Block button (POST /me/blocks). Never shows phone or email. */
export function MemberCard({ membershipId, onClose, onBlocked }: { membershipId: string | null; onClose: () => void; onBlocked?: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCard(null);
    setError(undefined);
    if (membershipId) api<Card>('GET', `/members/${membershipId}/card`).then(setCard, (e) => setError(errText(e)));
  }, [membershipId]);

  const block = () =>
    Alert.alert(`Block ${card?.name}?`, 'You will not see each other’s rides and cannot message each other. You can unblock from Account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api('POST', '/me/blocks', { membershipId });
            onClose();
            onBlocked?.();
          } catch (e) {
            Alert.alert('Could not block', errText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const v = card?.driver?.vehicle;
  return (
    <Modal visible={!!membershipId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.45)' }} />
      <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 14 }}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!card && !error ? <ActivityIndicator color={colors.ink} style={{ padding: 30 }} /> : null}
        {card ? (
          <>
            <View style={s.row}>
              <Avatar name={card.name} size={60} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h2}>{card.name}</Text>
                <Text style={s.small}>{card.department ?? 'Colleague'}</Text>
                {card.driver ? <Badge tone="success">Verified driver</Badge> : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                [card.rating.average ? `★ ${card.rating.average.toFixed(1)}` : '—', `${card.rating.count} ratings`],
                [String(card.ridesCompleted.asDriver), 'rides driven'],
                [`${Math.round(card.reliabilityScore)}%`, 'reliable'],
              ].map(([val, lab]) => (
                <View key={lab} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 10 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{val}</Text>
                  <Text style={s.small}>{lab}</Text>
                </View>
              ))}
            </View>
            {v ? <Text style={s.small}>Drives a {v.color} {v.make} {v.model}{v.carType ? ` (${v.carType.toLowerCase()})` : ''}{v.hasAc ? ' · AC' : ''}</Text> : null}
            {card.rating.recentComments?.length ? (
              <View style={{ gap: 6 }}>
                <Label>Recent comments</Label>
                {card.rating.recentComments.slice(0, 3).map((c, i) => <Text key={i} style={s.small}>“{c.comment}” · {'★'.repeat(c.stars)}</Text>)}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button small variant="ghost" label="Block" style={{ flex: 1 }} loading={busy} onPress={block} />
              <Button small label="Close" style={{ flex: 1 }} onPress={onClose} />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
