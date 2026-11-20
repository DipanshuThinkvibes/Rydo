import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s } from './ui';

/**
 * Bottom sheet over a map that the person can pull up (almost full screen) or push down again.
 * Drag the handle, or tap it to switch. Fills the area it is placed in; put it last so it sits on top.
 */
export function DragSheet({ children, low = 0.55 }: { children: React.ReactNode; /** share of the area when collapsed */ low?: number }) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState(0);
  const [open, setOpen] = useState(false);
  const height = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const start = useRef(0);

  const sizes = useMemo(() => ({ low: Math.round(area * low), high: Math.max(Math.round(area * low), Math.round(area - insets.top - 8)) }), [area, low, insets.top]);
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  useEffect(() => {
    const id = height.addListener(({ value }) => (current.current = value));
    return () => height.removeListener(id);
  }, [height]);

  // First layout (and rotation): sit at the collapsed or open size without animating.
  useEffect(() => {
    if (area) height.setValue(open ? sizes.high : sizes.low);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const snap = (toOpen: boolean, velocity = 0) => {
    setOpen(toOpen);
    Animated.spring(height, { toValue: toOpen ? sizesRef.current.high : sizesRef.current.low, velocity, bounciness: 3, speed: 16, useNativeDriver: false }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        height.stopAnimation();
        start.current = current.current;
      },
      onPanResponderMove: (_, g) => {
        const { low: lo, high: hi } = sizesRef.current;
        height.setValue(Math.min(hi, Math.max(lo * 0.85, start.current - g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const { low: lo, high: hi } = sizesRef.current;
        // A quick flick decides; otherwise whichever size is nearer.
        const toOpen = Math.abs(g.vy) > 0.4 ? g.vy < 0 : current.current > (lo + hi) / 2;
        snapRef.current(toOpen, -g.vy);
      },
      onPanResponderTerminate: () => snapRef.current(current.current > (sizesRef.current.low + sizesRef.current.high) / 2),
    }),
  ).current;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} onLayout={(e) => setArea(e.nativeEvent.layout.height)}>
      {area ? (
        <Animated.View style={[s.sheet, { height, paddingTop: 0, paddingBottom: 0, gap: 0 }]}>
          <View {...pan.panHandlers}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={open ? 'Make the panel smaller' : 'Make the panel bigger'}
              accessibilityState={{ expanded: open }}
              onPress={() => snap(!open)}
              hitSlop={{ top: 8, bottom: 8, left: 60, right: 60 }}
              style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 10, paddingBottom: 12 }}
            >
              <View style={s.grabber} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}
