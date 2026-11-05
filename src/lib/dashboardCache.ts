/**
 * Cache curto em memória para métricas pesadas do Dashboard (Visão Geral)
 * e do banner de controle de cartas.
 *
 * Objetivo: revisitar a página logo depois não refaz do zero as consultas
 * pesadas (contagens de employees, CNHs vencidas, listagem de cartas).
 * Os dados são invalidados por realtime quando algo relevante muda.
 */
import { readCacheEntry, writeCacheEntry } from './cacheTypes'

const store = new Map<string, import('./cacheTypes').CacheEntry>()

/** Retorna o valor em cache se ainda estiver dentro da validade; senão null. */
export function getCachedData<T>(key: string, maxAgeMs: number): T | null {
  return readCacheEntry<T>(store, key, maxAgeMs).value
}

/** Grava um valor no cache com o timestamp atual. */
export function setCachedData<T>(key: string, data: T): void {
  writeCacheEntry(store, key, data)
}

/**
 * Invalida entradas do cache. Sem prefixo limpa tudo; com prefixo remove
 * apenas as chaves que começam com ele (ex.: 'visao-geral:').
 */
export function invalidateDashboardCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    store.clear()
    return
  }
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key)
    }
  }
}
