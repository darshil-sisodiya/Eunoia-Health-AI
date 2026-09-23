import axios from 'axios';
import { API_BASE_URL } from './api';

// ==================== Domain Types ====================

export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
export type Smoking = 'never' | 'former' | 'occasional' | 'regular';
export type Alcohol = 'never' | 'occasional' | 'moderate' | 'frequent';
export type ExerciseFrequency = 'never' | 'occasional' | 'regular' | 'daily';
export type WaterIntake = 'low' | 'moderate' | 'high';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'excellent';
export type StressLevel = 'low' | 'moderate' | 'high';
// 'Very High' was added when the risk engine's component caps were rebalanced
// to sum to 100. Anything that maps a level to a colour must handle it
// explicitly - a fall-through `else` renders it as the calm Low tone.
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Very High';
export type RiskComponent =
  | 'conditions'
  | 'cardiovascular'
  | 'metabolic'
  | 'mental_wellness'
  | 'hereditary';

export type DiagnosedBucket = 'lt_1y' | '1_5y' | '5_10y' | 'gt_10y' | 'unknown';
export type ControlLevel = 'well' | 'partly' | 'poorly' | 'unsure';
export type TreatmentMode = 'none' | 'lifestyle' | 'medication' | 'both';
export type Severity = 'mild' | 'moderate' | 'severe';
export type StartedBucket = 'lt_1m' | '1_6m' | '6_12m' | '1_5y' | 'gt_5y' | 'unknown';
export type MedFrequency = 'od' | 'bd' | 'tds' | 'qds' | 'prn' | 'weekly' | 'other';
export type Adherence = 'always' | 'mostly' | 'sometimes' | 'rarely' | 'unknown';
export type AllergyCategory = 'drug' | 'food' | 'environmental' | 'other';
export type AllergyReaction =
  | 'mild_rash' | 'hives' | 'swelling' | 'breathing' | 'anaphylaxis' | 'unknown';
export type Relation = 'mother' | 'father' | 'sibling' | 'child' | 'grandparent' | 'other';
export type OnsetBucket = 'lt_50' | '50_70' | 'gt_70' | 'unknown';
export type SmokelessTobacco = 'never' | 'former' | 'occasional' | 'daily';
export type DietType = 'vegetarian' | 'vegan' | 'eggetarian' | 'non_vegetarian';
export type CookingFuel = 'lpg' | 'electric' | 'biomass' | 'kerosene' | 'mixed';
export type ScreeningRecency = 'lt_6m' | '6_12m' | '1_3y' | 'gt_3y' | 'never';

export type HereditaryCondition =
  | 'Diabetes'
  | 'Hypertension'
  | 'Heart Disease'
  | 'Asthma'
  | 'Cancer'
  | 'Mental Health Disorders'
  | 'Thyroid Disorders'
  | 'Obesity';

export interface BasicProfile {
  full_name: string;
  age: number;
  gender: Gender;
  height_cm: number;
  weight_kg: number;
}

export interface Lifestyle {
  // The six original ordinals stay required, so the request shape older
  // builds send is still valid.
  smoking: Smoking;
  alcohol: Alcohol;
  exercise_frequency: ExerciseFrequency;
  water_intake: WaterIntake;
  sleep_quality: SleepQuality;
  stress_level: StressLevel;

  // Quantities. The risk engine prefers these over the ordinal above whenever
  // one is present: "regular" smoking covered both 2/day and 40/day.
  cigarettes_per_day?: number | null;
  smoking_years?: number | null;
  smokeless_tobacco?: SmokelessTobacco | null;
  alcohol_units_per_week?: number | null;
  exercise_minutes_per_week?: number | null;
  sedentary_hours_per_day?: number | null;
  sleep_hours?: number | null;
  diet_type?: DietType | null;
  fruit_veg_servings?: number | null;
  fried_food_per_week?: number | null;
  sugary_drinks_per_week?: number | null;
  cooking_fuel?: CookingFuel | null;
}

export interface ConditionEntry {
  name: string;
  diagnosed_bucket: DiagnosedBucket;
  control: ControlLevel;
  treatment: TreatmentMode;
  severity?: Severity | null;
  hospitalised_12m?: boolean;
}

export interface MedicationEntry {
  name: string;
  dose?: string | null;
  frequency?: MedFrequency | null;
  started_bucket: StartedBucket;
  /** Links to a ConditionEntry.name, so a drug is shown with its reason. */
  for_condition?: string | null;
  adherence: Adherence;
}

export interface AllergyEntry {
  allergen: string;
  category: AllergyCategory;
  reaction?: AllergyReaction | null;
}

export interface MedicalHistory {
  conditions: ConditionEntry[];
  medications: MedicationEntry[];
  allergy_entries: AllergyEntry[];

  /** Legacy flat lists, still accepted by the backend. */
  existing_conditions?: string[];
  allergies?: string[];
  current_medications?: string[];
}

export interface FamilyEntry {
  condition: HereditaryCondition;
  relations: Relation[];
  onset_bucket: OnsetBucket;
}

export interface FamilyHistory {
  entries: FamilyEntry[];
  /** Legacy bare-string list. */
  conditions?: HereditaryCondition[];
}

/**
 * A vitals value is a number, or explicitly unknown, or never asked.
 * Those three states must stay distinguishable: an explicit "I don't know"
 * counts toward profile completeness but lowers assessment confidence, while
 * never-asked lowers both. Collapsing them is what made missing data read as
 * healthy.
 */
export interface Vitals {
  systolic_mmhg?: number | null;
  diastolic_mmhg?: number | null;
  fasting_glucose_mgdl?: number | null;
  hba1c_percent?: number | null;
  total_cholesterol_mgdl?: number | null;
  hdl_mgdl?: number | null;
  ldl_mgdl?: number | null;
  triglycerides_mgdl?: number | null;
  resting_hr_bpm?: number | null;
  waist_cm?: number | null;
  measured_on?: string | null;
  /** Field names the user explicitly marked "I don't know". */
  declared_unknown: string[];
}

export type VitalKey =
  | 'systolic_mmhg'
  | 'diastolic_mmhg'
  | 'fasting_glucose_mgdl'
  | 'hba1c_percent'
  | 'total_cholesterol_mgdl'
  | 'hdl_mgdl'
  | 'ldl_mgdl'
  | 'triglycerides_mgdl'
  | 'resting_hr_bpm'
  | 'waist_cm';

/** PHQ-2 and GAD-2. Each item 0..3; a total of 3 or more is screen-positive. */
export interface MentalHealth {
  phq2_interest?: number | null;
  phq2_down?: number | null;
  gad2_nervous?: number | null;
  gad2_worry?: number | null;
}

export interface WomensHealth {
  cycle_regularity?: 'regular' | 'irregular' | 'absent' | 'unsure' | null;
  pregnancy_status?: 'no' | 'pregnant' | 'trying' | 'postpartum' | 'prefer_not_say' | null;
  menopause_status?: 'pre' | 'peri' | 'post' | 'unsure' | null;
  contraception?: string | null;
  last_pap_bucket?: 'lt_1y' | '1_3y' | 'gt_3y' | 'never' | 'unsure' | null;
  last_mammogram_bucket?: 'lt_1y' | '1_3y' | 'gt_3y' | 'never' | 'unsure' | null;
}

export interface ScreeningHistory {
  last_bp_check?: ScreeningRecency | null;
  last_blood_sugar?: ScreeningRecency | null;
  last_lipid_panel?: ScreeningRecency | null;
  last_dental?: ScreeningRecency | null;
  last_eye_exam?: ScreeningRecency | null;
  last_full_checkup?: ScreeningRecency | null;
}

export interface Insurance {
  has_insurance?: boolean | null;
  provider?: string | null;
  sum_insured_band?: 'lt_2l' | '2_5l' | '5_10l' | '10_25l' | 'gt_25l' | 'unsure' | null;
  out_of_pocket_band?: 'lt_5k' | '5_25k' | '25_1l' | 'gt_1l' | null;
  has_regular_doctor?: boolean | null;
}

export interface Goals {
  primary_concern?: string | null;
  focus_areas: string[];
  target_steps?: number | null;
  target_weight_kg?: number | null;
}

export interface Location {
  state: 'Karnataka';
  city: string;
}

export interface AnalyzeRiskRequest {
  basic: BasicProfile;
  lifestyle: Lifestyle;
  medical: MedicalHistory;
  family_history: FamilyHistory;
  location: Location;
  // Optional so a payload built before these screens existed still validates.
  vitals?: Vitals | null;
  mental?: MentalHealth | null;
  womens_health?: WomensHealth | null;
  screening?: ScreeningHistory | null;
  insurance?: Insurance | null;
  goals?: Goals | null;
}

/**
 * `kind` drives how the factor is rendered:
 *   reported   - the user told us
 *   measured   - taken from a real number or device data
 *   unassessed - risk added because something is NOT known. These must look
 *                different from the others, or missing data reads as a finding.
 */
export interface ContributingFactor {
  dimension: string;
  component: RiskComponent;
  delta: number;
  label?: string;
  kind?: 'reported' | 'measured' | 'unassessed';
  multiplier?: number | null;
  explanation?: string;
}

/** A component total with its cap, so bars can be drawn on an absolute scale. */
export interface ComponentScore {
  score: number;
  cap: number;
}

export interface MissingEvidence {
  id: string;
  label: string;
  state: 'unknown' | 'unasked';
}

export interface Confidence {
  confidence: number;
  completeness: number;
  missing: MissingEvidence[];
}

/** A validated instrument (FINDRISC, PHQ-2, GAD-2) on its own scale. */
export interface SubScore {
  id: string;
  label: string;
  score: number;
  max: number;
  band: string;
  detail: string;
}

export interface GeminiInsights {
  preventive_health_insights: string;
  lifestyle_recommendations: string;
  diet_suggestions: string;
  exercise_guidance: string;
  mental_wellness_improvements: string;
  long_term_wellness_awareness: string;
  habit_optimization_recommendations: string;
}

export interface AnalyzeRiskResponse {
  report_id: number;
  wellness_score: number;
  risk_score: number;
  risk_level: RiskLevel;
  contributing_factors: ContributingFactor[];
  insights: GeminiInsights | null;
  ai_insights_unavailable: boolean;
  created_at: string;
  /** Optional: reports persisted before these fields existed omit them. */
  components?: Record<string, ComponentScore>;
  confidence?: Confidence | null;
  subscores?: SubScore[];
}

export interface CitiesResponse {
  Karnataka: string[];
  [state: string]: string[];
}

export interface SaveReportRequest {
  wellness_score: number;
  risk_score: number;
  risk_level: RiskLevel;
  contributing_factors: ContributingFactor[];
  insights: GeminiInsights | null;
  ai_insights_unavailable: boolean;
  payload_snapshot: AnalyzeRiskRequest;
}

export interface SaveReportResponse {
  id: number;
  created_at: string;
}


// ==================== Onboarding draft ====================

/**
 * The in-progress onboarding submission.
 *
 * Every slice is nullable or empty-able because a draft is, by definition,
 * partial — and the step predicates in `constants/onboardingSteps.ts` run
 * against it during resume, so they must tolerate any half-filled shape.
 */
export interface OnboardingDraft {
  basic: BasicProfile | null;
  lifestyle: Partial<Lifestyle> | null;
  medical: MedicalHistory;
  family: FamilyEntry[];
  location: Location | null;
  vitals: Vitals | null;
  mental: MentalHealth | null;
  womens_health: WomensHealth | null;
  /**
   * Answered on the conditions step. Someone with no diagnosed condition may
   * still take something (a supplement, contraception), so this is asked
   * rather than inferred, and it gates the medications step.
   */
  takes_medication?: boolean | null;
}


// ==================== Endpoints ====================

const ANALYZE_RISK_URL = `${API_BASE_URL}/api/analyze-risk`;
const CITIES_URL = `${API_BASE_URL}/api/cities`;
const SAVE_REPORT_URL = `${API_BASE_URL}/api/save-report`;
const REPORTS_URL = `${API_BASE_URL}/api/reports`;

const CITIES_TIMEOUT_MS = 3000;

// ==================== API Functions ====================

/**
 * POST /api/analyze-risk
 * Submits the full onboarding payload, returns Risk Engine + Gemini output.
 * Errors propagate so the caller (analyzing screen) drives retry/cancel UI.
 */
export async function analyzeRisk(
  payload: AnalyzeRiskRequest,
  token: string,
  signal?: AbortSignal,
): Promise<AnalyzeRiskResponse> {
  const response = await axios.post<AnalyzeRiskResponse>(ANALYZE_RISK_URL, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal,
  });
  return response.data;
}

/**
 * GET /api/cities
 * Public endpoint. Returns the canonical Karnataka city list.
 * Runs with a 3-second timeout; the caller handles fallback to
 * KARNATAKA_CITIES_FALLBACK on any rejection (timeout / network / non-2xx).
 */
export async function getCities(signal?: AbortSignal): Promise<CitiesResponse> {
  const response = await axios.get<CitiesResponse>(CITIES_URL, {
    timeout: CITIES_TIMEOUT_MS,
    signal,
  });
  return response.data;
}

/**
 * POST /api/save-report
 * Persists a Risk_Report under the authenticated user. Returns the new id.
 */
export async function saveReport(
  payload: SaveReportRequest,
  token: string,
): Promise<SaveReportResponse> {
  const response = await axios.post<SaveReportResponse>(SAVE_REPORT_URL, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

/**
 * GET /api/reports
 * Returns the authenticated user's risk report history, ordered by created_at DESC.
 */
export async function getReports(token: string): Promise<AnalyzeRiskResponse[]> {
  const response = await axios.get<AnalyzeRiskResponse[]>(REPORTS_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

// ==================== Profile bundle / progressive profiling ====================

/** Server-computed. The client renders it and never recomputes it, so the
 *  completeness meter can never disagree with the risk engine's confidence. */
export interface CompletenessSection {
  id: string;
  label: string;
  done: boolean;
  weight: number;
}

export interface NextBestAction {
  section_id: string;
  title: string;
  body: string;
  cta: string;
}

export interface Completeness {
  percent: number;
  sections: CompletenessSection[];
  next_best: NextBestAction | null;
}

/** The persisted `health_profiles` row plus its JSON columns. Loosely typed
 *  because it is a DB row, not a request body. */
export interface StoredProfile {
  age?: number | null;
  gender?: Gender | null;
  height?: number | null;
  weight?: number | null;
  blood_group?: string | null;
  health_persona?: string | null;
  smoking?: Smoking | null;
  smokeless_tobacco?: SmokelessTobacco | null;
  alcohol?: Alcohol | null;
  exercise_frequency?: ExerciseFrequency | null;
  exercise_minutes_per_week?: number | null;
  sedentary_hours_per_day?: number | null;
  sleep_quality?: SleepQuality | null;
  sleep_hours?: number | null;
  stress_level?: StressLevel | null;
  diet_type?: DietType | null;
  water_intake?: WaterIntake | null;
  fruit_veg_servings?: number | null;
  cooking_fuel?: CookingFuel | null;
  phq2_interest?: number | null;
  phq2_down?: number | null;
  gad2_nervous?: number | null;
  gad2_worry?: number | null;
  womens_health?: WomensHealth | null;
  screening_history?: ScreeningHistory | null;
  insurance?: Insurance | null;
  goals?: Goals | null;
  [key: string]: unknown;
}

export interface StoredCondition extends ConditionEntry {
  id?: number;
}

export interface StoredMedication extends MedicationEntry {
  id?: number;
}

export interface StoredAllergy extends AllergyEntry {
  id?: number;
}

export interface StoredFamilyEntry {
  condition: HereditaryCondition;
  relation: string;
  onset_bucket: OnsetBucket;
}

export interface StoredVitals extends Omit<Vitals, 'declared_unknown'> {
  declared_unknown?: string[] | string | null;
}

/** Everything a screen needs about the current user, in one round trip.
 *  This exists so screens stop each fetching their own disagreeing slice. */
export interface HealthProfileBundle {
  profile: StoredProfile | null;
  conditions: StoredCondition[];
  medications: StoredMedication[];
  allergies: StoredAllergy[];
  vitals: StoredVitals | null;
  family_history: StoredFamilyEntry[];
  latest_report: AnalyzeRiskResponse | null;
  completeness: Completeness;
}

export interface HealthCatalog {
  conditions: string[];
  medications: string[];
  allergies: string[];
  hereditary_conditions: HereditaryCondition[];
  relations: Relation[];
  diagnosed_buckets: DiagnosedBucket[];
  control_levels: ControlLevel[];
  treatments: TreatmentMode[];
  started_buckets: StartedBucket[];
  onset_buckets: OnsetBucket[];
  allergy_categories: AllergyCategory[];
  allergy_reactions: AllergyReaction[];
  vital_ranges: Record<string, { min: number; max: number; normal: [number, number]; unit: string }>;
}

/** One section of the profile. Exactly one field is normally set. */
export interface ProfileSectionPatch {
  vitals?: Vitals;
  conditions?: ConditionEntry[];
  medications?: MedicationEntry[];
  allergies?: AllergyEntry[];
  family?: FamilyEntry[];
  lifestyle?: Partial<Lifestyle>;
  mental?: MentalHealth;
  womens_health?: WomensHealth;
  screening?: ScreeningHistory;
  insurance?: Insurance;
  goals?: Goals;
}

const PROFILE_BUNDLE_URL = `${API_BASE_URL}/api/profile/bundle`;
const PROFILE_SECTION_URL = `${API_BASE_URL}/api/profile`;
const CATALOG_URL = `${API_BASE_URL}/api/health/catalog`;

/**
 * GET /api/profile/bundle
 * The single source of truth behind HealthProfileContext.
 */
export async function getProfileBundle(
  token: string,
  signal?: AbortSignal,
): Promise<HealthProfileBundle> {
  const response = await axios.get<HealthProfileBundle>(PROFILE_BUNDLE_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  return response.data;
}

/**
 * PATCH /api/profile/{section}
 * Returns the whole refreshed bundle, including a recomputed risk report, so
 * the client never has to guess what the new score is.
 */
export async function patchProfileSection(
  section: string,
  patch: ProfileSectionPatch,
  token: string,
): Promise<HealthProfileBundle> {
  const response = await axios.patch<HealthProfileBundle>(
    `${PROFILE_SECTION_URL}/${section}`,
    patch,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  );
  return response.data;
}

/**
 * GET /api/health/catalog
 * Option lists for the onboarding and profile-edit screens. Served from the
 * backend so new options are not hand-synced into the app, the same pattern
 * `getCities` already uses.
 */
export async function getHealthCatalog(signal?: AbortSignal): Promise<HealthCatalog> {
  const response = await axios.get<HealthCatalog>(CATALOG_URL, {
    timeout: CITIES_TIMEOUT_MS,
    signal,
  });
  return response.data;
}
