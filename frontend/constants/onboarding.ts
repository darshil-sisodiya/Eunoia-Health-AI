// ── Onboarding constants ────────────────────────────────────────
// Data-only module shared by the seven Eunoia onboarding screens
// and the AI Analysis Transition. This file MUST stay free of JSX
// and styling. All visual rendering is performed by screen-level
// components, which consume tokens from `frontend/constants/theme.ts`.
//
// The values defined here mirror the Pydantic enums and canonical
// city list on the backend (`backend/cities.py`,
// `backend/server.py`) so the two sides of the API contract stay
// in sync. Order is significant: the lifestyle question order
// drives sub-question pacing, and the Karnataka city list is
// pre-sorted so the picker renders identically whether the
// `GET /api/cities` request succeeded or fell back to this file.

// ── Hereditary conditions (Requirement 6, glossary) ────────────
// Ordered per the requirements glossary. Used by the Family
// History grid and validated against on the backend.
export const HEREDITARY_CONDITIONS = [
  'Diabetes',
  'Hypertension',
  'Heart Disease',
  'Asthma',
  'Cancer',
  'Mental Health Disorders',
  'Thyroid Disorders',
  'Obesity',
] as const;

export type HereditaryCondition = (typeof HEREDITARY_CONDITIONS)[number];

// ── Karnataka cities fallback (Requirements 7.5, 7.7) ──────────
// Alphabetised, identical to `backend/cities.py::KARNATAKA_CITIES_SORTED`.
// The Location step uses `GET /api/cities` first and falls back to
// this list on any network failure. Both paths therefore render
// the same alphabetical order.
export const KARNATAKA_CITIES_FALLBACK = [
  'Bagalkot',
  'Ballari',
  'Belagavi',
  'Bengaluru',
  'Chikkamagaluru',
  'Davanagere',
  'Dharwad',
  'Hassan',
  'Hubballi',
  'Kalaburagi',
  'Kolar',
  'Mandya',
  'Mangaluru',
  'Mysuru',
  'Raichur',
  'Shivamogga',
  'Tumakuru',
  'Udupi',
  'Vijayapura',
] as const;

export type KarnatakaCity = (typeof KARNATAKA_CITIES_FALLBACK)[number];

// ── Lifestyle sub-questions (Requirement 4) ────────────────────
// Ordered list describing each sub-question and its enum, exactly
// matching Requirements 4.1–4.7 and the order rendered by
// `app/onboarding/lifestyle.tsx`. Each `options[].value` is the
// enum value sent to the backend; `label` is the user-facing copy.
export const LIFESTYLE_QUESTIONS = [
  {
    id: 'smoking',
    eyebrow: 'Lifestyle · 01 / 06',
    question: 'How would you describe your smoking habits?',
    options: [
      { value: 'never', label: 'Never smoked' },
      { value: 'former', label: 'Former smoker' },
      { value: 'occasional', label: 'Occasional' },
      { value: 'regular', label: 'Regular' },
    ],
  },
  {
    id: 'alcohol',
    eyebrow: 'Lifestyle · 02 / 06',
    question: 'How often do you drink alcohol?',
    options: [
      { value: 'never', label: 'Never' },
      { value: 'occasional', label: 'Occasional' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'frequent', label: 'Frequent' },
    ],
  },
  {
    id: 'exercise_frequency',
    eyebrow: 'Lifestyle · 03 / 06',
    question: 'How often do you exercise?',
    options: [
      { value: 'never', label: 'Never' },
      { value: 'occasional', label: 'Occasionally' },
      { value: 'regular', label: 'Regularly' },
      { value: 'daily', label: 'Daily' },
    ],
  },
  {
    id: 'water_intake',
    eyebrow: 'Lifestyle · 04 / 06',
    question: 'How much water do you drink on a typical day?',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'high', label: 'High' },
    ],
  },
  {
    id: 'sleep_quality',
    eyebrow: 'Lifestyle · 05 / 06',
    question: 'How would you rate your sleep quality?',
    options: [
      { value: 'poor', label: 'Poor' },
      { value: 'fair', label: 'Fair' },
      { value: 'good', label: 'Good' },
      { value: 'excellent', label: 'Excellent' },
    ],
  },
  {
    id: 'stress_level',
    eyebrow: 'Lifestyle · 06 / 06',
    question: 'How would you describe your stress level?',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'high', label: 'High' },
    ],
  },
] as const;

export type LifestyleQuestion = (typeof LIFESTYLE_QUESTIONS)[number];
export type LifestyleQuestionId = LifestyleQuestion['id'];

// ── Progress messages quartet (Requirement 8.2) ────────────────
// Exact strings displayed during the AI Analysis Transition. Order
// matches the sequence rendered by `ProgressMessages`; the screen
// loops on the last message until the response resolves or the
// 30-second error timer fires.
export const PROGRESS_MESSAGES = [
  'Analyzing hereditary patterns',
  'Evaluating wellness indicators',
  'Generating preventive insights',
  'Preparing personalized health profile',
] as const;

export type ProgressMessage = (typeof PROGRESS_MESSAGES)[number];

// ── Step copy strings ──────────────────────────────────────────
// Per-step eyebrow / headline / subtitle copy. Mirrors design
// § "Frontend Screen Breakdown". Brand and tone stay calm,
// intelligent, and preventive (Requirement 1.5).
export const ONBOARDING_COPY = {
  brand: 'EUNOIA',
  totalSteps: 7,

  welcome: {
    eyebrow: 'EUNOIA',
    headline: 'Preventive intelligence for your everyday health',
    subtitle: 'Personalised insights, calmly delivered.',
    primaryCta: 'Begin',
    secondaryCta: 'I already have an account',
  },

  basic: {
    eyebrow: 'Step 02 · About you',
    headline: 'A few essentials',
    subtitle: 'These help Eunoia personalise the rest of the flow.',
    advanceLabel: 'Continue',
    fields: {
      fullName: {
        label: 'Full name',
        placeholder: 'Your full name',
        hint: 'Up to 80 characters.',
      },
      age: {
        label: 'Age',
        placeholder: 'Years',
        hint: 'Between 13 and 120.',
      },
      gender: {
        label: 'Gender',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'non_binary', label: 'Non-binary' },
          { value: 'prefer_not_to_say', label: 'Prefer not to say' },
        ],
      },
      heightCm: {
        label: 'Height',
        unit: 'cm',
        placeholder: 'Centimetres',
        hint: 'Between 80 and 250 cm.',
      },
      weightKg: {
        label: 'Weight',
        unit: 'kg',
        placeholder: 'Kilograms',
        hint: 'Between 20 and 300 kg.',
      },
    },
    errors: {
      fullName: 'Please enter your name (up to 80 characters).',
      age: 'Age must be a whole number between 13 and 120.',
      gender: 'Please choose an option.',
      heightCm: 'Height must be between 80 and 250 cm.',
      weightKg: 'Weight must be between 20 and 300 kg.',
    },
  },

  lifestyle: {
    eyebrow: 'Step 03 · Lifestyle',
    headline: 'Your everyday rhythm',
    subtitle: 'Six quick questions about how you live.',
    advanceLabel: 'Continue',
    unansweredPrompt: 'Select an option to continue.',
  },

  medical: {
    eyebrow: 'Step 04 · Medical history',
    headline: 'Anything we should know?',
    subtitle:
      'Add what applies. Skip what does not. You can search inside each list.',
    advanceLabel: 'Continue',
    sections: {
      existingConditions: 'Existing conditions',
      allergies: 'Allergies',
      currentMedications: 'Current medications',
    },
    searchPlaceholder: 'Search',
    addCustomLabel: 'Add custom entry',
    capMessage: 'You can pick up to 50 entries',
  },

  family: {
    eyebrow: 'Step 05 · Family history',
    headline: 'Hereditary signals',
    subtitle:
      'Tap any conditions that run in your family. Skipping is fine too.',
    advanceLabel: 'Continue',
    supporting:
      'This information powers hereditary risk indicators and is never used to issue diagnoses.',
  },

  location: {
    eyebrow: 'Step 06 · Location',
    headline: 'Where are you based?',
    subtitle:
      'We tailor recommendations to local healthcare and accessibility.',
    advanceLabel: 'Finish',
    stateLabel: 'State',
    stateValue: 'Karnataka',
    cityLabel: 'City',
    cityPlaceholder: 'Choose your city',
    cityPickerUnavailable: 'City picker unavailable',
    cityRequiredError: 'Choose a city to continue.',
  },

  analyzing: {
    eyebrow: 'EUNOIA',
    headline: 'Analysing your profile',
    subtitle: 'Calm, intelligent, preventive.',
    error: {
      headline: "We could not reach Eunoia's analysis just now.",
      subtitle: 'Try again, or come back when your connection is steady.',
      retryLabel: 'Retry',
      cancelLabel: 'Cancel',
    },
  },

  result: {
    eyebrow: 'Your Eunoia profile',
    wellnessLabel: 'Wellness score',
    riskLabel: 'Risk level',
    aiUnavailableMessage:
      'Your personalized AI insights will be retried later. Your risk indicators are ready.',
    sections: {
      preventiveInsights: 'Preventive insights',
      lifestyleOptimization: 'Lifestyle optimization',
      mentalWellness: 'Mental wellness',
      hereditaryIndicators: 'Hereditary risk indicators',
      longTermAwareness: 'Long-term wellness awareness',
      habitOptimization: 'Habit optimization',
      trendPlaceholder: 'Trend insights coming soon',
    },
    primaryCta: 'Return to home',
    saveErrorMessage:
      'We could not save your report just now. Tap to retry.',
  },
} as const;

export type OnboardingCopy = typeof ONBOARDING_COPY;
