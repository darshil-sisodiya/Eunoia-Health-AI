import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { colors, spacing, shadows, typography } from '../../constants/theme';

type OptionType = {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function Questions() {
  const { token } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [sleepPattern, setSleepPattern] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [hydrationLevel, setHydrationLevel] = useState('');
  const [stressLevel, setStressLevel] = useState('');
  const [exerciseFrequency, setExerciseFrequency] = useState('');
  const [dietType, setDietType] = useState('');

  const totalSteps = 6;

  const sleepPatternOptions: OptionType[] = [
    { value: 'early_bird', label: 'Early Bird', icon: 'sunny-outline' },
    { value: 'night_owl', label: 'Night Owl', icon: 'moon-outline' },
    { value: 'irregular', label: 'Irregular', icon: 'shuffle-outline' },
  ];

  const sleepHoursOptions: OptionType[] = [
    { value: '4', label: '4-5 hours', icon: 'time-outline' },
    { value: '6', label: '6-7 hours', icon: 'time-outline' },
    { value: '8', label: '8+ hours', icon: 'time-outline' },
  ];

  const hydrationOptions: OptionType[] = [
    { value: 'poor', label: 'Poor', icon: 'water-outline' },
    { value: 'moderate', label: 'Moderate', icon: 'water-outline' },
    { value: 'good', label: 'Good', icon: 'water-outline' },
  ];

  const stressOptions: OptionType[] = [
    { value: 'low', label: 'Low', icon: 'happy-outline' },
    { value: 'moderate', label: 'Moderate', icon: 'remove-circle-outline' },
    { value: 'high', label: 'High', icon: 'sad-outline' },
  ];

  const exerciseOptions: OptionType[] = [
    { value: 'never', label: 'Never', icon: 'close-circle-outline' },
    { value: 'occasional', label: 'Occasional', icon: 'walk-outline' },
    { value: 'regular', label: 'Regular', icon: 'bicycle-outline' },
    { value: 'daily', label: 'Daily', icon: 'fitness-outline' },
  ];

  const dietOptions: OptionType[] = [
    { value: 'balanced', label: 'Balanced', icon: 'restaurant-outline' },
    { value: 'vegetarian', label: 'Vegetarian', icon: 'leaf-outline' },
    { value: 'vegan', label: 'Vegan', icon: 'nutrition-outline' },
    { value: 'fast_food', label: 'Fast Food', icon: 'fast-food-outline' },
  ];

  const handleSubmit = async () => {
    if (!sleepPattern || !sleepHours || !hydrationLevel || !stressLevel || !exerciseFrequency || !dietType) {
      Alert.alert('Error', 'Please answer all questions');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/health/profile`,
        {
          sleep_pattern: sleepPattern,
          sleep_hours: parseInt(sleepHours),
          hydration_level: hydrationLevel,
          stress_level: stressLevel,
          exercise_frequency: exerciseFrequency,
          diet_type: dietType,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Alert.alert('Success', 'Your health profile has been created!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/home') },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  };

  const renderOptions = (options: OptionType[], selectedValue: string, onSelect: (value: string) => void) => (
    <View style={styles.optionsContainer}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, isSelected && styles.iconBadgeSelected]}>
              <Ionicons
                name={option.icon}
                size={24}
                color={isSelected ? colors.accent : colors.textMuted}
              />
            </View>
            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
              {option.label}
            </Text>
            {isSelected && (
              <Ionicons name="checkmark-circle" size={22} color={colors.accent} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>What's your sleep pattern?</Text>
            {renderOptions(sleepPatternOptions, sleepPattern, setSleepPattern)}
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>How many hours do you sleep?</Text>
            {renderOptions(sleepHoursOptions, sleepHours, setSleepHours)}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>How's your hydration level?</Text>
            {renderOptions(hydrationOptions, hydrationLevel, setHydrationLevel)}
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>What's your stress level?</Text>
            {renderOptions(stressOptions, stressLevel, setStressLevel)}
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>How often do you exercise?</Text>
            {renderOptions(exerciseOptions, exerciseFrequency, setExerciseFrequency)}
          </View>
        );
      case 6:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.question}>What's your diet type?</Text>
            {renderOptions(dietOptions, dietType, setDietType)}
          </View>
        );
      default:
        return null;
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return sleepPattern !== '';
      case 2:
        return sleepHours !== '';
      case 3:
        return hydrationLevel !== '';
      case 4:
        return stressLevel !== '';
      case 5:
        return exerciseFrequency !== '';
      case 6:
        return dietType !== '';
      default:
        return false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Health Profile</Text>
        <Text style={styles.subtitle}>
          Step {currentStep} of {totalSteps}
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(currentStep / totalSteps) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderStep()}
      </ScrollView>

      <View style={styles.footer}>
        {currentStep > 1 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setCurrentStep(currentStep - 1)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        {currentStep < totalSteps ? (
          <TouchableOpacity
            style={[styles.nextButton, !canGoNext() && styles.buttonDisabled]}
            onPress={() => setCurrentStep(currentStep + 1)}
            disabled={!canGoNext()}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.textInverse} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, (!canGoNext() || isLoading) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canGoNext() || isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>Finish</Text>
                <Ionicons name="checkmark" size={20} color={colors.textInverse} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  title: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textMuted,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.backgroundTertiary,
    marginHorizontal: spacing.xxl,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xxl,
  },
  stepContainer: {
    flex: 1,
  },
  question: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xxxl,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: spacing.cardRadius,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSelected: {
    backgroundColor: '#DDD6FE',
  },
  optionText: {
    marginLeft: spacing.lg,
    ...typography.headline,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.xxl,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  backButtonText: {
    marginLeft: spacing.sm,
    ...typography.callout,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: spacing.buttonRadius,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    ...shadows.md,
  },
  nextButtonText: {
    marginRight: spacing.sm,
    ...typography.headline,
    color: colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
