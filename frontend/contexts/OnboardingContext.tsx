import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import type {
  AllergyEntry,
  BasicProfile,
  ConditionEntry,
  FamilyEntry,
  HereditaryCondition,
  Lifestyle,
  Location,
  MedicalHistory,
  MedicationEntry,
  MentalHealth,
  OnboardingDraft,
  Vitals,
  WomensHealth,
} from '../utils/onboardingApi';
import { clearDraft, loadDraft, saveDraft } from '../utils/onboardingDraft';
import { EMPTY_DRAFT } from '../utils/onboardingDraftShape';
import { nextStep, prevStep, resumeTarget } from '../utils/onboardingFlow';
import type { StepId } from '../constants/onboardingSteps';

// Re-exported for ergonomics: screens import everything they need from here.
export type {
  AllergyEntry,
  BasicProfile,
  ConditionEntry,
  FamilyEntry,
  HereditaryCondition,
  Lifestyle,
  Location,
  MedicalHistory,
  MedicationEntry,
  MentalHealth,
  OnboardingDraft,
  Vitals,
  WomensHealth,
} from '../utils/onboardingApi';

// ==================== Constants ====================

/**
 * Per-list cap, matching the backend's `max_length=50` on each list.
 *
 * This used to be a single 50-entry budget shared across all three lists,
 * which the backend never enforced. The visible consequence was that a user
 * with many conditions silently could not add an allergy — a safety-relevant
 * field — because an unrelated list had used up the budget.
 */
export const MEDICAL_LIST_CAP = 50;

export type MedicalListKey = 'conditions' | 'medications' | 'allergy_entries';

// ==================== Public types ====================

export interface OnboardingState {
  /** True once the first `loadDraft()` has resolved. */
  hydrated: boolean;
  /**
   * Which step the user is on, as an id.
   *
   * Never an index. Indices shift the moment a step is inserted, which
   * silently mis-resumes every draft already in flight.
   */
  currentStepId: StepId;
  draft: OnboardingDraft;
  /** Open/closed state, keyed freely so per-condition accordions can use it. */
  openSections: Record<string, boolean>;
  cities: string[] | null;
  /** Per-list, because the caps are per-list. */
  capReached: Record<MedicalListKey, boolean>;
}

export interface OnboardingActions {
  setBasic(b: BasicProfile): void;
  setLifestyle<K extends keyof Lifestyle>(field: K, value: Lifestyle[K]): void;
  setVitals(v: Vitals): void;
  setMental(m: MentalHealth): void;
  setWomensHealth(w: WomensHealth): void;
  setConditions(list: ConditionEntry[]): void;
  setMedications(list: MedicationEntry[]): void;
  setAllergies(list: AllergyEntry[]): void;
  setTakesMedication(value: boolean): void;
  setFamily(list: FamilyEntry[]): void;
  toggleFamily(condition: HereditaryCondition): void;
  setLocation(loc: Location): void;
  /** Jump to a specific step. Prefer `advance()`/`retreat()`. */
  goTo(id: StepId): void;
  /** Move one step forward through the steps that apply to this draft. */
  advance(from: StepId): StepId | null;
  retreat(from: StepId): StepId | null;
  toggleSection(key: string): void;
  setCities(cities: string[]): void;
  reset(): void;
}

// ==================== Reducer ====================

type Action =
  | { type: 'HYDRATE'; currentStepId: StepId; data: OnboardingDraft }
  | { type: 'HYDRATE_EMPTY' }
  | { type: 'SET_BASIC'; payload: BasicProfile }
  | { type: 'SET_LIFESTYLE'; field: keyof Lifestyle; value: unknown }
  | { type: 'SET_VITALS'; payload: Vitals }
  | { type: 'SET_MENTAL'; payload: MentalHealth }
  | { type: 'SET_WOMENS'; payload: WomensHealth }
  | { type: 'SET_MEDICAL_LIST'; list: MedicalListKey; payload: unknown[] }
  | { type: 'SET_TAKES_MEDICATION'; payload: boolean }
  | { type: 'SET_FAMILY'; payload: FamilyEntry[] }
  | { type: 'TOGGLE_FAMILY'; condition: HereditaryCondition }
  | { type: 'SET_LOCATION'; payload: Location }
  | { type: 'GO_TO'; payload: StepId }
  | { type: 'TOGGLE_SECTION'; key: string }
  | { type: 'SET_CITIES'; payload: string[] }
  | { type: 'RESET' };

const EMPTY_CAPS: Record<MedicalListKey, boolean> = {
  conditions: false,
  medications: false,
  allergy_entries: false,
};

const INITIAL_STATE: OnboardingState = {
  hydrated: false,
  currentStepId: 'welcome',
  draft: EMPTY_DRAFT,
  openSections: {},
  cities: null,
  capReached: { ...EMPTY_CAPS },
};

function capsFor(medical: MedicalHistory): Record<MedicalListKey, boolean> {
  return {
    conditions: medical.conditions.length >= MEDICAL_LIST_CAP,
    medications: medical.medications.length >= MEDICAL_LIST_CAP,
    allergy_entries: medical.allergy_entries.length >= MEDICAL_LIST_CAP,
  };
}

function withDraft(state: OnboardingState, draft: OnboardingDraft): OnboardingState {
  return { ...state, draft, capReached: capsFor(draft.medical) };
}

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'HYDRATE': {
      // Resolve the stored step against the restored draft: it may no longer
      // apply (gender changed, last condition removed), in which case
      // `resumeTarget` snaps forward rather than stranding the user.
      const target = resumeTarget(action.data, action.currentStepId);
      return withDraft({ ...state, hydrated: true, currentStepId: target }, action.data);
    }
    case 'HYDRATE_EMPTY':
      return { ...state, hydrated: true };

    case 'SET_BASIC':
      return withDraft(state, { ...state.draft, basic: action.payload });

    case 'SET_LIFESTYLE': {
      // Set one field at a time across the lifestyle sub-questions, so the
      // value stays partial until the last one is answered.
      const merged = {
        ...(state.draft.lifestyle ?? {}),
        [action.field]: action.value,
      } as Partial<Lifestyle>;
      return withDraft(state, { ...state.draft, lifestyle: merged });
    }

    case 'SET_VITALS':
      return withDraft(state, { ...state.draft, vitals: action.payload });

    case 'SET_MENTAL':
      return withDraft(state, { ...state.draft, mental: action.payload });

    case 'SET_WOMENS':
      return withDraft(state, { ...state.draft, womens_health: action.payload });

    case 'SET_MEDICAL_LIST': {
      // Truncate rather than reject, so a paste or bulk import cannot fail
      // silently past the cap.
      const capped = action.payload.slice(0, MEDICAL_LIST_CAP);
      const medical = { ...state.draft.medical, [action.list]: capped } as MedicalHistory;
      return withDraft(state, { ...state.draft, medical });
    }

    case 'SET_TAKES_MEDICATION':
      return withDraft(state, { ...state.draft, takes_medication: action.payload });

    case 'SET_FAMILY':
      return withDraft(state, { ...state.draft, family: action.payload });

    case 'TOGGLE_FAMILY': {
      const list = state.draft.family ?? [];
      const at = list.findIndex((entry) => entry.condition === action.condition);
      const next =
        at >= 0
          ? [...list.slice(0, at), ...list.slice(at + 1)]
          : [
              ...list,
              // Defaults are deliberately the uninformative ones; the inline
              // follow-up asks for relation and onset.
              { condition: action.condition, relations: [], onset_bucket: 'unknown' as const },
            ];
      return withDraft(state, { ...state.draft, family: next });
    }

    case 'SET_LOCATION':
      return withDraft(state, { ...state.draft, location: action.payload });

    case 'GO_TO':
      return { ...state, currentStepId: action.payload };

    case 'TOGGLE_SECTION':
      return {
        ...state,
        openSections: { ...state.openSections, [action.key]: !state.openSections[action.key] },
      };

    case 'SET_CITIES':
      return { ...state, cities: action.payload };

    case 'RESET':
      // Stay hydrated so the persistence effect keeps tracking edits. Cached
      // cities survive a reset so the location step need not refetch.
      return {
        ...INITIAL_STATE,
        hydrated: true,
        cities: state.cities,
      };

    default:
      return state;
  }
}

// ==================== Context + provider ====================

const OnboardingContext = createContext<(OnboardingState & OnboardingActions) | undefined>(
  undefined,
);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Skips writing back the value we just loaded.
  const hydratedOnceRef = useRef(false);
  // Lets `reset()` clear storage instead of immediately re-saving an empty draft.
  const skipNextSaveRef = useRef(false);
  // Read by `advance`/`retreat` so they see the current draft without being
  // re-created on every keystroke.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadDraft();
        if (cancelled) return;
        if (stored) {
          dispatch({
            type: 'HYDRATE',
            currentStepId: stored.currentStepId,
            data: stored.data,
          });
        } else {
          dispatch({ type: 'HYDRATE_EMPTY' });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'HYDRATE_EMPTY' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!hydratedOnceRef.current) {
      hydratedOnceRef.current = true;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveDraft({ currentStepId: state.currentStepId, data: state.draft }).catch(() => {
      // Best-effort; in-memory state remains the source of truth.
    });
  }, [state.hydrated, state.currentStepId, state.draft]);

  const setBasic = useCallback((b: BasicProfile) => {
    dispatch({ type: 'SET_BASIC', payload: b });
  }, []);

  const setLifestyle = useCallback(
    <K extends keyof Lifestyle>(field: K, value: Lifestyle[K]) => {
      dispatch({ type: 'SET_LIFESTYLE', field, value });
    },
    [],
  );

  const setVitals = useCallback((v: Vitals) => dispatch({ type: 'SET_VITALS', payload: v }), []);
  const setMental = useCallback((m: MentalHealth) => dispatch({ type: 'SET_MENTAL', payload: m }), []);
  const setWomensHealth = useCallback(
    (w: WomensHealth) => dispatch({ type: 'SET_WOMENS', payload: w }),
    [],
  );

  const setConditions = useCallback(
    (list: ConditionEntry[]) => dispatch({ type: 'SET_MEDICAL_LIST', list: 'conditions', payload: list }),
    [],
  );
  const setMedications = useCallback(
    (list: MedicationEntry[]) => dispatch({ type: 'SET_MEDICAL_LIST', list: 'medications', payload: list }),
    [],
  );
  const setAllergies = useCallback(
    (list: AllergyEntry[]) => dispatch({ type: 'SET_MEDICAL_LIST', list: 'allergy_entries', payload: list }),
    [],
  );
  const setTakesMedication = useCallback(
    (value: boolean) => dispatch({ type: 'SET_TAKES_MEDICATION', payload: value }),
    [],
  );

  const setFamily = useCallback(
    (list: FamilyEntry[]) => dispatch({ type: 'SET_FAMILY', payload: list }),
    [],
  );
  const toggleFamily = useCallback((condition: HereditaryCondition) => {
    dispatch({ type: 'TOGGLE_FAMILY', condition });
  }, []);

  const setLocation = useCallback((loc: Location) => {
    dispatch({ type: 'SET_LOCATION', payload: loc });
  }, []);

  const goTo = useCallback((id: StepId) => dispatch({ type: 'GO_TO', payload: id }), []);

  // Screens must never name their successor. That is exactly what made the
  // old flow brittle: `markStep(3)` in one screen, `markStep(4)` in another,
  // and inserting a step meant renumbering all of them.
  const advance = useCallback((from: StepId) => {
    const target = nextStep(stateRef.current.draft, from);
    if (target) dispatch({ type: 'GO_TO', payload: target.id });
    return target?.id ?? null;
  }, []);

  const retreat = useCallback((from: StepId) => {
    const target = prevStep(stateRef.current.draft, from);
    if (target) dispatch({ type: 'GO_TO', payload: target.id });
    return target?.id ?? null;
  }, []);

  const toggleSection = useCallback((key: string) => {
    dispatch({ type: 'TOGGLE_SECTION', key });
  }, []);

  const setCities = useCallback((cities: string[]) => {
    dispatch({ type: 'SET_CITIES', payload: cities });
  }, []);

  const reset = useCallback(() => {
    skipNextSaveRef.current = true;
    dispatch({ type: 'RESET' });
    clearDraft().catch(() => undefined);
  }, []);

  const value = useMemo<OnboardingState & OnboardingActions>(
    () => ({
      ...state,
      setBasic,
      setLifestyle,
      setVitals,
      setMental,
      setWomensHealth,
      setConditions,
      setMedications,
      setAllergies,
      setTakesMedication,
      setFamily,
      toggleFamily,
      setLocation,
      goTo,
      advance,
      retreat,
      toggleSection,
      setCities,
      reset,
    }),
    [
      state, setBasic, setLifestyle, setVitals, setMental, setWomensHealth,
      setConditions, setMedications, setAllergies, setTakesMedication, setFamily,
      toggleFamily, setLocation, goTo, advance, retreat, toggleSection, setCities, reset,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

export function useOnboarding(): OnboardingState & OnboardingActions {
  const ctx = useContext(OnboardingContext);
  if (ctx === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
