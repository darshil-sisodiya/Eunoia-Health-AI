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
  BasicProfile,
  HereditaryCondition,
  Lifestyle,
  Location,
  MedicalHistory,
} from '../utils/onboardingApi';
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type OnboardingDraft,
} from '../utils/onboardingDraft';

// Re-export the supporting types for ergonomics: consumers import everything
// they need from this context module.
export type {
  BasicProfile,
  HereditaryCondition,
  Lifestyle,
  Location,
  MedicalHistory,
} from '../utils/onboardingApi';
export type { OnboardingDraft } from '../utils/onboardingDraft';

// ==================== Constants ====================

/** Total cap across the three Medical_History lists (Requirement 5.7). */
const MEDICAL_CAP = 50;
const MIN_STEP = 1;
const MAX_STEP = 7;

/** Initial draft used on a fresh install or after `reset()`. */
const EMPTY_DRAFT: OnboardingDraft = {
  basic: null,
  lifestyle: null,
  medical: {
    existing_conditions: [],
    allergies: [],
    current_medications: [],
  },
  family_history: [],
  location: null,
};

const INITIAL_MEDICAL_UI: OnboardingState['medicalUI'] = {
  existingConditionsOpen: false,
  allergiesOpen: false,
  currentMedicationsOpen: false,
};

// ==================== Public types ====================

export interface OnboardingState {
  /** True once the first `loadDraft()` call has resolved. */
  hydrated: boolean;
  /** 1..7. Always clamped to that range by `markStep`. */
  currentStep: number;
  /** The in-flight onboarding submission. */
  draft: OnboardingDraft;
  /** Per-section open/closed state for the Medical_History step. */
  medicalUI: {
    existingConditionsOpen: boolean;
    allergiesOpen: boolean;
    currentMedicationsOpen: boolean;
  };
  /** Cached `/api/cities` Karnataka city list. `null` until step 6 fetches it. */
  cities: string[] | null;
  /** True iff the total selected medical-history entries === {@link MEDICAL_CAP}. */
  capReached: boolean;
}

export interface OnboardingActions {
  setBasic(b: BasicProfile): void;
  setLifestyle<K extends keyof Lifestyle>(field: K, value: Lifestyle[K]): void;
  toggleMedical(list: keyof MedicalHistory, value: string): void;
  toggleFamily(condition: HereditaryCondition): void;
  setLocation(loc: Location): void;
  markStep(n: number): void;
  toggleMedicalSection(section: keyof OnboardingState['medicalUI']): void;
  setCities(cities: string[]): void;
  reset(): void;
}

// ==================== Reducer ====================

type Action =
  | { type: 'HYDRATE'; currentStep: number; data: OnboardingDraft }
  | { type: 'HYDRATE_EMPTY' }
  | { type: 'SET_BASIC'; payload: BasicProfile }
  | {
      type: 'SET_LIFESTYLE';
      field: keyof Lifestyle;
      value: Lifestyle[keyof Lifestyle];
    }
  | { type: 'TOGGLE_MEDICAL'; list: keyof MedicalHistory; value: string }
  | { type: 'TOGGLE_FAMILY'; condition: HereditaryCondition }
  | { type: 'SET_LOCATION'; payload: Location }
  | { type: 'MARK_STEP'; payload: number }
  | {
      type: 'TOGGLE_MEDICAL_SECTION';
      section: keyof OnboardingState['medicalUI'];
    }
  | { type: 'SET_CITIES'; payload: string[] }
  | { type: 'RESET' };

const INITIAL_STATE: OnboardingState = {
  hydrated: false,
  currentStep: MIN_STEP,
  draft: EMPTY_DRAFT,
  medicalUI: INITIAL_MEDICAL_UI,
  cities: null,
  capReached: false,
};

function clampStep(n: number): number {
  if (!Number.isFinite(n)) return MIN_STEP;
  return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.trunc(n)));
}

function totalMedicalCount(medical: MedicalHistory): number {
  return (
    medical.existing_conditions.length +
    medical.allergies.length +
    medical.current_medications.length
  );
}

/** Recomputes `capReached` after any draft mutation. */
function withCapReached(state: OnboardingState): OnboardingState {
  const total = totalMedicalCount(state.draft.medical);
  const capReached = total >= MEDICAL_CAP;
  if (capReached === state.capReached) return state;
  return { ...state, capReached };
}

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'HYDRATE': {
      const next: OnboardingState = {
        ...state,
        hydrated: true,
        currentStep: clampStep(action.currentStep),
        draft: action.data,
      };
      return withCapReached(next);
    }
    case 'HYDRATE_EMPTY':
      return { ...state, hydrated: true };

    case 'SET_BASIC':
      return {
        ...state,
        draft: { ...state.draft, basic: action.payload },
      };

    case 'SET_LIFESTYLE': {
      // The Lifestyle screen sets one field at a time across six sub-questions,
      // so the in-flight value is allowed to be a partial Lifestyle until the
      // last sub-question is answered. We cast at the boundary; the API
      // submission path is responsible for ensuring all six fields are present.
      const merged = {
        ...(state.draft.lifestyle ?? {}),
        [action.field]: action.value,
      } as Lifestyle;
      return {
        ...state,
        draft: { ...state.draft, lifestyle: merged },
      };
    }

    case 'TOGGLE_MEDICAL': {
      const list = state.draft.medical[action.list];
      const idx = list.indexOf(action.value);
      let nextList: string[];
      if (idx >= 0) {
        // Removing an entry is always allowed — even when the cap is reached.
        nextList = [...list.slice(0, idx), ...list.slice(idx + 1)];
      } else if (totalMedicalCount(state.draft.medical) >= MEDICAL_CAP) {
        // Adds beyond the 50-entry cap are no-ops; the screen renders the
        // inline cap-message UI by reading `state.capReached`.
        return withCapReached(state);
      } else {
        nextList = [...list, action.value];
      }
      const nextMedical: MedicalHistory = {
        ...state.draft.medical,
        [action.list]: nextList,
      };
      return withCapReached({
        ...state,
        draft: { ...state.draft, medical: nextMedical },
      });
    }

    case 'TOGGLE_FAMILY': {
      const list = state.draft.family_history;
      const idx = list.indexOf(action.condition);
      const nextList =
        idx >= 0
          ? [...list.slice(0, idx), ...list.slice(idx + 1)]
          : [...list, action.condition];
      return {
        ...state,
        draft: { ...state.draft, family_history: nextList },
      };
    }

    case 'SET_LOCATION':
      return {
        ...state,
        draft: { ...state.draft, location: action.payload },
      };

    case 'MARK_STEP':
      return { ...state, currentStep: clampStep(action.payload) };

    case 'TOGGLE_MEDICAL_SECTION':
      return {
        ...state,
        medicalUI: {
          ...state.medicalUI,
          [action.section]: !state.medicalUI[action.section],
        },
      };

    case 'SET_CITIES':
      return { ...state, cities: action.payload };

    case 'RESET':
      // Stay hydrated so the persistence effect continues to track future
      // edits. Cached cities are intentionally preserved across resets so
      // step 6 does not have to refetch within the same app session.
      return {
        hydrated: true,
        currentStep: MIN_STEP,
        draft: EMPTY_DRAFT,
        medicalUI: INITIAL_MEDICAL_UI,
        cities: state.cities,
        capReached: false,
      };

    default:
      return state;
  }
}

// ==================== Context + provider ====================

const OnboardingContext = createContext<
  (OnboardingState & OnboardingActions) | undefined
>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Tracks whether the post-hydration sentinel has fired so we can skip the
  // first persistence run (the value we just loaded does not need to be
  // written back).
  const hydratedOnceRef = useRef(false);
  // Allows `reset()` to suppress the next persistence run so it can clear the
  // AsyncStorage entry instead of immediately re-saving an empty draft.
  const skipNextSaveRef = useRef(false);

  // Hydrate from AsyncStorage on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadDraft();
        if (cancelled) return;
        if (stored) {
          dispatch({
            type: 'HYDRATE',
            currentStep: stored.currentStep,
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

  // Persist the draft on every (currentStep, draft) change once hydrated.
  // The first hydration tick is skipped so we do not write the value we
  // just loaded back to storage with a fresh `updatedAt`.
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
    saveDraft({ currentStep: state.currentStep, data: state.draft }).catch(() => {
      // Persistence is best-effort; in-memory state stays the source of truth.
    });
  }, [state.hydrated, state.currentStep, state.draft]);

  const setBasic = useCallback((b: BasicProfile) => {
    dispatch({ type: 'SET_BASIC', payload: b });
  }, []);

  const setLifestyle = useCallback(
    <K extends keyof Lifestyle>(field: K, value: Lifestyle[K]) => {
      dispatch({ type: 'SET_LIFESTYLE', field, value });
    },
    [],
  );

  const toggleMedical = useCallback(
    (list: keyof MedicalHistory, value: string) => {
      dispatch({ type: 'TOGGLE_MEDICAL', list, value });
    },
    [],
  );

  const toggleFamily = useCallback((condition: HereditaryCondition) => {
    dispatch({ type: 'TOGGLE_FAMILY', condition });
  }, []);

  const setLocation = useCallback((loc: Location) => {
    dispatch({ type: 'SET_LOCATION', payload: loc });
  }, []);

  const markStep = useCallback((n: number) => {
    dispatch({ type: 'MARK_STEP', payload: n });
  }, []);

  const toggleMedicalSection = useCallback(
    (section: keyof OnboardingState['medicalUI']) => {
      dispatch({ type: 'TOGGLE_MEDICAL_SECTION', section });
    },
    [],
  );

  const setCities = useCallback((cities: string[]) => {
    dispatch({ type: 'SET_CITIES', payload: cities });
  }, []);

  const reset = useCallback(() => {
    skipNextSaveRef.current = true;
    dispatch({ type: 'RESET' });
    clearDraft().catch(() => {
      // Best-effort cleanup; the in-memory reset has already happened.
    });
  }, []);

  const value = useMemo<OnboardingState & OnboardingActions>(
    () => ({
      ...state,
      setBasic,
      setLifestyle,
      toggleMedical,
      toggleFamily,
      setLocation,
      markStep,
      toggleMedicalSection,
      setCities,
      reset,
    }),
    [
      state,
      setBasic,
      setLifestyle,
      toggleMedical,
      toggleFamily,
      setLocation,
      markStep,
      toggleMedicalSection,
      setCities,
      reset,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

export function useOnboarding(): OnboardingState & OnboardingActions {
  const ctx = useContext(OnboardingContext);
  if (ctx === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
