import { seenTokens } from "../../../index.ts"; 
import { config } from "../../../config/config.ts"; 

export function rankAttentionTokens(tokens) {
  // 1. Filter out already seen tokens and sort the remaining by score
  const rankedTokens = [...tokens]
    .filter(token => !seenTokens.has(token.mint))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.tokensLimit);

  // 2. Add only the final, limited top tokens to the seenTokens set
  for (const token of rankedTokens) {
    seenTokens.add(token.mint);
  }

  return rankedTokens;
}
