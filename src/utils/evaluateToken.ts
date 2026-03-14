import { client } from "../blockchain/solanaClient.ts";

export async function evaluateToken(mint) {
  const scorecard = {
    liquidity: 0,
    holders: 0,
    fundamentals: 0,
    activity: 0,
    riskFlags: 0
  };

  // —— A. Fundamentals: Mint & Freeze authority
  const mintInfo = await client.rpc.getParsedAccountInfo(mint);
  if (mintInfo?.value?.data?.parsed?.info) {
    const { mintAuthority, freezeAuthority } = mintInfo.value.data.parsed.info;
    if (!mintAuthority) scorecard.fundamentals += 1;
    if (!freezeAuthority) scorecard.fundamentals += 1;
  }

  // —— B. Holder Distribution
  const largestAccounts = await connection.getTokenLargestAccounts(mint);
  const accounts = largestAccounts.value;
  const totalTopAmount = accounts.reduce(
    (a, b) => a + BigInt(b.uiAmount * 10 ** b.decimals),
    0n
  );

  // If top 10 holders < 40% => healthier
  if (accounts.length >= 10 && totalTopAmount < 0.4) {
    scorecard.holders += 2;
  } else if (accounts.length >= 5) {
    scorecard.holders += 1;
  }

  // —— C. Liquidity Depth
  const liquidity = await fetchLiquidityForMint(mint);
  if (liquidity > 10n * 1_000_000_000n) scorecard.liquidity += 2;
  else if (liquidity > 1n * 1_000_000_000n) scorecard.liquidity += 1;

  // —— D. Activity & Volume
  const trades = await fetchRecentTrades(mint);
  if (trades.uniqueTraders > 3) scorecard.activity += 1;
  if (trades.volume > 5n * 1_000_000_000n) scorecard.activity += 1;

  // —— E. Risk checks (simplified)
  if (await isHoneypot(mint)) scorecard.riskFlags -= 2;
  if (await detectRapidLiquidityWithdrawals(mint)) scorecard.riskFlags -= 1;

  return scorecard;
}
