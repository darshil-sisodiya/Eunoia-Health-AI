// Shared controls. Screens used to hand-roll their own buttons, headers and
// inputs with slightly different heights, radii and pressed states; these
// are the one version of each.
import React, { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, ClipPath, Defs, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { colors, fonts, HIT, spacing, typography } from '../constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function tap() {
  // Fire-and-forget; unsupported on web and some Android devices.
  Haptics.selectionAsync().catch(() => {});
}

// ── BrandMark ───────────────────────────────────────────────────
// A marigold sun rising over an indigo horizon, plus the wordmark.

export function BrandMark({ size = 32, wordmark = true, inverse = false }: {
  size?: number;
  wordmark?: boolean;
  inverse?: boolean;
}) {
  return (
    <View style={styles.brand} accessible accessibilityLabel="Eunoia">
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Defs>
          <ClipPath id="horizon">
            <Rect x="0" y="0" width="32" height="21" />
          </ClipPath>
        </Defs>
        <Rect x="0" y="0" width="32" height="32" rx="10" fill={inverse ? colors.surface : colors.inkSurface} />
        <Circle cx="16" cy="21" r="8.5" fill={colors.accent} clipPath="url(#horizon)" />
        <Rect x="6" y="23" width="20" height="2" rx="1" fill={inverse ? colors.inkSurface : colors.surface} opacity={0.9} />
      </Svg>
      {wordmark ? (
        <Text style={[styles.brandText, { fontSize: size * 0.72, color: inverse ? colors.textInverse : colors.textPrimary }]}>
          Eunoia
        </Text>
      ) : null}
    </View>
  );
}

// ── Button ──────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const v = BUTTON_VARIANTS[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: pressed ? v.pressed : v.bg },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTON_VARIANTS = {
  primary: { bg: colors.inkSurface, pressed: colors.inkSurfaceElevated, fg: colors.textInverse },
  secondary: { bg: colors.selected, pressed: colors.surfaceBorder, fg: colors.textPrimary },
  ghost: { bg: 'transparent', pressed: colors.backgroundTertiary, fg: colors.textPrimary },
  danger: { bg: colors.errorSoft, pressed: '#F2CFCB', fg: colors.error },
};

// ── IconButton ──────────────────────────────────────────────────

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'light',
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: dark ? colors.inkSurfaceElevated : colors.surface },
        pressed && styles.buttonPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={dark ? colors.textInverse : colors.textPrimary} />
    </Pressable>
  );
}

// ── ScreenHeader ────────────────────────────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Defaults to router.back(). Pass `null` to hide the back button. */
  onBack?: (() => void) | null;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const back = onBack === undefined ? () => router.back() : onBack;
  return (
    <View style={styles.header}>
      {back || right ? (
        <View style={styles.headerBar}>
          {back ? <IconButton icon="chevron-back" label="Go back" onPress={back} /> : <View />}
          {right}
        </View>
      ) : null}
      <Text style={styles.headerTitle} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ── TextField ───────────────────────────────────────────────────

type TextFieldProps = TextInputProps & {
  label: string;
  icon?: IconName;
  error?: string | null;
  hint?: string;
  /** Adds a show/hide toggle and hides the text. */
  password?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon, error, hint, password = false, style, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldBox,
          focused && styles.fieldBoxFocused,
          !!error && styles.fieldBoxError,
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={18} color={focused ? colors.textPrimary : colors.textTertiary} />
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={password && !revealed}
          autoCorrect={password ? false : input.autoCorrect}
          accessibilityLabel={label}
          {...input}
          style={[styles.fieldInput, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {password ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

// ── Notice ──────────────────────────────────────────────────────
// Inline message for errors and confirmations, instead of a blocking alert.

export function Notice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const t = NOTICE_TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <Ionicons name={t.icon} size={18} color={t.fg} />
      <Text style={[styles.noticeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const NOTICE_TONES = {
  error: { bg: colors.errorSoft, fg: colors.error, icon: 'alert-circle' as IconName },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as IconName },
  info: { bg: colors.selected, fg: colors.textPrimary, icon: 'information-circle' as IconName },
};

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandText: {
    fontFamily: fonts.display,
    letterSpacing: -0.3,
  },
  button: {
    minHeight: 54,
    borderRadius: spacing.buttonRadius,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...typography.headline,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    maxWidth: 360,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: HIT + 6,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
  },
  fieldBoxFocused: {
    borderColor: colors.textPrimary,
  },
  fieldBoxError: {
    borderColor: colors.error,
  },
  fieldInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    // RN web draws its own focus outline inside the box; the border is the ring.
    outlineStyle: 'none',
  } as any,
  fieldError: {
    ...typography.caption,
    color: colors.error,
  },
  fieldHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.inputRadius,
  },
  noticeText: {
    ...typography.callout,
    flex: 1,
  },
});
