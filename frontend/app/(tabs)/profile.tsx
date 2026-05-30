import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { MarkdownText } from '../../components/MarkdownText';
import { colors, spacing, shadows, typography } from '../../constants/theme';

interface HealthProfile {
  sleep_pattern: string;
  sleep_hours: number;
  hydration_level: string;
  stress_level: string;
  exercise_frequency: string;
  diet_type: string;
  health_persona?: string;
}

const HEALTH_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sleep_pattern: 'moon-outline',
  sleep_hours: 'time-outline',
  hydration_level: 'water-outline',
  stress_level: 'pulse-outline',
  exercise_frequency: 'fitness-outline',
  diet_type: 'restaurant-outline',
};

export default function Profile() {
  const { username, logout, token } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/health/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(response.data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const formatLabel = (key: string, value: string | number): string => {
    if (typeof value === 'number') return `${value} hours`;
    return value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatKeyLabel = (key: string): string => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
              {(['sleep_pattern', 'sleep_hours', 'hydration_level', 'stress_level', 'exercise_frequency', 'diet_type'] as const).map((key) => {
                const iconName = HEALTH_ICONS[key];
                const value = profile[key];
                if (value === undefined) return null;
                return (
                  <View key={key} style={styles.infoCard}>
                    <View style={styles.infoIconBg}>
                      <Ionicons name={iconName} size={16} color={colors.textPrimary} />
                    </View>
                    <Text style={styles.infoLabel}>{formatKeyLabel(key)}</Text>
                    <Text style={styles.infoValue}>{formatLabel(key, value)}</Text>
                  </View>
                );
              })}
            </View>
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
