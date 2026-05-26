import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Prefer EXPO_PUBLIC_ env (injected by Expo) and fall back to Constants.extra
const rawEnv = process.env.EXPO_PUBLIC_BACKEND_URL || (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_BACKEND_URL;

const normalize = (url?: string) => (url ? url.replace(/\/$/, '') : undefined);

const deriveFromHostUri = (): string | undefined => {
  // Works in Expo Go: hostUri looks like "192.168.1.10:19000" or "exp://192.168.1.10:8081"
  const hostUri = (Constants.expoConfig as any)?.hostUri || (Constants.manifest2 as any)?.extra?.expoClient?.hostUri || (Constants.manifest as any)?.hostUri;
  if (!hostUri) return undefined;
  const match = /([\d\.]+)(?::\d+)?/.exec(hostUri);
  const host = match?.[1];
  return host ? `http://${host}:8000` : undefined;
};

let base = normalize(rawEnv);

// If using localhost, fix it for emulators/devices. If missing, try to derive from Expo host.
if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
  if (Platform.OS === 'android') {
    // Android emulator maps host loopback to 10.0.2.2
    if (base && (base.includes('localhost') || base.includes('127.0.0.1'))) {
      base = base.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
    } else {
      base = deriveFromHostUri() || 'http://10.0.2.2:8000';
    }
  } else if (Platform.OS === 'ios') {
    // iOS Simulator can use localhost, physical devices need LAN IP
    const derived = deriveFromHostUri();
    if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
      base = derived || base;
    }
  } else {
    base = deriveFromHostUri() || base;
  }
}

if (!base) {
  // As a last resort, keep it empty but warn in dev
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('API_BASE_URL is not set. Set EXPO_PUBLIC_BACKEND_URL in frontend/.env');
  }
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
