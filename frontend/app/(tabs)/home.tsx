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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { useRouter } from 'expo-router';
import { colors, spacing, shadows, typography } from '../../constants/theme';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Pedometer } from 'expo-sensors';
import * as Linking from 'expo-linking';

const BACKEND_URL = API_BASE_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEP_GOAL_DEFAULT = 6000;

// ─── Circular Progress with Gradient ──────────────────────────────
function StepCircle({ steps, goal }: { steps: number; goal: number }) {
  const size = 130;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(steps / goal, 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.stepCircleContainer}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#10B981" />
            <Stop offset="100%" stopColor="#34D399" />
          </SvgGradient>
        </Defs>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress ring with gradient */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#fff"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }] as any}>
        <Text style={styles.stepCountText}>{steps.toLocaleString()}</Text>
        <Text style={styles.stepLabel}>steps</Text>
        <Text style={styles.goalText}>of {goal.toLocaleString()}</Text>
      </View>
    </View>
  );
}

// ─── Mini Week Calendar ─────────────────────────────────────────
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
                isToday && styles.weekDotToday,
                reachedGoal && styles.weekDotSuccess,
                hasSteps && !reachedGoal && !isToday && styles.weekDotPartial,
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

// ─── Activity Bar Chart ─────────────────────────────────────────
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
          const stepH = Math.max((daySteps / maxSteps) * 80, 6);
          const medH = Math.max((dayMed / maxMed) * 80, dayMed > 0 ? 6 : 0);
          const goalReached = weekData[i]?.goal_reached;
          const isToday = i === todayIndex;
          return (
            <View key={`chart-${label}-${i}`} style={styles.chartBarGroup}>
              <View style={styles.barPair}>
                <LinearGradient
                  colors={goalReached ? ['#10B981', '#34D399'] : isToday ? ['#E2E8F0', '#CBD5E1'] : ['#F1F5F9', '#E2E8F0']}
                  style={[styles.bar, { height: stepH }]}
                />
                {medH > 0 && (
                  <LinearGradient
                    colors={['#4F46E5', '#818CF8']}
                    style={[styles.bar, { height: medH, marginLeft: 4, width: 8 }]}
                  />
                )}
              </View>
              <Text style={[styles.chartBarLabel, isToday && styles.chartBarLabelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>Steps</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
          <Text style={styles.legendText}>Meditation</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Meditation Timer Modal ─────────────────────────────────────
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
    if (!visible) {
      reset();
    }
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
    if (elapsed >= 10) {
      onComplete(elapsed);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = isRunning || remainingSeconds === 0 ? 1 - remainingSeconds / totalRef.current : 0;
  const circSize = 200;
  const circStroke = 10;
  const circRadius = (circSize - circStroke) / 2;
  const circCircumference = 2 * Math.PI * circRadius;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Meditation</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', marginVertical: 32 }}>
            <Svg width={circSize} height={circSize} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Defs>
                <SvgGradient id="meditationGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#4F46E5" />
                  <Stop offset="100%" stopColor="#818CF8" />
                </SvgGradient>
              </Defs>
              <Circle
                cx={circSize / 2}
                cy={circSize / 2}
                r={circRadius}
                stroke="#E2E8F0"
                strokeWidth={circStroke}
                fill="none"
              />
              <Circle
                cx={circSize / 2}
                cy={circSize / 2}
                r={circRadius}
                stroke="url(#meditationGradient)"
                strokeWidth={circStroke}
                fill="none"
                strokeDasharray={`${circCircumference}`}
                strokeDashoffset={circCircumference * (1 - progress)}
                strokeLinecap="round"
              />
            </Svg>
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }] as any}>
              <Text style={styles.timerText}>{formatTime(remainingSeconds)}</Text>
              <Text style={styles.timerLabel}>remaining</Text>
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
                >
                  <Text style={[styles.presetChipText, idx === selectedPreset && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ alignItems: 'center', marginTop: 28 }}>
            {!isRunning && remainingSeconds > 0 && (
              <TouchableOpacity onPress={startTimer} activeOpacity={0.8}>
                <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.meditationStartBtn}>
                  <Ionicons name="play" size={22} color="#fff" />
                  <Text style={styles.meditationStartBtnText}>Start Session</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isRunning && (
              <TouchableOpacity style={styles.meditationStopBtn} onPress={stopTimer} activeOpacity={0.8}>
                <Ionicons name="stop" size={22} color="#fff" />
                <Text style={styles.meditationStartBtnText}>End Session</Text>
              </TouchableOpacity>
            )}
            {remainingSeconds === 0 && (
              <View style={{ alignItems: 'center' }}>
                <View style={styles.completedIcon}>
                  <Ionicons name="checkmark" size={36} color="#fff" />
                </View>
                <Text style={styles.completedText}>Session Complete!</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
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
        const [weekRes, analysisRes, medRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/steps/week`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/steps/analysis`, { headers }).catch(() => null),
          axios.get(`${BACKEND_URL}/api/meditation/week`, { headers }).catch(() => null),
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero Header ─────────────────────────────────── */}
        <LinearGradient colors={['#4F46E5', '#6366F1', '#818CF8']} style={styles.heroHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.greetingText}>{getGreeting()}</Text>
                <Text style={styles.usernameText}>{username || 'User'}</Text>
              </View>
              <TouchableOpacity
                style={styles.profileBtn}
                onPress={() => router.push('/(tabs)/profile')}
              >
                <Ionicons name="person" size={20} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {/* Step Progress */}
            <View style={styles.stepProgressContainer}>
              <StepCircle steps={todaySteps} goal={stepGoal} />
              <View style={styles.stepInfoContainer}>
                <View style={styles.stepInfoRow}>
                  <Ionicons name="flame" size={20} color="#F59E0B" />
                  <Text style={styles.stepInfoLabel}>Daily Goal</Text>
                  <Text style={styles.stepInfoValue}>{stepGoal.toLocaleString()}</Text>
                </View>
                <View style={styles.stepInfoRow}>
                  <Ionicons name="trophy" size={20} color="#10B981" />
                  <Text style={styles.stepInfoLabel}>This Week</Text>
                  <Text style={styles.stepInfoValue}>{goalsReached}/7 days</Text>
                </View>
                <WeekCalendar weekData={weekSteps} />
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ── Quick Actions ────────────────────────────────── */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push('/(tabs)/chat')}
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.quickActionGradient}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="chatbubbles" size={24} color={colors.accent} />
              </View>
              <Text style={styles.quickActionTitle}>Health AI</Text>
              <Text style={styles.quickActionSubtitle}>Chat with your assistant</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => setShowMeditation(true)}
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.quickActionGradient}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#10B98133' }]}>
                <Ionicons name="leaf" size={24} color="#10B981" />
              </View>
              <Text style={styles.quickActionTitle}>Meditate</Text>
              <Text style={styles.quickActionSubtitle}>{totalMeditationMin} min this week</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Health Insights ──────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Health Insights</Text>
            <View style={styles.sectionBadge}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={styles.sectionBadgeText}>AI</Text>
            </View>
          </View>

          <View style={styles.insightCard}>
            <View style={styles.insightIconContainer}>
              <Ionicons
                name={walkingTrend === 'up' ? 'trending-up' : walkingTrend === 'down' ? 'trending-down' : 'pulse'}
                size={24}
                color={walkingTrend === 'up' ? '#10B981' : walkingTrend === 'down' ? '#EF4444' : colors.accent}
              />
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Walking Analysis</Text>
              <Text style={styles.insightText} numberOfLines={3}>
                {walkingAnalysis || 'Start tracking your steps to get personalized insights!'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Weekly Activity ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Activity</Text>
          <ActivityBarChart weekData={weekSteps} meditationData={meditationWeek} />
        </View>

        {/* ── Stats Grid ───────────────────────────────────── */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.statIconBg}>
              <Ionicons name="flag" size={20} color="#D97706" />
            </LinearGradient>
            <Text style={styles.statValue}>{goalsReached}</Text>
            <Text style={styles.statLabel}>Goals Hit</Text>
          </View>

          <View style={styles.statCard}>
            <LinearGradient colors={['#DBEAFE', '#BFDBFE']} style={styles.statIconBg}>
              <Ionicons name="leaf" size={20} color="#3B82F6" />
            </LinearGradient>
            <Text style={styles.statValue}>{totalMeditationMin}</Text>
            <Text style={styles.statLabel}>Mindful Min</Text>
          </View>

          <View style={styles.statCard}>
            <LinearGradient colors={['#D1FAE5', '#A7F3D0']} style={styles.statIconBg}>
              <Ionicons name="footsteps" size={20} color="#059669" />
            </LinearGradient>
            <Text style={styles.statValue}>
              {Math.round(weekSteps.reduce((sum, d) => sum + (d.step_count || 0), 0) / 1000)}k
            </Text>
            <Text style={styles.statLabel}>Week Steps</Text>
          </View>
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
    paddingBottom: 120,
  },

  // Hero Header
  heroHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.screenPadding,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerContent: {
    gap: spacing.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
  },
  usernameText: {
    ...typography.largeTitle,
    color: '#fff',
    marginTop: 4,
  },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },

  // Step Progress
  stepCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
  },
  stepProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  stepCountText: {
    ...typography.numericLarge,
    color: '#fff',
  },
  stepLabel: {
    ...typography.overline,
    color: 'rgba(255,255,255,0.85)',
    marginTop: -2,
  },
  goalText: {
    ...typography.captionSmall,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  stepInfoContainer: {
    flex: 1,
    gap: spacing.sm,
  },
  stepInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  stepInfoLabel: {
    flex: 1,
    ...typography.caption,
    color: 'rgba(255,255,255,0.9)',
  },
  stepInfoValue: {
    ...typography.caption,
    fontWeight: '700',
    color: '#fff',
  },

  // Week Calendar
  weekContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  weekDayLabel: {
    ...typography.overline,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  weekDayLabelActive: {
    color: '#fff',
  },
  weekDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotToday: {
    backgroundColor: '#fff',
  },
  weekDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  weekDotSuccess: {
    backgroundColor: '#10B981',
  },
  weekDotPartial: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // Quick Actions
  quickActionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    marginTop: -24,
    alignItems: 'stretch',
  },
  quickActionCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    ...shadows.lg,
  },
  quickActionGradient: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(79, 70, 229, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickActionTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  quickActionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Section
  section: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sectionBadgeText: {
    ...typography.overline,
    fontSize: 10,
    color: colors.accent,
  },

  // Insight Card
  insightCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  insightIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  insightText: {
    ...typography.callout,
    color: colors.textSecondary,
  },

  // Chart
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
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
    width: 12,
    borderRadius: 6,
  },
  chartBarLabel: {
    ...typography.overline,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 8,
  },
  chartBarLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
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

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.xxl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.overline,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xxl,
    paddingBottom: 48,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    ...typography.display,
    fontSize: 52,
    color: colors.textPrimary,
  },
  timerLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -4,
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
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  presetChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  presetChipText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetChipTextActive: {
    color: '#fff',
  },
  meditationStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    ...shadows.md,
  },
  meditationStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EF4444',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    ...shadows.md,
  },
  meditationStartBtnText: {
    ...typography.headline,
    color: '#fff',
  },
  completedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  completedText: {
    ...typography.headline,
    color: '#10B981',
  },
});
