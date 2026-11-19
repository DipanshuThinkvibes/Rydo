import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Adds the Google Maps keys from apps/mobile/.env (never committed) to app.json.
 * Expo Go on Android shows Google Maps without a key; development and store builds need these.
 * Use keys restricted to the app (Android package / iOS bundle id com.thinkvibes.rydo), not the web browser key.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'RYDO',
  slug: config.slug ?? 'rydo',
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
  },
  ios: {
    ...config.ios,
    config: { ...config.ios?.config, googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY },
  },
});
