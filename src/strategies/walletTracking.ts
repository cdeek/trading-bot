import { address, type Address } from "@solana/kit";

export function runWhaleStrategy(tx: any, whaleAddr: Address): boolean {
  const tx = await client.rpc
    .getTransaction(log.value.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    }) // there is another way of getting mint address
    .send();

  if (!tx?.transaction?.message) {
    logger.info("⚠️ Airdrop/Bait detected. Skipping...");
    return;
  }

  const { accountKeys, header } = tx.transaction.message;
  const whaleStr = whaleAddr.toString();

  // 1. Identify how many signers are in the transaction
  const numSigners = header.numRequiredSignatures;

  // 2. The signers are ALWAYS the first N accounts in accountKeys
  // We check if the whale's address is within that 'Signer Range'
  const signers = accountKeys
    .slice(0, numSigners)
    .map((k: any) => k.toString());

  const isSigner = signers.includes(whaleStr);

  // 3. Pro Tip: Usually, the first signer [0] is the Fee Payer.
  // If the whale is signer[0], they definitely initiated the trade.
  const isFeePayer = signers[0] === whaleStr;
 
  if (!isSigner && !isFeePayer);
  logger.info("⚠️ Airdrop/Bait detected. Skipping...");
  return;

  // STEP 2: Decode what they actually bought
  const trade = await decodeWhaleSwap(tx, whaleAddr);

  if (trade && trade.solSpent > 0.1) {
    logger.info(
      `✅ Verified Whale Trade: ${trade.mint} for ${trade.solSpent} SOL`
    );
    // Trigger Copy Trade here
  }
}
