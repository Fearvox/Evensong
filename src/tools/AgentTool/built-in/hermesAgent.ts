import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

export const HERMES_AGENT: BuiltInAgentDefinition = {
  agentType: 'hermes',
  whenToUse:
    'Dispatch a task to the Hermes (NousResearch) subprocess agent. Use when the task benefits from Hermes\'s specialized context, skills, or model configuration. Hermes runs independently with its own memory.',
  source: 'built-in',
  baseDir: 'built-in',
  // No tools — Hermes is a CLI subprocess, not an API agent
  tools: [],
  // No maxTurns — subprocess handles its own lifecycle
  // CCR waits for stdout and yields it as the result
}
