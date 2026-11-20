import { useEffect, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colors } from '@rydo/ui-tokens';

/**
 * Google OAuth client ids (Google Cloud → Credentials) from apps/mobile/.env. They are public ids, not secrets.
 * The same ids go to the API's GOOGLE_OAUTH_CLIENT_IDS so it accepts the tokens.
 */
const ids = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};
const forThisPlatform = Platform.OS === 'android' ? ids.androidClientId : Platform.OS === 'ios' ? ids.iosClientId : ids.webClientId;

/**
 * The Google sign-in package needs native code that Expo Go does not ship (ExpoApplication), so it is loaded only
 * when a client id is set, and a failed load just hides the button instead of crashing the sign-in screens.
 * Google sign-in works in a development build (npx expo run:android / eas build), not in Expo Go.
 */
type GoogleProvider = typeof import('expo-auth-session/providers/google');
let Google: GoogleProvider | null = null;
if (forThisPlatform) {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    Google = require('expo-auth-session/providers/google') as GoogleProvider;
    (require('expo-web-browser') as typeof import('expo-web-browser')).maybeCompleteAuthSession();
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    Google = null;
  }
}

/** True when "Continue with Google" can work here (client id set and the native part present). */
export const googleSignInAvailable = !!Google;

/** "Continue with Google". Render only when googleSignInAvailable (the Google hook needs a client id). */
type ButtonProps = { onIdToken: (idToken: string) => void; onError: (message: string) => void; busy?: boolean; label?: string; disabled?: boolean };

export function GoogleButton(props: ButtonProps) {
  return Google ? <LoadedGoogleButton google={Google} {...props} /> : null;
}

function LoadedGoogleButton({ google, onIdToken, onError, busy, label = 'Continue with Google', disabled }: ButtonProps & { google: GoogleProvider }) {
  const [request, response, promptAsync] = google.useIdTokenAuthRequest(ids);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const token = response.params.id_token;
      if (token && handled.current !== token) {
        handled.current = token;
        onIdToken(token);
      } else if (!token) onError('Google did not return a sign-in. Try again.');
    } else if (response.type === 'error') onError('Google sign-in failed. Try again or use your work email.');
  }, [response, onIdToken, onError]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!request || busy || disabled}
      onPress={() => promptAsync()}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.lineStrong,
        backgroundColor: colors.white,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: !request || busy || disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {/* Google "G" in its four colours, drawn with text */}
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#4285F4' }}>G</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{busy ? 'Signing in…' : label}</Text>
    </Pressable>
  );
}
