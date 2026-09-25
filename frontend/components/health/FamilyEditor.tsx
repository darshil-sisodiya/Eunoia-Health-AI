import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SegmentedRow from '../onboarding/SegmentedRow';
import { HEREDITARY_CONDITIONS } from '../../constants/onboarding';
import type { HereditaryCondition } from '../../constants/onboarding';
import { colors, fonts, spacing, typography } from '../../constants/theme';
import { tap } from '../ui';
import type { FamilyEntry, OnsetBucket, Relation } from '../../utils/onboardingApi';

/**
 * Family history with relation and age of onset.
 *
 * Shared by the onboarding step and the profile editor. The eight booleans
 * this replaces threw away the two things that carry the signal: whether the
 * relative was first-degree, and how young they were. Premature heart disease
 * in a parent is a major independent risk factor; the same condition in a
 * grandparent at eighty is close to background.
 */

export const RELATION_OPTIONS: { value: Relation; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'other', label: 'Other' },
];

export const ONSET_OPTIONS: { value: OnsetBucket; label: string }[] = [
  { value: 'lt_50', label: 'Before 50' },
  { value: '50_70', label: '50-70' },
  { value: 'gt_70', label: 'After 70' },
  { value: 'unknown', label: 'Not sure' },
];

const FIRST_DEGREE: Relation[] = ['mother', 'father', 'sibling', 'child'];

export type FamilyEditorProps = {
  value: FamilyEntry[];
  onChange: (next: FamilyEntry[]) => void;
  openSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
};

export default function FamilyEditor({
  value,
  onChange,
  openSections,
  toggleSection,
}: FamilyEditorProps) {
  const selected = useMemo(
    () => new Set(value.map((entry) => entry.condition)),
    [value],
  );

  const toggleCondition = useCallback(
    (condition: HereditaryCondition) => {
      const at = value.findIndex((entry) => entry.condition === condition);
      if (at >= 0) {
        onChange([...value.slice(0, at), ...value.slice(at + 1)]);
        return;
      }
      onChange([
        ...value,
        { condition, relations: [], onset_bucket: 'unknown' },
      ]);
      toggleSection(`family:${condition}`);
    },
    [value, onChange, toggleSection],
  );

  const update = useCallback(
    (condition: HereditaryCondition, patch: Partial<FamilyEntry>) =>
      onChange(
        value.map((entry) =>
          entry.condition === condition ? { ...entry, ...patch } : entry,
        ),
      ),
    [value, onChange],
  );

  const toggleRelation = useCallback(
    (condition: HereditaryCondition, relation: Relation) => {
      const entry = value.find((e) => e.condition === condition);
      if (!entry) return;
      update(condition, {
        relations: entry.relations.includes(relation)
          ? entry.relations.filter((r) => r !== relation)
          : [...entry.relations, relation],
      });
    },
    [value, update],
  );

  return (
    <View>
      <View style={styles.grid}>
        {HEREDITARY_CONDITIONS.map((condition) => {
          const on = selected.has(condition);
          return (
            <Pressable
              key={condition}
              onPress={() => {
                tap();
                toggleCondition(condition);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${condition} in the family`}
              style={({ pressed }) => [styles.card, on && styles.cardSelected, pressed && styles.pressed]}
            >
              <Text
                style={[styles.cardLabel, on && styles.cardLabelSelected]}
                numberOfLines={2}
              >
                {condition}
              </Text>
              {on ? <Ionicons name="checkmark-circle" size={20} color={colors.textInverse} /> : null}
            </Pressable>
          );
        })}
      </View>

      {value.length > 0 ? (
        <View style={styles.detailBlock}>
          <Text style={styles.sectionLabel}>Who, and when it started</Text>
          {value.map((entry) => {
            const key = `family:${entry.condition}`;
            const open = Boolean(openSections[key]);
            const firstDegree = entry.relations.some((r) => FIRST_DEGREE.includes(r));
            const early = entry.onset_bucket === 'lt_50';
            const needsDetail = entry.relations.length === 0;

            return (
              <View key={entry.condition} style={styles.entryCard}>
                <Pressable
                  style={({ pressed }) => [styles.entryHeader, pressed && styles.pressed]}
                  onPress={() => toggleSection(key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`Details for ${entry.condition}`}
                >
                  <View style={styles.entryTitleWrap}>
                    <Text style={styles.entryName}>{entry.condition}</Text>
                    {needsDetail ? (
                      <Text style={styles.needsDetail}>Add who</Text>
                    ) : (
                      <>
                        <Text style={styles.entryMeta}>
                          {entry.relations
                            .map((r) => RELATION_OPTIONS.find((o) => o.value === r)?.label ?? r)
                            .join(', ')}
                        </Text>
                        {firstDegree && early ? (
                          <Text style={styles.strongSignal}>Close relative, early onset</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>

                {open ? (
                  <View style={styles.followUp}>
                    <Text style={styles.fieldLabel}>Who had it?</Text>
                    <Text style={styles.fieldHint}>
                      Select everyone that applies. Close relatives count for more.
                    </Text>
                    <View style={styles.relationGrid}>
                      {RELATION_OPTIONS.map((option) => {
                        const on = entry.relations.includes(option.value);
                        return (
                          <Pressable
                            key={option.value}
                            style={({ pressed }) => [
                              styles.relation,
                              on && styles.relationSelected,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => {
                              tap();
                              toggleRelation(entry.condition, option.value);
                            }}
                            hitSlop={4}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text
                              style={[styles.relationText, on && styles.relationTextSelected]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <SegmentedRow
                      label="Roughly what age did it start?"
                      hint="Early onset in a close relative matters most."
                      options={ONSET_OPTIONS}
                      value={entry.onset_bucket}
                      onChange={(v) => update(entry.condition, { onset_bucket: v })}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48.5%',
    minHeight: 72,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardSelected: {
    backgroundColor: colors.inkSurface,
  },
  cardLabel: {
    ...typography.headline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardLabelSelected: {
    color: colors.textInverse,
  },
  detailBlock: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  entryCard: {
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  entryTitleWrap: {
    flexShrink: 1,
  },
  entryName: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  entryMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  strongSignal: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.accentText,
    marginTop: 2,
  },
  needsDetail: {
    ...typography.caption,
    color: colors.warning,
    marginTop: 2,
  },
  followUp: {
    padding: spacing.lg,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  fieldLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  fieldHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  relationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  relation: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    // Sits on a white card, so the resting chip takes the page tint.
    backgroundColor: colors.background,
  },
  relationSelected: {
    backgroundColor: colors.inkSurface,
  },
  relationText: {
    ...typography.callout,
    color: colors.textPrimary,
  },
  relationTextSelected: {
    color: colors.textInverse,
  },
});
