import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LatLng } from '@rydo/shared';

/** Props shared by the phone map (route-map.native.tsx, Google Maps) and the browser preview map (route-map.tsx). */
export interface MapRoute {
  id: string;
  path: LatLng[];
  /** Highlighted route; others are drawn faint. */
  active?: boolean;
}
export interface MapMarker {
  id: string;
  at: LatLng;
  kind: 'start' | 'end' | 'pickup' | 'car' | 'me' | 'person';
  /** Car marker: ink circle with a lime arrow (rider view) instead of lime with ink (driver view). */
  inkCar?: boolean;
  /** Pill text next to the marker (pickup / end), or the person's name (person). */
  label?: string;
  headingDeg?: number | null;
}

export interface RouteMapProps {
  routes?: MapRoute[];
  markers?: MapMarker[];
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Room kept free of route/markers, e.g. under a bottom sheet or a top banner. */
  inset?: { top?: number; bottom?: number; left?: number; right?: number };
  children?: ReactNode;
}

