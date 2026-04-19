export const LOCAL_GEMMA_DEFAULT_BASE_URL = 'http://127.0.0.1:1337/v1'
export const LOCAL_GEMMA_DEFAULT_MODEL = 'Gemma-4-E4B-Uncensored-Q4_K_M'

export interface LocalGemmaClientOptions {
  baseURL?: string
  model?: string
  timeoutMs?: number
}

export interface LocalGemmaClient {
  baseURL: string
  model: string
  timeoutMs: number
}

export function createLocalGemmaClient(options: LocalGemmaClientOptions = {}): LocalGemmaClient {
  return {
    baseURL: options.baseURL ?? LOCAL_GEMMA_DEFAULT_BASE_URL,
    model: options.model ?? LOCAL_GEMMA_DEFAULT_MODEL,
    timeoutMs: options.timeoutMs ?? 30000,
  }
}
