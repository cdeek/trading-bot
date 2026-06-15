export function rankAttentionTokens(
  tokens
) {
  return tokens
    .map(tokenScore)
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      config.tokensLimit
    );
}