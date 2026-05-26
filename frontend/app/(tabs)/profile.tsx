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
import { LinearGradient } from 'expo-linear-gradient';
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

const HEALTH_ICONS: Record<string, { icon: string; gradient: [string, string] }> = {
  sleep_pattern: { icon: 'moon', gradient: ['#818CF8', '#6366F1'] },
  sleep_hours: { icon: 'time', gradient: ['#60A5FA', '#3B82F6'] },
  hydration_level: { icon: 'water', gradient: ['#22D3EE', '#06B6D4'] },
  stress_level: { icon: 'pulse', gradient: ['#FBBF24', '#F59E0B'] },
  exercise_frequency: { icon: 'fitness', gradient: ['#34D399', '#10B981'] },
  diet_type: { icon: 'restaurant', gradient: ['#A78BFA', '#8B5CF6'] },
};

export default function Profile() {
  const { username, logout } = useAuth();
  const { token } = useAuth();
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
        Alert.alert('Success', 'Opening your health report...');
      } else {
        Alert.alert(
          'Report Ready',
          'Your health report is ready. Please copy this URL and open it in your browser:\n\n' + pdfUrl,
          [{ text: 'OK', onPress: () => console.log('PDF URL:', pdfUrl) }],
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
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handleUpdateProfile = () => {
    router.push('/onboarding/questions');
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
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <LinearGradient colors={['#4F46E5', '#6366F1', '#818CF8']} style={styles.headerCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(username || 'U').charAt(0).toUpperCase()}</Text>
            </View>
            <TouchableOpacity style={styles.editAvatarBtn} onPress={handleUpdateProfile}>
              <Ionicons name="pencil" size={14} color={colors.accent} />
            </TouchableOpacity>
          </View>
          <Text style={styles.username}>{username}</Text>
          <View style={styles.memberBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#10B981" />
            <Text style={styles.memberText}>Health Member</Text>
          </View>
        </LinearGradient>

        {/* Health persona */}
        {profile?.health_persona && (
          <View style={styles.personaCard}>
            <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.personaIconBg}>
              <Ionicons name="sparkles" size={20} color="#D97706" />
            </LinearGradient>
            <View style={styles.personaContent}>
              <Text style={styles.personaTitle}>Your Health Persona</Text>
              <MarkdownText content={profile.health_persona} variant="light" />
            </View>
          </View>
        )}

        {/* Health info grid */}
        {profile && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Health Profile</Text>
              <TouchableOpacity onPress={handleUpdateProfile} style={styles.editBtn}>
                <Ionicons name="create-outline" size={18} color={colors.accent} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoGrid}>
              {(['sleep_pattern', 'sleep_hours', 'hydration_level', 'stress_level', 'exercise_frequency', 'diet_type'] as const).map((key) => {
                const iconInfo = HEALTH_ICONS[key];
                const value = profile[key];
                if (value === undefined) return null;
                return (
                  <View key={key} style={styles.infoCard}>
                    <LinearGradient colors={iconInfo.gradient} style={styles.infoIconBg}>
                      <Ionicons name={iconInfo.icon as any} size={20} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.infoLabel}>{formatKeyLabel(key)}</Text>
                    <Text style={styles.infoValue}>{formatLabel(key, value)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleGenerateReport}
            disabled={isGeneratingReport}
            activeOpacity={0.7}
          >
            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.actionIconWrap}>
              <Ionicons name="document-text" size={20} color={colors.accent} />
            </LinearGradient>
            <View style={styles.actionContent}>
              <Text style={styles.actionButtonText}>
                {isGeneratingReport ? 'Generating Report...' : 'Generate Health Report'}
              </Text>
              <Text style={styles.actionSubtext}>Download your comprehensive health summary</Text>
            </View>
            {isGeneratingReport ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleUpdateProfile} activeOpacity={0.7}>
            <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.actionIconWrap}>
              <Ionicons name="refresh" size={20} color="#10B981" />
            </LinearGradient>
            <View style={styles.actionContent}>
              <Text style={styles.actionButtonText}>Update Health Profile</Text>
              <Text style={styles.actionSubtext}>Retake the health questionnaire</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout} activeOpacity={0.7}>
            <LinearGradient colors={['#FEE2E2', '#FECACA']} style={styles.actionIconWrap}>
              <Ionicons name="log-out" size={20} color="#DC2626" />
            </LinearGradient>
            <View style={styles.actionContent}>
              <Text style={[styles.actionButtonText, { color: '#DC2626' }]}>Logout</Text>
              <Text style={styles.actionSubtext}>Sign out of your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Health App v1.0.0</Text>
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
    paddingBottom: 120,
  },

  // Header Card
  headerCard: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.screenPadding,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: {
    ...typography.display,
    fontSize: 40,
    color: '#fff',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  username: {
    ...typography.largeTitle,
    fontSize: 24,
    color: '#fff',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  memberText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#fff',
  },

  // Persona Card
  personaCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    marginTop: -20,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  personaIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaContent: {
    flex: 1,
  },
  personaTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: 6,
  },

  // Section
  section: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.accentLight,
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accent,
  },

  // Info Grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  infoCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  infoIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    ...typography.captionSmall,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  infoValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  logoutButton: {
    marginTop: spacing.md,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    ...typography.captionSmall,
    color: colors.textMuted,
    marginTop: 2,
  },

  // App Info
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  appVersion: {
    ...typography.captionSmall,
    color: colors.textMuted,
  },
});
