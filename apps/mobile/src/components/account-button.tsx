import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { Avatar } from './ui';

/** Your initials; opens Account (profile, safety contacts, sign out). Shown on every tab. */
export function AccountButton({ size = 44, dark }: { size?: number; dark?: boolean }) {
  const { me } = useSession();
  if (!me) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Account and sign out" hitSlop={6} onPress={() => router.push('/account')}>
      <Avatar name={me.user.name} tone={dark ? 'lime' : 'ink'} size={size} />
    </Pressable>
  );
}
