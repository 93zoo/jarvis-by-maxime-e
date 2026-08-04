/**
 * MarketNotificationBanner — Bandeau de notification glissant
 *
 * Affiche des notifications (événements marché, ventes AH) depuis le haut de l'écran.
 * Non-bloquant : slide in → pause → slide out → auto-dismiss.
 * File d'attente : plusieurs notifications s'enchaînent automatiquement.
 *
 * Hermes hoisting: aucun sous-composant avec hooks ici — seul le composant principal.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@/components/Feather';
import {
  BANNER_DISPLAY_MS,
  BANNER_QUEUE_GAP_MS,
  BANNER_SCROLL_SPEED_PX_PER_S,
  BANNER_SLIDE_DURATION_MS,
} from '@/config/marketConfig';

// ── Public types ───────────────────────────────────────────────────────────────

export interface BannerNotification {
  id: string;
  text: string;
  /** Feather icon name */
  iconName: string;
  color: string;
}

interface Props {
  queue: BannerNotification[];
  onConsumed: (id: string) => void;
  /** Safe-area top inset so the banner clears status bar / notch */
  topInset?: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MarketNotificationBanner({ queue, onConsumed, topInset = 0 }: Props) {
  // Current notification being displayed (null = none)
  const [current, setCurrent] = useState<BannerNotification | null>(null);
  // Prevent picking a new item while an animation cycle is in progress
  const animatingRef = useRef(false);

  // Slide animation value
  const slideY = useRef(new Animated.Value(-100)).current;

  // Scroll text animation
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(300);

  // ── Pick next item when queue changes and nothing is showing ─────────────────

  useEffect(() => {
    if (animatingRef.current || queue.length === 0 || current !== null) return;
    setCurrent(queue[0]);
  }, [queue, current]);

  // ── Run animation cycle when current changes ──────────────────────────────────

  const runCycle = useCallback((item: BannerNotification) => {
    animatingRef.current = true;
    // Slide in
    Animated.timing(slideY, {
      toValue: 0,
      duration: BANNER_SLIDE_DURATION_MS,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start(() => {
      // Wait then slide out
      const displayTimer = setTimeout(() => {
        scrollAnimRef.current?.stop();
        Animated.timing(slideY, {
          toValue: -100,
          duration: BANNER_SLIDE_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          onConsumed(item.id);
          // Short gap before next
          const gapTimer = setTimeout(() => {
            setCurrent(null);
            animatingRef.current = false;
          }, BANNER_QUEUE_GAP_MS);
          return () => clearTimeout(gapTimer);
        });
      }, BANNER_DISPLAY_MS);
      return () => clearTimeout(displayTimer);
    });
  }, [slideY, onConsumed]);

  useEffect(() => {
    if (!current) return;
    slideY.setValue(-100);
    setTextWidth(0);
    runCycle(current);
  }, [current]); // intentionally omit runCycle/slideY to avoid re-triggering

  // ── Scroll text when measured ──────────────────────────────────────────────

  useEffect(() => {
    if (textWidth === 0 || containerWidth === 0) return;
    if (textWidth <= containerWidth) {
      scrollX.setValue(0);
      return;
    }
    // Text wider than container → scroll it
    scrollAnimRef.current?.stop();
    scrollX.setValue(0);
    const travel = textWidth - containerWidth + 16;
    const duration = (travel / BANNER_SCROLL_SPEED_PX_PER_S) * 1000;
    scrollAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(scrollX, { toValue: -travel, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(scrollX, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    );
    scrollAnimRef.current.start();
    return () => scrollAnimRef.current?.stop();
  }, [textWidth, containerWidth]);

  if (!current) return null;

  return (
    <Animated.View
      style={[
        bs.wrapper,
        {
          top: topInset + 6,
          borderColor: current.color + '60',
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="none"
    >
      {/* Left icon */}
      <View style={[bs.iconWrap, { backgroundColor: current.color + '22' }]}>
        <Feather
          name={current.iconName as React.ComponentProps<typeof Feather>['name']}
          size={16}
          color={current.color}
        />
      </View>

      {/* Scrolling label */}
      <View
        style={bs.textClip}
        onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <Animated.Text
          style={[bs.text, { color: current.color, transform: [{ translateX: scrollX }] }]}
          numberOfLines={1}
          onLayout={(e: LayoutChangeEvent) => setTextWidth(e.nativeEvent.layout.width)}
        >
          {current.text}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const bs = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14100A',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    zIndex: 9999,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textClip: {
    flex: 1,
    overflow: 'hidden',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
