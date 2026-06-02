/**
 * Frontend client for the Eunoia Medical Cost Estimator API.
 *
 * The estimator is deterministic on the backend; this module is a thin typed
 * wrapper over `POST /api/cost-estimate` and friends. Network errors are
 * normalized to `Error` instances so the screen can render a calm retry UI.
 */

import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from './api';

// ── Types (mirror the FastAPI Pydantic models in `server.py`) ─────────────

export interface CostBand {
  min: number;
  max: number;
}

export interface CostBreakdown {
  consultation?: CostBand | null;
  tests?: CostBand | null;
  medication?: CostBand | null;
  procedure?: CostBand | null;
  hospitalization?: CostBand | null;
}

export interface RecommendedDoctor {
  name: string;
  specialization: string;
  qualification?: string | null;
  experience_years?: number | null;
  consultation_fee?: number | null;
  availability?: string | null;
  timing?: string | null;
}

export interface MatchedHospital {
  name: string;
  city: string;
  district: string;
  hospital_type: string;
  specialization: string;
  rating: number;
  cost_level: string; // "Low" | "Medium" | "Mid" | "High"
  relevance_score: number;

  // Bangalore-only enrichment (sourced from blr.xlsx). Null/empty for every
  // other Karnataka city so the existing layout renders unchanged.
  area?: string | null;
  tier?: string | null; // "Low" | "Mid" | "High"
  accreditation?: string | null;
  total_beds?: number | null;
  consultation_fee_min?: number | null;
  consultation_fee_max?: number | null;
  estimated_cost_min?: number | null;
  estimated_cost_max?: number | null;
  doctors?: RecommendedDoctor[];
}

export interface CostEstimateRequest {
  condition: string;
  city?: string;
  severity?: 'Mild' | 'Moderate' | 'Severe';
  hospital_tier?: 'Low' | 'Medium' | 'High';
  consultation_type?: 'General' | 'Specialist' | 'Follow_up' | 'Tele';
  save_history?: boolean;
}

export interface CostEstimateResponse {
  id: number | null;
  city: string;
  condition: { key: string; label: string };
  tier: 'Low' | 'Medium' | 'High' | 'Auto';
  severity: 'mild' | 'moderate' | 'severe';
  consultation_type: 'general' | 'specialist' | 'follow_up' | 'tele';

  // Final (refined when applied, baseline otherwise)
  estimated_total_min: number;
  estimated_total_max: number;
  breakdown: CostBreakdown;

  // Per-tier breakdown (auto only)
  tier_breakdown: Record<string, CostBand>;
  present_tiers: string[];

  // Deterministic baseline kept alongside the refined values
  baseline_total_min: number;
  baseline_total_max: number;
  baseline_breakdown: CostBreakdown;

  // Hard pricing envelope the refinement layer was constrained to
  allowed_range: CostBand;
  allowed_components: Record<string, CostBand>;

  matched_hospitals: MatchedHospital[];
  confidence_note: string;
  relevance_summary: string;

  // True when the estimate came from the Bangalore-specific (blr.xlsx)
  // pipeline, which attaches doctor recommendations + consultation fees.
  bangalore_mode?: boolean;

  // Specialization the symptom text was routed to (Bangalore pipeline only).
  mapped_specialization?: string | null;

  // AI-assisted refinement metadata
  refinement_applied: boolean;
  refinement_reasoning: string[];
  refinement_decline_reason: string | null;

  created_at: string | null;
}

export interface CostConditionsCatalog {
  conditions: Array<{
    key: string;
    label: string;
    specializations: string[];
    requires_hospitalization: boolean;
  }>;
  severities: Array<'Mild' | 'Moderate' | 'Severe'>;
  hospital_tiers: Array<'Low' | 'Medium' | 'High'>;
  consultation_types: Array<'General' | 'Specialist' | 'Follow_up' | 'Tele'>;
}

export interface CostEstimateHistoryItem {
  id: number;
  city: string;
  condition_label: string;
  condition_key: string;
  tier: string;
  severity: string;
  consultation_type: string;
  estimated_total_min: number;
  estimated_total_max: number;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toError(err: unknown, fallback: string): Error {
  const ax = err as AxiosError<any>;
  const detail = ax?.response?.data?.detail;
  if (typeof detail === 'string' && detail.length > 0) return new Error(detail);
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return new Error(first);
    if (first && typeof first.msg === 'string') return new Error(first.msg);
  }
  if (ax?.message) return new Error(ax.message);
  return new Error(fallback);
}

// ── Endpoints ────────────────────────────────────────────────────────────

export async function getCostConditions(token: string): Promise<CostConditionsCatalog> {
  try {
    const res = await axios.get<CostConditionsCatalog>(
      `${API_BASE_URL}/api/cost-estimate/conditions`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data;
  } catch (err) {
    throw toError(err, 'Failed to load conditions');
  }
}

export async function createCostEstimate(
  token: string,
  body: CostEstimateRequest,
): Promise<CostEstimateResponse> {
  try {
    const res = await axios.post<CostEstimateResponse>(
      `${API_BASE_URL}/api/cost-estimate`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data;
  } catch (err) {
    throw toError(err, 'Failed to generate cost estimate');
  }
}

export async function getCostEstimateHistory(
  token: string,
  limit = 20,
): Promise<CostEstimateHistoryItem[]> {
  try {
    const res = await axios.get<CostEstimateHistoryItem[]>(
      `${API_BASE_URL}/api/cost-estimate/history?limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data;
  } catch (err) {
    throw toError(err, 'Failed to load cost estimate history');
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────

const inrFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

export function formatINR(value: number): string {
  return `₹${inrFormatter.format(Math.max(0, Math.round(value)))}`;
}

export function formatRange(band: CostBand): string {
  if (band.min === band.max) return formatINR(band.min);
  return `${formatINR(band.min)} – ${formatINR(band.max)}`;
}


// ── User profile (for auto-filling city from onboarding) ─────────────────

export interface UserMe {
  username: string;
  name: string | null;
  email: string | null;
  preferred_city: string | null;
  preferred_state: string | null;
}

export async function getMe(token: string): Promise<UserMe> {
  try {
    const res = await axios.get<UserMe>(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    throw toError(err, 'Failed to load profile');
  }
}
