import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { uploadPrescription, getPrescriptionHistory, PrescriptionAnalysis } from '@/utils/api';
import { MarkdownText } from '@/components/MarkdownText';
import { colors, spacing, shadows, typography } from '@/constants/theme';

export default function PrescriptionsScreen() {
  const { token } = useAuth();
  const [prescriptions, setPrescriptions] = useState<PrescriptionAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionAnalysis | null>(null);

  useEffect(() => {
    loadPrescriptions();
  }, []);

  const loadPrescriptions = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await getPrescriptionHistory(token);
      setPrescriptions(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load prescriptions');
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
    try {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Camera permission is needed to take photos');
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
          Alert.alert('Permission Required', 'Photo library permission is needed');
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
      Alert.alert('Error', 'Failed to pick image');
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
    } catch (error: any) {
      setUploading(false);
      Alert.alert('Error', error.message || 'Failed to upload prescription');
      console.error(error);
    }
  };

  const showUploadOptions = () => {
    Alert.alert(
      'Upload Prescription',
      'Choose a source',
      [
        { text: 'Take Photo', onPress: () => pickImage('camera') },
        { text: 'Choose from Library', onPress: () => pickImage('library') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const renderPrescriptionCard = (prescription: PrescriptionAnalysis, index: number) => (
    <TouchableOpacity
      key={prescription.id}
      onPress={() => setSelectedPrescription(prescription)}
      activeOpacity={0.85}
      style={styles.prescriptionCard}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.medicationName} numberOfLines={1}>{prescription.medication_name}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
        </View>
        <Text style={styles.date}>
          {new Date(prescription.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
        {(prescription.frequency || prescription.timing) && (
          <View style={styles.cardDetails}>
            {prescription.frequency && (
              <View style={styles.detailChip}>
                <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.detailChipText}>{prescription.frequency}</Text>
              </View>
            )}
            {prescription.timing && (
              <View style={styles.detailChip}>
                <Ionicons name="sunny-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.detailChipText}>{prescription.timing}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderDetailSection = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    content: string | null | undefined,
    accent?: 'warning' | 'error' | 'accent',
  ) => {
    if (!content) return null;
    const accentColor =
      accent === 'warning' ? colors.warning : accent === 'error' ? colors.error : colors.textPrimary;
    return (
      <View style={styles.detailSection}>
        <View style={styles.detailSectionHeader}>
          <View style={styles.sectionIconBg}>
            <Ionicons name={icon} size={14} color={accentColor} />
          </View>
          <Text style={styles.detailSectionTitle}>{label}</Text>
        </View>
        <Text style={styles.detailText}>{content}</Text>
      </View>
    );
  };

  const renderPrescriptionDetail = () => {
    if (!selectedPrescription) return null;

    return (
      <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setSelectedPrescription(null)}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>All prescriptions</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailEyebrow}>PRESCRIPTION</Text>
          <Text style={styles.detailTitle}>{selectedPrescription.medication_name}</Text>
          <Text style={styles.detailDate}>
            Added {new Date(selectedPrescription.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>

        <View style={styles.detailCard}>
          {renderDetailSection('fitness-outline', 'Dosage', selectedPrescription.dosage)}
          {renderDetailSection('time-outline', 'Frequency', selectedPrescription.frequency)}
          {renderDetailSection('sunny-outline', 'Best time to take', selectedPrescription.timing)}
          {renderDetailSection('information-circle-outline', 'Purpose', selectedPrescription.purpose)}
          {renderDetailSection('warning-outline', 'Possible side effects', selectedPrescription.side_effects, 'warning')}
          {renderDetailSection('alert-circle-outline', 'Interactions & warnings', selectedPrescription.interactions, 'error')}

          {selectedPrescription.personalized_advice && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <View style={[styles.sectionIconBg, { backgroundColor: colors.accentMuted, borderColor: colors.accentSoftBorder }]}>
                  <Ionicons name="sparkles" size={14} color={colors.accent} />
                </View>
                <Text style={styles.detailSectionTitle}>Personalized advice</Text>
              </View>
              <View style={styles.markdownWrap}>
                <MarkdownText content={selectedPrescription.personalized_advice} />
              </View>
            </View>
          )}
        </View>

        <View style={styles.extractedSection}>
          <Text style={styles.extractedLabel}>EXTRACTED TEXT</Text>
          <Text style={styles.extractedText}>{selectedPrescription.extracted_text}</Text>
        </View>
      </ScrollView>
    );
  };

  if (uploading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
          <Text style={styles.loadingEyebrow}>ANALYZING</Text>
          <Text style={styles.loadingText}>Reading prescription</Text>
          <Text style={styles.loadingSubtext}>Extracting medication details and personalizing guidance.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedPrescription) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderPrescriptionDetail()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Editorial header ─────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>EUNOIA · ANALYZER</Text>
          <Text style={styles.title}>Prescriptions</Text>
          <Text style={styles.subtitle}>
            {prescriptions.length} {prescriptions.length !== 1 ? 'medications' : 'medication'} on file
          </Text>
        </View>
        <TouchableOpacity style={styles.uploadButtonHeader} onPress={showUploadOptions} activeOpacity={0.9}>
          <Ionicons name="add" size={20} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      <View style={styles.headerRule} />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      ) : prescriptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="document-text-outline" size={32} color={colors.textPrimary} />
          </View>
          <Text style={styles.emptyEyebrow}>NO PRESCRIPTIONS</Text>
          <Text style={styles.emptyTitle}>Start your library.</Text>
          <Text style={styles.emptyText}>
            Upload a photo to receive AI-powered analysis and personalized guidance.
          </Text>
          <TouchableOpacity onPress={showUploadOptions} activeOpacity={0.9} style={styles.uploadButtonLarge}>
            <Ionicons name="camera-outline" size={18} color={colors.textInverse} />
            <Text style={styles.uploadButtonText}>Upload prescription</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textTertiary}
            />
          }
        >
          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconBg}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textPrimary} />
            </View>
            <Text style={styles.infoText}>
              Personalized medication guidance, contextualized to your health profile.
            </Text>
          </View>

          {/* List */}
          <View style={styles.prescriptionsList}>
            {prescriptions.map((p, i) => renderPrescriptionCard(p, i))}
          </View>

          {/* Add more */}
          <TouchableOpacity style={styles.addMoreButton} onPress={showUploadOptions} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color={colors.textPrimary} />
            <Text style={styles.addMoreText}>Add another prescription</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ─── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerLeft: {
    flex: 1,
  },
  headerEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textTertiary,
    marginTop: 4,
  },
  uploadButtonHeader: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.inkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  headerRule: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.screenPadding,
  },

  // ─── List ────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: 140,
  },

  // ─── States ──────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  loadingEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginTop: spacing.lg,
  },
  loadingText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  loadingSubtext: {
    ...typography.callout,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  emptyEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 10,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  uploadButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: spacing.buttonRadius,
    marginTop: spacing.xxl,
    gap: spacing.sm,
    backgroundColor: colors.inkSurface,
    ...shadows.md,
  },
  uploadButtonText: {
    ...typography.headline,
    color: colors.textInverse,
  },

  // ─── Info card ──────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  infoIconBg: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  infoText: {
    flex: 1,
    ...typography.callout,
    color: colors.textSecondary,
  },

  // ─── Prescription card ──────────────────────────────────
  prescriptionsList: {
    gap: spacing.sm,
  },
  prescriptionCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  cardLeft: {
    width: 56,
    paddingTop: spacing.lg,
    paddingLeft: spacing.lg,
  },
  cardIndex: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    flex: 1,
    padding: spacing.lg,
    paddingLeft: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  medicationName: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  date: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  cardDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  detailChipText: {
    ...typography.captionSmall,
    color: colors.textSecondary,
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  addMoreText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ─── Detail view ────────────────────────────────────────
  detailContainer: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: 140,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  backButtonText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detailHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  detailEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  detailTitle: {
    ...typography.display,
    fontSize: 36,
    color: colors.textPrimary,
  },
  detailDate: {
    ...typography.callout,
    color: colors.textTertiary,
    marginTop: 8,
  },
  detailCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  detailSection: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 10,
  },
  sectionIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  detailSectionTitle: {
    ...typography.overline,
    color: colors.textPrimary,
  },
  detailText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  markdownWrap: {
    marginTop: -4,
  },
  extractedSection: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  extractedLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  extractedText: {
    ...typography.mono,
    color: colors.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
