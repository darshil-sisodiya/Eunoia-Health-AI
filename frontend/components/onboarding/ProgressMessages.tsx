import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PROGRESS_MESSAGES } from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';

// ── Timing constants (Requirement 8.3) ─────────────────────────
// Per design § "ProgressMessages": cross-fade with `withTiming`
// over 300 ms, with a 600 ms hold between fade-in and fade-out.
const FADE_IN_MS = 300;
const HOLD_MS = 600;
const FADE_OUT_MS = 300;
const STEP_DURATION_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS; // 1200 ms

const TRANSLATE_Y_FROM = 8;
const TRANSLATE_Y_TO = 0;

const EASING = Easing.out(Easing.cubic);

export interface ProgressMessagesProps {
  /** When true, holds the last (or current) message and stops cycling. */
  done?: boolean;
  /** When true, holds the last (or current) message and stops cycling
   *  (caller renders error UI separately). */
  error?: boolean;
  /** Optional override for the message list. Defaults to `PROGRESS_MESSAGES`. */
  messages?: readonly string[];
  testID?: string;
}

/**
 * Renders exactly one of the four `PROGRESS_MESSAGES` at a time during the
 * AI Analysis Transition. Cycles through `messages` starting at index 0:
 *
 *   ┌── 300 ms fade-in (opacity 0 → 1, translateY 8 → 0)
 *   ├── 600 ms hold
 *   └── 300 ms fade-out (opacity 1 → 0)  → advance to next index
 *
 * On the last message, the fade-out and advance are skipped — the message
 * stays visible until the parent flips `done` or `error` to true. When
 * either flag becomes true mid-cycle, pending timers are cancelled and the
 * currently displayed message smoothly settles to fully visible.
 *
 * Visual tokens consumed (Requirement 16.1, 16.2, 16.3):
 *   - `typography.headline`
 *   - `colors.textPrimary`
 *   - `spacing.lg` (horizontal padding)
 *
 * Accessibility (Requirement 8.3 + design § "Accessibility"):
 *   - The visible message is wrapped in a `View` with
 *     `accessibilityLiveRegion="polite"` so screen readers announce changes
 *     as the index advances. The prop is Android-only at the platform level
 *     and is ignored as a no-op on iOS without crashing, satisfying the
 *     "do not crash on iOS" guidance.
 *
 * Validates: Requirements 8.2, 8.3, 16.6
 */
export const ProgressMessages: React.FC<ProgressMessagesProps> = ({
  done = false,
  error = false,
  messages = PROGRESS_MESSAGES,
  testID,
}) => {
  const [index, setIndex] = useState(0);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(TRANSLATE_Y_FROM);

  const fadeOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settled = done || error;
  const lastIndex = Math.max(messages.length - 1, 0);
  // Clamp the visible index to a valid range in case `messages` shrinks.
  const currentIndex = Math.min(index, lastIndex);
  const isLast = currentIndex >= lastIndex;

  useEffect(() => {
    const clearTimers = () => {
      if (fadeOutTimeoutRef.current !== null) {
        clearTimeout(fadeOutTimeoutRef.current);
        fadeOutTimeoutRef.current = null;
      }
      if (advanceTimeoutRef.current !== null) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
    };

    // Always clear pending work first so a settled/index/messages change
    // does not race with stale timers from the previous cycle.
    clearTimers();

    if (settled) {
      // Settle smoothly on the current message: no further advance.
      opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: EASING });
      translateY.value = withTiming(TRANSLATE_Y_TO, {
        duration: FADE_IN_MS,
        easing: EASING,
      });
      return clearTimers;
    }

    // Begin the fade-in cycle for the current message.
    opacity.value = 0;
    translateY.value = TRANSLATE_Y_FROM;
    opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: EASING });
    translateY.value = withTiming(TRANSLATE_Y_TO, {
      duration: FADE_IN_MS,
      easing: EASING,
    });

    if (isLast) {
      // Hold the last message visible until `done` or `error` flips.
      return clearTimers;
    }

    fadeOutTimeoutRef.current = setTimeout(() => {
      opacity.value = withTiming(0, {
        duration: FADE_OUT_MS,
        easing: EASING,
      });
    }, FADE_IN_MS + HOLD_MS);

    advanceTimeoutRef.current = setTimeout(() => {
      setIndex((prev) => Math.min(prev + 1, lastIndex));
    }, STEP_DURATION_MS);

    return clearTimers;
  }, [currentIndex, settled, isLast, lastIndex, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (messages.length === 0) {
    return null;
  }

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Animated.Text style={[styles.message, animatedStyle]}>
        {messages[currentIndex]}
      </Animated.Text>
    </View>
  );
};

export default ProgressMessages;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  message: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
