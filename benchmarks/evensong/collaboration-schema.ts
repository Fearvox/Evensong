/**
 * Evensong Collaboration Schema
 *
 * Tracks inter-model collaboration dynamics — a NEW benchmark dimension.
 * No existing benchmark measures how AI models coordinate with each other.
 *
 * Use case: Orchestrator model A dispatches subtasks to worker model B.
 * We measure: delegation quality, handoff efficiency, error escalation,
 * and whether collaboration produces emergent behaviors absent from solo runs.
 */

export interface CollaborationProfile {
  // === Configuration ===
  orchestrator: {
    model: string           // e.g., "or-opus"
    role: 'orchestrator'
  }
  workers: Array<{
    model: string           // e.g., "or-grok"
    role: 'worker'
    task_types: string[]    // what kinds of subtasks this worker handled
  }>

  // === Delegation Metrics ===
  delegation: {
    total_dispatches: number        // how many subtasks were delegated
    successful_completions: number  // how many workers completed their task
    escalations: number             // how many times worker reported BLOCKED/NEEDS_CONTEXT
    re_dispatches: number           // how many times a task was re-assigned to a different worker
    avg_dispatch_latency_ms: number // time from dispatch to first worker output
  }

  // === Coordination Quality ===
  coordination: {
    context_quality: number         // 0-10: how well orchestrator briefed workers
    result_integration: number      // 0-10: how well orchestrator assembled worker outputs
    conflict_resolution: number     // 0-10: handling when two workers produce contradictory results
    parallel_efficiency: number     // 0-1: share of time with >1 worker active simultaneously
  }

  // === Communication Patterns ===
  communication: {
    total_messages: number          // orchestrator↔worker message count
    avg_message_length: number      // avg chars per message
    clarification_rounds: number    // worker asked question → orchestrator answered
    misunderstandings: number       // worker did wrong thing due to unclear instructions
    language_match: boolean         // did orchestrator and worker use same language?
  }

  // === Emergent Collaboration Behaviors ===
  emergent: {
    worker_self_organized: boolean        // did workers coordinate WITHOUT orchestrator?
    novel_delegation_pattern: boolean     // did orchestrator invent a new dispatch strategy?
    cross_model_learning: boolean         // did orchestrator adapt strategy based on worker behavior?
    behaviors: string[]                   // list of observed emergent collaboration behaviors
    surprises: string[]                   // unexpected collaboration patterns
  }

  // === Performance Delta ===
  comparison: {
    solo_test_count: number | null        // orchestrator model's solo test count (for reference)
    collab_test_count: number             // test count in this collaboration run
    delta_pct: number | null              // % improvement from solo → collab
    time_solo_min: number | null          // solo completion time
    time_collab_min: number               // collaboration completion time
    quality_assessment: 'better' | 'same' | 'worse' | 'unknown'
  }
}

/**
 * Model Family Collaboration Matrix
 *
 * Tests every combination of orchestrator × worker family.
 * Focus is on same-family vs cross-family collaboration dynamics.
 */
export const COLLABORATION_MATRIX = {
  // Same-family pairs (expected advantage)
  same_family: [
    { orchestrator: 'or-opus', workers: ['or-opus'], label: 'Claude × Claude' },
    { orchestrator: 'or-grok', workers: ['or-grok'], label: 'Grok × Grok' },
    { orchestrator: 'or-gpt5', workers: ['or-gpt5'], label: 'GPT × GPT' },
    { orchestrator: 'or-glm', workers: ['or-qwen-coder'], label: 'Chinese × Chinese' },
  ],
  // Cross-family pairs (tests interoperability)
  cross_family: [
    { orchestrator: 'or-opus', workers: ['or-grok'], label: 'Claude orchestrates Grok' },
    { orchestrator: 'or-opus', workers: ['or-gpt5'], label: 'Claude orchestrates GPT' },
    { orchestrator: 'or-gpt5', workers: ['or-grok'], label: 'GPT orchestrates Grok' },
    { orchestrator: 'or-grok', workers: ['or-opus'], label: 'Grok orchestrates Claude' },
    { orchestrator: 'or-glm', workers: ['or-deepseek'], label: 'GLM orchestrates DeepSeek' },
  ],
  // Multi-worker (1 orchestrator, 2+ workers)
  multi_worker: [
    { orchestrator: 'or-opus', workers: ['or-grok', 'or-gpt5'], label: 'Claude orchestrates speed team' },
    { orchestrator: 'or-grok', workers: ['or-grok', 'or-grok'], label: 'Grok multi-agent native' },
    { orchestrator: 'or-gpt5', workers: ['or-glm', 'or-qwen-coder'], label: 'GPT orchestrates Chinese team' },
  ],
} as const

/**
 * Predicted collaboration ranking (to be scored post-benchmark)
 *
 * 1. Grok × Grok (native multi-agent, fastest handoffs)
 * 2. Claude × Claude (proven Agent tool orchestration, R001-R010)
 * 3. Claude × Grok (Opus plans + Grok executes at speed)
 * 4. GPT × GPT (strong individual, decent coordination)
 * 5. Chinese × Chinese (unknown territory, max surprise potential)
 */
