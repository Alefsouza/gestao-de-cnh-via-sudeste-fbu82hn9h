/**
 * Tipos e primitivas do cache em memória usado pelas métricas do Dashboard.
 * Mantido em módulo próprio para poder ser testado isoladamente.
 */

export interface CacheEntry {
  data: unknown
  savedAt: number
}

export function readCacheEntry<T>(
  store: Map<string, CacheEntry>,
  key: string,
  maxAgeMs: number,
): { value: T | null; savedAt: number | null } {
  const entry = store.get(key)
  if (!entry) return { value: null, savedAt: null }
  if (Date.now() - entry.savedAt > maxAgeMs) {
    store.delete(key)
    return { value: null, savedAt: null }
  }
  return { value: entry.data as T, savedAt: entry.savedAt }
}

export function writeCacheEntry<T>(store: Map<string, CacheEntry>, key: string, data: T): void {
  store.set(key, { data, savedAt: Date.now() })
}
