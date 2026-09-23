import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../constants/theme';
import { filterOptions } from '../../constants/onboarding';

export type EntryListEditorProps<T> = {
  /** Current entries. */
  value: T[];
  onChange: (next: T[]) => void;
  /** Catalogue of suggestions. */
  options: readonly string[];
  /** Reads the display name from an entry. */
  nameOf: (entry: T) => string;
  /** Builds a new entry from a name. */
  create: (name: string) => T;
  /** Renders the follow-up questions for an expanded entry. */
  renderDetail: (entry: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  /** Optional one-line summary shown collapsed. */
  summaryOf?: (entry: T) => string;
  /** Renders the entry in the error tone (severe allergy). */
  isWarning?: (entry: T) => boolean;
  /** Shown under the collapsed row when the detail is still unanswered. */
  needsDetail?: (entry: T) => boolean;
  searchPlaceholder: string;
  catalogueLabel: string;
  cap?: number;
  capMessage?: string;
};

/**
 * Searchable list with an inline detail accordion per entry.
 *
 * Shared by the onboarding steps and the profile editors so a condition is
 * edited the same way wherever you reach it — and so the follow-up questions
 * cannot drift between the two. That symmetry is the point: the profile has
 * to be maintainable after onboarding, not just fillable during it.
 */
export default function EntryListEditor<T>({
  value,
  onChange,
  options,
  nameOf,
  create,
  renderDetail,
  summaryOf,
  isWarning,
  needsDetail,
  searchPlaceholder,
  catalogueLabel,
  cap = 50,
  capMessage = 'That is the maximum we can record here.',
}: EntryListEditorProps<T>) {
  const [query, setQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const names = useMemo(
    () => new Set(value.map((entry) => nameOf(entry).toLowerCase())),
    [value, nameOf],
  );

  const toggleOpen = useCallback(
    (key: string) => setOpenKeys((current) => ({ ...current, [key]: !current[key] })),
    [],
  );

  const add = useCallback(
    (name: string) => {
      if (value.length >= cap) return;
      if (names.has(name.toLowerCase())) return;
      onChange([...value, create(name)]);
      // Expand straight away: the detail is the reason this component exists,
      // and a collapsed accordion makes it easy to skip.
      setOpenKeys((current) => ({ ...current, [name]: true }));
      setQuery('');
    },
    [value, cap, names, onChange, create],
  );

  const remove = useCallback(
    (name: string) => onChange(value.filter((entry) => nameOf(entry) !== name)),
    [value, onChange, nameOf],
  );

  const update = useCallback(
    (name: string, patch: Partial<T>) =>
      onChange(
        value.map((entry) => (nameOf(entry) === name ? { ...entry, ...patch } : entry)),
      ),
    [value, onChange, nameOf],
  );

  const visible = useMemo(() => filterOptions(options, query), [options, query]);
  const trimmed = query.trim();
  const canAddCustom =
    trimmed.length > 0 &&
    !names.has(trimmed.toLowerCase()) &&
    !options.some((option) => option.toLowerCase() === trimmed.toLowerCase());

  return (
    <View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={searchPlaceholder}
        />
      </View>

      {canAddCustom ? (
        <TouchableOpacity
          style={styles.addCustom}
          onPress={() => add(trimmed)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${trimmed}`}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.addCustomText}>{`Add "${trimmed}"`}</Text>
        </TouchableOpacity>
      ) : null}

      {value.map((entry) => {
        const name = nameOf(entry);
        const open = Boolean(openKeys[name]);
        const warn = isWarning?.(entry) ?? false;
        const incomplete = needsDetail?.(entry) ?? false;
        const summary = summaryOf?.(entry) ?? '';

        return (
          <View key={name} style={[styles.card, warn && styles.cardWarning]}>
            <TouchableOpacity
              style={styles.header}
              onPress={() => toggleOpen(name)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Details for ${name}`}
            >
              <View style={styles.titleWrap}>
                <Text style={[styles.name, warn && styles.nameWarning]}>{name}</Text>
                {incomplete ? (
                  <Text style={styles.needsDetail}>Needs detail</Text>
                ) : summary ? (
                  <Text style={styles.summary}>{summary}</Text>
                ) : null}
              </View>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textTertiary}
              />
            </TouchableOpacity>

            {open ? (
              <View style={styles.detail}>
                {renderDetail(entry, (patch) => update(name, patch))}
                <TouchableOpacity
                  style={styles.removeRow}
                  onPress={() => remove(name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${name}`}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.catalogueLabel}>{catalogueLabel}</Text>
      <View style={styles.grid}>
        {visible.map((option) => {
          const selected = names.has(option.toLowerCase());
          return (
            <TouchableOpacity
              key={option}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => (selected ? remove(option) : add(option))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {value.length >= cap ? <Text style={styles.capMessage}>{capMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: spacing.md,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    padding: 0,
  },
  addCustom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  addCustomText: {
    ...typography.bodyMedium,
    color: colors.accent,
  },
  card: {
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardWarning: {
    borderColor: colors.error,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  titleWrap: {
    flexShrink: 1,
  },
  name: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  nameWarning: {
    color: colors.error,
  },
  needsDetail: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  summary: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  detail: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  removeText: {
    ...typography.caption,
    color: colors.error,
  },
  catalogueLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  optionText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.textInverse,
  },
  capMessage: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.md,
  },
});
