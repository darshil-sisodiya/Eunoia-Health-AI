import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { uploadPrescription, getPrescriptionHistory, PrescriptionAnalysis } from '@/utils/api';
import { MarkdownText } from '@/components/MarkdownText';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { useHealthProfile } from '@/contexts/HealthProfileContext';
import { Notice, ScreenHeader, tap } from '@/components/ui';

type IconName = keyof typeof Ionicons.glyphMap;

// Shown one after another while the upload runs, so the wait reads as work
// in progress rather than a frozen screen.
const ANALYSIS_STEPS = [
  'Reading the text on your prescription',
  'Identifying the medicine and dose',
  'Checking it against your health profile',
];

function formatDate(iso: string, month: 'short' | 'long') {
  return new Date(iso).toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' });
}

function AnalyzingView() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.analyzing} accessibilityLiveRegion="polite">
      <Text style={styles.analyzingTitle} accessibilityRole="header">
        Reading your prescription
      </Text>
      <Text style={styles.analyzingSub}>Keep the app open. This can take up to half a minute.</Text>
      <View style={styles.stepsCard}>
        {ANALYSIS_STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <View key={label} style={styles.stepRow}>
              <View style={styles.stepIcon}>
                {done ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                ) : current ? (
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                ) : (
                  <View style={styles.stepPending} />
                )}
              </View>
              <Text style={[styles.stepText, !done && !current && styles.stepTextPending]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HeroButton({
  icon,
  label,
  onPress,
  light,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  light?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.heroButton,
        { backgroundColor: light ? colors.surface : colors.inkSurfaceElevated },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={light ? colors.textPrimary : colors.textInverse} />
      <Text style={[styles.heroButtonText, { color: light ? colors.textPrimary : colors.textInverse }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailSection({
  icon,
  label,
  content,
  tone,
}: {
  icon: IconName;
  label: string;
  content?: string | null;
  tone?: 'warning' | 'error';
}) {
  if (!content) return null;
  const fg = tone === 'warning' ? colors.warning : tone === 'error' ? colors.error : colors.textPrimary;
  const bg = tone === 'warning' ? colors.warningSoft : tone === 'error' ? colors.errorSoft : colors.selected;
  return (
    <View style={styles.detailSection}>
      <View style={styles.detailSectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={16} color={fg} />
        </View>
        <Text style={styles.detailSectionTitle}>{label}</Text>
      </View>
      <Text style={styles.detailText}>{content}</Text>
    </View>
  );
}

export default function PrescriptionsScreen() {
  const { token } = useAuth();
  // The real medication and allergy lists, so an upload can be checked
  // against them and can add to them.
  const { data: profile, patch: patchProfile } = useHealthProfile();
  const [prescriptions, setPrescriptions] = useState<PrescriptionAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionAnalysis | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Re-run once the stored token has loaded; on a cold start it is null at mount.
  useEffect(() => {
    loadPrescriptions();
  }, [token]);

  const loadPrescriptions = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await getPrescriptionHistory(token);
      setPrescriptions(data);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPrescriptions();
    setRefreshing(false);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    setUploadError(null);
    try {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in your device settings to scan a prescription.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo access needed', 'Allow photo library access in your device settings to choose a prescription.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      }
      if (!result.canceled && result.assets[0]) {
        await handleUpload(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setUploadError('Could not open the photo. Try again, or choose a different one.');
    }
  };

  const handleUpload = async (imageUri: string) => {
    if (!token) return;
    try {
      setUploading(true);
      const analysis = await uploadPrescription(token, imageUri);
      setUploading(false);
      loadPrescriptions().catch(console.error);
      setSelectedPrescription(analysis);
      offerToSaveMedication(analysis);
    } catch (error: any) {
      setUploading(false);
      setUploadError(
        error.message || 'Could not read that prescription. Check your connection and try a clearer photo.',
      );
      console.error(error);
    }
  };

  /**
   * Offer to add a newly seen drug to the profile's medication list.
   *
   * This is the link that makes the modules feel like one app: what the
   * camera reads becomes part of the health record, which re-scores the risk
   * assessment and, from then on, is what future prescriptions get checked
   * against for interactions.
   */
  const offerToSaveMedication = (analysis: PrescriptionAnalysis) => {
    // Backend caps name at 80 and dose at 60 chars; OCR output can run longer.
    const name = (analysis.medication_name || '').trim().slice(0, 80);
    if (!name) return;

    const known = (profile?.medications ?? []).some(
      (m) => m.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (known) return;

    Alert.alert(
      'Add to your medications?',
      `Keep ${name} on your profile so we can check future prescriptions against it and keep your risk score current.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Add',
          onPress: async () => {
            try {
              await patchProfile('medications', {
                medications: [
                  ...(profile?.medications ?? []).map((m) => ({
                    name: m.name,
                    dose: m.dose ?? null,
                    frequency: m.frequency ?? null,
                    started_bucket: m.started_bucket ?? 'unknown',
                    for_condition: m.for_condition ?? null,
                    adherence: m.adherence ?? 'unknown',
                  })),
                  {
                    name,
                    dose: analysis.dosage?.trim().slice(0, 60) || null,
                    started_bucket: 'lt_1m' as const,
                    adherence: 'unknown' as const,
                  },
                ],
              });
            } catch {
              Alert.alert('Could not save', 'Your medication list was not updated. Try again from your profile.');
            }
          },
        },
      ],
    );
  };

  if (uploading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AnalyzingView />
      </SafeAreaView>
    );
  }

  if (selectedPrescription) {
    const p = selectedPrescription;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title={p.medication_name}
            subtitle={`Added ${formatDate(p.created_at, 'long')}`}
            onBack={() => setSelectedPrescription(null)}
          />

          <View style={styles.body}>
            <View style={styles.card}>
              <DetailSection icon="fitness-outline" label="Dosage" content={p.dosage} />
              <DetailSection icon="time-outline" label="How often" content={p.frequency} />
              <DetailSection icon="sunny-outline" label="Best time to take" content={p.timing} />
              <DetailSection icon="information-circle-outline" label="What it's for" content={p.purpose} />
              <DetailSection icon="warning-outline" label="Possible side effects" content={p.side_effects} tone="warning" />
              <DetailSection icon="alert-circle-outline" label="Interactions and warnings" content={p.interactions} tone="error" />
            </View>

            {p.personalized_advice ? (
              <View style={styles.card}>
                <View style={styles.detailSectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="sparkles-outline" size={16} color={colors.textPrimary} />
                  </View>
                  <Text style={styles.cardTitle}>Guidance for you</Text>
                </View>
                <MarkdownText content={p.personalized_advice} />
              </View>
            ) : null}

            {p.extracted_text ? (
              <View style={styles.extracted}>
                <Text style={styles.extractedLabel}>Extracted text</Text>
                <Text style={styles.extractedText} selectable>
                  {p.extracted_text}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          Prescriptions
        </Text>

        {/* ── Primary action ─────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="scan-outline" size={22} color={colors.textPrimary} />
          </View>
          <Text style={styles.heroTitle}>Scan a prescription</Text>
          <Text style={styles.heroBody}>
            Get the dose, timing and side effects for each medicine, checked against your health profile.
          </Text>
          <View style={styles.heroActions}>
            <HeroButton icon="camera-outline" label="Scan prescription" onPress={() => pickImage('camera')} light />
            <HeroButton icon="images-outline" label="Choose from photos" onPress={() => pickImage('library')} />
          </View>
        </View>

        {uploadError ? (
          <View style={styles.gap}>
            <Notice>{uploadError}</Notice>
          </View>
        ) : null}

        {/* ── History ────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Past prescriptions</Text>

        {loading && !refreshing && prescriptions.length === 0 ? (
          <View style={styles.listLoading}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : loadError && prescriptions.length === 0 ? (
          <Notice>Could not load your prescriptions. Pull down to try again.</Notice>
        ) : prescriptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.rowIcon}>
              <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>No prescriptions yet</Text>
              <Text style={styles.rowMeta}>
                Scan your first one above. It will be saved here so you can check it any time.
              </Text>
            </View>
          </View>
        ) : (
          prescriptions.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setSelectedPrescription(p)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${p.medication_name}, added ${formatDate(p.created_at, 'long')}. Open details.`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {p.medication_name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {formatDate(p.created_at, 'short')}
                </Text>
                {p.frequency ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {p.frequency}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  gap: {
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  // Hero
  hero: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textInverse,
  },
  heroBody: {
    ...typography.callout,
    fontFamily: fonts.regular,
    lineHeight: 21,
    color: colors.textInverseMuted,
    marginTop: spacing.xs,
  },
  heroActions: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  heroButton: {
    minHeight: 50,
    borderRadius: spacing.buttonRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  heroButtonText: {
    ...typography.headline,
  },

  // History
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  listLoading: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Analyzing
  analyzing: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  analyzingTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  analyzingSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPending: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorderStrong,
  },
  stepText: {
    ...typography.callout,
    color: colors.textPrimary,
    flex: 1,
  },
  stepTextPending: {
    color: colors.textTertiary,
  },

  // Detail
  detailContent: {
    paddingBottom: spacing.xxxl,
  },
  body: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
  },
  detailSection: {
    gap: spacing.sm,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSectionTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  detailText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  extracted: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
  },
  extractedLabel: {
    ...typography.overline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  extractedText: {
    ...typography.callout,
    fontFamily: fonts.regular,
    lineHeight: 21,
    color: colors.textSecondary,
  },
});
