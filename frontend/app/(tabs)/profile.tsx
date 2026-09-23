import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../utils/api';
import { MarkdownText } from '../../components/MarkdownText';
import { colors, spacing, shadows, typography } from '../../constants/theme';
import { useHealthProfile } from '../../contexts/HealthProfileContext';
import CompletenessCard from '../../components/health/CompletenessCard';
import ClinicalList, {
  CONTROL_LABELS,
  DURATION_LABELS,
} from '../../components/health/ClinicalList';

// Fields worth surfacing, in the order a person would look for them. The
// screen previously showed six legacy lifestyle fields read from the old
// profile endpoint, two of which the backend filled with hardcoded constants
// because onboarding never asked for them.
const PROFILE_FIELDS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  unit?: string;
}[] = [
  { key: 'age', label: 'Age', icon: 'person-outline' },
  { key: 'gender', label: 'Gender', icon: 'body-outline' },
  { key: 'height', label: 'Height', icon: 'resize-outline', unit: 'cm' },
  { key: 'weight', label: 'Weight', icon: 'barbell-outline', unit: 'kg' },
  { key: 'smoking', label: 'Smoking', icon: 'flame-outline' },
  { key: 'alcohol', label: 'Alcohol', icon: 'wine-outline' },
  { key: 'exercise_frequency', label: 'Exercise', icon: 'fitness-outline' },
  { key: 'sleep_hours', label: 'Sleep', icon: 'moon-outline', unit: 'h' },
  { key: 'stress_level', label: 'Stress', icon: 'pulse-outline' },
  { key: 'diet_type', label: 'Diet', icon: 'restaurant-outline' },
];

export default function Profile() {
  const { username, logout, token } = useAuth();
  const router = useRouter();
  // Read from the shared store rather than re-fetching a screen-specific
  // slice. This screen used to call the legacy profile endpoint, which is why
  // it showed none of the data collected during onboarding.
  const { data, status, refresh } = useHealthProfile();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const profile = data?.profile ?? null;
  const conditions = data?.conditions ?? [];
  const medications = data?.medications ?? [];
  const allergies = data?.allergies ?? [];
  const isLoading = status === 'loading' && !data;

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const encodedToken = encodeURIComponent(token || '');
      const pdfUrl = `${API_BASE_URL}/api/health/generate-report?token=${encodedToken}`;
      const canOpen = await Linking.canOpenURL(pdfUrl);
      if (canOpen) {
        await Linking.openURL(pdfUrl);
      } else {
        Alert.alert(
          'Report Ready',
          'Your health report is ready. Please copy this URL and open it in your browser:\n\n' + pdfUrl,
          [{ text: 'OK' }],
        );
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      Alert.alert('Error', 'Failed to generate health report. Please try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handleUpdateProfile = () => {
    router.push('/onboarding/welcome');
  };

  // Units are declared per field now, so this only has to make a stored value
  // readable - it must not invent one (it used to append "hours" to every
  // number it was given, including height and weight).
  const formatLabel = (key: string, value: unknown): string => {
    if (typeof value === 'number') return String(value);
    return String(value).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
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
        {/* ── INK HERO HEADER ─────────────────────────────── */}
        <View style={styles.headerCard}>
          <View style={styles.heroAccentGlow} pointerEvents="none" />

          <View style={styles.headerTopRow}>
            <Text style={styles.headerEyebrow}>EUNOIA · MEMBER</Text>
            <TouchableOpacity onPress={handleUpdateProfile} style={styles.editTopBtn} activeOpacity={0.85}>
              <Ionicons name="pencil-outline" size={14} color={colors.textInverse} />
            </TouchableOpacity>
          </View>

          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(username || 'U').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.username}>{username}</Text>
              <View style={styles.memberBadge}>
                <View style={styles.memberDot} />
                <Text style={styles.memberText}>Verified member</Text>
              </View>
            </View>
          </View>
        </View>

        <CompletenessCard completeness={data?.completeness} hideWhenComplete={false} />

        {/* ── PERSONA ──────────────────────────────────────── */}
        {profile?.health_persona && (
          <View style={styles.personaCard}>
            <View style={styles.personaHeader}>
              <View style={styles.personaIconBg}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
              </View>
              <Text style={styles.personaEyebrow}>Health persona</Text>
            </View>
            <View style={styles.personaContent}>
              <MarkdownText content={profile.health_persona} variant="light" />
            </View>
          </View>
        )}

        {/* ── HEALTH PROFILE GRID ─────────────────────────── */}
        {profile && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>01</Text>
                <Text style={styles.sectionTitle}>Health Profile</Text>
              </View>
              <TouchableOpacity onPress={handleUpdateProfile} style={styles.editBtn} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={14} color={colors.textPrimary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoGrid}>
              {PROFILE_FIELDS.map((field) => {
                const value = (profile as Record<string, unknown>)[field.key];
                if (value === undefined || value === null || value === '') return null;
                return (
                  <View key={field.key} style={styles.infoCard}>
                    <View style={styles.infoIconBg}>
                      <Ionicons name={field.icon} size={16} color={colors.textPrimary} />
                    </View>
                    <Text style={styles.infoLabel}>{field.label}</Text>
                    <Text style={styles.infoValue}>
                      {formatLabel(field.key, value)}
                      {field.unit ? ` ${field.unit}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* The clinical record. None of this was visible before, because
                the medical history only ever reached a JSON snapshot column. */}
            <ClinicalList
              title="Conditions"
              empty="None recorded"
              items={conditions.map((c) => ({
                key: c.name,
                primary: c.name,
                secondary: [
                  DURATION_LABELS[String(c.diagnosed_bucket)] ?? 'duration unknown',
                  CONTROL_LABELS[String(c.control)] ?? 'control unknown',
                ].join(' · '),
              }))}
              onEdit={() => router.push('/profile/edit/conditions' as never)}
            />

            <ClinicalList
              title="Medications"
              empty="None recorded"
              items={medications.map((m) => ({
                key: m.name,
                primary: m.name,
                secondary: [m.dose, m.for_condition ? `for ${m.for_condition}` : null]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              onEdit={() => router.push('/profile/edit/medications' as never)}
            />

            <ClinicalList
              title="Allergies"
              empty="None recorded"
              items={allergies.map((a) => ({
                key: a.allergen,
                primary: a.allergen,
                secondary: a.reaction ? String(a.reaction).replace(/_/g, ' ') : '',
                warn:
                  a.reaction === 'anaphylaxis' ||
                  a.reaction === 'breathing' ||
                  a.reaction === 'swelling',
              }))}
              onEdit={() => router.push('/profile/edit/allergies' as never)}
            />
          </View>
        )}

        {/* ── ACTIONS ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>02</Text>
              <Text style={styles.sectionTitle}>Actions</Text>
            </View>
          </View>

          <View style={styles.actionsList}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleGenerateReport}
              disabled={isGeneratingReport}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons name="document-text-outline" size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionButtonText}>
                  {isGeneratingReport ? 'Generating report…' : 'Generate health report'}
                </Text>
                <Text style={styles.actionSubtext}>Comprehensive health summary, ready to download</Text>
              </View>
              {isGeneratingReport ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
              )}
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            <TouchableOpacity style={styles.actionButton} onPress={handleUpdateProfile} activeOpacity={0.85}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="refresh-outline" size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionButtonText}>Update health profile</Text>
                <Text style={styles.actionSubtext}>Retake the health questionnaire</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={16} color={colors.error} />
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* App info */}
        <View style={styles.appInfo}>
          <View style={styles.appInfoDot} />
          <Text style={styles.appVersion}>EUNOIA v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingBottom: 140,
  },

  // ─── Hero ────────────────────────────────────────────────
  headerCard: {
    backgroundColor: colors.inkSurface,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    paddingHorizontal: spacing.screenPadding,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  heroAccentGlow: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent,
    opacity: 0.16,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  headerEyebrow: {
    ...typography.overline,
    color: colors.textInverseSubtle,
  },
  editTopBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.display,
    fontSize: 30,
    color: colors.textInverse,
  },
  identityText: {
    flex: 1,
  },
  username: {
    ...typography.largeTitle,
    color: colors.textInverse,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
  },
  memberDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.success,
  },
  memberText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.textInverse,
  },

  // ─── Persona ─────────────────────────────────────────────
  personaCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    marginTop: -20,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.lg,
  },
  personaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  personaIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaEyebrow: {
    ...typography.overline,
    color: colors.textPrimary,
  },
  personaContent: {},

  // ─── Sections ────────────────────────────────────────────
  section: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  sectionEyebrow: {
    ...typography.overline,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ─── Info grid ───────────────────────────────────────────
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  infoCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  infoIconBg: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  infoLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 4,
  },
  infoValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ─── Actions ─────────────────────────────────────────────
  actionsList: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionButtonText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionSubtext: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  logoutText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.error,
  },

  // ─── App info ────────────────────────────────────────────
  appInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.xxxl,
    marginTop: spacing.lg,
  },
  appInfoDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  appVersion: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
  },
});
