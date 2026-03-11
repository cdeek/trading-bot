import { address } from "@solana/kit";
import { client } from "../blockchain/solanaClient.ts";
import logger from "./logger.ts";

export async function decodeMigration(signature: string) {
  try {
    // Fetch the transaction with the highest version support (v0)
    const tx = await client.rpc
      .getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      })
      .send();

    if (!tx || !tx.meta) return null;

    const { postTokenBalances, preTokenBalances } = tx.meta;

    // 1. Extract the Mint Address
    // In a graduation, the Mint is the token whose balance changes significantly
    // and usually has a "pump" suffix or is the newly created account.
    const mint = postTokenBalances?.find(
      b =>
        !preTokenBalances?.some(pb => pb.mint === b.mint) ||
        b.mint.toString().endsWith("pump")
    )?.mint;

    // 2. Extract the New Pool Address
    // The Pool is typically the account that receives the SOL liquidity (85-100 SOL)
    const poolAccount = tx.transaction.message.staticAccounts.find(
      (acc, idx) => {
        const pre = tx.meta?.preBalances[idx] || 0n;
        const post = tx.meta?.postBalances[idx] || 0n;
        return post - pre >= 80_000_000_000n; // ~80 SOL threshold
      }
    );

    logger.info(`✅ Decoded : Mint: ${mint} | Pool: ${poolAccount}`);

    return {
      mint: mint ? address(mint) : null,
      pool: poolAccount ? address(poolAccount) : null
    };
  } catch (err) {
    logger.error("❌ Decoding Error:", err);
    return null;
  }
}

export async function decodeWhaleSwap(tx: any, whaleAddr: Address) {
  if (!tx?.meta) return null;

  const { preTokenBalances, postTokenBalances } = tx.meta;
  const whaleStr = whaleAddr.toString();

  // 1. Find which token the whale RECEIVED (The "Out" token)
  // We look for a mint where the post-balance is higher than the pre-balance for the whale's owner.
  const boughtToken = postTokenBalances?.find(post => {
    const pre = preTokenBalances?.find(
      p => p.mint === post.mint && p.owner === whaleStr
    );
    const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
    const postAmount = BigInt(post.uiTokenAmount.amount);

    return post.owner === whaleStr && postAmount > preAmount;
  });

  // 2. Calculate the SOL spent (The "In" token)
  // Find the change in the native SOL balance for the whale's index
  const whaleIndex = tx.transaction.message.staticAccounts.findIndex(
    acc => acc.toString() === whaleStr
  );

  const preSol = tx.meta.preBalances[whaleIndex] || 0n;
  const postSol = tx.meta.postBalances[whaleIndex] || 0n;
  const solSpent = preSol > postSol ? preSol - postSol : 0n;

  if (!boughtToken) return null;

  return {
    mint: address(boughtToken.mint),
    amountBought: boughtToken.uiTokenAmount.uiAmount,
    solSpent: Number(solSpent) / 1e9,
    whale: whaleAddr
  };
}
