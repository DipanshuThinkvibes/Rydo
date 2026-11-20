import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OrgRoleName } from '@rydo/shared';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { appendFile, pick } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { appHref } from '@/lib/web-routes';
import { Icon, type IconName } from './icons';
import { Avatar, BackButton, s } from './ui';

/**
 * The web account hub (apps/web/src/components/account-hub.tsx) on the phone: one identity header with the persona,
 * four numbers from /me/highlights, and tabs Profile · Preferences · Security · Safety & privacy · role.
 */
export interface Profile {
  name: string;
  email: string;
  phone: string | null;
  gender: string;
  photoUrl: string | null;
  department: string | null;
  roles: string[];
  reliabilityScore: number;
  rating: { average: number | null; count: number; recentComments: { stars: number; comment: string }[] };
  ridesCompleted: { asDriver: number; asRider: number };
  driver: { status: string; preferences?: Record<string, boolean> } | null;
  emergencyContacts: number;
}
export interface Highlight {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
}
export interface EmailState {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
}
export type Msg = { tone: 'ok' | 'error'; text: string } | undefined;

const TILE_ICON: Record<string, IconName> = {
  clients: 'globe', licences: 'badge', reports: 'flag', blocked: 'close', employees: 'users', waiting: 'clock', offices: 'building', trips: 'ticket',
  drivers: 'badge', paused: 'close', today: 'route', issues: 'flag', sos: 'alert', noshows: 'clock', rides: 'car', riders: 'users', rating: 'star', reliability: 'shield', co2: 'sparkle',
};

export type PersonaKey = 'OWNER' | 'SUPPORT' | OrgRoleName;
/** Same personas, names and blurbs as the web; `band` is the header colour. */
export const PERSONA: Record<PersonaKey, { label: string; icon: IconName; band: string; blurb: string }> = {
  OWNER: { label: 'RYDO owner', icon: 'shield', band: '#C8F560', blurb: 'You run RYDO for every client company.' },
  SUPPORT: { label: 'RYDO support', icon: 'chat', band: '#2563EB', blurb: 'You help client companies. Access to a company is read-only and always logged.' },
  ORG_ADMIN: { label: 'Org admin', icon: 'building', band: '#2563EB', blurb: 'You set up and run your company on RYDO.' },
  HR_ADMIN: { label: 'HR admin', icon: 'users', band: '#EA580C', blurb: 'You approve people and keep your team in order.' },
  OPS_ADMIN: { label: 'Ops admin', icon: 'route', band: '#2563EB', blurb: 'You keep daily rides and safety running smoothly.' },
  DRIVER: { label: 'Driver', icon: 'wheel', band: '#C8F560', blurb: 'You share your seats with colleagues.' },
  RIDER: { label: 'Rider', icon: 'car', band: '#2563EB', blurb: 'You ride to work with colleagues.' },
};
const ORDER: PersonaKey[] = ['OWNER', 'SUPPORT', 'ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'DRIVER', 'RIDER'];

/** Which personas this person holds right now, most senior first. */
export function usePersonas(): PersonaKey[] {
  const { roles, isPlatformAdmin, platformRole } = useSession();
  const held = new Set<PersonaKey>(roles);
  if (isPlatformAdmin) held.add('OWNER');
  else if (platformRole === 'SUPPORT') held.add('SUPPORT');
  return ORDER.filter((p) => held.has(p));
}

interface Ctx {
  profile: Profile | null;
  emailState: EmailState | null;
  setEmailState: (e: EmailState) => void;
  reloadProfile: () => Promise<void>;
  removePhoto: () => Promise<void>;
  photoUrl: string | null;
}
const AccountCtx = createContext<Ctx | null>(null);
export const useAccount = () => {
  const c = useContext(AccountCtx);
  if (!c) throw new Error('useAccount needs AccountFrame');
  return c;
};

/** A titled card with an icon chip: the block every account screen is built from (web Section). */
export function Section({ icon, title, sub, children, aside }: { icon: IconName; title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <View style={[s.card, { gap: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{title}</Text>
          {sub ? <Text style={s.small}>{sub}</Text> : null}
        </View>
        {aside}
      </View>
      {children}
    </View>
  );
}

export type AccountTab = 'profile' | 'preferences' | 'security' | 'safety' | 'role';

/** Identity header and tabs shared by Profile, Preferences, Security, Safety and Role. Tabs depend on who you are. */
export function AccountFrame({ tab, children }: { tab: AccountTab; children: React.ReactNode }) {
  const { me, membership, active, isPlatformAdmin, reload } = useSession();
  const personas = usePersonas();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emailState, setEmailState] = useState<EmailState | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Highlight[] | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPhoto = useCallback(() => api<{ photoUrl: string | null }>('GET', '/me/photo').then((r) => setPhotoUrl(r.photoUrl), () => undefined), []);
  const reloadProfile = useCallback(async () => {
    await Promise.all([active ? api<Profile>('GET', '/me/profile').then(setProfile, () => undefined) : Promise.resolve(), loadPhoto()]);
  }, [active, loadPhoto]);
  const loadAll = useCallback(async () => {
    await Promise.all([
      reloadProfile(),
      api<EmailState>('GET', '/me/email').then(setEmailState, () => undefined),
      active || isPlatformAdmin ? api<{ tiles: Highlight[] }>('GET', '/me/highlights').then((r) => setTiles(r.tiles), () => setTiles([])) : Promise.resolve(),
    ]);
  }, [reloadProfile, active, isPlatformAdmin]);
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /** Sent through the RYDO API (like the web), so it works even when the phone can't reach the file store. */
  const uploadFrom = async (camera: boolean) => {
    const file = await pick(camera);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Alert.alert('Choose a JPG, PNG or WebP photo.');
    setPhotoBusy(true);
    try {
      const form = new FormData();
      await appendFile(form, 'file', file);
      await api('POST', '/me/photo/file', form);
      await reloadProfile();
      await reload();
    } catch (e) {
      Alert.alert('Could not upload', errText(e, 'The photo could not be uploaded. Try again.'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = useCallback(async () => {
    await api('DELETE', '/me/photo');
    await reloadProfile();
  }, [reloadProfile]);
  const photoMenu = () =>
    Alert.alert('Profile photo', 'Colleagues trust a face.', [
      ...(Platform.OS !== 'web' ? [{ text: 'Take a photo', onPress: () => uploadFrom(true) }] : []),
      { text: 'Choose from gallery', onPress: () => uploadFrom(false) },
      ...(photoUrl ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => removePhoto() }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const ctx = useMemo<Ctx>(() => ({ profile, emailState, setEmailState, reloadProfile, removePhoto, photoUrl }), [profile, emailState, reloadProfile, removePhoto, photoUrl]);
  const main = personas[0];
  const persona = main ? PERSONA[main] : null;
  const name = profile?.name ?? me?.user.name ?? me?.user.email ?? '';
  const roleTab = personas.some((p) => p === 'ORG_ADMIN' || p === 'HR_ADMIN' || p === 'OPS_ADMIN') ? 'Admin tools' : main === 'OWNER' ? 'RYDO owner' : main === 'DRIVER' ? 'Driving' : 'My rides';
  const tabs: { key: AccountTab; href: '/account' | '/settings' | '/settings/security' | '/settings/safety' | '/settings/role'; label: string; icon: IconName; show: boolean }[] = [
    { key: 'profile', href: '/account', label: 'Profile', icon: 'user', show: true },
    { key: 'preferences', href: '/settings', label: 'Preferences', icon: 'settings', show: true },
    { key: 'security', href: '/settings/security', label: 'Security', icon: 'shield', show: true },
    { key: 'safety', href: '/settings/safety', label: 'Safety & privacy', icon: 'alert', show: active },
    { key: 'role', href: '/settings/role', label: roleTab, icon: persona?.icon ?? 'car', show: personas.length > 0 },
  ];

  return (
    <AccountCtx.Provider value={ctx}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surface }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await loadAll(), setRefreshing(false))} />}
          >
            {/* Identity header with the persona colour band and watermark icon */}
            <View style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 110, backgroundColor: persona?.band ?? colors.lime, opacity: 0.28 }} />
              {persona ? (
                <View pointerEvents="none" style={{ position: 'absolute', right: -20, top: -10, opacity: 0.08 }}>
                  <Icon name={persona.icon} size={150} />
                </View>
              ) : null}
              <View style={{ padding: 20, gap: 14 }}>
                <BackButton />
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={photoUrl ? 'Change photo' : 'Add photo'} onPress={photoMenu} disabled={photoBusy}>
                    <View style={{ borderRadius: 52, borderWidth: 4, borderColor: colors.white }}>
                      {photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: 88, height: 88, borderRadius: 44 }} accessibilityLabel="Your profile photo" /> : <Avatar name={name || 'R'} size={88} />}
                    </View>
                    <View style={{ position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={photoBusy ? 'clock' : 'plus'} size={15} color={colors.onLime} />
                    </View>
                  </Pressable>
                  <View style={{ flex: 1, gap: 4, paddingBottom: 4 }}>
                    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: colors.ink }} numberOfLines={2}>{name}</Text>
                    <Text style={s.small} numberOfLines={1}>{me?.user.email}</Text>
                    {emailState ? (
                      emailState.verified ? (
                        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.successBg }}>
                          <Icon name="check" size={11} color={colors.successText} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.successText }}>Verified</Text>
                        </View>
                      ) : (
                        <Pressable accessibilityRole="link" onPress={() => tab !== 'profile' && router.replace('/account')} style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.warningBg }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.warningText }}>Not verified · verify now ›</Text>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {personas.map((p) => (
                    <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p === 'DRIVER' ? colors.lime : colors.inkBg }}>
                      <Icon name={PERSONA[p].icon} size={13} color={p === 'DRIVER' ? colors.onLime : colors.lime} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: p === 'DRIVER' ? colors.onLime : colors.onInk }}>{PERSONA[p].label}</Text>
                    </View>
                  ))}
                  {membership && active ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface2 }}>
                      <Icon name="building" size={13} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }}>{membership.organization.name}</Text>
                    </View>
                  ) : null}
                  {profile?.department ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface2 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }}>{profile.department}</Text>
                    </View>
                  ) : null}
                </View>
                {persona ? <Text style={s.small}>{persona.blurb}</Text> : null}

                {tiles && tiles.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {tiles.map((t) => (
                      <Pressable
                        key={t.key}
                        accessibilityRole={t.href ? 'link' : undefined}
                        disabled={!t.href}
                        onPress={() => t.href && router.push(appHref(t.href))}
                        style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={TILE_ICON[t.key] ?? 'sparkle'} size={17} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{t.value}</Text>
                          <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>{t.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 4 }}>
                {tabs
                  .filter((t) => t.show)
                  .map((t) => {
                    const on = t.key === tab;
                    return (
                      <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => !on && router.replace(t.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: on ? colors.lime : 'transparent' }}>
                        <Icon name={t.icon} size={16} color={on ? colors.ink : colors.muted} />
                        <Text style={{ fontWeight: on ? '800' : '600', color: on ? colors.ink : colors.muted }}>{t.label}</Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>

            <View style={{ padding: 16, gap: 14 }}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AccountCtx.Provider>
  );
}
