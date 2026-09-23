import React from 'react';

import EntryListEditor from './EntryListEditor';
import SegmentedRow from '../onboarding/SegmentedRow';
import {
  ALLERGY_OPTIONS,
  CONDITION_OPTIONS,
  MEDICATION_OPTIONS,
} from '../../constants/onboarding';
import type {
  AllergyCategory,
  AllergyEntry,
  AllergyReaction,
  ConditionEntry,
  ControlLevel,
  DiagnosedBucket,
  MedicationEntry,
  StartedBucket,
  TreatmentMode,
} from '../../utils/onboardingApi';

/**
 * The three medical list editors, shared between the onboarding steps and the
 * profile editor.
 *
 * Defining them once is what stops the two paths drifting: if the follow-up
 * questions differed between "during onboarding" and "editing later", the
 * risk engine would receive different levels of detail depending on where a
 * condition happened to be entered.
 */

// ── option sets ────────────────────────────────────────────────────

export const DURATION_OPTIONS: { value: DiagnosedBucket; label: string }[] = [
  { value: 'lt_1y', label: 'Under a year' },
  { value: '1_5y', label: '1-5 years' },
  { value: '5_10y', label: '5-10 years' },
  { value: 'gt_10y', label: '10+ years' },
  { value: 'unknown', label: 'Not sure' },
];

export const CONTROL_OPTIONS: { value: ControlLevel; label: string }[] = [
  { value: 'well', label: 'Well controlled' },
  { value: 'partly', label: 'Partly' },
  { value: 'poorly', label: 'Poorly' },
  { value: 'unsure', label: 'Not sure' },
];

export const TREATMENT_OPTIONS: { value: TreatmentMode; label: string }[] = [
  { value: 'medication', label: 'Medication' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'Nothing' },
];

export const STARTED_OPTIONS: { value: StartedBucket; label: string }[] = [
  { value: 'lt_1m', label: 'Under a month' },
  { value: '1_6m', label: '1-6 months' },
  { value: '6_12m', label: '6-12 months' },
  { value: '1_5y', label: '1-5 years' },
  { value: 'gt_5y', label: '5+ years' },
  { value: 'unknown', label: 'Not sure' },
];

export const CATEGORY_OPTIONS: { value: AllergyCategory; label: string }[] = [
  { value: 'drug', label: 'Medicine' },
  { value: 'food', label: 'Food' },
  { value: 'environmental', label: 'Environment' },
  { value: 'other', label: 'Other' },
];

export const REACTION_OPTIONS: { value: AllergyReaction; label: string }[] = [
  { value: 'mild_rash', label: 'Mild rash' },
  { value: 'hives', label: 'Hives' },
  { value: 'swelling', label: 'Swelling' },
  { value: 'breathing', label: 'Breathing' },
  { value: 'anaphylaxis', label: 'Anaphylaxis' },
  { value: 'unknown', label: 'Not sure' },
];

export const SEVERE_REACTIONS: AllergyReaction[] = ['swelling', 'breathing', 'anaphylaxis'];

/** New entries default to the uninformative answers on purpose: the engine
 *  penalises "not sure" rather than assuming the best, so an unanswered
 *  follow-up must never read as "well controlled". */
export function newCondition(name: string): ConditionEntry {
  return {
    name,
    diagnosed_bucket: 'unknown',
    control: 'unsure',
    treatment: 'none',
    hospitalised_12m: false,
  };
}

export function newMedication(name: string): MedicationEntry {
  return { name, started_bucket: 'unknown', adherence: 'unknown' };
}

export function newAllergy(allergen: string): AllergyEntry {
  return { allergen, category: 'other', reaction: null };
}

// ── editors ────────────────────────────────────────────────────────

export function ConditionsEditor({
  value,
  onChange,
}: {
  value: ConditionEntry[];
  onChange: (next: ConditionEntry[]) => void;
}) {
  return (
    <EntryListEditor<ConditionEntry>
      value={value}
      onChange={onChange}
      options={CONDITION_OPTIONS}
      nameOf={(entry) => entry.name}
      create={newCondition}
      searchPlaceholder="Search or type your own"
      catalogueLabel="Common conditions"
      needsDetail={(entry) =>
        entry.diagnosed_bucket === 'unknown' || entry.control === 'unsure'
      }
      summaryOf={(entry) =>
        [
          DURATION_OPTIONS.find((o) => o.value === entry.diagnosed_bucket)?.label,
          CONTROL_OPTIONS.find((o) => o.value === entry.control)?.label,
        ]
          .filter(Boolean)
          .join(' · ')
      }
      renderDetail={(entry, update) => (
        <>
          <SegmentedRow
            label="How long have you had it?"
            options={DURATION_OPTIONS}
            value={entry.diagnosed_bucket}
            onChange={(v) => update({ diagnosed_bucket: v })}
          />
          <SegmentedRow
            label="How well is it controlled?"
            hint="Your honest read is more useful here than an optimistic one."
            options={CONTROL_OPTIONS}
            value={entry.control}
            onChange={(v) => update({ control: v })}
          />
          <SegmentedRow
            label="How is it managed?"
            options={TREATMENT_OPTIONS}
            value={entry.treatment}
            onChange={(v) => update({ treatment: v })}
          />
        </>
      )}
    />
  );
}

export function MedicationsEditor({
  value,
  onChange,
  conditionNames = [],
}: {
  value: MedicationEntry[];
  onChange: (next: MedicationEntry[]) => void;
  /** Offered as "what is it for?", linking a drug to its reason. */
  conditionNames?: string[];
}) {
  return (
    <EntryListEditor<MedicationEntry>
      value={value}
      onChange={onChange}
      options={MEDICATION_OPTIONS}
      nameOf={(entry) => entry.name}
      create={newMedication}
      searchPlaceholder="Search or type a medicine"
      catalogueLabel="Common medications"
      summaryOf={(entry) =>
        [entry.dose, entry.for_condition ? `for ${entry.for_condition}` : null]
          .filter(Boolean)
          .join(' · ')
      }
      renderDetail={(entry, update) => (
        <>
          <SegmentedRow
            label="How long have you been taking it?"
            options={STARTED_OPTIONS}
            value={entry.started_bucket}
            onChange={(v) => update({ started_bucket: v })}
          />
          {conditionNames.length > 0 ? (
            <SegmentedRow
              label="What is it for?"
              hint="Linking it lets us explain your treatment as a whole."
              options={[
                ...conditionNames.map((name) => ({ value: name, label: name })),
                { value: '__other__', label: 'Something else' },
              ]}
              value={entry.for_condition ?? null}
              onChange={(v) =>
                update({ for_condition: v === '__other__' ? null : v })
              }
            />
          ) : null}
        </>
      )}
    />
  );
}

export function AllergiesEditor({
  value,
  onChange,
}: {
  value: AllergyEntry[];
  onChange: (next: AllergyEntry[]) => void;
}) {
  return (
    <EntryListEditor<AllergyEntry>
      value={value}
      onChange={onChange}
      options={ALLERGY_OPTIONS}
      nameOf={(entry) => entry.allergen}
      create={newAllergy}
      searchPlaceholder="Search or type an allergy"
      catalogueLabel="Common allergies"
      isWarning={(entry) =>
        Boolean(entry.reaction && SEVERE_REACTIONS.includes(entry.reaction))
      }
      summaryOf={(entry) =>
        entry.reaction
          ? REACTION_OPTIONS.find((o) => o.value === entry.reaction)?.label ?? ''
          : ''
      }
      renderDetail={(entry, update) => (
        <>
          <SegmentedRow
            label="What kind of allergy?"
            options={CATEGORY_OPTIONS}
            value={entry.category}
            onChange={(v) => update({ category: v })}
          />
          <SegmentedRow
            label="What happens?"
            hint="Severity decides how loudly we warn you about a prescription."
            options={REACTION_OPTIONS}
            value={entry.reaction ?? null}
            onChange={(v) => update({ reaction: v })}
          />
        </>
      )}
    />
  );
}
