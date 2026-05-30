import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  KARNATAKA_CITIES_FALLBACK,
  ONBOARDING_COPY,
} from '../../constants/onboarding';
import { getCities } from '../../utils/onboardingApi';
import { colors, shadows, spacing, typography } from '../../constants/theme';

/**
 * Step 6 of the Eunoia onboarding flow — Location personalisation.
 *
 * Behavioural contract (Requirements 7.1–7.8):
 *  - 7.1, 7.2: Collects state + city; the state field is a read-only
 *    "Karnataka" display (no other states are exposed yet).
 *  - 7.3, 7.4, 7.7: City selection is constrained to the Karnataka_Cities
 *    set served by `GET /api/cities`. On any rejection (timeout, network,
 *    non-2xx, malformed body) we silently fall back to
 *    `KARNATAKA_CITIES_FALLBACK`. No free-text input is ever rendered.
 *  - 7.5: The picker list is alphabetised regardless of source (we sort
 *    the cached `cities` list at render time).
 *  - 7.6: If the user attempts to advance with no city selected, an
 *    inline message "Choose a city to continue." is rendered under the
 *    city field and advance is blocked.
 *  - 7.8: If the modal subtree throws during render, the city field is
 *    replaced with the disabled "City picker unavailable" placeholder,
 *    advance stays disabled, and the modal is never rendered. No
 *    free-text fallback is exposed under any failure mode.
 *
 * The fetched list is cached in `OnboardingContext.cities` so this
 * screen does not re-issue the request when the user navigates back to
 * step 6 within the same session.
 *
 * All values come from `frontend/constants/theme.ts` and
 * `frontend/constants/onboarding.ts`; no inline color, spacing, or
 * typography literals.
 */
export default function Location() {
  const {
    draft,
    cities,
    setCities,
    setLocation,
    markStep,
  } = useOnboarding();

  // True iff the modal subtree threw during render. While true the city
  // field is replaced by the "City picker unavailable" placeholder and
  // advance stays disabled (Requirement 7.8).
  const [pickerError, setPickerError] = useState(false);
  // True once the user has tapped Finish without a selection. Drives the
  // inline "Choose a city to continue." message (Requirement 7.6).
  const [showAdvanceError, setShowAdvanceError] = useState(false);
  // Visibility of the modal sheet listing the cities.
  const [pickerVisible, setPickerVisible] = useState(false);

  // ── Cities fetch (mount-only) ────────────────────────────────
  // Runs once per mount. If the context already holds a cached list we
  // skip the network call entirely. On any rejection we cache the
  // alphabetised fallback so subsequent navigations resolve instantly
  // and the rendered list stays alphabetical regardless of source.
  useEffect(() => {
    if (cities) return;
    let cancelled = false;
    getCities()
      .then((res) => {
        if (cancelled) return;
        const fromServer = Array.isArray(res?.Karnataka) ? res.Karnataka : [];
        const sorted = [...fromServer].sort((a, b) => a.localeCompare(b));
        if (sorted.length === 0) {
          setCities([...KARNATAKA_CITIES_FALLBACK]);
        } else {
          setCities(sorted);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCities([...KARNATAKA_CITIES_FALLBACK]);
      });
    return () => {
      cancelled = true;
    };
    // The fetch must run exactly once on mount per the design; the
    // `cities` and `setCities` references are stable across renders
    // because they live on the context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always render the picker list alphabetised, regardless of the
  // source of `cities` (server, fallback, or stale cache).
  const sortedCities = useMemo(() => {
    const source = cities ?? KARNATAKA_CITIES_FALLBACK;
    return [...source].sort((a, b) => a.localeCompare(b));
  }, [cities]);

  const selectedCity = draft.location?.city ?? null;
  const canAdvance = selectedCity != null && !pickerError;

  // ── Handlers ─────────────────────────────────────────────────

  const handleOpenPicker = () => {
    if (pickerError) return;
    setPickerVisible(true);
  };

  const handleSelectCity = (city: string) => {
    setLocation({ state: 'Karnataka', city });
    setShowAdvanceError(false);
    setPickerVisible(false);
  };

  const handleClosePicker = () => {
    setPickerVisible(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  const handleAdvance = () => {
    if (!selectedCity) {
      setShowAdvanceError(true);
      return;
    }
    markStep(7);
    // The `/onboarding/analyzing` route is created by task 10.14; until
    // that file exists, expo-router's typed-routes generator does not
    // list it. Casting through `any` keeps this screen self-contained
    // without coupling its compilation to subsequent tasks.
    router.push('/onboarding/analyzing' as any);
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <OnboardingShell
      step={6}
      eyebrow={ONBOARDING_COPY.location.eyebrow}
      canAdvance={canAdvance}
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={ONBOARDING_COPY.location.advanceLabel}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.headline} accessibilityRole="header">
          {ONBOARDING_COPY.location.headline}
        </Text>
        <Text style={styles.subtitle}>
          {ONBOARDING_COPY.location.subtitle}
        </Text>
      </View>

      {/* ── State (read-only) ─────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {ONBOARDING_COPY.location.stateLabel}
        </Text>
        <View
          style={[styles.field, styles.fieldDisabled]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${ONBOARDING_COPY.location.stateLabel}: ${ONBOARDING_COPY.location.stateValue}`}
        >
          <Text style={styles.fieldValue}>
            {ONBOARDING_COPY.location.stateValue}
          </Text>
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={colors.textMuted}
          />
        </View>
      </View>

      {/* ── City (picker) ─────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {ONBOARDING_COPY.location.cityLabel}
        </Text>

        {pickerError ? (
          <View
            style={[styles.field, styles.fieldDisabled]}
            accessible
            accessibilityRole="text"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={ONBOARDING_COPY.location.cityPickerUnavailable}
          >
            <Text style={styles.fieldPlaceholder}>
              {ONBOARDING_COPY.location.cityPickerUnavailable}
            </Text>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.textMuted}
            />
          </View>
        ) : (
          <Pressable
            onPress={handleOpenPicker}
            accessibilityRole="button"
            accessibilityLabel={
              selectedCity
                ? `${ONBOARDING_COPY.location.cityLabel}: ${selectedCity}. ${ONBOARDING_COPY.location.cityPlaceholder}`
                : ONBOARDING_COPY.location.cityPlaceholder
            }
            accessibilityHint="Opens a list of Karnataka cities"
            style={({ pressed }) => [
              styles.field,
              styles.fieldInteractive,
              pressed && styles.fieldPressed,
            ]}
          >
            <Text
              style={
                selectedCity ? styles.fieldValue : styles.fieldPlaceholder
              }
            >
              {selectedCity ?? ONBOARDING_COPY.location.cityPlaceholder}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        )}

        {showAdvanceError && !selectedCity ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {ONBOARDING_COPY.location.cityRequiredError}
          </Text>
        ) : null}
      </View>

      {/* ── Picker modal ──────────────────────────────────── */}
      {!pickerError ? (
        <PickerErrorBoundary onError={() => setPickerError(true)}>
          <Modal
            visible={pickerVisible}
            animationType="slide"
            transparent
            onRequestClose={handleClosePicker}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalEyebrow}>
                      {ONBOARDING_COPY.location.stateValue}
                    </Text>
                    <Text style={styles.modalTitle}>
                      {ONBOARDING_COPY.location.cityLabel}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleClosePicker}
                    style={styles.modalCloseBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close city picker"
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalList}
                  contentContainerStyle={styles.modalListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {sortedCities.map((city) => {
                    const isSelected = city === selectedCity;
                    return (
                      <Pressable
                        key={city}
                        onPress={() => handleSelectCity(city)}
                        accessibilityRole="button"
                        accessibilityLabel={city}
                        accessibilityState={{ selected: isSelected }}
                        style={({ pressed }) => [
                          styles.cityRow,
                          isSelected && styles.cityRowSelected,
                          pressed && styles.cityRowPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.cityRowText,
                            isSelected && styles.cityRowTextSelected,
                          ]}
                        >
                          {city}
                        </Text>
                        {isSelected ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={colors.textPrimary}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </PickerErrorBoundary>
      ) : null}
    </OnboardingShell>
  );
}

// ──────────────────────────────────────────────────────────────
// Local error boundary for the modal subtree. If anything inside
// the picker modal throws during render, we surface a disabled
// "City picker unavailable" affordance and never expose a
// free-text fallback (Requirement 7.8).
// ──────────────────────────────────────────────────────────────

interface PickerErrorBoundaryProps {
  onError: () => void;
  children: React.ReactNode;
}

interface PickerErrorBoundaryState {
  hasError: boolean;
}

class PickerErrorBoundary extends React.Component<
  PickerErrorBoundaryProps,
  PickerErrorBoundaryState
> {
  state: PickerErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PickerErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // Notify the parent so it can swap the city field for the
    // disabled placeholder. The parent setter is idempotent.
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBlock: {
    marginBottom: spacing.xxxl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldGroup: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.callout,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: spacing.inputRadius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  fieldDisabled: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.divider,
  },
  fieldInteractive: {
    backgroundColor: colors.surface,
  },
  fieldPressed: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.surfaceBorderStrong,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  fieldPlaceholder: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },

  // ── Modal sheet ──────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: spacing.cardRadiusXl,
    borderTopRightRadius: spacing.cardRadiusXl,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.xl,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceBorderStrong,
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  modalEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  modalTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: {
    flexGrow: 0,
  },
  modalListContent: {
    paddingBottom: spacing.lg,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.cardRadius,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cityRowSelected: {
    borderColor: colors.surfaceBorderStrong,
    backgroundColor: colors.backgroundSecondary,
  },
  cityRowPressed: {
    backgroundColor: colors.surfaceHover,
  },
  cityRowText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cityRowTextSelected: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
});
