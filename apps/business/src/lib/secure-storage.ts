import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memory = new Map<string, string>();
const manifestKey = (key: string) => `${key}.manifest`;
const chunkKey = (key: string, version: string, index: number) => `${key}.${version}.${index}`;

const splitUtf8 = (value: string) => {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of value) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 1800 && current) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  chunks.push(current);
  return chunks;
};

type Manifest = { version: string; chunks: number };
const readManifest = async (key: string): Promise<Manifest | null> => {
  const raw = await SecureStore.getItemAsync(manifestKey(key));
  if (!raw) return null;
  try { return JSON.parse(raw) as Manifest; } catch { return null; }
};
const removeNative = async (key: string, manifest: Manifest | null) => {
  if (!manifest) return;
  await Promise.all(Array.from({ length: manifest.chunks }, (_, index) =>
    SecureStore.deleteItemAsync(chunkKey(key, manifest.version, index))));
};

export const secureSessionStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      return typeof localStorage === 'undefined' ? memory.get(key) ?? null : localStorage.getItem(key);
    }
    const manifest = await readManifest(key);
    if (!manifest) return null;
    const chunks = await Promise.all(Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, manifest.version, index))));
    return chunks.some((chunk) => chunk == null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') memory.set(key, value);
      else localStorage.setItem(key, value);
      return;
    }
    const previous = await readManifest(key);
    const version = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const chunks = splitUtf8(value);
    await Promise.all(chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(key, version, index), chunk)));
    await SecureStore.setItemAsync(manifestKey(key), JSON.stringify({ version, chunks: chunks.length }));
    await removeNative(key, previous);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') memory.delete(key);
      else localStorage.removeItem(key);
      return;
    }
    const manifest = await readManifest(key);
    await SecureStore.deleteItemAsync(manifestKey(key));
    await removeNative(key, manifest);
  },
};
