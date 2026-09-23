// ── Pure-logic checks ───────────────────────────────────────────
// Run with: npm run check   (node executes TypeScript directly; no jest, no
// babel, no transpiler, no new dependency.)
//
// This covers the two things that break silently and are invisible in review:
// conditional step navigation, and draft parsing/expiry. It also enforces the
// architectural constraint that makes it possible at all — if any module
// under test ever imports react-native or AsyncStorage, this file fails to
// load and `npm run check` goes red.

import assert from 'node:assert/strict';

import {
  inputStepPosition,
  isStepId,
  nextStep,
  prevStep,
  resumeTarget,
  routeForStepId,
  stepIndex,
  totalSteps,
  visibleSteps,
} from '../onboardingFlow.ts';
import {
  DRAFT_KEY,
  DRAFT_TTL_MS,
  EMPTY_DRAFT,
  parseStoredDraft,
  serializeDraft,
} from '../onboardingDraftShape.ts';
import {
  buildAnalyzePayload,
  hasAllLifestyleAnswers,
  isSubmittable,
} from '../onboardingPayload.ts';
import {
  componentBars,
  confidenceLabel,
  linkForFactor,
  riskTone,
  topDrivers,
  unassessedFactors,
} from '../riskView.ts';

const checks: string[] = [];
function check(name: string, fn: () => void) {
  fn();
  checks.push(name);
}

// ---------------------------------------------------------------------------
// Draft fixtures
// ---------------------------------------------------------------------------

const male = {
  ...EMPTY_DRAFT,
  basic: { full_name: 'A', age: 30, gender: 'male', height_cm: 175, weight_kg: 75 },
} as any;

const female = {
  ...EMPTY_DRAFT,
  basic: { full_name: 'B', age: 30, gender: 'female', height_cm: 165, weight_kg: 60 },
} as any;

const withCondition = {
  ...male,
  medical: {
    conditions: [{ name: 'Type 2 Diabetes', diagnosed_bucket: 'gt_10y', control: 'poorly', treatment: 'medication' }],
    medications: [],
    allergy_entries: [],
  },
} as any;

// ---------------------------------------------------------------------------
// Conditional steps
// ---------------------------------------------------------------------------

check('female sees exactly one more step than male', () => {
  assert.equal(totalSteps(female), totalSteps(male) + 1);
});

check('womens step is hidden for male', () => {
  assert.ok(!visibleSteps(male).some((s) => s.id === 'womens'));
  assert.ok(visibleSteps(female).some((s) => s.id === 'womens'));
});

check('medications step appears only when there is something to treat', () => {
  assert.ok(!visibleSteps(male).some((s) => s.id === 'medications'));
  assert.ok(visibleSteps(withCondition).some((s) => s.id === 'medications'));
});

check('takes_medication also unlocks the medications step', () => {
  const noConditionsButMedicated = { ...male, takes_medication: true } as any;
  assert.ok(visibleSteps(noConditionsButMedicated).some((s) => s.id === 'medications'));
});

check('navigation skips hidden steps', () => {
  assert.equal(nextStep(male, 'mental')!.id, 'location');
  assert.equal(nextStep(female, 'mental')!.id, 'womens');
  assert.equal(nextStep(male, 'conditions')!.id, 'family');
  assert.equal(nextStep(withCondition, 'conditions')!.id, 'medications');
});

check('backward navigation skips hidden steps too', () => {
  assert.equal(prevStep(male, 'location')!.id, 'mental');
  assert.equal(prevStep(female, 'location')!.id, 'womens');
});

check('navigation terminates at both ends', () => {
  assert.equal(prevStep(male, 'welcome'), null);
  assert.equal(nextStep(male, 'analyzing'), null);
});

check('step indices shift when a step is inserted', () => {
  assert.ok(stepIndex(female, 'location') > stepIndex(male, 'location'));
  assert.equal(stepIndex(male, 'womens'), 0); // not in this user's flow
});

check('progress counts only steps that ask something', () => {
  const { index, total } = inputStepPosition(male, 'basic');
  assert.equal(index, 1); // welcome is not counted
  assert.equal(total, totalSteps(male) - 2); // minus welcome and analyzing
});

// ---------------------------------------------------------------------------
// Resume — the case the old index map could not express
// ---------------------------------------------------------------------------

check('resume snaps forward when the stored step no longer applies', () => {
  // Answered as female, reached the womens step, then changed to male.
  assert.equal(resumeTarget(male, 'womens'), 'location');
});

check('resume snaps forward when a condition is removed', () => {
  assert.equal(resumeTarget(male, 'medications'), 'family');
});

check('resume keeps a step that still applies', () => {
  assert.equal(resumeTarget(female, 'womens'), 'womens');
  assert.equal(resumeTarget(male, 'lifestyle'), 'lifestyle');
});

check('resume falls back to welcome on garbage', () => {
  assert.equal(resumeTarget(male, 'not-a-step'), 'welcome');
  assert.equal(resumeTarget(male, undefined), 'welcome');
  assert.equal(resumeTarget(male, 7), 'welcome');
});

check('every step id resolves to a route', () => {
  for (const node of visibleSteps(female)) {
    assert.equal(routeForStepId(node.id), node.route);
    assert.ok(isStepId(node.id));
  }
});

// ---------------------------------------------------------------------------
// Draft persistence
// ---------------------------------------------------------------------------

const now = Date.now();

check('a fresh draft round-trips', () => {
  const parsed = parseStoredDraft(serializeDraft('vitals', male, now), now);
  assert.ok(parsed);
  assert.equal(parsed!.currentStepId, 'vitals');
  assert.equal(parsed!.data.basic!.gender, 'male');
});

check('an expired draft is discarded', () => {
  const raw = serializeDraft('vitals', male, now);
  assert.equal(parseStoredDraft(raw, now + DRAFT_TTL_MS + 1), null);
  assert.ok(parseStoredDraft(raw, now + DRAFT_TTL_MS - 1));
});

check('the TTL is long enough to survive leaving the app', () => {
  // A 30-minute window would destroy real work now the flow is resumable.
  assert.ok(DRAFT_TTL_MS >= 24 * 60 * 60 * 1000);
});

check('the draft key is versioned past v1', () => {
  assert.ok(DRAFT_KEY.endsWith('.v2'));
});

check('malformed drafts are discarded, not thrown', () => {
  assert.equal(parseStoredDraft('{not json', now), null);
  assert.equal(parseStoredDraft(null, now), null);
  assert.equal(parseStoredDraft('null', now), null);
  assert.equal(parseStoredDraft('{}', now), null); // no updatedAt
  assert.equal(parseStoredDraft('{"updatedAt":"nonsense"}', now), null);
});

check('a partial draft is normalised so screens cannot crash on it', () => {
  const raw = JSON.stringify({ updatedAt: new Date(now).toISOString(), data: {} });
  const parsed = parseStoredDraft(raw, now);
  assert.ok(parsed);
  assert.deepEqual(parsed!.data.medical.conditions, []);
  assert.deepEqual(parsed!.data.family, []);
  assert.equal(parsed!.currentStepId, 'welcome');
});

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

const submittable = {
  ...withCondition,
  lifestyle: {
    smoking: 'never', alcohol: 'never', exercise_frequency: 'daily',
    water_intake: 'high', sleep_quality: 'good', stress_level: 'low',
  },
  location: { state: 'Karnataka', city: 'Bengaluru' },
} as any;

check('submittability requires basic, city and every lifestyle answer', () => {
  assert.ok(isSubmittable(submittable));
  assert.ok(!isSubmittable(male));
  assert.ok(!isSubmittable({ ...submittable, location: null }));
  assert.ok(!hasAllLifestyleAnswers({ ...submittable, lifestyle: { smoking: 'never' } }));
});

check('the payload nests family entries under family_history', () => {
  const payload = buildAnalyzePayload(submittable);
  assert.ok(Array.isArray(payload.family_history.entries));
  assert.equal(payload.medical.conditions.length, 1);
});

check('optional slices are sent as null, not dropped', () => {
  const payload = buildAnalyzePayload(submittable);
  assert.equal(payload.vitals, null);
  assert.equal(payload.mental, null);
});

check('building an incomplete payload throws rather than sending junk', () => {
  assert.throws(() => buildAnalyzePayload({ ...submittable, basic: null } as any));
});

// ---------------------------------------------------------------------------
// Risk presentation
// ---------------------------------------------------------------------------

check('every risk level has its own tone and Very High is not Low', () => {
  const low = riskTone('Low');
  const veryHigh = riskTone('Very High');
  assert.notDeepEqual(low, veryHigh);
  assert.equal(veryHigh.fg, 'error');
  assert.equal(riskTone('Moderate').fg, 'warning');
  assert.equal(riskTone(null).fg, 'textPrimary');
});

const report = {
  risk_score: 56,
  risk_level: 'High',
  components: {
    conditions: { score: 29, cap: 35 },
    cardiovascular: { score: 12, cap: 25 },
    metabolic: { score: 35, cap: 20 },
  },
  contributing_factors: [
    { dimension: 'condition.type 2 diabetes', component: 'conditions', delta: 29, label: 'Type 2 Diabetes', kind: 'reported' },
    { dimension: 'vitals.blood_pressure_unknown', component: 'cardiovascular', delta: 4, label: 'BP not known', kind: 'unassessed' },
    { dimension: 'lifestyle.activity', component: 'cardiovascular', delta: 5, label: 'Activity', kind: 'measured' },
  ],
  confidence: { confidence: 62, completeness: 80, missing: [{ id: 'bp', label: 'Blood pressure', state: 'unknown' }] },
} as any;

check('component bars are absolute, not normalised to the largest', () => {
  const bars = componentBars(report);
  const conditions = bars.find((b) => b.id === 'conditions')!;
  assert.equal(conditions.fraction, 29 / 35);
  assert.ok(conditions.fraction < 1, 'a below-cap component must not render full');
});

check('a capped component is flagged and clamped', () => {
  const metabolic = componentBars(report).find((b) => b.id === 'metabolic')!;
  assert.equal(metabolic.fraction, 1);
  assert.ok(metabolic.atCap);
});

check('component bars are empty rather than wrong for an old report', () => {
  assert.deepEqual(componentBars({ ...report, components: undefined } as any), []);
  assert.deepEqual(componentBars(null), []);
});

check('drivers are ordered worst first', () => {
  const drivers = topDrivers(report, 2);
  assert.equal(drivers[0].delta, 29);
  assert.equal(drivers.length, 2);
});

check('unassessed factors are separable from findings', () => {
  const unassessed = unassessedFactors(report);
  assert.equal(unassessed.length, 1);
  assert.equal(unassessed[0].dimension, 'vitals.blood_pressure_unknown');
});

check('actionable factors link somewhere, immutable ones do not', () => {
  assert.equal(linkForFactor('family_history.Diabetes'), null);
  assert.equal(linkForFactor('basic.age'), null);
  assert.ok(linkForFactor('vitals.blood_pressure_unknown'));
  assert.ok(linkForFactor('lifestyle.activity'));
  assert.ok(linkForFactor('condition.type 2 diabetes'));
});

check('confidence copy explains itself', () => {
  assert.match(confidenceLabel(report)!, /62%/);
  assert.match(confidenceLabel(report)!, /Blood pressure/);
  assert.equal(confidenceLabel({ ...report, confidence: undefined } as any), null);
});

console.log(`flow.check: ${checks.length} checks passed`);
