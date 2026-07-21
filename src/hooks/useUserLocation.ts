import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';

interface CityOption {
  city: string;
  state: string;
}

interface UserLocationState {
  /** Detected or selected city */
  city: string | null;
  /** Detected or selected state */
  state: string | null;
  /** User latitude (null if denied/unavailable) */
  lat: number | null;
  /** User longitude (null if denied/unavailable) */
  lng: number | null;
  /** Whether location detection is in progress */
  loading: boolean;
  /** All distinct cities with active establishments in Supabase */
  availableCities: CityOption[];
  /** Whether the available cities are still loading */
  citiesLoading: boolean;
}

/**
 * Extracts city and state from an address string like "Rua X, 123, Bairro, Cidade - SP"
 */
const parseCityFromAddress = (address: string): CityOption | null => {
  const parts = address.split(',');
  if (parts.length >= 4) {
    const cityState = parts[3].trim().split('-');
    if (cityState.length >= 2) {
      return { city: cityState[0].trim(), state: cityState[1].trim() };
    }
    return { city: cityState[0].trim(), state: '' };
  }
  if (parts.length === 3) {
    return { city: parts[2].trim(), state: '' };
  }
  return null;
};



/**
 * Hook: Captures user geolocation (browser/GPS) and provides a dynamic list
 * of cities with active establishments from Supabase.
 *
 * - Web: uses navigator.geolocation
 * - Native: uses expo-location
 * - Fallback: SELECT DISTINCT city extracted from address FROM establishments WHERE active
 */
export function useUserLocation(): UserLocationState {
  const [city, setCity] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableCities, setAvailableCities] = useState<CityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);

  // 1. Fetch all distinct cities from active establishments
  const fetchAvailableCities = useCallback(async () => {
    try {
      setCitiesLoading(true);
      const { data, error } = await supabase
        .from('establishments')
        .select('address')
        .eq('account_status', 'active');

      if (error) throw error;

      const cityMap = new Map<string, CityOption>();
      (data || []).forEach((row) => {
        if (row.address) {
          const parsed = parseCityFromAddress(row.address);
          if (parsed && parsed.city) {
            const key = `${parsed.city}-${parsed.state}`;
            if (!cityMap.has(key)) {
              cityMap.set(key, parsed);
            }
          }
        }
      });

      setAvailableCities(
        Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city))
      );
    } catch (err) {
      console.error('[useUserLocation] Failed to fetch available cities:', err);
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  // 2. Try to detect user location
  const detectLocation = useCallback(async () => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        // Web: navigator.geolocation
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setLat(position.coords.latitude);
              setLng(position.coords.longitude);
              setLoading(false);
            },
            () => {
              // Permission denied or error — use fallback
              setLoading(false);
            },
            { timeout: 5000, maximumAge: 300000 }
          );
        } else {
          setLoading(false);
        }
      } else {
        // Native: expo-location (dynamic import to avoid bundler issues on web)
        try {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
            });
            setLat(loc.coords.latitude);
            setLng(loc.coords.longitude);
          }
        } catch {
          // expo-location not available or permission denied
        }
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAvailableCities();
    void detectLocation();
  }, [fetchAvailableCities, detectLocation]);

  // 3. When we have coordinates AND available cities, try to set a default
  useEffect(() => {
    if (lat && lng && availableCities.length > 0 && !city) {
      // For now, just pick the first available city as default since we don't
      // have establishment coordinates for distance calculation
      const first = availableCities[0];
      if (first) {
        setCity(first.city);
        setState(first.state);
      }
    }
  }, [lat, lng, availableCities, city]);

  return { city, state, lat, lng, loading, availableCities, citiesLoading };
}
