import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, shadows, spacing, typography } from '../../constants/theme';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import OnboardingShell from '../../components/onboarding/OnboardingShell';
import Chip from '../../components/onboarding/Chip';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { useOnboarding } from '../../contexts/OnboardingContext';
import type { MedicalHistory } from '../../utils/onboardingApi';

// ── Static catalogues (Requirement 5.1, 5.3) ──────────────────
// Reasonable defaults per section. The user can also add free-form
// entries through the per-section "Add custom" affordance. Order is
// the canonical render order; the search input filters this list.
const EXISTING_CONDITIONS_CATALOG: readonly string[] = [
  'Hypertension',
  'Type 2 Diabetes',
  'Asthma',
  'Hypothyroidism',
  'PCOS/PCOD',
  'High Cholesterol',
  'Migraine',
  'Depression',
  'Anxiety',
  'GERD/Acid Reflux',
  'Arthritis',
  'Anemia',
];

const ALLERGIES_CATALOG: readonly string[] = [
  'Pollen',
  'Dust mites',
  'Penicillin',
  'Sulfa drugs',
  'Peanuts',
  'Tree nuts',
  'Shellfish',
  'Eggs',
  'Dairy/Lactose',
  'Gluten',
  'Latex',
  'Bee stings',
];

const CURRENT_MEDICATIONS_CATALOG: readonly string[] = [
  'Metformin',
  'Levothyroxine',
  'Atorvastatin',
  'Amlodipine',
  'Losartan',
  'Omeprazole',
  'Salbutamol Inhaler',
  'Iron supplements',
  'Vitamin D',
  'Multivitamin',
  'Aspirin (Low-dose)',
  'Birth control pill',
];

// ── Section descriptors ───────────────────────────────────────
// Maps `OnboardingContext.medicalUI` keys to their corresponding
// `MedicalHistory` list keys, catalogue, and user-facing title.
type SectionUIKey = 'existingConditionsOpen' | 'allergiesOpen' | 'currentMedicationsOpen';
type SectionListKey = keyof MedicalHistory;

interface SectionDescriptor {
  uiKey: SectionUIKey;
  listKey: SectionListKey;
  title: string;
  catalog: readonly string[];
}

const SECTIONS: readonly SectionDescriptor[] = [
  {
    uiKey: 'existingConditionsOpen',
    listKey: 'existing_conditions',
    title: ONBOARDING_COPY.medical.sections.existingConditions,
    catalog: EXISTING_CONDITIONS_CATALOG,
  },
  {
    uiKey: 'allergiesOpen',
    listKey: 'allergies',
    title: ONBOARDING_COPY.medical.sections.allergies,
    catalog: ALLERGIES_CATALOG,
  },
  {
    uiKey: 'currentMedicationsOpen',
    listKey: 'current_medications',
    title: ONBOARDING_COPY.medical.sections.currentMedications,
    catalog: CURRENT_MEDICATIONS_CATALOG,
  },
];

/**
 * Pure, case-insensitive substring filter over a list of options.
 * An empty / whitespace-only query returns the input list unchanged.
 *
 * Exported for the property test in task 10.7 (Property 3: medical-history
 * search is a case-insensitive substring filter, validating Requirement 5.3).
 */
export function filterOptions(options: string[], query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return options;
  return options.filter((o) => o.toLowerCase().includes(q));
}

/**
 * Step 4 — Medical_History. Three independent collapsible sections
 * (Existing conditions / Allergies / Current medications) rendered with
 * surface and border tokens. All three start collapsed on first render
 * (Requirement 5.4): the open/closed state lives in
 * `OnboardingContext.medicalUI` so it survives re-renders within the flow
 * but the empty initial state of `medicalUI` keeps every section collapsed
 * the first time the user lands on this screen.
 *
 * Each open section renders its own search input (filtering its catalogue
 * via {@link filterOptions}), an "Add custom" affordance for the current
 * query when it is not already in the catalogue or the selected list, the
 * filtered options as toggleable rows with a check pip, and the currently
 * selected entries as `Chip`s with a remove affordance.
 *
 * Cap behaviour (Requirement 5.7): the 50-entry total cap is enforced
 * inside `toggleMedical` (adds beyond the cap are no-ops). When the cap
 * is reached, a single inline message — `ONBOARDING_COPY.medical.capMessage`
 * — is rendered under the sections. The message only appears after the cap
 * has actually been reached (`capReached === true`).
 *
 * Advance is always enabled (Requirement 5.6): zero selections are valid.
 *
 * All values come from `frontend/constants/theme.ts` and
 * `frontend/constants/onboarding.ts`; no inline color, spacing, or
 * typography literals.
 */
export default function MedicalHistoryScreen() {
  const {
    draft,
    medicalUI,
    capReached,
    toggleMedical,
    toggleMedicalSection,
    markStep,
  } = useOnboarding();

  // Per-section search query, kept in local component state because it does
  // not need to survive across re-mounts of the onboarding flow. The
  // OnboardingContext only persists data the user has explicitly committed.
  const [queries, setQueries] = useState<Record<SectionListKey, string>>({
    existing_conditions: '',
    allergies: '',
    current_medications: '',
  });

  const handleAdvance = () => {
    markStep(5);
    router.push('/onboarding/family' as any);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <OnboardingShell
      step={4}
      eyebrow={ONBOARDING_COPY.medical.eyebrow}
      canAdvance={true}
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={ONBOARDING_COPY.medical.advanceLabel}
    >
      <KeyboardAwareScreenScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.headline} accessibilityRole="header">
          {ONBOARDING_COPY.medical.headline}
        </Text>
        <Text style={styles.subtitle}>{ONBOARDING_COPY.medical.subtitle}</Text>

        {SECTIONS.map((section) => (
          <Section
            key={section.uiKey}
            section={section}
            isOpen={medicalUI[section.uiKey]}
            selected={draft.medical[section.listKey]}
            query={queries[section.listKey]}
            capReached={capReached}
            onToggleSection={() => toggleMedicalSection(section.uiKey)}
            onQueryChange={(next) =>
              setQueries((prev) => ({ ...prev, [section.listKey]: next }))
            }
            onToggleEntry={(value) => toggleMedical(section.listKey, value)}
            onClearQuery={() =>
              setQueries((prev) => ({ ...prev, [section.listKey]: '' }))
            }
          />
        ))}

        {capReached ? (
          <Text
            style={styles.capMessage}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {ONBOARDING_COPY.medical.capMessage}
          </Text>
        ) : null}
      </KeyboardAwareScreenScrollView>
    </OnboardingShell>
  );
}

// ──────────────────────────────────────────────────────────────
// Section
// ──────────────────────────────────────────────────────────────

interface SectionProps {
  section: SectionDescriptor;
  isOpen: boolean;
  selected: string[];
  query: string;
  capReached: boolean;
  onToggleSection: () => void;
  onQueryChange: (next: string) => void;
  onToggleEntry: (value: string) => void;
  onClearQuery: () => void;
}

function Section({
  section,
  isOpen,
  selected,
  query,
  capReached,
  onToggleSection,
  onQueryChange,
  onToggleEntry,
  onClearQuery,
}: SectionProps) {
  const filtered = useMemo(
    () => filterOptions([...section.catalog], query),
    [section.catalog, query],
  );

  // Whether the current search query represents a candidate "Add custom"
  // entry: non-empty, not already in the catalogue, and not already in the
  // user's selected list for this section.
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const customCandidate =
    trimmedQuery.length > 0 &&
    !section.catalog.some((c) => c.toLowerCase() === lowerQuery) &&
    !selected.some((s) => s.toLowerCase() === lowerQuery);

  // The "Add custom" affordance is only enabled when both:
  //   1. There is a usable candidate value (above), AND
  //   2. We are not currently capped for a new addition.
  const customEnabled = customCandidate && !capReached;

  const handleAddCustom = () => {
    if (!customEnabled) return;
    onToggleEntry(trimmedQuery);
    onClearQuery();
  };

  return (
    <View style={styles.section}>
      <Pressable
        onPress={onToggleSection}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${section.title}, ${selected.length} selected`}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {selected.length > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{selected.length}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name="chevron-down"
          size={18}
          color={colors.textTertiary}
          style={isOpen ? styles.chevronOpen : styles.chevronClosed}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.sectionBody}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={onQueryChange}
              placeholder={ONBOARDING_COPY.medical.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={`Search ${section.title}`}
            />
          </View>

          {filtered.length === 0 && trimmedQuery.length === 0 ? (
            <Text style={styles.emptyHint}>No options to display.</Text>
          ) : null}

          {filtered.map((option) => {
            const isSelected = selected.includes(option);
            // Prevent additional add taps when the cap is reached and this
            // option is not currently selected (removing remains allowed).
            const disabled = capReached && !isSelected;
            return (
              <OptionRow
                key={option}
                label={option}
                selected={isSelected}
                disabled={disabled}
                onPress={() => onToggleEntry(option)}
              />
            );
          })}

          {customCandidate ? (
            <Pressable
              onPress={handleAddCustom}
              disabled={!customEnabled}
              style={({ pressed }) => [
                styles.addCustomRow,
                pressed && customEnabled && styles.addCustomPressed,
                !customEnabled && styles.addCustomDisabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !customEnabled }}
              accessibilityLabel={`${ONBOARDING_COPY.medical.addCustomLabel}: ${trimmedQuery}`}
            >
              <Ionicons
                name="add"
                size={16}
                color={
                  customEnabled ? colors.textPrimary : colors.textMuted
                }
              />
              <Text
                style={[
                  styles.addCustomText,
                  !customEnabled && styles.addCustomTextDisabled,
                ]}
                numberOfLines={1}
              >
                {`${ONBOARDING_COPY.medical.addCustomLabel}: "${trimmedQuery}"`}
              </Text>
            </Pressable>
          ) : null}

          {selected.length > 0 ? (
            <View style={styles.chipsRow}>
              {selected.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  onRemove={() => onToggleEntry(value)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// OptionRow — toggleable option with a check pip
// ──────────────────────────────────────────────────────────────

interface OptionRowProps {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function OptionRow({ label, selected, disabled, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.optionRow,
        selected && styles.optionRowSelected,
        pressed && !disabled && styles.optionRowPressed,
        disabled && styles.optionRowDisabled,
      ]}
    >
      <Text
        style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={[styles.checkPip, selected && styles.checkPipSelected]}>
        {selected ? (
          <Ionicons name="checkmark" size={12} color={colors.textInverse} />
        ) : null}
      </View>
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionHeaderPressed: {
    backgroundColor: colors.surfaceHover,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  countPill: {
    minWidth: 22,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.inkSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    ...typography.captionSmall,
    color: colors.textInverse,
    fontWeight: '700',
  },
  chevronClosed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  sectionBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: spacing.inputRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  emptyHint: {
    ...typography.callout,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  optionRowSelected: {
    borderColor: colors.textPrimary,
    ...shadows.sm,
  },
  optionRowPressed: {
    backgroundColor: colors.surfaceHover,
  },
  optionRowDisabled: {
    opacity: 0.4,
  },
  optionLabel: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  optionLabelSelected: {
    color: colors.textPrimary,
  },
  checkPip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkPipSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  addCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.surfaceBorderStrong,
    backgroundColor: colors.backgroundSecondary,
  },
  addCustomPressed: {
    backgroundColor: colors.surfaceHover,
  },
  addCustomDisabled: {
    opacity: 0.5,
  },
  addCustomText: {
    flex: 1,
    ...typography.callout,
    color: colors.textPrimary,
  },
  addCustomTextDisabled: {
    color: colors.textMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  capMessage: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
