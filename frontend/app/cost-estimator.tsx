import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import KeyboardAwareScreenScrollView from '../components/KeyboardAwareScreenScrollView';
import { Button, Notice, ScreenHeader, TextField, tap } from '../components/ui';
import { colors, fonts, spacing, typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useHealthProfile } from '../contexts/HealthProfileContext';
import {
  createCostEstimate,
  formatINR,
  formatRange,
  getMe,
  type CostEstimateResponse,
  type MatchedHospital,
  type RecommendedDoctor,
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
  { key: 'Low', label: 'Low', hint: 'Government or trust' },
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
  { key: 'Tele', label: 'Teleconsult' },
];

// ── Hospital tier colour mapping (uses existing tokens only) ─────────────

function tierTone(level: string) {
  const v = (level || '').toLowerCase();
  if (v === 'high') return { bg: colors.accentSoft, fg: colors.accentText };
  if (v === 'low') return { bg: colors.successSoft, fg: colors.success };
  // "medium" and Bangalore's "mid" share the neutral tone.
  return { bg: colors.selected, fg: colors.textPrimary };
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
  // Suggested, never forced. Someone with no cover and a small budget should
  // not have to work out which tier they can afford - but they can override.
  const [tierSuggested, setTierSuggested] = useState(false);
  const [consultation, setConsultation] = useState<
    'General' | 'Specialist' | 'Follow_up' | 'Tele'
  >('Specialist');

  // ── Estimate state ────────────────────────────────────────────────────
  const [estimate, setEstimate] = useState<CostEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // The user's own conditions, offered as one-tap shortcuts instead of
  // making them retype something the app already knows.
  const { data: healthProfile } = useHealthProfile();
  const profileConditions = useMemo(
    () => (healthProfile?.conditions ?? []).map((c) => c.name).slice(0, 6),
    [healthProfile],
  );

  // Result fade-in.
  const resultOpacity = useRef(new Animated.Value(0)).current;
  // Bring the result into view once it renders; it lands below the form.
  const scrollRef = useRef<any>(null);
  const bodyY = useRef(0);
  const scrolledFor = useRef<unknown>(null);

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

  // Default the hospital tier from the user's cover and budget once, leaving
  // any explicit choice alone.
  useEffect(() => {
    if (tier !== null || tierSuggested) return;
    const insurance = healthProfile?.profile?.insurance as
      | { sum_insured_band?: string | null; out_of_pocket_band?: string | null }
      | null
      | undefined;
    if (!insurance) return;

    const cover = insurance.sum_insured_band;
    const pocket = insurance.out_of_pocket_band;
    const suggestion =
      cover === 'gt_25l' || cover === '10_25l' || pocket === 'gt_1l'
        ? 'High'
        : cover === '5_10l' || pocket === '25_1l'
          ? 'Medium'
          : cover || pocket
            ? 'Low'
            : null;

    if (suggestion) {
      setTier(suggestion as 'Low' | 'Medium' | 'High');
      setTierSuggested(true);
    }
  }, [healthProfile, tier, tierSuggested]);

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
  const formReady = conditionTrimmed.length > 0 && city.trim().length > 0;
  const canSubmit = formReady && !estimating;

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
      <KeyboardAwareScreenScrollView
        innerRef={(r: any) => {
          scrollRef.current = r;
        }}
        style={styles.keyboardScroll}
        contentContainerStyle={styles.scrollContent}
      >
        <ScreenHeader
          title="Treatment costs"
          subtitle="Typical price ranges for care in your city, from Karnataka hospital data."
          onBack={handleBack}
        />

        <View style={styles.body} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          {/* ── City ─────────────────────────────────────── */}
          <View style={styles.step}>
            {profileLoading ? (
              <>
                <Text style={styles.stepLabel}>Your city</Text>
                <View style={styles.card}>
                  <View style={[styles.skeletonLine, { width: 140 }]} />
                </View>
              </>
            ) : cityEditing ? (
              <TextField
                label="Your city"
                icon="location-outline"
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Bengaluru"
                autoCapitalize="words"
                autoCorrect={false}
                onBlur={() => setCityEditing(false)}
                returnKeyType="done"
                onSubmitEditing={() => setCityEditing(false)}
                autoFocus
              />
            ) : (
              <>
                <Text style={styles.stepLabel}>Your city</Text>
                <View style={[styles.card, styles.cityRow]}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="location-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cityValue, !city && styles.cityValueEmpty]}>
                      {city || 'No city set'}
                    </Text>
                    <Text style={styles.cityHint}>
                      {me?.preferred_city
                        ? 'From your profile'
                        : 'Add the city you want estimates for'}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.cityEditBtn, pressed && styles.pressed]}
                    onPress={() => {
                      tap();
                      setCityEditing(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={city ? 'Change city' : 'Add city'}
                  >
                    <Text style={styles.cityEditText}>{city ? 'Change' : 'Add'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          {/* ── Condition ────────────────────────────────── */}
          <View style={styles.step}>
            <TextField
              label="Symptom or condition"
              value={conditionText}
              onChangeText={setConditionText}
              placeholder="e.g. chest pain, diabetes, knee fracture"
              multiline
              numberOfLines={2}
              maxLength={200}
              autoCorrect
              style={styles.conditionInput}
              hint="We match it to the right kind of specialist."
            />
            {profileConditions.length > 0 ? (
              <View style={styles.profileConditions}>
                <Text style={styles.profileConditionLabel}>From your profile</Text>
                <View style={styles.chipWrap}>
                  {profileConditions.map((name) => {
                    const selected = conditionTrimmed === name;
                    return (
                      <Pressable
                        key={name}
                        style={({ pressed }) => [
                          styles.pill,
                          selected && styles.selectedFill,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => {
                          tap();
                          setConditionText(name);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${name}`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.pillText, selected && styles.selectedText]}>{name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {/* ── Severity ─────────────────────────────────── */}
          <View style={styles.step}>
            <Text style={styles.stepLabel}>How severe is it?</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
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

          {/* ── Hospital tier ────────────────────────────── */}
          <View style={styles.step}>
            <Text style={styles.stepLabel}>Hospital tier</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              <SelectorChip
                label="Auto"
                hint="Compare all tiers"
                active={tier === null}
                onPress={() => setTier(null)}
                half
              />
              {TIER_OPTIONS.map((opt) => (
                <SelectorChip
                  key={opt.key}
                  label={opt.label}
                  hint={opt.hint}
                  active={tier === opt.key}
                  onPress={() => setTier(opt.key)}
                  half
                />
              ))}
            </View>
          </View>

          {/* ── Consultation type ────────────────────────── */}
          <View style={styles.step}>
            <Text style={styles.stepLabel}>Consultation type</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              {CONSULTATION_OPTIONS.map((opt) => (
                <SelectorChip
                  key={opt.key}
                  label={opt.label}
                  active={consultation === opt.key}
                  onPress={() => setConsultation(opt.key)}
                  half
                />
              ))}
            </View>
          </View>

          {/* ── Primary action ───────────────────────────── */}
          <View style={styles.cta}>
            <Button
              label="Estimate cost"
              onPress={handleEstimate}
              loading={estimating}
              disabled={!formReady}
            />
            {!formReady && !estimating ? (
              <Text style={styles.helperText}>
                {conditionTrimmed.length === 0
                  ? 'Describe the symptom or condition to continue.'
                  : 'Add a city to continue.'}
              </Text>
            ) : null}
          </View>

          {/* ── Estimate / skeleton / error ──────────────── */}
          {estimating && <EstimatingSkeleton />}

          {!estimating && estimateError && (
            <ErrorBlock message={estimateError} onRetry={handleEstimate} />
          )}

          {!estimating && estimate && (
            <Animated.View
              style={{ opacity: resultOpacity }}
              onLayout={(e) => {
                // Once per estimate, so later relayouts don't yank the scroll.
                if (scrolledFor.current === estimate) return;
                scrolledFor.current = estimate;
                scrollRef.current?.scrollTo?.({
                  y: Math.max(bodyY.current + e.nativeEvent.layout.y - spacing.lg, 0),
                  animated: true,
                });
              }}
            >
              <EstimateResult estimate={estimate} onReset={handleReset} />
            </Animated.View>
          )}
        </View>
      </KeyboardAwareScreenScrollView>
    </SafeAreaView>
  );
}

// ── Selector chip ────────────────────────────────────────────────────────

function SelectorChip({
  label,
  hint,
  active,
  onPress,
  half = false,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
  half?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        half && styles.chipHalf,
        active && styles.selectedFill,
        pressed && styles.pressed,
      ]}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.selectedText]}>{label}</Text>
      {hint ? (
        <Text style={[styles.chipHint, active && styles.chipHintActive]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

// ── Estimating skeleton ──────────────────────────────────────────────────

function EstimatingSkeleton() {
  return (
    <View style={styles.result} accessible accessibilityLabel="Working out your estimate">
      <View style={styles.totalCard}>
        <View style={[styles.skeletonLineInverse, { width: 140 }]} />
        <View style={[styles.skeletonLineInverse, { width: 240, height: 34, marginTop: spacing.lg }]} />
        <View style={[styles.skeletonLineInverse, { width: 180, marginTop: spacing.lg }]} />
      </View>
      <View style={styles.card}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={[styles.skeletonLine, { width: 110 }]} />
            <View style={[styles.skeletonLine, { width: 90 }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Error block ──────────────────────────────────────────────────────────

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBlock}>
      <Notice>{`Couldn't get an estimate. ${message}`}</Notice>
      <Button label="Try again" variant="secondary" compact onPress={onRetry} style={styles.retryBtn} />
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
        label: 'Hospital stay',
        min: breakdown.hospitalization.min,
        max: breakdown.hospitalization.max,
        icon: 'bed-outline',
      });
    }
    return items;
  }, [breakdown]);

  const tierEntries = useMemo(() => {
    const tb = estimate.tier_breakdown ?? {};
    // The Bangalore estimator keys the middle tier "Mid"; the generic one "Medium".
    const bands = { Low: tb.Low, Medium: tb.Medium ?? tb.Mid, High: tb.High };
    return (['Low', 'Medium', 'High'] as const)
      .filter((t) => bands[t])
      .map((t) => ({ tier: t, band: bands[t] }));
  }, [estimate.tier_breakdown]);

  const isAuto = estimate.tier === 'Auto';
  const sameTotal = estimate.estimated_total_min === estimate.estimated_total_max;

  const metaPills = [
    estimate.city,
    isAuto ? 'All tiers' : `${estimate.tier} tier`,
    capitalize(estimate.severity),
    estimate.bangalore_mode ? estimate.mapped_specialization : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.result}>
      {/* Total */}
      <View style={styles.resultHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your estimate
        </Text>
        <Button
          label="Clear"
          variant="ghost"
          compact
          icon="refresh-outline"
          onPress={onReset}
          accessibilityLabel="Clear estimate"
          style={styles.clearBtn}
        />
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalCondition}>{estimate.condition.label}</Text>
        {estimate.bangalore_mode || estimate.refinement_applied ? (
          <View style={styles.totalBadgeRow}>
            {estimate.bangalore_mode ? (
              <View style={styles.inversePill}>
                <Ionicons name="location" size={12} color={colors.textInverse} />
                <Text style={styles.inversePillText}>Bengaluru data</Text>
              </View>
            ) : null}
            {estimate.refinement_applied ? (
              <View style={styles.inversePill}>
                <View style={styles.accentDot} />
                <Text style={styles.inversePillText}>AI-assisted</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View
          style={styles.totalRow}
          accessible
          accessibilityLabel={
            sameTotal
              ? `Estimated total ${formatINR(estimate.estimated_total_min)}`
              : `Estimated total ${formatINR(estimate.estimated_total_min)} to ${formatINR(estimate.estimated_total_max)}`
          }
        >
          <Text style={styles.totalValue}>{formatINR(estimate.estimated_total_min)}</Text>
          {sameTotal ? null : (
            <>
              <Text style={styles.totalSeparator}>–</Text>
              <Text style={styles.totalValue}>{formatINR(estimate.estimated_total_max)}</Text>
            </>
          )}
        </View>
        <Text style={styles.totalCaption}>Estimated total cost</Text>

        <View style={styles.totalMetaRow}>
          {metaPills.map((m) => (
            <View key={m} style={styles.inversePill}>
              <Text style={styles.inversePillText}>{m}</Text>
            </View>
          ))}
        </View>

        {estimate.refinement_applied && (
          <View style={styles.baselineRow}>
            <Text style={styles.baselineLabel}>Baseline estimate</Text>
            <Text style={styles.baselineValue}>
              {formatINR(estimate.baseline_total_min)} – {formatINR(estimate.baseline_total_max)}
            </Text>
          </View>
        )}
        <Text style={styles.totalNote}>{estimate.confidence_note}</Text>
      </View>

      {/* Per-tier ranges (Auto only) */}
      {isAuto && tierEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By hospital tier</Text>
          <View style={[styles.card, styles.rowList]}>
            {tierEntries.map(({ tier, band }) => (
              <View key={tier} style={styles.amountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amountLabel}>{tier}</Text>
                  <Text style={styles.amountHint}>
                    {TIER_OPTIONS.find((o) => o.key === tier)?.hint}
                  </Text>
                </View>
                <Text style={styles.amountValue}>{formatRange(band)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Breakdown */}
      {breakdownItems.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <View style={[styles.card, styles.rowList]}>
            {breakdownItems.map((item) => (
              <View key={item.key} style={styles.amountRow}>
                <View style={styles.iconCircleSmall}>
                  <Ionicons name={item.icon} size={18} color={colors.textPrimary} />
                </View>
                <Text style={[styles.amountLabel, { flex: 1 }]}>{item.label}</Text>
                <Text style={styles.amountValue}>
                  {formatRange({ min: item.min, max: item.max })}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Planning context (AI-assisted reasoning bullets) */}
      {estimate.refinement_applied && estimate.refinement_reasoning.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What shaped this estimate</Text>
          <View style={styles.card}>
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
        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>
            {estimate.bangalore_mode ? 'Hospitals and doctors' : 'Relevant hospitals'}
          </Text>
          {estimate.matched_hospitals.length > 0 ? (
            <Text style={styles.sectionMeta}>{estimate.matched_hospitals.length} found</Text>
          ) : null}
        </View>
        {estimate.matched_hospitals.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              No hospitals are listed for this combination yet. The estimate uses
              the {estimate.tier.toLowerCase()}-tier base pricing.
            </Text>
          </View>
        ) : (
          <View style={styles.hospitalsList}>
            {estimate.matched_hospitals.map((h) => (
              <HospitalCard
                key={h.name}
                hospital={h}
                bangalore={!!estimate.bangalore_mode}
              />
            ))}
          </View>
        )}
        {estimate.relevance_summary ? (
          <Text style={styles.relevanceSummary}>{estimate.relevance_summary}</Text>
        ) : null}
      </View>

      {/* Footer disclaimer */}
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textTertiary} />
        <Text style={styles.disclaimerText}>
          Estimates are approximate and meant for planning. Confirm prices with the
          hospital before any treatment.
        </Text>
      </View>
    </View>
  );
}

function HospitalCard({
  hospital,
  bangalore,
}: {
  hospital: MatchedHospital;
  bangalore: boolean;
}) {
  const tierLabel = hospital.tier || hospital.cost_level;
  const tone = tierTone(tierLabel);
  const stars = useMemo(() => hospital.rating.toFixed(1), [hospital.rating]);
  const relevancePct = Math.round(hospital.relevance_score * 100);

  const isBangalore = bangalore;
  const doctors = hospital.doctors ?? [];
  const hasFee =
    hospital.consultation_fee_min != null && hospital.consultation_fee_max != null;
  const hasCostRange =
    hospital.estimated_cost_min != null && hospital.estimated_cost_max != null;

  const subtitle = [
    hospital.specialization,
    hospital.hospital_type,
    isBangalore ? hospital.area : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <View style={styles.hospitalTitleRow}>
        <Text style={styles.hospitalName} numberOfLines={2}>
          {hospital.name}
        </Text>
        {tierLabel ? (
          <View style={[styles.tierChip, { backgroundColor: tone.bg }]}>
            <Text style={[styles.tierChipText, { color: tone.fg }]}>
              {capitalize(tierLabel.toLowerCase())} tier
            </Text>
          </View>
        ) : null}
      </View>

      {subtitle ? (
        <Text style={styles.hospitalSubtle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}

      <View style={styles.hospitalMetaRow}>
        <View style={styles.hospitalMetaItem} accessible accessibilityLabel={`Rated ${stars}`}>
          <Ionicons name="star" size={14} color={colors.textPrimary} />
          <Text style={styles.hospitalRating}>{stars}</Text>
        </View>
        {/* The directory stores a missing accreditation as the string "None". */}
        {isBangalore && hospital.accreditation && !/^(none|nan|-)$/i.test(hospital.accreditation.trim()) ? (
          <Text style={styles.hospitalMetaText}>{hospital.accreditation}</Text>
        ) : null}
        <Text style={styles.hospitalMetaText}>{relevancePct}% match</Text>
      </View>

      {/* Bangalore-only: consultation fee + estimated cost range */}
      {isBangalore && (hasFee || hasCostRange) ? (
        <View style={styles.hospitalStatsRow}>
          {hasFee ? (
            <View style={styles.hospitalStat}>
              <Text style={styles.hospitalStatLabel}>Consultation fee</Text>
              <Text style={styles.hospitalStatValue}>
                {hospital.consultation_fee_min === hospital.consultation_fee_max
                  ? formatINR(hospital.consultation_fee_min as number)
                  : `${formatINR(hospital.consultation_fee_min as number)} – ${formatINR(
                      hospital.consultation_fee_max as number,
                    )}`}
              </Text>
            </View>
          ) : null}
          {hasCostRange ? (
            <View style={styles.hospitalStat}>
              <Text style={styles.hospitalStatLabel}>Estimated treatment</Text>
              <Text style={styles.hospitalStatValue}>
                {`${formatINR(hospital.estimated_cost_min as number)} – ${formatINR(
                  hospital.estimated_cost_max as number,
                )}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Bangalore-only: recommended doctors */}
      {isBangalore && doctors.length > 0 ? (
        <View style={styles.doctorList}>
          <Text style={styles.doctorListLabel}>Recommended doctors</Text>
          {doctors.map((doc, idx) => (
            <DoctorRow key={`${doc.name}-${idx}`} doctor={doc} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DoctorRow({ doctor }: { doctor: RecommendedDoctor }) {
  const meta = [
    doctor.specialization,
    doctor.qualification,
    doctor.experience_years ? `${doctor.experience_years} yrs experience` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const hours = [doctor.availability, doctor.timing].filter(Boolean).join(', ');

  return (
    <View style={styles.doctorRow}>
      <View style={styles.iconCircleSmall}>
        <Ionicons name="person-outline" size={18} color={colors.textPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.doctorName} numberOfLines={1}>
          {doctor.name}
        </Text>
        {meta ? (
          <Text style={styles.doctorMeta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        {hours ? (
          <Text style={styles.doctorMeta} numberOfLines={1}>
            {hours}
          </Text>
        ) : null}
      </View>
      {doctor.consultation_fee != null ? (
        <View style={styles.doctorFee}>
          <Text style={styles.doctorFeeValue}>{formatINR(doctor.consultation_fee)}</Text>
          <Text style={styles.doctorFeeLabel}>per visit</Text>
        </View>
      ) : null}
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
  keyboardScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  body: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.xxl,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },

  // ── Shared ──────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedFill: {
    backgroundColor: colors.inkSurface,
  },
  selectedText: {
    color: colors.textInverse,
  },

  // ── Form steps ──────────────────────────────────────────────
  step: {
    gap: spacing.sm,
  },
  // Matches TextField's label so every step reads the same.
  stepLabel: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },

  // City
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  cityValue: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  cityValueEmpty: {
    color: colors.textTertiary,
  },
  cityHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  cityEditBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityEditText: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },

  // Condition
  conditionInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  profileConditions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  profileConditionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    ...typography.callout,
    color: colors.textPrimary,
  },

  // Option chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipHalf: {
    flex: 0,
    flexGrow: 1,
    flexBasis: '46%',
  },
  chipLabel: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  chipHint: {
    ...typography.captionSmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  chipHintActive: {
    color: colors.textInverseMuted,
  },

  // CTA
  cta: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  helperText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ── Error ───────────────────────────────────────────────────
  errorBlock: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
  },

  // ── Result ──────────────────────────────────────────────────
  result: {
    gap: spacing.md,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  clearBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Total hero
  totalCard: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xxl,
  },
  totalCondition: {
    ...typography.headline,
    color: colors.textInverse,
  },
  totalBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    marginTop: spacing.xl,
  },
  totalValue: {
    ...typography.numeric,
    fontSize: 34,
    lineHeight: 40,
    color: colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  totalSeparator: {
    ...typography.numeric,
    fontSize: 28,
    color: colors.textInverseSubtle,
  },
  totalCaption: {
    ...typography.caption,
    color: colors.textInverseMuted,
    marginTop: spacing.xs,
  },
  totalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  inversePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.inkSurfaceElevated,
  },
  inversePillText: {
    ...typography.captionSmall,
    fontFamily: fonts.semibold,
    color: colors.textInverse,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  baselineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.inkBorder,
  },
  baselineLabel: {
    ...typography.caption,
    color: colors.textInverseMuted,
  },
  baselineValue: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  totalNote: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textInverseMuted,
    marginTop: spacing.lg,
    lineHeight: 20,
  },

  // Amount rows (tiers, breakdown)
  rowList: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 36,
  },
  amountLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  amountHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  amountValue: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },

  // Reasoning
  reasoningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  reasoningBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 9,
  },
  reasoningText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },

  // Hospitals
  hospitalsList: {
    gap: spacing.md,
  },
  hospitalTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  hospitalName: {
    ...typography.headline,
    color: colors.textPrimary,
    flex: 1,
  },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: spacing.chipRadius,
  },
  tierChipText: {
    ...typography.captionSmall,
    fontFamily: fonts.semibold,
  },
  hospitalSubtle: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  hospitalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginTop: spacing.md,
  },
  hospitalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hospitalRating: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  hospitalMetaText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  hospitalStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  hospitalStat: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.background,
    borderRadius: spacing.inputRadius,
    padding: spacing.md,
  },
  hospitalStatLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  hospitalStatValue: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  relevanceSummary: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
  },

  // Doctors
  doctorList: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  doctorListLabel: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  doctorName: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  doctorMeta: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    marginTop: 1,
  },
  doctorFee: {
    alignItems: 'flex-end',
  },
  doctorFeeValue: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  doctorFeeLabel: {
    ...typography.captionSmall,
    color: colors.textTertiary,
  },

  // ── Skeletons ───────────────────────────────────────────────
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.skeleton,
  },
  skeletonLineInverse: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.inkSurfaceElevated,
  },

  // ── Disclaimer ──────────────────────────────────────────────
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  disclaimerText: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    flex: 1,
  },
});
