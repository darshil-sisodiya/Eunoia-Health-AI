import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Modal,
  Vibration,
  Alert,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { type AnalyzeRiskResponse } from '../../utils/onboardingApi';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, shadows, typography } from '../../constants/theme';
import { componentBars } from '../../utils/riskView';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { ConfidencePill, toneColors } from '../../components/health/RiskBreakdown';
import CompletenessCard from '../../components/health/CompletenessCard';
import { useHealthProfile } from '../../contexts/HealthProfileContext';
import { Button, IconButton, tap } from '../../components/ui';
import Svg, { Circle, Path } from 'react-native-svg';
import { Pedometer } from 'expo-sensors';
import * as Linking from 'expo-linking';
import { getMe } from '../../utils/costEstimatorApi';

const BACKEND_URL = API_BASE_URL;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STEP_GOAL_DEFAULT = 6000;

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── Sunrise: today's steps as a sun climbing a half-circle ─────
// The one orchestrated motion on the screen: the arc sweeps up to
// today's progress on load (skipped when the OS asks for reduced motion).
function Sunrise({ steps, goal }: { steps: number; goal: number }) {
  const width = 280;
  const stroke = 14;
  const r = (width - stroke) / 2;
  const cy = r + stroke / 2;
  const height = cy + stroke / 2;
  const arcLength = Math.PI * r;
  const progress = Math.min(steps / Math.max(goal, 1), 1);
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${cy}`;

  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          sweep.setValue(progress);
          return;
        }
        Animated.timing(sweep, {
          toValue: progress,
          duration: 1100,
          delay: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    return () => {
      alive = false;
    };
  }, [progress, sweep]);

  const dashOffset = sweep.interpolate({ inputRange: [0, 1], outputRange: [arcLength, 0] });
  const remaining = Math.max(goal - steps, 0);

  return (
    <View
      style={styles.sunrise}
      accessible
      accessibilityLabel={`${steps.toLocaleString()} of ${goal.toLocaleString()} steps today`}
    >
      <Svg width={width} height={height}>
        <Path d={d} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <AnimatedPath
          d={d}
          stroke={colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={dashOffset as any}
        />
      </Svg>
      <View style={styles.sunriseCenter}>
        <Text style={styles.stepCount}>{steps.toLocaleString()}</Text>
        <Text style={styles.stepGoal}>
          {remaining > 0
            ? `${remaining.toLocaleString()} steps to your ${goal.toLocaleString()} goal`
            : `Goal of ${goal.toLocaleString()} reached`}
        </Text>
      </View>
    </View>
  );
}

// ─── Week strip: one mark per day, on the indigo hero ───────────
function WeekStrip({ weekData }: { weekData: any[] }) {
  const todayIndex = new Date().getDay();
  return (
    <View style={styles.weekStrip}>
      {DAY_LABELS.map((label, i) => {
        const isToday = i === todayIndex;
        const day = weekData[i];
        const reached = !!day?.goal_reached;
        const walked = (day?.step_count ?? 0) > 0;
        return (
          <View
            key={`${label}-${i}`}
            style={styles.weekDay}
            accessible
            accessibilityLabel={`${DAY_NAMES[i]}${isToday ? ', today' : ''}: ${
              reached ? 'goal met' : walked ? `${day.step_count} steps` : 'no steps'
            }`}
          >
            <View
              style={[
                styles.weekMark,
                walked && styles.weekMarkWalked,
                reached && styles.weekMarkReached,
                isToday && !reached && styles.weekMarkToday,
              ]}
            >
              {reached ? <Ionicons name="checkmark" size={12} color={colors.textPrimary} /> : null}
            </View>
            <Text style={[styles.weekLabel, isToday && styles.weekLabelToday]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Weekly activity chart ──────────────────────────────────────
function ActivityChart({ weekData, meditationData }: { weekData: any[]; meditationData: any[] }) {
  const maxSteps = Math.max(...weekData.map((d: any) => d?.step_count || 0), 1);
  const maxMed = Math.max(...meditationData.map((d: any) => d?.total_seconds || 0), 1);
  const todayIndex = new Date().getDay();
  const H = 112;

  return (
    <View>
      <View style={styles.chartBars}>
        {DAY_LABELS.map((label, i) => {
          const daySteps = weekData[i]?.step_count || 0;
          const dayMed = meditationData[i]?.total_seconds || 0;
          const stepH = daySteps > 0 ? Math.max((daySteps / maxSteps) * H, 6) : 3;
          const medH = dayMed > 0 ? Math.max((dayMed / maxMed) * H * 0.6, 6) : 0;
          const reached = weekData[i]?.goal_reached;
          const isToday = i === todayIndex;
          return (
            <View key={`chart-${i}`} style={styles.chartCol}>
              <View style={[styles.chartPlot, { height: H }]}>
                <View
                  style={[
                    styles.bar,
                    { height: stepH },
                    reached ? styles.barReached : daySteps > 0 ? styles.barSteps : styles.barEmpty,
                  ]}
                />
                {medH > 0 ? <View style={[styles.barMed, { height: medH }]} /> : null}
              </View>
              <Text style={[styles.chartLabel, isToday && styles.chartLabelToday]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <LegendDot color={colors.textPrimary} label="Steps" />
        <LegendDot color={colors.accent} label="Goal met" />
        <LegendDot color={colors.textMuted} label="Meditation" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── Meditation sheet ───────────────────────────────────────────
const TIMER_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
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

  const done = remainingSeconds === 0;
  const progress = isRunning || done ? 1 - remainingSeconds / totalRef.current : 0;
  const circSize = 232;
  const circStroke = 10;
  const circRadius = (circSize - circStroke) / 2;
  const circCircumference = 2 * Math.PI * circRadius;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={isRunning ? undefined : onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Meditate</Text>
              <Text style={styles.sheetSubtitle}>
                {isRunning ? 'Breathe slowly. You can end early at any time.' : 'Pick a length, then begin.'}
              </Text>
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>

          <View style={styles.timerWrap}>
            <Svg width={circSize} height={circSize} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={circSize / 2} cy={circSize / 2} r={circRadius} stroke={colors.backgroundTertiary} strokeWidth={circStroke} fill="none" />
              <Circle
                cx={circSize / 2}
                cy={circSize / 2}
                r={circRadius}
                stroke={colors.accent}
                strokeWidth={circStroke}
                fill="none"
                strokeDasharray={`${circCircumference}`}
                strokeDashoffset={circCircumference * (1 - progress)}
                strokeLinecap="round"
              />
            </Svg>
            <View style={styles.timerCenter}>
              {done ? (
                <>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                  <Text style={styles.timerDone}>Session saved</Text>
                </>
              ) : (
                <>
                  <Text style={styles.timerText} accessibilityLiveRegion="polite">
                    {formatTime(remainingSeconds)}
                  </Text>
                  <Text style={styles.timerLabel}>{isRunning ? 'remaining' : 'minutes'}</Text>
                </>
              )}
            </View>
          </View>

          {!isRunning && !done ? (
            <View style={styles.presetRow} accessibilityRole="radiogroup">
              {TIMER_PRESETS.map((p, idx) => {
                const selected = idx === selectedPreset;
                return (
                  <Pressable
                    key={p.seconds}
                    style={[styles.preset, selected && styles.presetActive]}
                    onPress={() => {
                      tap();
                      setSelectedPreset(idx);
                      setRemainingSeconds(p.seconds);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.presetText, selected && styles.presetTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!isRunning && !done ? <Button label="Begin session" icon="play" onPress={startTimer} /> : null}
          {isRunning ? <Button label="End session" variant="secondary" icon="stop" onPress={stopTimer} /> : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Wellness report card ───────────────────────────────────────
function WellnessCard({ report, onPress }: { report: AnalyzeRiskResponse | null; onPress: () => void }) {
  const tone = toneColors(report?.risk_level ?? null);

  if (!report) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, styles.emptyCard, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Build your health profile to get your risk score"
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="pulse" size={22} color={colors.textPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Get your risk score</Text>
          <Text style={styles.cardBody}>Answer a few questions about your health. It takes about 4 minutes.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </Pressable>
    );
  }

  const bars = componentBars(report).slice(0, 4);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${ONBOARDING_COPY.result.scoreLabel} ${report.risk_score} ${ONBOARDING_COPY.result.scoreOutOf}, ${report.risk_level} risk. Open full report.`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{ONBOARDING_COPY.result.scoreLabel}</Text>
        <View style={styles.cardHeadRight}>
          <Text style={styles.cardMeta}>{formatShortDate(report.created_at)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreValue}>{report.risk_score}</Text>
        <View style={styles.scoreSide}>
          <Text style={styles.scoreOutOf}>{ONBOARDING_COPY.result.scoreOutOf}</Text>
          <View style={[styles.riskChip, { backgroundColor: tone.bg }]}>
            <View style={[styles.riskDot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.riskChipText, { color: tone.fg }]}>{report.risk_level} risk</Text>
          </View>
        </View>
      </View>

      {bars.length > 0 ? (
        <View style={styles.miniBars}>
          {bars.map((row) => (
            <View key={row.id} style={styles.miniBarRow}>
              <Text style={styles.miniBarLabel} numberOfLines={1}>
                {row.label}
              </Text>
              <View style={styles.miniBarTrack}>
                {/* Against the component's own cap, so a bar is only full when the component is. */}
                <View style={[styles.miniBarFill, { width: `${Math.max(row.fraction * 100, 3)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* How much of the picture this is based on. */}
      <View style={styles.confidence}>
        <ConfidencePill report={report} />
      </View>
    </Pressable>
  );
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Small pressable tile ───────────────────────────────────────
function Tile({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
    >
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileDetail} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

// ─── Home ───────────────────────────────────────────────────────

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
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getMe(token)
      .then((me) => setFullName(me?.name ?? null))
      .catch(() => {});
  }, [token]);

  // Sourced from the shared store rather than a screen-local fetch, so a
  // profile edit made anywhere updates the score shown here.
  const { data: profileData, refresh: refreshProfile } = useHealthProfile();
  const latestReport = profileData?.latest_report ?? null;

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
        // Steps and meditation stay local: they are activity data, not
        // profile. The risk report comes from the shared store so every
        // screen shows the same one.
        const [weekRes, analysisRes, medRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/steps/week`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/steps/analysis`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/meditation/week`, { headers }).catch(() => null),
        ]);
        void refreshProfile();

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
      } catch (e) {
        console.error('Error loading home data', e);
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [token, isPedometerAvailable, refreshProfile]
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


  const totalWeekSteps = weekSteps.reduce((sum, d) => sum + (d?.step_count || 0), 0);
  const trend =
    walkingTrend === 'up'
      ? { icon: 'trending-up' as const, color: colors.success, label: 'Walking more than last week' }
      : walkingTrend === 'down'
      ? { icon: 'trending-down' as const, color: colors.warning, label: 'Walking less than last week' }
      : { icon: 'remove' as const, color: colors.textSecondary, label: 'About the same as last week' };
  // Greet by the first name given in onboarding, not the login handle.
  const name = (fullName || '').trim().split(/\s+/)[0] || username || 'there';

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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Greeting ───────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {name}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        {/* ── Today hero ─────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroHead}>
            <Text style={styles.heroTitle}>Today’s walk</Text>
            <Text style={styles.heroMeta}>
              {goalsReached} of 7 days on target
            </Text>
          </View>
          <Sunrise steps={todaySteps} goal={stepGoal} />
          <WeekStrip weekData={weekSteps} />
        </View>

        {/* ── Quick actions ──────────────────────────────── */}
        <View style={styles.tiles}>
          <Tile
            icon="chatbubble-ellipses-outline"
            title="Ask Eunoia"
            detail="Questions about your health or medicines"
            onPress={() => router.push('/(tabs)/chat')}
          />
          <Tile
            icon="leaf-outline"
            title="Meditate"
            detail={totalMeditationMin > 0 ? `${totalMeditationMin} min this week` : 'Start a short session'}
            onPress={() => setShowMeditation(true)}
          />
        </View>

        {/* ── Wellness ───────────────────────────────────── */}
        <WellnessCard
          report={latestReport}
          onPress={() => {
            if (latestReport) {
              router.push({ pathname: '/risk-detail' as any, params: { id: String(latestReport.report_id) } });
            } else {
              router.push('/onboarding/welcome' as any);
            }
          }}
        />

        {/* Asks for the rest of the profile one item at a time; hides itself when done. */}
        <View style={styles.gap}>
          <CompletenessCard completeness={profileData?.completeness} />
        </View>

        {/* ── This week ──────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>This week</Text>
            <Text style={styles.cardMeta}>{totalWeekSteps.toLocaleString()} steps</Text>
          </View>
          <ActivityChart weekData={weekSteps} meditationData={meditationWeek} />
          <View style={styles.insight}>
            <View style={styles.insightHead}>
              <Ionicons name={trend.icon} size={18} color={trend.color} />
              <Text style={styles.insightTitle}>{trend.label}</Text>
            </View>
            <Text style={styles.insightText}>
              {walkingAnalysis || 'Walk with your phone for a day or two and a summary of your pattern will appear here.'}
            </Text>
          </View>
        </View>

        {/* ── Cost estimator ─────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.card, styles.rowCard, pressed && styles.pressed]}
          onPress={() => router.push('/cost-estimator' as any)}
          accessibilityRole="button"
          accessibilityLabel="Estimate treatment costs"
        >
          <View style={styles.rowIcon}>
            <Ionicons name="wallet-outline" size={20} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitleSmall}>Estimate treatment costs</Text>
            <Text style={styles.cardBody}>Typical price ranges at hospitals near you</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </Pressable>
      </ScrollView>

      <MeditationModal
        visible={showMeditation}
        onClose={() => setShowMeditation(false)}
        onComplete={handleMeditationComplete}
      />
    </SafeAreaView>
  );
}

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

  // Greeting
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greeting: {
    ...typography.body,
    color: colors.textSecondary,
  },
  name: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.textPrimary,
  },

  // Hero
  hero: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    marginBottom: spacing.md,
  },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xl,
  },
  heroTitle: {
    ...typography.headline,
    color: colors.textInverse,
  },
  heroMeta: {
    ...typography.caption,
    color: colors.textInverseMuted,
  },
  sunrise: {
    alignItems: 'center',
  },
  sunriseCenter: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  stepCount: {
    ...typography.mega,
    color: colors.textInverse,
  },
  stepGoal: {
    ...typography.caption,
    color: colors.textInverseMuted,
    marginTop: 2,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.inkBorder,
  },
  weekDay: {
    alignItems: 'center',
    gap: 6,
    minWidth: 32,
  },
  weekMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekMarkWalked: {
    borderColor: 'rgba(244,167,34,0.7)',
  },
  weekMarkReached: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  weekMarkToday: {
    borderColor: colors.textInverse,
    borderWidth: 2,
  },
  weekLabel: {
    ...typography.captionSmall,
    color: colors.textInverseSubtle,
  },
  weekLabelToday: {
    fontFamily: fonts.bold,
    color: colors.textInverse,
  },

  // Tiles
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: spacing.xl,
  },
  tileDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cardHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  cardTitleSmall: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cardBody: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Wellness
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  scoreValue: {
    ...typography.mega,
    fontSize: 72,
    lineHeight: 74,
    color: colors.textPrimary,
  },
  scoreSide: {
    paddingBottom: 10,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  scoreOutOf: {
    ...typography.callout,
    color: colors.textTertiary,
  },
  riskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: spacing.chipRadius,
  },
  riskDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  riskChipText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
  },
  miniBars: {
    gap: spacing.md,
  },
  miniBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  miniBarLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 128,
  },
  miniBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.textPrimary,
  },
  confidence: {
    marginTop: spacing.lg,
    alignItems: 'flex-start',
  },

  // Chart
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chartPlot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: {
    width: 14,
    borderRadius: 7,
  },
  barSteps: {
    backgroundColor: colors.textPrimary,
  },
  barReached: {
    backgroundColor: colors.accent,
  },
  barEmpty: {
    backgroundColor: colors.backgroundTertiary,
  },
  barMed: {
    width: 5,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  chartLabel: {
    ...typography.captionSmall,
    color: colors.textTertiary,
  },
  chartLabelToday: {
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.captionSmall,
    color: colors.textSecondary,
  },
  insight: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  insightHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  insightTitle: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  insightText: {
    ...typography.callout,
    fontFamily: fonts.regular,
    lineHeight: 21,
    color: colors.textSecondary,
  },

  // Meditation sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.cardRadiusXl,
    borderTopRightRadius: spacing.cardRadiusXl,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    ...shadows.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceBorderStrong,
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  sheetTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xxl,
  },
  timerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timerText: {
    ...typography.mega,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    ...typography.callout,
    color: colors.textTertiary,
  },
  timerDone: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  preset: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: {
    backgroundColor: colors.inkSurface,
  },
  presetText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.textInverse,
  },
});
