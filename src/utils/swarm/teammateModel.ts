import { CLAUDE_OPUS_4_6_CONFIG, CLAUDE_OPUS_4_7_CONFIG } from '../model/configs.js'
import { getAPIProvider } from '../model/providers.js'

// @[MODEL LAUNCH]: Update the fallback model below.
// When the user has never set teammateDefaultModel in /config, new teammates
// use Opus 4.7 on firstParty, Opus 4.6 on 3P (Bedrock/Vertex/Foundry may lag).
// Must be provider-aware so 3P customers get the correct model ID.
export function getHardcodedTeammateModelFallback(): string {
  const provider = getAPIProvider()
  if (provider !== 'firstParty') {
    return CLAUDE_OPUS_4_6_CONFIG[provider]
  }
  return CLAUDE_OPUS_4_7_CONFIG[provider]
}
