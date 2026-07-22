import * as SecureStore from 'expo-secure-store';

import { splitUtf8Chunks } from './utf8-chunks';

interface SecureStoreManifest {
  version: 1;
  generation: string;
  chunks: number;
}

const manifestKey = (key: string) => `${key}.meta`;
const chunkKey = (key: string, generation: string, index: number) => `${key}.${generation}.${index}`;

const readManifest = async (key: string): Promise<SecureStoreManifest | null> => {
  const raw = await SecureStore.getItemAsync(manifestKey(key));
  if (!raw) return null;

  try {
    const manifest = JSON.parse(raw) as Partial<SecureStoreManifest>;
    if (manifest.version !== 1 || typeof manifest.generation !== 'string' || !Number.isInteger(manifest.chunks) || Number(manifest.chunks) < 1) {
      return null;
    }
    return manifest as SecureStoreManifest;
  } catch {
    return null;
  }
};

const deleteGeneration = async (key: string, manifest: SecureStoreManifest | null) => {
  if (!manifest) return;

  await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) => (
      SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index))
    )),
  );
};

const createGeneration = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const secureSessionStorage = {
  async getItem(key: string) {
    const manifest = await readManifest(key);
    if (!manifest) return null;

    const chunks = await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) => (
        SecureStore.getItemAsync(chunkKey(key, manifest.generation, index))
      )),
    );

    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    const previous = await readManifest(key);
    const generation = createGeneration();
    const chunks = splitUtf8Chunks(value);
    const next: SecureStoreManifest = { version: 1, generation, chunks: chunks.length };

    try {
      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, generation, index), chunk)),
      );
      await SecureStore.setItemAsync(manifestKey(key), JSON.stringify(next));
    } catch (error) {
      await deleteGeneration(key, next);
      throw error;
    }

    // A sessão nova já está ativa. Falhas ao remover a geração anterior não
    // podem invalidá-la; os fragmentos antigos serão sobrescritos em rotações futuras.
    try {
      await deleteGeneration(key, previous);
    } catch {
      // SecureStore continua contendo apenas dados criptografados e inacessíveis ao app.
    }
  },

  async removeItem(key: string) {
    const current = await readManifest(key);
    await SecureStore.deleteItemAsync(manifestKey(key));
    await deleteGeneration(key, current);
  },
};
