import pb from '@/lib/pocketbase/client'

/**
 * Helpers de rede para as chamadas do modal Gerar Carta.
 *
 * O problema relatado: quando a rede oscila (ERR_HTTP2_PING_FAILED), as
 * requisições do PocketBase ficam pendentes indefinidamente — nem resolvem,
 * nem rejeitam — e a UI trava em "Gerando…". Duas defesas:
 *
 * 1. `withTimeout` — aborta a requisição após ~15s (AbortController), então a
 *    chamada SEMPRE termina (erro ou resultado) e a UI pode reagir.
 * 2. `withModalRetry` — repete automaticamente falhas transitórias (rede,
 *    timeout, 429, 5xx) antes de renderizar o estado de erro com "Tentar de novo".
 */

/** Timeout padrão das chamadas do modal (ms). */
export const MODAL_TIMEOUT_MS = 15_000

/** Erro lançado quando a requisição estoura o timeout. */
export class TimeoutError extends Error {
  constructor() {
    super('A requisição não respondeu a tempo (timeout).')
    this.name = 'TimeoutError'
  }
}

/** Opções de envio aceitas pelo PocketBase (SendOptions estende RequestInit). */
export type SendOptionsWithSignal = Parameters<typeof pb.send>[1] & { signal?: AbortSignal }

/**
 * Executa `fn` com um teto de tempo RÍGIDO: a promessa corre contra um timer
 * que rejeita com TimeoutError mesmo que a chamada fique pendente para sempre
 * (o caso ERR_HTTP2_PING_FAILED, em que a requisição nem resolve nem rejeita).
 * A promessa de `fn` recebe as opções de envio com o sinal de abort — quando a
 * camada de rede propaga o signal, a conexão HTTP é realmente cancelada.
 */
export async function withTimeout<T>(
  fn: (options: SendOptionsWithSignal) => Promise<T>,
  timeoutMs = MODAL_TIMEOUT_MS,
): Promise<T> {
  if (timeoutMs <= 0) return fn({})

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const teto = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError())
    }, timeoutMs)
  })

  const trabalho = fn({ signal: controller.signal })
  // Evita rejeição não tratada quando o teto vence antes da chamada falhar.
  trabalho.catch(() => {})

  try {
    return await Promise.race([trabalho, teto])
  } finally {
    clearTimeout(timer)
  }
}

/** Falhas que valem nova tentativa automática: rede, timeout, 429 e 5xx. */
function isTransientError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number') {
    return status === 0 || status === 429 || (status >= 500 && status <= 599)
  }
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) return true
  return false
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Repete a chamada (que já é protegida por withTimeout) em falhas transitórias,
 * com backoff curto. O total ainda respeita um teto percebido pelo usuário:
 * com o padrão (2 tentativas extras, ~600ms de espera) o modal sai do
 * "Gerando…" rapidamente em caso de falha definitiva, nunca ficando preso.
 */
export async function withModalRetry<T>(
  fn: (options: SendOptionsWithSignal) => Promise<T>,
  options: { maxRetries?: number; retryDelayMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 600
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(fn, options.timeoutMs)
    } catch (error) {
      if (attempt >= maxRetries || !isTransientError(error)) throw error
      await wait(retryDelayMs)
    }
  }
}
