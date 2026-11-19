import { Linking, Share } from 'react-native';
import { Alert } from './dialog';
import { api, errText } from './api';

async function shareLink(rideId: string) {
  try {
    const r = await api<{ url: string }>('POST', `/rides/${rideId}/share`);
    await Share.share({ message: `Follow my RYDO ride live until it ends: ${r.url}` });
  } catch (e) {
    Alert.alert('Could not share the trip', errText(e));
  }
}

/** Emails the live-trip link to every emergency contact that has an email (POST /rides/:id/share/contacts). */
async function emailContacts(rideId: string, onNoContacts?: () => void) {
  try {
    const contacts = await api<{ id: string; email: string | null }[]>('GET', '/me/emergency-contacts');
    if (!contacts.some((c) => c.email)) {
      Alert.alert('No emergency contact with an email', 'Add one in Account, then try again.', [
        { text: 'Later', style: 'cancel' },
        ...(onNoContacts ? [{ text: 'Add contact', onPress: onNoContacts }] : []),
      ]);
      return;
    }
    const r = await api<{ sentTo: { name: string }[]; skippedNoEmail: { name: string }[] }>('POST', `/rides/${rideId}/share/contacts`, { contactIds: contacts.map((c) => c.id) });
    const sent = r.sentTo.map((x) => x.name).join(', ');
    const skipped = r.skippedNoEmail.map((x) => x.name).join(', ');
    Alert.alert('Trip link sent', `${sent ? `Emailed to ${sent}.` : ''}${skipped ? ` Not sent to ${skipped} (no email).` : ''}`);
  } catch (e) {
    Alert.alert('Could not send the trip link', errText(e));
  }
}

/** Share the live trip: email my emergency contacts, or open the phone's share sheet (WhatsApp, SMS…). */
export function shareTrip(rideId: string, onNoContacts?: () => void) {
  Alert.alert('Share your trip', 'Anyone with the link can watch this ride live until it ends.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Email my emergency contacts', onPress: () => emailContacts(rideId, onNoContacts) },
    { text: 'Share link…', onPress: () => shareLink(rideId) },
  ]);
}

/** Asks first, then raises an SOS to the company's admins. */
export function confirmSos(rideId: string, onDone?: () => void) {
  Alert.alert('Safety', "Send an SOS to your company's safety team? They see this ride and will call you. In danger right now? Call 112.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Call 112', onPress: () => Linking.openURL('tel:112') },
    {
      text: 'Send SOS',
      style: 'destructive',
      onPress: async () => {
        try {
          const r = await api<{ alreadyOpen: boolean }>('POST', `/rides/${rideId}/sos`, {});
          Alert.alert('SOS sent', r.alreadyOpen ? 'Your SOS is already with your company. They will call you.' : "Your company's admins have your ride and will call you.");
          onDone?.();
        } catch (e) {
          Alert.alert('SOS failed', `${errText(e)} Call 112 if you are in danger.`);
        }
      },
    },
  ]);
}

/** Opens Google Maps (or the phone's maps app) with driving directions to a point. */
export function openDirections(to: { lat: number; lng: number }) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`).catch(() => undefined);
}
