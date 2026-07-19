import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;
const PREFIX = 'yaqeen.auth.';

function safeKey(key: string) {
  return `${PREFIX}${key.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function webStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

async function getNativeItem(key: string) {
  const root = safeKey(key);
  const rawCount = await SecureStore.getItemAsync(`${root}.count`);
  const count = Number(rawCount);
  if (!Number.isInteger(count) || count < 1 || count > 32) return null;
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${root}.${index}`)),
  );
  if (chunks.some((chunk) => chunk === null)) return null;
  return chunks.join('');
}

async function setNativeItem(key: string, value: string) {
  const root = safeKey(key);
  const previousCount = Number(await SecureStore.getItemAsync(`${root}.count`)) || 0;
  const chunks = Array.from(
    { length: Math.ceil(value.length / CHUNK_SIZE) },
    (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
  );
  if (chunks.length > 32) throw new Error('auth_session_too_large');
  await Promise.all(chunks.map((chunk, index) =>
    SecureStore.setItemAsync(`${root}.${index}`, chunk, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  ));
  await SecureStore.setItemAsync(`${root}.count`, String(chunks.length), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (previousCount > chunks.length) {
    await Promise.all(Array.from(
      { length: previousCount - chunks.length },
      (_, index) => SecureStore.deleteItemAsync(`${root}.${chunks.length + index}`),
    ));
  }
}

async function removeNativeItem(key: string) {
  const root = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${root}.count`)) || 0;
  await Promise.all([
    SecureStore.deleteItemAsync(`${root}.count`),
    ...Array.from({ length: Math.min(count, 32) }, (_, index) =>
      SecureStore.deleteItemAsync(`${root}.${index}`)
    ),
  ]);
}

export const secureAuthStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return webStorage()?.getItem(key) ?? null;
    return getNativeItem(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(key, value);
      return;
    }
    await setNativeItem(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(key);
      return;
    }
    await removeNativeItem(key);
  },
};
