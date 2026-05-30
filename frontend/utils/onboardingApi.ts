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
export type RiskLevel = 'Low' | 'Moderate' | 'High';
export type RiskComponent = 'cardiovascular' | 'metabolic' | 'wellness' | 'hereditary';

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
  smoking: Smoking;
  alcohol: Alcohol;
  exercise_frequency: ExerciseFrequency;
  water_intake: WaterIntake;
  sleep_quality: SleepQuality;
  stress_level: StressLevel;
}

export interface MedicalHistory {
  existing_conditions: string[];
  allergies: string[];
  current_medications: string[];
}

export interface FamilyHistory {
  conditions: HereditaryCondition[];
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
}

export interface ContributingFactor {
  dimension: string;
  component: RiskComponent;
  delta: number;
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
