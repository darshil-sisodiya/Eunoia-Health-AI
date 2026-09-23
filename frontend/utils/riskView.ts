// ── Risk presentation logic ─────────────────────────────────────
// PURE. Turns a risk report into things a screen can render directly.
//
// The colour mapping lives here because `RiskLevel` gained a fourth value.
// The old inline ternary in home.tsx fell through to its `else` for anything
// it did not name, so 'Very High' would have rendered in the calm accent tone
// — identical to 'Low'. A single mapping makes that impossible to get wrong
// in one screen and right in another.

import type {
  AnalyzeRiskResponse,
  ComponentScore,
  ContributingFactor,
  RiskComponent,
  RiskLevel,
} from './onboardingApi';

export interface RiskTone {
  /** Semantic token names, resolved against `constants/theme.ts` by the caller
   *  so this module stays free of react-native imports. */
  fg: 'accent' | 'warning' | 'error' | 'textPrimary';
  bg: 'accentMuted' | 'warningSoft' | 'errorSoft' | 'backgroundTertiary';
}

const TONES: Record<RiskLevel, RiskTone> = {
  Low: { fg: 'accent', bg: 'accentMuted' },
  Moderate: { fg: 'warning', bg: 'warningSoft' },
  High: { fg: 'error', bg: 'errorSoft' },
  // Deliberately the same hue as High but rendered on the strong surface, so
  // it reads as more severe rather than as a different category of thing.
  'Very High': { fg: 'error', bg: 'errorSoft' },
};

export function riskTone(level: RiskLevel | null | undefined): RiskTone {
  if (!level) return { fg: 'textPrimary', bg: 'backgroundTertiary' };
  return TONES[level] ?? { fg: 'textPrimary', bg: 'backgroundTertiary' };
}

/** 'Very High' warrants heavier emphasis than a soft background alone. */
export function isSevere(level: RiskLevel | null | undefined): boolean {
  return level === 'Very High';
}

export const COMPONENT_LABELS: Record<RiskComponent, string> = {
  conditions: 'Conditions',
  cardiovascular: 'Heart & circulation',
  metabolic: 'Metabolic',
  mental_wellness: 'Mind & sleep',
  hereditary: 'Family history',
};

const COMPONENT_ORDER: RiskComponent[] = [
  'conditions',
  'cardiovascular',
  'metabolic',
  'mental_wellness',
  'hereditary',
];

export interface ComponentBar {
  id: RiskComponent;
  label: string;
  score: number;
  cap: number;
  /** 0..1 against the component's own cap — an ABSOLUTE scale. */
  fraction: number;
  atCap: boolean;
}

/**
 * Absolute component bars.
 *
 * Replaces the old `aggregateByComponent`, which summed raw factor deltas and
 * normalised them against the largest bucket. That made every user's worst
 * component a full-width bar, so a Low-risk user looked maxed out. Scoring
 * against the engine's published cap is the whole point of returning caps.
 */
export function componentBars(report: AnalyzeRiskResponse | null): ComponentBar[] {
  const components = report?.components;
  if (!components) return [];

  return COMPONENT_ORDER.filter((id) => components[id]).map((id) => {
    const bucket = components[id] as ComponentScore;
    const cap = bucket.cap || 1;
    return {
      id,
      label: COMPONENT_LABELS[id],
      score: bucket.score,
      cap: bucket.cap,
      fraction: Math.max(0, Math.min(1, bucket.score / cap)),
      atCap: bucket.score >= bucket.cap,
    };
  });
}

export interface DriverRow extends ContributingFactor {
  label: string;
  kind: 'reported' | 'measured' | 'unassessed';
}

/** The biggest contributors, worst first. */
export function topDrivers(
  report: AnalyzeRiskResponse | null,
  limit = 5,
): DriverRow[] {
  const factors = report?.contributing_factors ?? [];
  return [...factors]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit)
    .map((factor) => ({
      ...factor,
      label: factor.label || factor.dimension,
      kind: factor.kind ?? 'reported',
    }));
}

/** Factors that exist because something is NOT known. These drive the
 *  "get this checked" prompts and must never be styled as findings. */
export function unassessedFactors(report: AnalyzeRiskResponse | null): DriverRow[] {
  return topDrivers(report, Number.MAX_SAFE_INTEGER).filter((f) => f.kind === 'unassessed');
}

export interface FactorLink {
  pathname: string;
  params?: Record<string, string>;
}

/**
 * Where a factor can be acted on.
 *
 * A risk report that only names problems is a diagnosis. Pointing each one at
 * the part of the app that can change it is what makes it a plan. Family
 * history deliberately returns null — nothing can be done about it, and
 * offering an action would be dishonest.
 */
export function linkForFactor(dimension: string): FactorLink | null {
  if (dimension.startsWith('family_history.')) return null;

  if (dimension.startsWith('vitals.')) {
    return { pathname: '/profile/edit/vitals' };
  }
  if (dimension.startsWith('condition.')) {
    return { pathname: '/profile/edit/conditions' };
  }
  if (dimension === 'lifestyle.activity' || dimension === 'lifestyle.exercise_frequency'
      || dimension === 'lifestyle.sedentary') {
    return { pathname: '/(tabs)/home', params: { focus: 'steps' } };
  }
  if (dimension === 'lifestyle.stress_level' || dimension.startsWith('mental.')) {
    return { pathname: '/(tabs)/home', params: { focus: 'meditation' } };
  }
  if (dimension.startsWith('lifestyle.sleep')) {
    return { pathname: '/profile/edit/lifestyle' };
  }
  if (dimension === 'basic.bmi') {
    return { pathname: '/profile/edit/goals' };
  }
  if (dimension === 'basic.age') return null;

  if (dimension.startsWith('lifestyle.')) {
    return { pathname: '/profile/edit/lifestyle' };
  }
  return null;
}

export function routeForSection(sectionId: string): string {
  return `/profile/edit/${sectionId}`;
}

/** Copy for the confidence pill. Below 100% we say why, not just how much. */
export function confidenceLabel(report: AnalyzeRiskResponse | null): string | null {
  const confidence = report?.confidence;
  if (!confidence) return null;
  if (confidence.confidence >= 100) return 'Based on everything you told us';

  const missing = confidence.missing ?? [];
  if (missing.length === 0) return `${confidence.confidence}% confidence`;
  if (missing.length === 1) return `${confidence.confidence}% confidence — ${missing[0].label} not known`;
  return `${confidence.confidence}% confidence — ${missing.length} things not yet known`;
}
