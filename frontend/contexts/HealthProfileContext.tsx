import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';
import {
  getProfileBundle,
  patchProfileSection,
} from '../utils/onboardingApi';
import type {
  HealthProfileBundle,
  ProfileSectionPatch,
} from '../utils/onboardingApi';

/**
 * The single runtime source of truth for the persisted health profile.
 *
 * Before this existed there was none. `OnboardingContext` is mounted only
 * under `/onboarding/*`, so it is destroyed the moment the flow ends, and
 * every screen afterwards fetched its own slice from a different endpoint:
 * profile.tsx read the legacy six-field profile, home.tsx read the report
 * list, cost-estimator.tsx called /auth/me just to learn the user's city.
 * They could and did disagree, and nothing could react to a change made
 * somewhere else. That is what "the app doesn't feel connected" was.
 *
 * Deliberately NOT folded into AuthContext: its `isLoading` gates the splash
 * screen, so adding a profile fetch there would block startup on the network.
 */

const CACHE_KEY = 'eunoia.healthprofile.v1';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface HealthProfileContextType {
  data: HealthProfileBundle | null;
  status: Status;
  error: string | null;
  /** Refetch from the server. Safe to call from anywhere. */
  refresh: () => Promise<void>;
  /**
   * Update one section. Returns the server's recomputed bundle, so the risk
   * score the UI shows is always the one the engine produced — the client
   * never guesses it.
   */
  patch: (section: string, body: ProfileSectionPatch) => Promise<HealthProfileBundle>;
}

const HealthProfileContext = createContext<HealthProfileContextType | undefined>(undefined);

export const HealthProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [data, setData] = useState<HealthProfileBundle | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response from a previous token landing after logout
  // or after a newer request has already resolved.
  const requestRef = useRef(0);

  const cache = useCallback(async (bundle: HealthProfileBundle | null) => {
    try {
      if (bundle) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
      } else {
        await AsyncStorage.removeItem(CACHE_KEY);
      }
    } catch {
      // A cache miss only costs a spinner. Never let it break a render.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const requestId = ++requestRef.current;
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    setError(null);
    try {
      const bundle = await getProfileBundle(token);
      if (requestId !== requestRef.current) return;
      setData(bundle);
      setStatus('ready');
      void cache(bundle);
    } catch (err: any) {
      if (requestId !== requestRef.current) return;
      setError(err?.response?.data?.detail || 'Could not load your profile');
      // Keep whatever we already had on screen; a failed refresh should not
      // blank out a profile the user was reading.
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
    }
  }, [token, cache]);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      requestRef.current += 1;
      setData(null);
      setStatus('idle');
      setError(null);
      void cache(null);
      return;
    }

    // Paint from cache first so home and profile have content immediately on a
    // cold start, then replace it with the network result.
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached) {
          setData(JSON.parse(cached) as HealthProfileBundle);
          setStatus('ready');
        }
      } catch {
        // Ignore: the network fetch below is the real source.
      }
      if (!cancelled) await refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [token, refresh, cache]);

  const patch = useCallback(
    async (section: string, body: ProfileSectionPatch) => {
      if (!token) throw new Error('Not signed in');
      const bundle = await patchProfileSection(section, body, token);
      requestRef.current += 1;
      setData(bundle);
      setStatus('ready');
      setError(null);
      void cache(bundle);
      return bundle;
    },
    [token, cache],
  );

  return (
    <HealthProfileContext.Provider value={{ data, status, error, refresh, patch }}>
      {children}
    </HealthProfileContext.Provider>
  );
};

export const useHealthProfile = () => {
  const context = useContext(HealthProfileContext);
  if (context === undefined) {
    throw new Error('useHealthProfile must be used within a HealthProfileProvider');
  }
  return context;
};
