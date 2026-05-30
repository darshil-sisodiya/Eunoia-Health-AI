import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Modal,
  Vibration,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { getReports, type AnalyzeRiskResponse } from '../../utils/onboardingApi';
import { useRouter } from 'expo-router';
import { colors, spacing, shadows, typography } from '../../constants/theme';
import Svg, { Circle } from 'react-native-svg';
import { Pedometer } from 'expo-sensors';
import * as Linking from 'expo-linking';

const BACKEND_URL = API_BASE_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEP_GOAL_DEFAULT = 6000;

// ─── Circular Progress (Monochrome on dark hero) ─────────────────
function StepCircle({ steps, goal }: { steps: number; goal: number }) {
  const size = 156;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(steps / goal, 1);
  const strokeDashoffset = circumference * (1 - progress);
  const pct = Math.round(progress * 100);

  return (
    <View style={styles.stepCircleContainer}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.textInverse}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }] as any}>
        <Text style={styles.stepCountText}>{steps.toLocaleString()}</Text>
        <Text style={styles.stepLabel}>STEPS · {pct}%</Text>
      </View>
    </View>
  );
}

// ─── Mini Week Calendar (monochrome dots) ───────────────────────
function WeekCalendar({ weekData }: { weekData: any[] }) {
  const todayIndex = new Date().getDay();
  return (
    <View style={styles.weekContainer}>
      {DAY_LABELS.map((label, i) => {
        const isToday = i === todayIndex;
        const dayData = weekData[i];
        const reachedGoal = dayData && dayData.goal_reached;
        const hasSteps = dayData && dayData.step_count > 0;
        return (
          <View key={`${label}-${i}`} style={styles.weekDayCol}>
            <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelActive]}>{label}</Text>
            <View
              style={[
                styles.weekDot,
                hasSteps && styles.weekDotPartial,
                reachedGoal && styles.weekDotSuccess,
                isToday && styles.weekDotToday,
              ]}
            >
              {isToday && <View style={styles.weekDotInner} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Activity Bar Chart (monochrome with cobalt accent) ────────
function ActivityBarChart({ weekData, meditationData }: { weekData: any[]; meditationData: any[] }) {
  const maxSteps = Math.max(...weekData.map((d: any) => d.step_count || 0), 1);
  const maxMed = Math.max(...meditationData.map((d: any) => d.total_seconds || 0), 1);
  const todayIndex = new Date().getDay();

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {DAY_LABELS.map((label, i) => {
          const daySteps = weekData[i]?.step_count || 0;
          const dayMed = meditationData[i]?.total_seconds || 0;
          const stepH = Math.max((daySteps / maxSteps) * 96, daySteps > 0 ? 8 : 4);
          const medH = Math.max((dayMed / maxMed) * 96, dayMed > 0 ? 8 : 0);
          const goalReached = weekData[i]?.goal_reached;
          const isToday = i === todayIndex;
          return (
            <View key={`chart-${label}-${i}`} style={styles.chartBarGroup}>
              <View style={styles.barPair}>
                <View
                  style={[
                    styles.bar,
                    { height: stepH },
                    goalReached
                      ? styles.barFilled
                      : isToday
                      ? styles.barToday
                      : daySteps > 0
                      ? styles.barPartial
                      : styles.barEmpty,
                  ]}
                />
                {medH > 0 && (
                  <View style={[styles.bar, styles.barMeditation, { height: medH, marginLeft: 4, width: 6 }]} />
                )}
              </View>
              <Text style={[styles.chartBarLabel, isToday && styles.chartBarLabelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.textPrimary }]} />
          <Text style={styles.legendText}>Steps</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Meditation</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Meditation Timer Modal ─────────────────────────────────────
const TIMER_PRESETS = [
  { label: '1m', seconds: 60 },
  { label: '3m', seconds: 180 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
];

function MeditationModal({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: (seconds: number) => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_PRESETS[1].seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalRef = useRef(TIMER_PRESETS[1].seconds);

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setRemainingSeconds(TIMER_PRESETS[selectedPreset].seconds);
  };

  const startTimer = () => {
    const dur = TIMER_PRESETS[selectedPreset].seconds;
    totalRef.current = dur;
    setRemainingSeconds(dur);
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsRunning(false);
          Vibration.vibrate([200, 200, 200]);
          onComplete(totalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const elapsed = totalRef.current - remainingSeconds;
    setIsRunning(false);
    if (elapsed >= 10) onComplete(elapsed);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = isRunning || remainingSeconds === 0 ? 1 - remainingSeconds / totalRef.current : 0;
  const circSize = 220;
  const circStroke = 6;
  const circRadius = (circSize - circStroke) / 2;
  const circCircumference = 2 * Math.PI * circRadius;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>Session</Text>
              <Text style={styles.modalTitle}>Meditation</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', marginVertical: 36 }}>
            <Svg width={circSize} height={circSize} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle
                cx={circSize / 2}
                cy={circSize / 2}
                r={circRadius}
                stroke={colors.divider}
                strokeWidth={circStroke}
                fill="none"
              />
              <Circle
                cx={circSize / 2}
                cy={circSize / 2}
                r={circRadius}
                stroke={colors.textPrimary}
                strokeWidth={circStroke}
                fill="none"
                strokeDasharray={`${circCircumference}`}
                strokeDashoffset={circCircumference * (1 - progress)}
                strokeLinecap="round"
              />
            </Svg>
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }] as any}>
              <Text style={styles.timerText}>{formatTime(remainingSeconds)}</Text>
              <Text style={styles.timerLabel}>REMAINING</Text>
            </View>
          </View>

          {!isRunning && remainingSeconds > 0 && (
            <View style={styles.presetRow}>
              {TIMER_PRESETS.map((p, idx) => (
                <TouchableOpacity
                  key={p.seconds}
                  style={[styles.presetChip, idx === selectedPreset && styles.presetChipActive]}
                  onPress={() => {
                    setSelectedPreset(idx);
                    setRemainingSeconds(p.seconds);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.presetChipText, idx === selectedPreset && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ alignItems: 'center', marginTop: 32 }}>
            {!isRunning && remainingSeconds > 0 && (
              <TouchableOpacity onPress={startTimer} activeOpacity={0.9} style={styles.meditationStartBtn}>
                <Ionicons name="play" size={18} color={colors.textInverse} />
                <Text style={styles.meditationStartBtnText}>Begin session</Text>
              </TouchableOpacity>
            )}
            {isRunning && (
              <TouchableOpacity style={styles.meditationStopBtn} onPress={stopTimer} activeOpacity={0.9}>
                <Ionicons name="stop" size={18} color={colors.textPrimary} />
                <Text style={styles.meditationStopBtnText}>End session</Text>
              </TouchableOpacity>
            )}
            {remainingSeconds === 0 && (
              <View style={{ alignItems: 'center' }}>
                <View style={styles.completedIcon}>
                  <Ionicons name="checkmark" size={28} color={colors.textInverse} />
                </View>
                <Text style={styles.completedText}>Session complete</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// ─── Risk Score Card ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

function RiskScoreCard({
  report,
  onPress,
}: {
  report: AnalyzeRiskResponse | null;
  onPress: () => void;
}) {
  const hasReport = report !== null;
  const score = hasReport ? report!.wellness_score : null;
  const riskLevel = hasReport ? report!.risk_level : null;

  // Map risk level → semantic accent + soft surface (existing tokens only).
  const riskTone =
    riskLevel === 'High'
      ? { fg: colors.error, bg: colors.errorSoft, dot: colors.error }
      : riskLevel === 'Moderate'
      ? { fg: colors.warning, bg: colors.warningSoft, dot: colors.warning }
      : { fg: colors.success, bg: colors.successSoft, dot: colors.success };

  return (
    <View style={riskCardStyles.section}>
      <View style={riskCardStyles.sectionHeader}>
        <View style={riskCardStyles.sectionHeaderLeft}>
          <Text style={riskCardStyles.sectionEyebrow}>01</Text>
          <Text style={riskCardStyles.sectionTitle}>Risk Score</Text>
        </View>
        {hasReport && (
          <Text style={riskCardStyles.sectionMeta}>
            {formatShortDate(report!.created_at)}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={riskCardStyles.card}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          hasReport
            ? `Open health report. Wellness score ${score} out of 100. Risk level ${riskLevel}.`
            : 'Start onboarding to generate your health report.'
        }
      >
        {hasReport ? (
          <>
            <View style={riskCardStyles.cardLeft}>
              <Text style={riskCardStyles.scoreLabel}>WELLNESS</Text>
              <View style={riskCardStyles.scoreRow}>
                <Text style={riskCardStyles.scoreValue}>{score}</Text>
                <Text style={riskCardStyles.scoreSuffix}>/100</Text>
              </View>
              <View
                style={[
                  riskCardStyles.riskBadge,
                  { backgroundColor: riskTone.bg, borderColor: riskTone.fg },
                ]}
              >
                <View
                  style={[riskCardStyles.riskDot, { backgroundColor: riskTone.dot }]}
                />
                <Text style={[riskCardStyles.riskBadgeText, { color: riskTone.fg }]}>
                  {(riskLevel ?? '').toUpperCase()} RISK
                </Text>
              </View>
            </View>

            <View style={riskCardStyles.cardRight}>
              <View style={riskCardStyles.miniBars}>
                {aggregateByComponent(report!.contributing_factors).map((row) => (
                  <View key={row.component} style={riskCardStyles.miniBarRow}>
                    <Text style={riskCardStyles.miniBarLabel} numberOfLines={1}>
                      {row.component}
                    </Text>
                    <View style={riskCardStyles.miniBarTrack}>
                      <View
                        style={[
                          riskCardStyles.miniBarFill,
                          { width: `${Math.max(row.intensity * 100, 6)}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <View style={riskCardStyles.cardCta}>
                <Text style={riskCardStyles.cardCtaText}>View report</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.textPrimary} />
              </View>
            </View>
          </>
        ) : (
          <View style={riskCardStyles.emptyState}>
            <View style={riskCardStyles.emptyIcon}>
              <Ionicons name="pulse" size={20} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={riskCardStyles.emptyTitle}>No report yet</Text>
              <Text style={riskCardStyles.emptyBody}>
                Complete onboarding to generate your wellness score.
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Bucket contributing factors by their component so the dashboard mini-bars
// show one row per bucket (cardiovascular / metabolic / wellness / hereditary)
// rather than repeating the same component label when multiple `dimension`s
// share a bucket. Magnitudes are summed within a bucket and the largest
// bucket scales to 100%; everything else is relative to it. Buckets with a
// total of zero are dropped so empty rows don't render.
function aggregateByComponent(
  factors: AnalyzeRiskResponse['contributing_factors'],
): { component: string; intensity: number }[] {
  const totals = new Map<string, number>();
  for (const f of factors) {
    if (!f || typeof f.component !== 'string') continue;
    const prev = totals.get(f.component) ?? 0;
    totals.set(f.component, prev + Math.abs(Number(f.delta) || 0));
  }
  const rows = Array.from(totals.entries())
    .filter(([, total]) => total > 0)
    .map(([component, total]) => ({ component, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  if (rows.length === 0) return [];
  const max = rows[0].total || 1;
  return rows.map((r) => ({
    component: r.component,
    intensity: Math.min(r.total / max, 1),
  }));
}

// ═══════════════════════════════════════════════════════════════
// ─── Home Screen ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export default function Home() {
  const { token, username } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [todaySteps, setTodaySteps] = useState(0);
  const [stepGoal, setStepGoal] = useState(STEP_GOAL_DEFAULT);
  const [weekSteps, setWeekSteps] = useState<any[]>([]);
  const [goalsReached, setGoalsReached] = useState(0);
  const [walkingAnalysis, setWalkingAnalysis] = useState('');
  const [walkingTrend, setWalkingTrend] = useState('steady');
  const [meditationWeek, setMeditationWeek] = useState<any[]>([]);
  const [totalMeditationMin, setTotalMeditationMin] = useState(0);
  const [showMeditation, setShowMeditation] = useState(false);

  const [latestReport, setLatestReport] = useState<AnalyzeRiskResponse | null>(null);

  const [isPedometerAvailable, setIsPedometerAvailable] = useState(false);
  const pedometerSub = useRef<any>(null);

  useEffect(() => {
    let sub: any = null;
    const setupPedometer = async () => {
      try {
        const { status: existingStatus } = await Pedometer.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Pedometer.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          Alert.alert(
            'Step Tracking Permission Required',
            'To track your steps, please enable Activity Recognition permission in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
        const available = await Pedometer.isAvailableAsync();
        setIsPedometerAvailable(available);
        if (!available) return;

        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        try {
          const result = await Pedometer.getStepCountAsync(midnight, now);
          if (result) {
            setTodaySteps(result.steps);
            syncStepsToBackend(result.steps);
          }
        } catch (e) {
          console.warn('getStepCountAsync error:', e);
        }

        sub = Pedometer.watchStepCount((result) => {
          setTodaySteps((prev) => {
            const updated = prev + result.steps;
            syncStepsToBackend(updated);
            return updated;
          });
        });
        pedometerSub.current = sub;
      } catch (e) {
        console.warn('Pedometer setup error:', e);
      }
    };

    setupPedometer();
    return () => {
      if (sub) sub.remove();
    };
  }, []);

  const syncStepsToBackend = useCallback(
    async (steps: number) => {
      try {
        await axios.post(
          `${BACKEND_URL}/api/steps/log`,
          { step_count: steps, goal: stepGoal },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {}
    },
    [token, stepGoal]
  );

  const loadAll = useCallback(
    async (fullscreen = false) => {
      if (fullscreen) setIsLoading(true);
      setRefreshing(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [weekRes, analysisRes, medRes, reportsResult] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/steps/week`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/steps/analysis`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/meditation/week`, { headers }).catch(() => null),
          getReports(token ?? '').catch(() => null),
        ]);

        if (weekRes?.data) {
          const mapped = mapWeekToSunSat(weekRes.data.days);
          setWeekSteps(mapped);
          setGoalsReached(weekRes.data.goals_reached_count);
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayData = weekRes.data.days.find((d: any) => d.date === todayStr);
          if (todayData && !isPedometerAvailable) {
            setTodaySteps(todayData.step_count);
          }
          if (todayData) {
            setStepGoal(todayData.goal || STEP_GOAL_DEFAULT);
          }
        }
        if (analysisRes?.data) {
          setWalkingAnalysis(analysisRes.data.analysis);
          setWalkingTrend(analysisRes.data.trend);
        }
        if (medRes?.data) {
          const mappedMed = mapMeditationToSunSat(medRes.data.days);
          setMeditationWeek(mappedMed);
          setTotalMeditationMin(medRes.data.total_minutes);
        }
        if (Array.isArray(reportsResult) && reportsResult.length > 0) {
          setLatestReport(reportsResult[0]);
        } else if (Array.isArray(reportsResult)) {
          setLatestReport(null);
        }
      } catch (e) {
        console.error('Error loading home data', e);
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [token, isPedometerAvailable]
  );

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  const onRefresh = useCallback(() => loadAll(false), [loadAll]);

  const handleMeditationComplete = useCallback(
    async (seconds: number) => {
      try {
        await axios.post(
          `${BACKEND_URL}/api/meditation/log`,
          { duration_seconds: seconds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {}
      setTimeout(() => {
        setShowMeditation(false);
        loadAll(false);
      }, 1500);
    },
    [token, loadAll]
  );

  function mapWeekToSunSat(days: any[]) {
    const mapped: any[] = new Array(7).fill(null).map(() => ({ step_count: 0, goal: STEP_GOAL_DEFAULT, goal_reached: false }));
    for (const d of days) {
      const date = new Date(d.date + 'T00:00:00');
      const dayIndex = date.getDay();
      mapped[dayIndex] = d;
    }
    return mapped;
  }

  function mapMeditationToSunSat(days: any[]) {
    const mapped: any[] = new Array(7).fill(null).map(() => ({ total_seconds: 0 }));
    for (const d of days) {
      const date = new Date(d.date + 'T00:00:00');
      const dayIndex = date.getDay();
      mapped[dayIndex] = d;
    }
    return mapped;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const trendIcon = walkingTrend === 'up' ? 'trending-up' : walkingTrend === 'down' ? 'trending-down' : 'pulse';
  const trendColor = walkingTrend === 'up' ? colors.success : walkingTrend === 'down' ? colors.error : colors.accent;
  const totalWeekSteps = weekSteps.reduce((sum, d) => sum + (d.step_count || 0), 0);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textTertiary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── INK HERO HEADER ─────────────────────────────── */}
        <View style={styles.heroHeader}>
          <View style={styles.heroNoiseOverlay} pointerEvents="none" />
          <View style={styles.heroAccentGlow} pointerEvents="none" />

          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greetingText}>{getGreeting().toUpperCase()}</Text>
              <Text style={styles.usernameText}>{username || 'User'}</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.85}
            >
              <Ionicons name="person-outline" size={18} color={colors.textInverse} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroRule} />

          {/* Step ring + meta */}
          <View style={styles.stepProgressContainer}>
            <StepCircle steps={todaySteps} goal={stepGoal} />
            <View style={styles.stepInfoContainer}>
              <View style={styles.stepInfoRow}>
                <Text style={styles.stepInfoKey}>Daily target</Text>
                <Text style={styles.stepInfoValue}>{stepGoal.toLocaleString()}</Text>
              </View>
              <View style={styles.stepInfoDivider} />
              <View style={styles.stepInfoRow}>
                <Text style={styles.stepInfoKey}>This week</Text>
                <Text style={styles.stepInfoValue}>{goalsReached} / 7</Text>
              </View>
              <View style={styles.stepInfoDivider} />
              <WeekCalendar weekData={weekSteps} />
            </View>
          </View>
        </View>

        {/* ── QUICK ACTIONS ────────────────────────────────── */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push('/(tabs)/chat')}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionTop}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="sparkles" size={18} color={colors.textPrimary} />
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
            </View>
            <View>
              <Text style={styles.quickActionTitle}>Health AI</Text>
              <Text style={styles.quickActionSubtitle}>Chat with your assistant</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => setShowMeditation(true)}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionTop}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="leaf-outline" size={18} color={colors.textPrimary} />
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
            </View>
            <View>
              <Text style={styles.quickActionTitle}>Meditate</Text>
              <Text style={styles.quickActionSubtitle}>{totalMeditationMin} min this week</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── COST ESTIMATOR ENTRY ─────────────────────────── */}
        <TouchableOpacity
          style={costEstimatorStyles.card}
          onPress={() => router.push('/cost-estimator' as any)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Open medical cost estimator"
        >
          <View style={costEstimatorStyles.left}>
            <View style={costEstimatorStyles.iconBg}>
              <Ionicons name="calculator-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={costEstimatorStyles.eyebrow}>NEW</Text>
              <Text style={costEstimatorStyles.title}>Medical cost estimator</Text>
              <Text style={costEstimatorStyles.subtitle}>
                Approximate ranges by city, condition, and hospital tier
              </Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* ── RISK SCORE ────────────────────────────────────── */}
        <RiskScoreCard
          report={latestReport}
          onPress={() => {
            if (latestReport) {
              router.push({
                pathname: '/risk-detail' as any,
                params: { id: String(latestReport.report_id) },
              });
            } else {
              router.push('/onboarding/welcome' as any);
            }
          }}
        />

        {/* ── HEALTH INSIGHTS ──────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>02</Text>
              <Text style={styles.sectionTitle}>Health Insights</Text>
            </View>
            <View style={styles.sectionBadge}>
              <View style={styles.sectionBadgeDot} />
              <Text style={styles.sectionBadgeText}>AI</Text>
            </View>
          </View>

          <View style={styles.insightCard}>
            <View style={styles.insightIconContainer}>
              <Ionicons name={trendIcon as any} size={20} color={trendColor} />
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightOverline}>Walking Analysis</Text>
              <Text style={styles.insightText} numberOfLines={4}>
                {walkingAnalysis || 'Start tracking your steps to receive personalized insights.'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── WEEKLY ACTIVITY ──────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>03</Text>
              <Text style={styles.sectionTitle}>Weekly Activity</Text>
            </View>
            <Text style={styles.sectionMeta}>{(totalWeekSteps / 1000).toFixed(1)}k</Text>
          </View>
          <ActivityBarChart weekData={weekSteps} meditationData={meditationWeek} />
        </View>

        {/* ── STATS GRID ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionEyebrow}>04</Text>
              <Text style={styles.sectionTitle}>Vitals</Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>GOALS HIT</Text>
              <Text style={styles.statValue}>{goalsReached}</Text>
              <Text style={styles.statUnit}>this week</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>MINDFUL</Text>
              <Text style={styles.statValue}>{totalMeditationMin}</Text>
              <Text style={styles.statUnit}>minutes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>STEPS</Text>
              <Text style={styles.statValue}>
                {Math.round(totalWeekSteps / 1000)}<Text style={styles.statValueUnit}>k</Text>
              </Text>
              <Text style={styles.statUnit}>weekly</Text>
            </View>
          </View>
        </View>

        <View style={styles.footerMark}>
          <View style={styles.footerDot} />
          <Text style={styles.footerText}>EUNOIA</Text>
        </View>
      </ScrollView>

      <MeditationModal
        visible={showMeditation}
        onClose={() => setShowMeditation(false)}
        onComplete={handleMeditationComplete}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// ─── Styles ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 140,
  },

  // ─── Hero (ink surface) ───────────────────────────────────
  heroHeader: {
    backgroundColor: colors.inkSurface,
    paddingTop: spacing.lg,
    paddingBottom: 56,
    paddingHorizontal: spacing.screenPadding,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  heroNoiseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  heroAccentGlow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  greetingText: {
    ...typography.overline,
    color: colors.textInverseSubtle,
  },
  usernameText: {
    ...typography.largeTitle,
    color: colors.textInverse,
    marginTop: 6,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.inkBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRule: {
    height: 1,
    backgroundColor: colors.inkBorder,
    marginVertical: spacing.lg,
  },

  // ─── Step Progress ───────────────────────────────────────
  stepProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  stepCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 156,
    height: 156,
  },
  stepCountText: {
    ...typography.numericLarge,
    fontSize: 36,
    color: colors.textInverse,
  },
  stepLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textInverseSubtle,
    marginTop: 4,
  },
  stepInfoContainer: {
    flex: 1,
    gap: spacing.sm,
  },
  stepInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepInfoKey: {
    ...typography.caption,
    color: colors.textInverseSubtle,
  },
  stepInfoValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textInverse,
  },
  stepInfoDivider: {
    height: 1,
    backgroundColor: colors.inkBorder,
    marginVertical: 2,
  },

  // Week Calendar
  weekContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  weekDayLabel: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textInverseSubtle,
  },
  weekDayLabelActive: {
    color: colors.textInverse,
  },
  weekDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  weekDotPartial: {
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  weekDotSuccess: {
    backgroundColor: colors.textInverse,
    borderColor: colors.textInverse,
  },
  weekDotToday: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  weekDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textInverse,
  },

  // ─── Quick Actions ───────────────────────────────────────
  quickActionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    marginTop: -28,
    alignItems: 'stretch',
  },
  quickActionCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  quickActionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  quickActionTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  quickActionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

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
  sectionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  sectionBadge: {
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
  sectionBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  sectionBadgeText: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textPrimary,
  },

  // ─── Insight Card ────────────────────────────────────────
  insightCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  insightIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  insightContent: {
    flex: 1,
  },
  insightOverline: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  insightText: {
    ...typography.body,
    color: colors.textPrimary,
  },

  // ─── Chart ───────────────────────────────────────────────
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    marginBottom: spacing.md,
  },
  chartBarGroup: {
    alignItems: 'center',
    flex: 1,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    width: 10,
    borderRadius: 3,
  },
  barFilled: {
    backgroundColor: colors.textPrimary,
  },
  barToday: {
    backgroundColor: colors.neutral.mist,
  },
  barPartial: {
    backgroundColor: colors.neutral.mist,
  },
  barEmpty: {
    backgroundColor: colors.neutral.cloud,
  },
  barMeditation: {
    backgroundColor: colors.accent,
  },
  chartBarLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 12,
  },
  chartBarLabelActive: {
    color: colors.textPrimary,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.lg,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    ...typography.captionSmall,
    color: colors.textTertiary,
  },

  // ─── Stats Grid ──────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  statLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.numeric,
    color: colors.textPrimary,
    marginTop: 8,
  },
  statValueUnit: {
    ...typography.numeric,
    color: colors.textTertiary,
  },
  statUnit: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // ─── Footer mark ─────────────────────────────────────────
  footerMark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 56,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  footerText: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
  },

  // ─── Modal ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xxl,
    paddingBottom: 48,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dividerStrong,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  modalTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    ...typography.display,
    fontSize: 56,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginTop: 6,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  presetChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  presetChipActive: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  presetChipText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetChipTextActive: {
    color: colors.textInverse,
  },
  meditationStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: spacing.buttonRadius,
    backgroundColor: colors.inkSurface,
    ...shadows.md,
  },
  meditationStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: spacing.buttonRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  meditationStartBtnText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  meditationStopBtnText: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  completedIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.inkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  completedText: {
    ...typography.headline,
    color: colors.textPrimary,
  },
});

// ═══════════════════════════════════════════════════════════════
// ─── Risk Score Card Styles ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const riskCardStyles = StyleSheet.create({
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
  sectionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadows.sm,
  },
  cardLeft: {
    flex: 1.1,
    justifyContent: 'space-between',
  },
  cardRight: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  scoreLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 6,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreValue: {
    ...typography.numericLarge,
    color: colors.textPrimary,
  },
  scoreSuffix: {
    ...typography.callout,
    color: colors.textTertiary,
  },

  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskBadgeText: {
    ...typography.overline,
    fontSize: 10,
  },

  miniBars: {
    gap: 8,
  },
  miniBarRow: {
    gap: 4,
  },
  miniBarLabel: {
    ...typography.captionSmall,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  miniBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.skeleton,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.textPrimary,
  },

  cardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
  },
  cardCtaText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  emptyState: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
});

// ═══════════════════════════════════════════════════════════════
// ─── Cost Estimator entry card ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const costEstimatorStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...typography.overline,
    fontSize: 9,
    color: colors.accent,
    marginBottom: 2,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
