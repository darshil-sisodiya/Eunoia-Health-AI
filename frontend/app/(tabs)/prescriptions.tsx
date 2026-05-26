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
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { uploadPrescription, getPrescriptionHistory, PrescriptionAnalysis } from '@/utils/api';
import { GlassCard } from '@/components/GlassCard';
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
      'Choose an option',
      [
        { text: 'Take Photo', onPress: () => pickImage('camera') },
        { text: 'Choose from Library', onPress: () => pickImage('library') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const renderPrescriptionCard = (prescription: PrescriptionAnalysis) => (
    <TouchableOpacity
      key={prescription.id}
      onPress={() => setSelectedPrescription(prescription)}
      activeOpacity={0.7}
      style={styles.prescriptionCard}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.cardIconWrap}>
            <Ionicons name="medical" size={22} color={colors.accent} />
          </LinearGradient>
          <View style={styles.cardHeaderText}>
            <Text style={styles.medicationName}>{prescription.medication_name}</Text>
            <Text style={styles.date}>
              {new Date(prescription.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.cardArrow}>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </View>

        <View style={styles.cardDetails}>
          {prescription.frequency && (
            <View style={styles.detailChip}>
              <Ionicons name="time-outline" size={14} color={colors.accent} />
              <Text style={styles.detailChipText}>{prescription.frequency}</Text>
            </View>
          )}
          {prescription.timing && (
            <View style={styles.detailChip}>
              <Ionicons name="sunny-outline" size={14} color="#F59E0B" />
              <Text style={styles.detailChipText}>{prescription.timing}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderPrescriptionDetail = () => {
    if (!selectedPrescription) return null;

    return (
      <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setSelectedPrescription(null)}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.detailIconBg}>
            <Ionicons name="medical" size={28} color="#fff" />
          </LinearGradient>
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
          {selectedPrescription.dosage && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#DBEAFE', '#BFDBFE']} style={styles.sectionIconBg}>
                  <Ionicons name="fitness" size={18} color="#3B82F6" />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Dosage</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.dosage}</Text>
            </View>
          )}

          {selectedPrescription.frequency && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.sectionIconBg}>
                  <Ionicons name="time" size={18} color={colors.accent} />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Frequency</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.frequency}</Text>
            </View>
          )}

          {selectedPrescription.timing && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.sectionIconBg}>
                  <Ionicons name="sunny" size={18} color="#D97706" />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Best Time to Take</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.timing}</Text>
            </View>
          )}

          {selectedPrescription.purpose && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#D1FAE5', '#A7F3D0']} style={styles.sectionIconBg}>
                  <Ionicons name="information-circle" size={18} color="#059669" />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Purpose</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.purpose}</Text>
            </View>
          )}

          {selectedPrescription.side_effects && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#FEE2E2', '#FECACA']} style={styles.sectionIconBg}>
                  <Ionicons name="warning" size={18} color="#DC2626" />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Possible Side Effects</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.side_effects}</Text>
            </View>
          )}

          {selectedPrescription.interactions && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#FFEDD5', '#FED7AA']} style={styles.sectionIconBg}>
                  <Ionicons name="alert-circle" size={18} color="#EA580C" />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Interactions & Warnings</Text>
              </View>
              <Text style={styles.detailText}>{selectedPrescription.interactions}</Text>
            </View>
          )}

          {selectedPrescription.personalized_advice && (
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <LinearGradient colors={['#E0E7FF', '#C7D2FE']} style={styles.sectionIconBg}>
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                </LinearGradient>
                <Text style={styles.detailSectionTitle}>Personalized Advice</Text>
              </View>
              <MarkdownText content={selectedPrescription.personalized_advice} />
            </View>
          )}
        </View>

        <View style={styles.extractedSection}>
          <Text style={styles.extractedLabel}>Extracted Text</Text>
          <Text style={styles.extractedText}>{selectedPrescription.extracted_text}</Text>
        </View>
      </ScrollView>
    );
  };

  if (uploading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.loadingIconBg}>
            <ActivityIndicator size="large" color={colors.accent} />
          </LinearGradient>
          <Text style={styles.loadingText}>Analyzing prescription...</Text>
          <Text style={styles.loadingSubtext}>Our AI is extracting medication details</Text>
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
      {/* Header */}
      <LinearGradient colors={['#4F46E5', '#6366F1', '#818CF8']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>Prescriptions</Text>
            <Text style={styles.subtitle}>{prescriptions.length} medication{prescriptions.length !== 1 ? 's' : ''} on file</Text>
          </View>
          <TouchableOpacity style={styles.uploadButtonHeader} onPress={showUploadOptions} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : prescriptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.emptyIconWrap}>
            <Ionicons name="medical" size={56} color={colors.accent} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No Prescriptions Yet</Text>
          <Text style={styles.emptyText}>
            Upload a photo of your prescription to get AI-powered analysis and personalized guidance
          </Text>
          <TouchableOpacity onPress={showUploadOptions} activeOpacity={0.8}>
            <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.uploadButtonLarge}>
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.uploadButtonText}>Upload Prescription</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {/* Info Card */}
          <View style={styles.infoCard}>
            <LinearGradient colors={['#D1FAE5', '#A7F3D0']} style={styles.infoIconBg}>
              <Ionicons name="shield-checkmark" size={20} color="#059669" />
            </LinearGradient>
            <Text style={styles.infoText}>
              Get personalized medication guidance based on your health profile
            </Text>
          </View>

          {/* Prescriptions List */}
          <View style={styles.prescriptionsList}>
            {prescriptions.map(renderPrescriptionCard)}
          </View>

          {/* Add More Button */}
          <TouchableOpacity style={styles.addMoreButton} onPress={showUploadOptions} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
            <Text style={styles.addMoreText}>Add Another Prescription</Text>
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
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.largeTitle,
    color: '#fff',
  },
  subtitle: {
    ...typography.callout,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  uploadButtonHeader: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  loadingIconBg: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  loadingText: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  loadingSubtext: {
    ...typography.callout,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  uploadButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: spacing.xxl,
    gap: spacing.sm,
    ...shadows.md,
  },
  uploadButtonText: {
    ...typography.headline,
    color: '#fff',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  infoIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    ...typography.callout,
    color: colors.textSecondary,
  },
  prescriptionsList: {
    gap: spacing.md,
  },
  prescriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardContent: {
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  medicationName: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  addMoreText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.accent,
  },

  // Detail View
  detailContainer: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: 120,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  backButtonText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detailHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
  },
  detailIconBg: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  detailTitle: {
    ...typography.largeTitle,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  detailDate: {
    ...typography.callout,
    color: colors.textMuted,
    marginTop: 4,
  },
  detailCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  detailSection: {
    marginBottom: spacing.xl,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSectionTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detailText: {
    ...typography.callout,
    color: colors.textSecondary,
    marginLeft: 52,
  },
  extractedSection: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: spacing.lg,
  },
  extractedLabel: {
    ...typography.overline,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  extractedText: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
