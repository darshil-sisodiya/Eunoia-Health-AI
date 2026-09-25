import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../utils/api';
import { getMe } from '../../utils/costEstimatorApi';
import { MarkdownText } from '../../components/MarkdownText';
import { colors, fonts, spacing, typography } from '../../constants/theme';
import { useHealthProfile } from '../../contexts/HealthProfileContext';
import CompletenessCard from '../../components/health/CompletenessCard';
import { Notice, tap } from '../../components/ui';
import type { HealthProfileBundle } from '../../utils/onboardingApi';

type IconName = keyof typeof Ionicons.glyphMap;

// Set during onboarding and not editable section by section, so they are
// shown read-only with a single way back into the questionnaire.
const BASIC_FIELDS: { key: string; label: string; unit?: string; icon: IconName }[] = [
  { key: 'age', label: 'Age', icon: 'calendar-outline' },
  { key: 'gender', label: 'Gender', icon: 'person-outline' },
  { key: 'height', label: 'Height', unit: 'cm', icon: 'resize-outline' },
  { key: 'weight', label: 'Weight', unit: 'kg', icon: 'speedometer-outline' },
  { key: 'blood_group', label: 'Blood group', icon: 'water-outline' },
];

const VITAL_KEYS = [
  'systolic_mmhg', 'diastolic_mmhg', 'hba1c_percent', 'fasting_glucose_mgdl',
  'total_cholesterol_mgdl', 'ldl_mgdl', 'hdl_mgdl', 'waist_cm', 'resting_hr_bpm',
] as const;

const SEVERE = ['anaphylaxis', 'breathing', 'swelling'];

const has = (v: unknown) => v !== undefined && v !== null && v !== '';

// Makes a stored value readable without inventing a unit.
function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  // MySQL DECIMAL columns arrive as strings like "158.00".
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return String(Number(value));
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function list(names: string[], empty = 'None recorded'): string {
  return names.length ? names.join(', ') : empty;
}

/** One row per editable section: label, what is stored now, and where to edit it. */
function healthSections(data: HealthProfileBundle | null) {
  const profile = (data?.profile ?? {}) as Record<string, any>;
  const vitals = (data?.vitals ?? {}) as Record<string, any>;
  const screening = (profile.screening_history ?? {}) as Record<string, unknown>;
  const insurance = profile.insurance ?? {};
  const allergies = data?.allergies ?? [];

  const vitalsCount = VITAL_KEYS.filter((k) => has(vitals[k])).length;
  const vitalsSummary =
    has(vitals.systolic_mmhg) && has(vitals.diastolic_mmhg)
      ? `Blood pressure ${vitals.systolic_mmhg}/${vitals.diastolic_mmhg}`
      : vitalsCount
        ? `${vitalsCount} of ${VITAL_KEYS.length} recorded`
        : 'Not added yet';

  // Onboarding only asks the ordinals; fall back to them when exact amounts are missing.
  const lifestyleParts = [
    has(profile.sleep_hours)
      ? `${profile.sleep_hours} h sleep`
      : has(profile.sleep_quality) ? `${formatValue(profile.sleep_quality)} sleep` : null,
    has(profile.exercise_minutes_per_week)
      ? `${profile.exercise_minutes_per_week} min exercise a week`
      : has(profile.exercise_frequency) ? `Exercise: ${formatValue(profile.exercise_frequency).toLowerCase()}` : null,
    has(profile.diet_type) ? formatValue(profile.diet_type) : null,
  ].filter(Boolean) as string[];

  const mentalAnswered = ['phq2_interest', 'phq2_down', 'gad2_nervous', 'gad2_worry'].filter((k) =>
    has(profile[k]),
  ).length;
  const screeningAnswered = Object.values(screening).filter(has).length;
  const familyConditions = Array.from(new Set((data?.family_history ?? []).map((f) => formatValue(f.condition))));

  return [
    { id: 'conditions', label: 'Conditions', icon: 'medkit-outline' as IconName, summary: list((data?.conditions ?? []).map((c) => c.name)) },
    { id: 'medications', label: 'Medications', icon: 'bandage-outline' as IconName, summary: list((data?.medications ?? []).map((m) => m.name)) },
    {
      id: 'allergies',
      label: 'Allergies',
      icon: 'alert-circle-outline' as IconName,
      summary: list(allergies.map((a) => a.allergen)),
      warn: allergies.some((a) => SEVERE.includes(String(a.reaction))),
    },
    { id: 'family', label: 'Family history', icon: 'people-outline' as IconName, summary: list(familyConditions) },
    { id: 'vitals', label: 'Vitals and lab numbers', icon: 'pulse-outline' as IconName, summary: vitalsSummary },
    { id: 'lifestyle', label: 'Lifestyle', icon: 'walk-outline' as IconName, summary: list(lifestyleParts, 'Not added yet') },
    {
      id: 'mental',
      label: 'Mood and stress',
      icon: 'happy-outline' as IconName,
      summary: mentalAnswered ? `${mentalAnswered} of 4 answered` : 'Not answered yet',
    },
    {
      id: 'screening',
      label: 'Screening history',
      icon: 'calendar-outline' as IconName,
      summary: screeningAnswered ? `${screeningAnswered} of 6 answered` : 'Not added yet',
    },
    {
      id: 'insurance',
      label: 'Insurance and budget',
      icon: 'shield-checkmark-outline' as IconName,
      summary:
        insurance.has_insurance === true ? 'Insured' : insurance.has_insurance === false ? 'No insurance' : 'Not added yet',
    },
  ];
}

// ─── Settings-style rows ────────────────────────────────────────

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupCard}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  summary,
  value,
  onPress,
  warn = false,
  danger = false,
  busy = false,
}: {
  icon: IconName;
  label: string;
  summary?: string;
  value?: string;
  onPress?: () => void;
  warn?: boolean;
  danger?: boolean;
  busy?: boolean;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.errorSoft }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.error : colors.textPrimary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: colors.error }]} numberOfLines={1}>
          {label}
        </Text>
        {summary ? (
          <Text style={[styles.rowSummary, warn && { color: colors.error }]} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {warn ? <Ionicons name="warning-outline" size={18} color={colors.error} /> : null}
      {busy ? (
        <ActivityIndicator size="small" color={colors.textTertiary} />
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${label}: ${value ?? summary ?? ''}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={summary ? `${label}. ${summary}` : label}
      accessibilityState={{ busy }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

// ─── Profile ────────────────────────────────────────────────────

export default function Profile() {
  const { username, logout, token } = useAuth();
  const router = useRouter();
  // Read from the shared store rather than re-fetching a screen-specific slice.
  const { data, status, refresh } = useHealthProfile();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string | null; city: string | null } | null>(null);

  // Best-effort: only adds the display name and city to the header.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMe(token)
      .then((m) => {
        if (!cancelled) setMe({ name: m.name, city: m.preferred_city });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const profile = data?.profile ?? null;
  const isLoading = status === 'loading' && !data;
  const displayName = me?.name || username || 'You';
  const details = [
    has(profile?.age) ? `${profile?.age} years` : null,
    me?.city || null,
  ].filter(Boolean) as string[];

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const encodedToken = encodeURIComponent(token || '');
      const pdfUrl = `${API_BASE_URL}/api/health/generate-report?token=${encodedToken}`;
      const canOpen = await Linking.canOpenURL(pdfUrl);
      if (canOpen) {
        await Linking.openURL(pdfUrl);
      } else {
        Alert.alert(
          'Report ready',
          'Copy this link and open it in your browser to download the report:\n\n' + pdfUrl,
          [{ text: 'OK' }],
        );
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      setReportError('The report could not be created. Check your connection and try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleLogout = () => {
    const message = 'You will need your username and password to sign back in.';
    const signOut = async () => {
      await logout();
      router.replace('/auth/login');
    };
    // Alert.alert with buttons is a no-op on react-native-web.
    if (Platform.OS === 'web') {
      if (window.confirm(`Sign out?\n\n${message}`)) signOut();
      return;
    }
    Alert.alert('Sign out', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleUpdateProfile = () => {
    router.push('/onboarding/welcome');
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading' && Boolean(data)}
            onRefresh={refresh}
            tintColor={colors.textTertiary}
          />
        }
      >
        {/* ── Identity ───────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {displayName}
            </Text>
            {details.length ? (
              <View style={styles.details}>
                {details.map((d) => (
                  <Text key={d} style={styles.detail}>
                    {d}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <CompletenessCard completeness={data?.completeness} hideWhenComplete={false} />

        {profile?.health_persona ? (
          <View style={styles.personaCard}>
            <Text style={styles.personaTitle}>Your health persona</Text>
            <MarkdownText content={profile.health_persona} variant="light" />
          </View>
        ) : null}

        <Group title="Health profile">
          {healthSections(data).map((s) => (
            <Row
              key={s.id}
              icon={s.icon}
              label={s.label}
              summary={s.summary}
              warn={s.warn}
              onPress={() => router.push(`/profile/edit/${s.id}` as never)}
            />
          ))}
        </Group>

        <Group title="About you">
          {BASIC_FIELDS.filter((f) => has((profile as Record<string, unknown> | null)?.[f.key])).map((f) => {
            const value = (profile as Record<string, unknown>)[f.key];
            return (
              <Row
                key={f.key}
                icon={f.icon}
                label={f.label}
                value={`${formatValue(value)}${f.unit ? ` ${f.unit}` : ''}`}
              />
            );
          })}
          <Row
            icon="refresh-outline"
            label="Retake health questionnaire"
            summary="Answer the onboarding questions again"
            onPress={handleUpdateProfile}
          />
        </Group>

        <Group title="Reports">
          <Row
            icon="document-text-outline"
            label={isGeneratingReport ? 'Creating your report' : 'Download health report'}
            summary="A PDF summary to share with your doctor"
            onPress={handleGenerateReport}
            busy={isGeneratingReport}
          />
        </Group>
        {reportError ? (
          <View style={styles.notice}>
            <Notice>{reportError}</Notice>
          </View>
        ) : null}

        <Group title="Account">
          <Row icon="log-out-outline" label="Sign out" onPress={handleLogout} danger />
        </Group>

        <Text style={styles.appVersion}>Eunoia 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const ICON = 36;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Identity
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.textPrimary,
  },
  headerText: {
    flex: 1,
  },
  name: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    marginTop: 2,
  },
  detail: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },

  // Persona
  personaCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  personaTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },

  // Groups
  group: {
    marginTop: spacing.xxl,
  },
  groupTitle: {
    ...typography.overline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    // Inset to where the text starts, as in iOS settings.
    marginLeft: spacing.lg + ICON + spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceHover,
  },
  rowIcon: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  rowSummary: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rowValue: {
    ...typography.body,
    color: colors.textSecondary,
  },
  notice: {
    marginTop: spacing.sm,
  },

  appVersion: {
    ...typography.captionSmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
