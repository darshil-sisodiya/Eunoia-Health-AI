import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../constants/theme';

/** Bucket codes rendered as something a person reads. */
export const DURATION_LABELS: Record<string, string> = {
  lt_1y: 'under a year',
  '1_5y': '1-5 years',
  '5_10y': '5-10 years',
  gt_10y: '10+ years',
  unknown: 'duration unknown',
};

export const CONTROL_LABELS: Record<string, string> = {
  well: 'well controlled',
  partly: 'partly controlled',
  poorly: 'poorly controlled',
  unsure: 'control unknown',
};

export type ClinicalItem = {
  key: string;
  primary: string;
  secondary?: string;
  /** Renders in the error tone — used for severe allergic reactions. */
  warn?: boolean;
};

export type ClinicalListProps = {
  title: string;
  items: ClinicalItem[];
  empty: string;
  onEdit?: () => void;
};

/**
 * A titled list of clinical records.
 *
 * Conditions, medications and allergies had no representation in the app at
 * all once onboarding finished — they went straight into a JSON snapshot
 * column and were never read back. Showing them here is what makes the
 * profile feel like a record rather than a form you filled in once.
 */
export default function ClinicalList({ title, items, empty, onEdit }: ClinicalListProps) {
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${title.toLowerCase()}`}
            style={styles.editButton}
          >
            <Ionicons name="create-outline" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        items.map((item) => (
          <View key={item.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.primary, item.warn && styles.primaryWarn]}>
                {item.primary}
              </Text>
              {item.secondary ? (
                <Text style={styles.secondary}>{item.secondary}</Text>
              ) : null}
            </View>
            {item.warn ? (
              <Ionicons name="warning-outline" size={16} color={colors.error} />
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.overline,
    color: colors.textTertiary,
  },
  editButton: {
    padding: spacing.xs,
  },
  empty: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  primary: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  primaryWarn: {
    color: colors.error,
  },
  secondary: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
});
