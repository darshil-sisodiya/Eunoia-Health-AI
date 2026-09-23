import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Port the FastAPI backend listens on (see backend/run.ps1).
const BACKEND_PORT = process.env.EXPO_PUBLIC_BACKEND_PORT || '8000';

const normalize = (url?: string) => (url ? url.replace(/\/$/, '') : undefined);

// An explicit override always wins: set EXPO_PUBLIC_BACKEND_URL (in .env, or via
// the eas.json / app.json extra) to point at a deployed backend. Leave it unset
// for local dev and the LAN IP is auto-detected below, so it never needs
// hand-editing when you change Wi-Fi networks.
const explicit = normalize(
  process.env.EXPO_PUBLIC_BACKEND_URL ||
    (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_BACKEND_URL
);

// The host serving the Metro bundle IS the dev machine, so it's also the right
// host for the backend. hostUri looks like "172.51.134.254:8081" or
// "exp://172.51.134.254:8081".
const deriveFromHostUri = (): string | undefined => {
  const hostUri: string | undefined =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoClient?.hostUri ||
    (Constants.manifest as any)?.hostUri;
  if (!hostUri) return undefined;

  // Strip the scheme, then any path, then the port, leaving a bare host.
  const host = hostUri
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split('/')[0]
    .split(':')[0];

  return host ? `http://${host}:${BACKEND_PORT}` : undefined;
};

// Loopback means "this device" — on a phone or emulator that is not the dev
// machine. Android emulators map the host loopback to 10.0.2.2; a physical
// device has to go over the LAN.
const isLoopback = (url: string) => /\/\/(localhost|127\.0\.0\.1)\b/.test(url);

const resolveBase = (): string | undefined => {
  // A real remote URL (Railway, staging) is used as-is.
  if (explicit && !isLoopback(explicit)) return explicit;

  // Otherwise prefer the auto-detected dev machine over a loopback address.
  const derived = deriveFromHostUri();
  if (derived) return derived;

  if (explicit && isLoopback(explicit)) {
    return Platform.OS === 'android'
      ? explicit.replace(/localhost|127\.0\.0\.1/, '10.0.2.2')
      : explicit;
  }

  return Platform.OS === 'android' ? `http://10.0.2.2:${BACKEND_PORT}` : undefined;
};

const base = resolveBase();

if (!base && __DEV__) {
  // eslint-disable-next-line no-console
  console.warn(
    'API_BASE_URL is not set and could not be derived from the Expo host. ' +
      'Set EXPO_PUBLIC_BACKEND_URL in frontend/.env.'
  );
}

export const API_BASE_URL: string = base || '';

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[API] Using base URL:', API_BASE_URL || '(empty)');
}

// ==================== TYPES ====================

export interface PrescriptionAnalysis {
  id: string;
  user_id: string;
  medication_name: string;
  dosage?: string;
  frequency?: string;
  timing?: string;
  purpose?: string;
  side_effects?: string;
  interactions?: string;
  personalized_advice?: string;
  extracted_text: string;
  ai_analysis: string;
  created_at: string;
}

// ==================== PRESCRIPTION API ====================

export const uploadPrescription = async (token: string, imageUri: string): Promise<PrescriptionAnalysis> => {
  try {
    // Create form data
    const formData = new FormData();
    
    // Get file extension
    const uriParts = imageUri.split('.');
    const fileType = uriParts[uriParts.length - 1];
    
    // Append file to form data
    const file = {
      uri: imageUri,
      name: `prescription.${fileType}`,
      type: `image/${fileType}`,
    } as any;
    
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/api/prescriptions/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        // Don't set Content-Type, let fetch set it with boundary for multipart/form-data
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload prescription');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Upload prescription error:', error);
    throw error;
  }
};

export const getPrescriptionHistory = async (token: string, limit: number = 20): Promise<PrescriptionAnalysis[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/prescriptions/history?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch prescription history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get prescription history error:', error);
    throw error;
  }
};

export const getPrescription = async (token: string, prescriptionId: string): Promise<PrescriptionAnalysis> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/prescriptions/${prescriptionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch prescription');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get prescription error:', error);
    throw error;
  }
};
