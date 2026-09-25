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
    eyebrow: 'Lifestyle',
    question: 'Do you smoke?',
    options: [
      { value: 'never', label: 'Never smoked' },
      { value: 'former', label: 'Former smoker' },
      { value: 'occasional', label: 'Occasional' },
      { value: 'regular', label: 'Regular' },
    ],
  },
  {
    id: 'alcohol',
    eyebrow: 'Lifestyle',
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
    eyebrow: 'Lifestyle',
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
    eyebrow: 'Lifestyle',
    question: 'How much water do you drink on a typical day?',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'high', label: 'High' },
    ],
  },
  {
    id: 'sleep_quality',
    eyebrow: 'Lifestyle',
    question: 'How well do you usually sleep?',
    options: [
      { value: 'poor', label: 'Poor' },
      { value: 'fair', label: 'Fair' },
      { value: 'good', label: 'Good' },
      { value: 'excellent', label: 'Excellent' },
    ],
  },
  {
    id: 'stress_level',
    eyebrow: 'Lifestyle',
    question: 'How stressed do you feel most days?',
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
// Per-step copy. `eyebrow` is the topic label the shell shows above the
// body (the shell already shows "Step N of M"); an empty string hides it.
// Plain, sentence case, specific.
export const ONBOARDING_COPY = {
  brand: 'Eunoia',
  totalSteps: 7,

  welcome: {
    eyebrow: '',
    headline: 'Stay a step ahead of your health',
    subtitle:
      'Tell us about yourself, your habits and your family. We turn it into a clear picture of your risks and what to check next.',
    primaryCta: 'Start my profile',
    secondaryCta: 'I already have an account',
  },

  basic: {
    eyebrow: 'About you',
    headline: 'Start with the basics',
    subtitle: 'Age, gender, height and weight set the baseline for every estimate that follows.',
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
      fullName: 'Enter your name, up to 80 characters.',
      age: 'Enter your age as a whole number from 13 to 120.',
      gender: 'Choose one option.',
      heightCm: 'Enter a height between 80 and 250 cm.',
      weightKg: 'Enter a weight between 20 and 300 kg.',
    },
  },

  lifestyle: {
    eyebrow: 'Lifestyle',
    headline: 'Your daily habits',
    subtitle: 'Six quick questions about how you live day to day.',
    advanceLabel: 'Continue',
    unansweredPrompt: 'Choose an answer to continue.',
  },

  medical: {
    eyebrow: 'Medical history',
    headline: 'Has a doctor diagnosed you with anything?',
    subtitle: 'Add what applies and skip the rest. Each list is searchable.',
    advanceLabel: 'Continue',
    sections: {
      existingConditions: 'Existing conditions',
      allergies: 'Allergies',
      currentMedications: 'Current medications',
    },
    searchPlaceholder: 'Search',
    addCustomLabel: 'Add your own',
    capMessage: 'You can add up to 50 entries.',
  },

  family: {
    eyebrow: 'Family history',
    headline: 'Does anything run in your family?',
    subtitle:
      'Tap any condition a parent, sibling or grandparent has had. Skip this if none apply.',
    advanceLabel: 'Continue',
    supporting:
      'Tap any condition a parent, sibling or grandparent has had. We use this to flag inherited risk, never to diagnose you.',
  },

  location: {
    eyebrow: 'Location',
    headline: 'Where do you live?',
    subtitle: 'Your city lets us point you to nearby care and realistic local costs.',
    advanceLabel: 'Analyse my profile',
    stateLabel: 'State',
    stateValue: 'Karnataka',
    cityLabel: 'City',
    cityPlaceholder: 'Choose your city',
    cityPickerUnavailable: 'The city list could not load',
    cityRequiredError: 'Choose a city to continue.',
  },

  analyzing: {
    eyebrow: '',
    headline: 'Analysing your profile',
    subtitle: 'This usually takes a few seconds.',
    error: {
      headline: 'Could not reach the analysis service',
      subtitle: 'Check your connection, then try again.',
      retryLabel: 'Try again',
      cancelLabel: 'Cancel',
    },
  },

  result: {
    eyebrow: 'Your Eunoia profile',
    // The headline number is the risk score: the component bars and the
    // drivers listed under it are risk points that add up to it.
    scoreLabel: 'Risk score',
    scoreOutOf: 'out of 100 · lower is better',
    riskLabel: 'Risk level',
    aiUnavailableMessage:
      'Your risk indicators are ready. Personalised insights could not load and will be retried later.',
    sections: {
      preventiveInsights: 'Preventive insights',
      lifestyleOptimization: 'Lifestyle optimization',
      mentalWellness: 'Mental wellness',
      hereditaryIndicators: 'Hereditary risk indicators',
      longTermAwareness: 'Long-term wellness awareness',
      habitOptimization: 'Habit optimization',
      trendPlaceholder: 'Trend insights coming soon',
    },
    primaryCta: 'Go to home',
    saveErrorMessage:
      'Your report was not saved. Tap to try again.',
  },
} as const;

export type OnboardingCopy = typeof ONBOARDING_COPY;

// ── Medical catalogues ─────────────────────────────────────────
// Local fallbacks. `GET /api/health/catalog` is the source of truth so new
// options do not have to be hand-synced into the app — the same pattern
// `getCities` + KARNATAKA_CITIES_FALLBACK already uses. These keep the
// screens usable offline and on a first paint.
//
// Keep names in step with `backend/risk_engine.py::CONDITION_BASE`: an
// unrecognised condition still scores, but at a generic default weight rather
// than its real one.

export const CONDITION_OPTIONS: readonly string[] = [
  'Hypertension',
  'Type 2 Diabetes',
  'Type 1 Diabetes',
  'High Cholesterol',
  'Asthma',
  'COPD',
  'Heart Disease',
  'Chronic Kidney Disease',
  'Stroke',
  'Hypothyroidism',
  'Hyperthyroidism',
  'PCOS/PCOD',
  'Depression',
  'Anxiety',
  'GERD/Acid Reflux',
  'Arthritis',
  'Migraine',
  'Anemia',
  'Cancer',
];

export const MEDICATION_OPTIONS: readonly string[] = [
  'Metformin',
  'Insulin',
  'Levothyroxine',
  'Atorvastatin',
  'Amlodipine',
  'Losartan',
  'Telmisartan',
  'Omeprazole',
  'Pantoprazole',
  'Salbutamol Inhaler',
  'Aspirin (Low-dose)',
  'Iron supplements',
  'Vitamin D',
  'Vitamin B12',
  'Multivitamin',
  'Birth control pill',
];

export const ALLERGY_OPTIONS: readonly string[] = [
  'Penicillin',
  'Sulfa drugs',
  'Aspirin/NSAIDs',
  'Pollen',
  'Dust mites',
  'Peanuts',
  'Tree nuts',
  'Shellfish',
  'Eggs',
  'Dairy/Lactose',
  'Gluten',
  'Latex',
  'Bee stings',
];

/**
 * Case-insensitive substring filter. An empty query returns the list
 * unchanged. Pure, so it is safe to call during render.
 */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...options];
  return options.filter((option) => option.toLowerCase().includes(q));
}
