import type { StyleProp, ViewStyle } from 'react-native';
import type { LatLng } from '@rydo/shared';

/** Props shared by the phone pin map (pin-map.native.tsx, Google Maps) and the browser preview (pin-map.tsx). */
export interface PinMapProps {
  /** Where the map opens; the pin sits in the middle of it. */
  start: LatLng;
  /** Change `key` to fly the map (and so the pin) to `at`, e.g. "Use my location". */
  jumpTo?: { at: LatLng; key: number };
  /** The spot under the pin, each time the map stops moving. */
  onMove: (at: LatLng) => void;
  /** The map is being dragged (the pin lifts). */
  onDragStart?: () => void;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}
