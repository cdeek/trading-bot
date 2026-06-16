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

  // 3. If seenTokens length reaches or exceeds 10, remove the oldest 5
  // (JavaScript Sets preserve insertion order, so the first elements are the oldest)
  if (seenTokens.size >= 20) {
    const oldestTokens = Array.from(seenTokens).slice(0, 5);
    for (const oldToken of oldestTokens) {
      seenTokens.delete(oldToken);
    }
  }

  return rankedTokens;
}
