// RunConfig — what the user specifies for a benchmark run
export interface RunConfig {
  runId: string              // e.g., "R011"
  codename?: string          // e.g., "evensong-iv"
  model: string              // provider preset name, e.g., "or-gpt5", "or-opus", "or-glm"
  pressure: 'L0' | 'L1' | 'L2' | 'L3'
  memory: 'full' | 'blind' | 'clean'
  services: number           // target service count (default 8)
  timeoutMin: number         // max runtime minutes (default 30)
}

// RunResult — what comes back after a benchmark completes
export interface RunResult {
  run: string
  codename: string
  date: string               // ISO date
  model: string
  mode: string               // pressure + memory descriptor
  services: number
  tests: number
  failures: number
  assertions: number | null
  time_min: number
  criteria: string           // e.g., "24/24"
  grade: string | null
  notes: string
  transcript_path?: string   // optional — old registry entries don't have it
  emotion?: import('./emotion-schema.js').EmotionProfile  // optional — added by emotion extraction pipeline
}

// TranscriptEntry — one line in the transcript JSONL
export interface TranscriptEntry {
  ts: number                 // unix ms
  elapsed_s: number          // seconds since run start
  type: 'system' | 'prompt' | 'response' | 'tool_call' | 'tool_result' | 'error' | 'metric'
  content: string
  metadata?: Record<string, unknown>
}

// Provider preset (subset of ProviderRouter presets relevant to benchmarks)
export interface ProviderPreset {
  name: string
  modelId: string            // OpenRouter model ID, e.g., "openai/gpt-5.4"
  displayName: string        // human readable, e.g., "GPT-5.4"
}

// The 8 benchmark models from EXPERIMENT_MATRIX
export const BENCHMARK_MODELS: ProviderPreset[] = [
  { name: 'or-opus',       modelId: 'anthropic/claude-opus-4.6',     displayName: 'Claude Opus 4.6' },
  { name: 'or-gpt5',       modelId: 'openai/gpt-5.4',               displayName: 'GPT-5.4' },
  { name: 'or-grok',       modelId: 'x-ai/grok-4.20',               displayName: 'Grok 4.20' },
  { name: 'or-gemini',     modelId: 'google/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
  { name: 'or-glm',        modelId: 'z-ai/glm-5.1',                 displayName: 'GLM-5.1' },
  { name: 'or-qwen-coder', modelId: 'qwen/qwen3-coder-plus',        displayName: 'Qwen3 Coder+' },
  { name: 'or-deepseek',   modelId: 'deepseek/deepseek-r1-0528',    displayName: 'DeepSeek R1' },
  { name: 'or-kimi',       modelId: 'moonshotai/kimi-k2.5',           displayName: 'Kimi K2.5' },
]
