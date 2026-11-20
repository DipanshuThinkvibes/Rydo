import { Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { Icon } from './icons';

/**
 * Same notice as the web header: everyone sees when carpool stopped because the company's RYDO Share licence is not
 * active; admins also see when it ends within 14 days.
 */
export function LicenceBanner() {
  const { shareLicence: share, isAdmin, active } = useSession();
  if (!active || !share) return null;
  const note =
    share.state !== 'ACTIVE'
      ? { stopped: true, text: share.state === 'SCHEDULED' ? "Your company's RYDO Share licence has not started yet, so carpool is not available." : "Your company's RYDO Share licence is not active, so carpool is paused. Ask your admin to contact RYDO." }
      : share.daysLeft !== null && share.daysLeft <= 14 && isAdmin
        ? { stopped: false, text: `Your company's RYDO Share licence ends in ${Math.max(share.daysLeft, 0)} ${share.daysLeft === 1 ? 'day' : 'days'}. Contact RYDO to renew it so carpool does not stop.` }
        : null;
  if (!note) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 14, backgroundColor: note.stopped ? colors.dangerBg : colors.warningBg }}>
      <Icon name="alert" size={16} color={note.stopped ? colors.danger : colors.warningText} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600', color: note.stopped ? colors.danger : colors.warningText }}>{note.text}</Text>
    </View>
  );
}
