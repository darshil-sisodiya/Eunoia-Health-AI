import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SegmentedRow from '../onboarding/SegmentedRow';
import { HEREDITARY_CONDITIONS } from '../../constants/onboarding';
import type { HereditaryCondition } from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';
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
            <TouchableOpacity
              key={condition}
              onPress={() => toggleCondition(condition)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Toggle ${condition} for family history`}
              style={[styles.card, on && styles.cardSelected]}
            >
              <Text
                style={[styles.cardLabel, on && styles.cardLabelSelected]}
                numberOfLines={2}
              >
                {condition}
              </Text>
            </TouchableOpacity>
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
                <TouchableOpacity
                  style={styles.entryHeader}
                  onPress={() => toggleSection(key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                >
                  <View style={styles.entryTitleWrap}>
                    <Text style={styles.entryName}>{entry.condition}</Text>
                    {needsDetail ? (
                      <Text style={styles.needsDetail}>Add who</Text>
                    ) : (
                      <Text style={styles.entryMeta}>
                        {entry.relations.join(', ')}
                        {firstDegree && early ? ' · strong signal' : ''}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>

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
                          <TouchableOpacity
                            key={option.value}
                            style={[styles.relation, on && styles.relationSelected]}
                            onPress={() => toggleRelation(entry.condition, option.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text
                              style={[styles.relationText, on && styles.relationTextSelected]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    minHeight: 72,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardSelected: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  cardLabel: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  cardLabelSelected: {
    color: colors.textInverse,
  },
  detailBlock: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  entryCard: {
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
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
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  needsDetail: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  followUp: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
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
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  relation: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  relationSelected: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  relationText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  relationTextSelected: {
    color: colors.textInverse,
  },
});
