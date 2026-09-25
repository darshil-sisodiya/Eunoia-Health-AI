import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../constants/theme';
import { filterOptions } from '../../constants/onboarding';
import { Button, IconButton, tap } from '../ui';

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
  const [focused, setFocused] = useState(false);
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
      <View style={[styles.searchRow, focused && styles.searchRowFocused]}>
        <Ionicons name="search" size={18} color={focused ? colors.textPrimary : colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={searchPlaceholder}
          returnKeyType="done"
          onSubmitEditing={() => (canAddCustom ? add(trimmed) : undefined)}
        />
      </View>

      {canAddCustom ? (
        <Button
          label={`Add "${trimmed}"`}
          icon="add"
          variant="secondary"
          compact
          onPress={() => add(trimmed)}
          style={styles.addCustom}
        />
      ) : null}

      {value.map((entry) => {
        const name = nameOf(entry);
        const open = Boolean(openKeys[name]);
        const warn = isWarning?.(entry) ?? false;
        const incomplete = needsDetail?.(entry) ?? false;
        const summary = summaryOf?.(entry) ?? '';

        return (
          <View key={name} style={styles.card}>
            <View style={styles.header}>
              <Pressable
                style={({ pressed }) => [styles.headerToggle, pressed && styles.pressed]}
                onPress={() => toggleOpen(name)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`Details for ${name}`}
              >
                <View style={styles.titleWrap}>
                  <View style={styles.nameRow}>
                    {warn ? <Ionicons name="warning" size={16} color={colors.error} /> : null}
                    <Text style={[styles.name, warn && styles.nameWarning]}>{name}</Text>
                  </View>
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
              </Pressable>
              <IconButton icon="trash-outline" label={`Remove ${name}`} onPress={() => remove(name)} />
            </View>

            {open ? <View style={styles.detail}>{renderDetail(entry, (patch) => update(name, patch))}</View> : null}
          </View>
        );
      })}

      <Text style={styles.catalogueLabel}>{catalogueLabel}</Text>
      <View style={styles.grid}>
        {visible.map((option) => {
          const selected = names.has(option.toLowerCase());
          return (
            <Pressable
              key={option}
              style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
              onPress={() => {
                tap();
                if (selected) remove(option);
                else add(option);
              }}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              {selected ? <Ionicons name="checkmark" size={16} color={colors.textInverse} /> : null}
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option}
              </Text>
            </Pressable>
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
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  searchRowFocused: {
    borderColor: colors.textPrimary,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.md,
    outlineStyle: 'none',
  } as any,
  addCustom: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  card: {
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  headerToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  titleWrap: {
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    marginTop: 2,
  },
  summary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  detail: {
    padding: spacing.lg,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  catalogueLabel: {
    ...typography.overline,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    backgroundColor: colors.inkSurface,
  },
  optionText: {
    ...typography.callout,
    color: colors.textPrimary,
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
