import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadows, spacing, typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  createCostEstimate,
  formatINR,
  formatRange,
  getMe,
  type CostEstimateResponse,
  type MatchedHospital,
  type UserMe,
} from '../utils/costEstimatorApi';

// ── Static option lists (mirror the catalog returned by the backend) ─────

const SEVERITY_OPTIONS: Array<{
  key: 'Mild' | 'Moderate' | 'Severe';
  label: string;
  hint: string;
}> = [
  { key: 'Mild', label: 'Mild', hint: 'Manageable, low intensity' },
  { key: 'Moderate', label: 'Moderate', hint: 'Noticeable, ongoing' },
  { key: 'Severe', label: 'Severe', hint: 'Acute or persistent' },
];

const TIER_OPTIONS: Array<{
  key: 'Low' | 'Medium' | 'High';
  label: string;
  hint: string;
}> = [
  { key: 'Low', label: 'Low', hint: 'Government / trust' },
  { key: 'Medium', label: 'Medium', hint: 'Mid-tier private' },
  { key: 'High', label: 'High', hint: 'Premium private' },
];

const CONSULTATION_OPTIONS: Array<{
  key: 'General' | 'Specialist' | 'Follow_up' | 'Tele';
  label: string;
}> = [
  { key: 'General', label: 'General' },
  { key: 'Specialist', label: 'Specialist' },
  { key: 'Follow_up', label: 'Follow-up' },
  { key: 'Tele', label: 'Tele' },
];

// ── Hospital tier colour mapping (uses existing tokens only) ─────────────

function tierTone(level: string) {
  const v = (level || '').toLowerCase();
  if (v === 'high') return { bg: colors.accentMuted, fg: colors.accent, border: colors.accentSoftBorder };
  if (v === 'low') return { bg: colors.successSoft, fg: colors.success, border: colors.successSoft };
  return { bg: colors.backgroundTertiary, fg: colors.textPrimary, border: colors.surfaceBorder };
}

// ─────────────────────────────────────────────────────────────────────────

export default function CostEstimatorScreen() {
  const { token } = useAuth();

  // ── User profile (preferred city auto-fill) ────────────────────────────
  const [me, setMe] = useState<UserMe | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [cityEditing, setCityEditing] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────
  const [conditionText, setConditionText] = useState('');
  const [city, setCity] = useState('');
  const [severity, setSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [tier, setTier] = useState<'Low' | 'Medium' | 'High' | null>(null);
  const [consultation, setConsultation] = useState<
    'General' | 'Specialist' | 'Follow_up' | 'Tele'
  >('Specialist');

  // ── Estimate state ────────────────────────────────────────────────────
  const [estimate, setEstimate] = useState<CostEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Result fade-in.
  const resultOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setProfileLoading(false);
        return;
      }
      try {
        const data = await getMe(token);
        if (cancelled) return;
        setMe(data);
        if (data.preferred_city) setCity(data.preferred_city);
      } catch {
        // Profile load is best-effort; the user can still type a city.
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (estimate) {
      resultOpacity.setValue(0);
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [estimate, resultOpacity]);

  const conditionTrimmed = conditionText.trim();
  const canSubmit = conditionTrimmed.length > 0 && city.trim().length > 0 && !estimating;

  const handleEstimate = useCallback(async () => {
    if (!canSubmit || !token) return;
    setEstimating(true);
    setEstimateError(null);
    try {
      const res = await createCostEstimate(token, {
        condition: conditionTrimmed,
        city: city.trim(),
        severity,
        hospital_tier: tier ?? undefined,
        consultation_type: consultation,
      });
      setEstimate(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate estimate';
      setEstimateError(msg);
    } finally {
      setEstimating(false);
    }
  }, [canSubmit, token, conditionTrimmed, city, severity, tier, consultation]);

  const handleReset = useCallback(() => {
    setEstimate(null);
    setEstimateError(null);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── HERO ─────────────────────────────────────── */}
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>EUNOIA · COST ESTIMATOR</Text>
            <Text style={styles.heroTitle}>Plan ahead with calm clarity.</Text>
            <Text style={styles.heroBody}>
              Approximate healthcare cost ranges for your city, hospital tier, and
              condition. Built deterministically from real Karnataka hospital data.
            </Text>
          </View>

          {/* ── CITY ─────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>01</Text>
                <Text style={styles.sectionTitle}>Your city</Text>
              </View>
            </View>
            <View style={styles.cityCard}>
              {profileLoading ? (
                <View style={styles.skeletonRow}>
                  <View style={[styles.skeletonLine, { width: 120 }]} />
                </View>
              ) : cityEditing ? (
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="City (e.g. Bengaluru)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.cityInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  onBlur={() => setCityEditing(false)}
                  returnKeyType="done"
                  onSubmitEditing={() => setCityEditing(false)}
                  autoFocus
                />
              ) : (
                <View style={styles.cityRow}>
                  <View style={styles.cityIconBg}>
                    <Ionicons name="location-outline" size={16} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cityValue}>{city || 'Not set'}</Text>
                    <Text style={styles.cityHint}>
                      {me?.preferred_city
                        ? 'Auto-filled from your onboarding'
                        : 'Enter the city you want estimates for'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.cityEditBtn}
                    onPress={() => setCityEditing(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors.textPrimary} />
                    <Text style={styles.cityEditText}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* ── CONDITION TEXT ───────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>02</Text>
                <Text style={styles.sectionTitle}>What&apos;s the condition?</Text>
              </View>
            </View>
            <View style={styles.conditionCard}>
              <TextInput
                value={conditionText}
                onChangeText={setConditionText}
                placeholder="e.g. chest pain, diabetes, knee fracture, dental cleaning"
                placeholderTextColor={colors.textMuted}
                style={styles.conditionInput}
                multiline
                numberOfLines={2}
                maxLength={200}
                autoCorrect
                returnKeyType="default"
                accessibilityLabel="Condition description"
              />
              <Text style={styles.conditionHint}>
                Type any health concern. We map it to a relevant specialization.
              </Text>
            </View>
          </View>

          {/* ── SEVERITY ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>03</Text>
                <Text style={styles.sectionTitle}>Severity</Text>
              </View>
              <Text style={styles.sectionMeta}>Optional</Text>
            </View>
            <View style={styles.chipRow}>
              {SEVERITY_OPTIONS.map((opt) => (
                <SelectorChip
                  key={opt.key}
                  label={opt.label}
                  hint={opt.hint}
                  active={severity === opt.key}
                  onPress={() => setSeverity(opt.key)}
                />
              ))}
            </View>
          </View>

          {/* ── HOSPITAL TIER ────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>04</Text>
                <Text style={styles.sectionTitle}>Hospital tier</Text>
              </View>
              <Text style={styles.sectionMeta}>{tier ? '' : 'Optional'}</Text>
            </View>
            <View style={styles.chipRow}>
              <SelectorChip
                label="Auto"
                hint="Based on city"
                active={tier === null}
                onPress={() => setTier(null)}
              />
              {TIER_OPTIONS.map((opt) => (
                <SelectorChip
                  key={opt.key}
                  label={opt.label}
                  hint={opt.hint}
                  active={tier === opt.key}
                  onPress={() => setTier(opt.key)}
                />
              ))}
            </View>
          </View>

          {/* ── CONSULTATION TYPE ────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>05</Text>
                <Text style={styles.sectionTitle}>Consultation type</Text>
              </View>
              <Text style={styles.sectionMeta}>Optional</Text>
            </View>
            <View style={styles.chipRow}>
              {CONSULTATION_OPTIONS.map((opt) => (
                <SelectorChip
                  key={opt.key}
                  label={opt.label}
                  active={consultation === opt.key}
                  onPress={() => setConsultation(opt.key)}
                />
              ))}
            </View>
          </View>

          {/* ── PRIMARY ACTION ───────────────────────────── */}
          <View style={styles.ctaBlock}>
            <TouchableOpacity
              style={[styles.primaryCta, !canSubmit && styles.primaryCtaDisabled]}
              activeOpacity={0.9}
              onPress={handleEstimate}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Generate cost estimate"
            >
              {estimating ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <>
                  <Text style={styles.primaryCtaText}>Generate estimate</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
                </>
              )}
            </TouchableOpacity>
            {!canSubmit && !estimating && (
              <Text style={styles.helperText}>
                {conditionTrimmed.length === 0
                  ? 'Describe the condition to continue.'
                  : 'Add a city to continue.'}
              </Text>
            )}
          </View>

          {/* ── ESTIMATE / SKELETON / ERROR ──────────────── */}
          {estimating && <EstimatingSkeleton />}

          {!estimating && estimateError && (
            <ErrorBlock message={estimateError} onRetry={handleEstimate} />
          )}

          {!estimating && estimate && (
            <Animated.View style={{ opacity: resultOpacity }}>
              <EstimateResult estimate={estimate} onReset={handleReset} />
            </Animated.View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Header ───────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Cost Estimator</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

// ── Selector chip ────────────────────────────────────────────────────────

function SelectorChip({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
      {hint ? (
        <Text style={[styles.chipHint, active && styles.chipHintActive]}>{hint}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Estimating skeleton ──────────────────────────────────────────────────

function EstimatingSkeleton() {
  return (
    <View style={styles.section}>
      <View style={styles.totalCard}>
        <View style={[styles.skeletonLine, { width: 80, marginBottom: spacing.md }]} />
        <View style={[styles.skeletonLine, { width: 220, height: 36, marginBottom: spacing.sm }]} />
        <View style={[styles.skeletonLine, { width: 160, height: 14 }]} />
      </View>
      <View style={styles.breakdownGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.breakdownCard}>
            <View style={[styles.skeletonLine, { width: 60 }]} />
            <View style={[styles.skeletonLine, { width: 100, marginTop: spacing.sm, height: 18 }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Error block ──────────────────────────────────────────────────────────

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorCard}>
      <View style={styles.errorIconBg}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.errorTitle}>Couldn&apos;t generate the estimate</Text>
        <Text style={styles.errorBody}>{message}</Text>
      </View>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.85}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Estimate result ──────────────────────────────────────────────────────

function EstimateResult({
  estimate,
  onReset,
}: {
  estimate: CostEstimateResponse;
  onReset: () => void;
}) {
  const breakdown = estimate.breakdown;
  const breakdownItems = useMemo(() => {
    const items: Array<{ key: string; label: string; min: number; max: number; icon: keyof typeof Ionicons.glyphMap }> = [];
    if (breakdown.consultation) {
      items.push({ key: 'consultation', label: 'Consultation', min: breakdown.consultation.min, max: breakdown.consultation.max, icon: 'person-outline' });
    }
    if (breakdown.tests) {
      items.push({ key: 'tests', label: 'Diagnostics', min: breakdown.tests.min, max: breakdown.tests.max, icon: 'flask-outline' });
    }
    if (breakdown.medication) {
      items.push({ key: 'medication', label: 'Medication', min: breakdown.medication.min, max: breakdown.medication.max, icon: 'medkit-outline' });
    }
    if (breakdown.procedure) {
      items.push({ key: 'procedure', label: 'Procedure', min: breakdown.procedure.min, max: breakdown.procedure.max, icon: 'pulse-outline' });
    }
    if (breakdown.hospitalization) {
      items.push({
        key: 'hospitalization',
        label: 'Hospitalization',
        min: breakdown.hospitalization.min,
        max: breakdown.hospitalization.max,
        icon: 'bed-outline',
      });
    }
    return items;
  }, [breakdown]);

  const tierEntries = useMemo(() => {
    const order: Array<'Low' | 'Medium' | 'High'> = ['Low', 'Medium', 'High'];
    return order
      .filter((t) => estimate.tier_breakdown && estimate.tier_breakdown[t])
      .map((t) => ({ tier: t, band: estimate.tier_breakdown[t] }));
  }, [estimate.tier_breakdown]);

  const isAuto = estimate.tier === 'Auto';

  return (
    <View>
      {/* Total */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionEyebrow}>06</Text>
            <Text style={styles.sectionTitle}>Estimated total</Text>
          </View>
          <TouchableOpacity onPress={onReset} activeOpacity={0.85} style={styles.smallGhostBtn}>
            <Ionicons name="refresh-outline" size={12} color={colors.textPrimary} />
            <Text style={styles.smallGhostBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.totalCard}>
          <View style={styles.heroAccentGlow} pointerEvents="none" />
          <View style={styles.totalCardTopRow}>
            <Text style={styles.totalEyebrow}>RANGE FOR {estimate.condition.label.toUpperCase()}</Text>
            {estimate.refinement_applied && (
              <View style={styles.refinedBadge}>
                <View style={styles.refinedBadgeDot} />
                <Text style={styles.refinedBadgeText}>AI-ASSISTED</Text>
              </View>
            )}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalValue}>{formatINR(estimate.estimated_total_min)}</Text>
            <Text style={styles.totalSeparator}>—</Text>
            <Text style={styles.totalValue}>{formatINR(estimate.estimated_total_max)}</Text>
          </View>
          <View style={styles.totalMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{estimate.city}</Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{estimate.tier} tier</Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{capitalize(estimate.severity)}</Text>
            </View>
          </View>
          {estimate.refinement_applied && (
            <View style={styles.baselineCompareRow}>
              <Text style={styles.baselineCompareLabel}>Deterministic baseline</Text>
              <Text style={styles.baselineCompareValue}>
                {formatINR(estimate.baseline_total_min)} – {formatINR(estimate.baseline_total_max)}
              </Text>
            </View>
          )}
          <Text style={styles.totalNote}>{estimate.confidence_note}</Text>
        </View>
      </View>

      {/* Per-tier ranges (Auto only) */}
      {isAuto && tierEntries.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>07</Text>
              <Text style={styles.sectionTitle}>By hospital tier</Text>
            </View>
          </View>
          <View style={styles.tierStack}>
            {tierEntries.map(({ tier, band }) => {
              const tone = tierTone(tier);
              return (
                <View key={tier} style={styles.tierRow}>
                  <View
                    style={[
                      styles.tierBadge,
                      { backgroundColor: tone.bg, borderColor: tone.border },
                    ]}
                  >
                    <Text style={[styles.tierBadgeText, { color: tone.fg }]}>{tier.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.tierRangeText}>
                    {formatINR(band.min)} <Text style={styles.tierRangeSep}>–</Text>{' '}
                    {formatINR(band.max)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Breakdown */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionEyebrow}>{isAuto && tierEntries.length > 0 ? '08' : '07'}</Text>
            <Text style={styles.sectionTitle}>Breakdown</Text>
          </View>
        </View>
        <View style={styles.breakdownGrid}>
          {breakdownItems.map((item) => (
            <View key={item.key} style={styles.breakdownCard}>
              <View style={styles.breakdownIconBg}>
                <Ionicons name={item.icon} size={14} color={colors.textPrimary} />
              </View>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownValue}>
                {formatRange({ min: item.min, max: item.max })}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Healthcare planning context (AI-assisted reasoning bullets) */}
      {estimate.refinement_applied && estimate.refinement_reasoning.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>{isAuto && tierEntries.length > 0 ? '09' : '08'}</Text>
              <Text style={styles.sectionTitle}>Healthcare planning context</Text>
            </View>
            <View style={styles.aiBadge}>
              <View style={styles.aiBadgeDot} />
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          </View>
          <View style={styles.aiCard}>
            {estimate.refinement_reasoning.map((bullet, idx) => (
              <View key={idx} style={styles.reasoningRow}>
                <View style={styles.reasoningBullet} />
                <Text style={styles.reasoningText}>{bullet}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Hospitals */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionEyebrow}>
              {(() => {
                let n = isAuto && tierEntries.length > 0 ? 9 : 8;
                if (estimate.refinement_applied && estimate.refinement_reasoning.length > 0) {
                  n += 1;
                }
                return String(n).padStart(2, '0');
              })()}
            </Text>
            <Text style={styles.sectionTitle}>Relevant hospitals</Text>
          </View>
          <Text style={styles.sectionMeta}>{estimate.matched_hospitals.length}</Text>
        </View>
        {estimate.matched_hospitals.length === 0 ? (
          <View style={styles.emptyHospitalsCard}>
            <Text style={styles.emptyHospitalsText}>
              No hospitals indexed for this combination yet. The estimate uses
              the {estimate.tier.toLowerCase()}-tier base pricing band.
            </Text>
          </View>
        ) : (
          <View style={styles.hospitalsList}>
            {estimate.matched_hospitals.map((h) => (
              <HospitalRow key={h.name} hospital={h} />
            ))}
          </View>
        )}
        <Text style={styles.relevanceSummary}>{estimate.relevance_summary}</Text>
      </View>

      {/* Footer disclaimer */}
      <View style={styles.disclaimerBlock}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.disclaimerText}>
          Estimates are approximate and intended for planning. Confirm with hospitals
          before any treatment.
        </Text>
      </View>
    </View>
  );
}

function HospitalRow({ hospital }: { hospital: MatchedHospital }) {
  const tone = tierTone(hospital.cost_level);
  const stars = useMemo(() => hospital.rating.toFixed(1), [hospital.rating]);
  const relevancePct = Math.round(hospital.relevance_score * 100);
  return (
    <View style={styles.hospitalRow}>
      <View style={styles.hospitalLeft}>
        <Text style={styles.hospitalName} numberOfLines={2}>
          {hospital.name}
        </Text>
        <Text style={styles.hospitalSubtle} numberOfLines={1}>
          {hospital.specialization} · {hospital.hospital_type}
        </Text>
        <View style={styles.hospitalMetaRow}>
          <View style={styles.hospitalMetaItem}>
            <Ionicons name="star" size={10} color={colors.textPrimary} />
            <Text style={styles.hospitalMetaText}>{stars}</Text>
          </View>
          <View style={styles.hospitalMetaDivider} />
          <View
            style={[
              styles.hospitalTierPill,
              { backgroundColor: tone.bg, borderColor: tone.border },
            ]}
          >
            <Text style={[styles.hospitalTierText, { color: tone.fg }]}>
              {hospital.cost_level.toUpperCase()}
            </Text>
          </View>
          <View style={styles.hospitalMetaDivider} />
          <Text style={styles.hospitalRelevance}>{relevancePct}% match</Text>
        </View>
      </View>
    </View>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.background,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },

  scrollContent: {
    paddingBottom: 80,
  },

  // ── Hero ────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  heroEyebrow: {
    ...typography.overline,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  heroBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },

  // ── Section primitives ──────────────────────────────────────
  section: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
  sectionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // ── City card ───────────────────────────────────────────────
  cityCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cityIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cityHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  cityEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  },
  cityEditText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cityInput: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },

  // ── Condition input ─────────────────────────────────────────
  conditionCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  conditionInput: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
    padding: 0,
  },
  conditionHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },

  // ── Chips ───────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minHeight: 44,
    minWidth: 96,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  chipLabel: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chipLabelActive: {
    color: colors.textInverse,
  },
  chipHint: {
    ...typography.captionSmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  chipHintActive: {
    color: colors.textInverseMuted,
  },

  // ── CTA ─────────────────────────────────────────────────────
  ctaBlock: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: 32,
    alignItems: 'stretch',
    gap: spacing.md,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: spacing.buttonRadius,
    backgroundColor: colors.inkSurface,
    ...shadows.md,
  },
  primaryCtaDisabled: {
    backgroundColor: colors.neutral.slate,
  },
  primaryCtaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  helperText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ── Total card ──────────────────────────────────────────────
  totalCard: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
    overflow: 'hidden',
    position: 'relative',
    ...shadows.lg,
  },
  heroAccentGlow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  totalEyebrow: {
    ...typography.overline,
    color: colors.textInverseSubtle,
    marginBottom: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  totalValue: {
    ...typography.numeric,
    fontSize: 30,
    color: colors.textInverse,
  },
  totalSeparator: {
    ...typography.numeric,
    fontSize: 24,
    color: colors.textInverseSubtle,
  },
  totalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
  },
  metaPillText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.textInverse,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textInverseSubtle,
  },
  totalNote: {
    ...typography.caption,
    color: colors.textInverseMuted,
    marginTop: spacing.lg,
    lineHeight: 20,
  },

  smallGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  smallGhostBtnText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ── Per-tier list ───────────────────────────────────────────
  tierStack: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
  },
  tierBadgeText: {
    ...typography.overline,
    fontSize: 10,
  },
  tierRangeText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  tierRangeSep: {
    color: colors.textTertiary,
    fontWeight: '400',
  },

  // ── Breakdown ───────────────────────────────────────────────
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  breakdownCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minHeight: 96,
  },
  breakdownIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  breakdownLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 4,
  },
  breakdownValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ── AI explanation card ─────────────────────────────────────
  aiCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  aiBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  aiBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  aiBadgeText: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textPrimary,
  },
  reasoningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  reasoningBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textPrimary,
    marginTop: 9,
  },
  reasoningText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },

  // ── Total card extras (AI-assisted badge + baseline compare) ───
  totalCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  refinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
  },
  refinedBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  refinedBadgeText: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textInverse,
  },
  baselineCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.inkBorder,
  },
  baselineCompareLabel: {
    ...typography.captionSmall,
    color: colors.textInverseSubtle,
  },
  baselineCompareValue: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textInverseMuted,
    fontVariant: ['tabular-nums'],
  },

  // ── Hospitals ───────────────────────────────────────────────
  hospitalsList: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  hospitalRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  hospitalLeft: {
    flex: 1,
  },
  hospitalName: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hospitalSubtle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  hospitalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  hospitalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hospitalMetaText: {
    ...typography.captionSmall,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hospitalMetaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.dividerStrong,
  },
  hospitalTierPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
  },
  hospitalTierText: {
    ...typography.overline,
    fontSize: 9,
  },
  hospitalRelevance: {
    ...typography.captionSmall,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  emptyHospitalsCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emptyHospitalsText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  relevanceSummary: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },

  // ── Skeletons ───────────────────────────────────────────────
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.skeleton,
  },

  // ── Error ───────────────────────────────────────────────────
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.errorSoft,
    marginHorizontal: spacing.screenPadding,
    marginTop: 32,
  },
  errorIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.inkSurface,
  },
  retryBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textInverse,
  },

  // ── Disclaimer ──────────────────────────────────────────────
  disclaimerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.xxl,
  },
  disclaimerText: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
});
