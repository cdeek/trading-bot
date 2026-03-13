import { client } from "./solanaClient";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  lamports,
  address
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

import logger from "../utils/logger.ts";
import { config, COLD_WALLET } from "../../config/config.ts";

/**
 * Checks balance and moves excess SOL to a cold wallet.
 */
export async function autoSweepProfits() {
  try {
    // 1. Get current balance in lamports
    const balanceBigInt = await client.rpc
      .getBalance(client.signer.address)
      .send();
    const currentSol = Number(balanceBigInt.value) / 1_000_000_000;

    // 2. Calculate profit above our capital base
    const excess = currentSol - config.minCapital;

    if (excess >= config.sweepThreshold) {
      logger.info(
        `[Accountant] Profit detected: ${excess.toFixed(
          4
        )} SOL. Initiating sweep...`
      );

      const signature = await transferSol(COLD_WALLET, excess);
      logger.info(
        `[Accountant] Sweep Successful! ${excess} SOL sent to Cold Wallet.`
      );

      await sendNotification(
        `[Accountant] Profit detected: ${excess.toFixed(
          4
        )} SOL.\n Initiating sweep...\n Done!`
      );
      return { swept: true, amount: excess, signature };
    } else {
      logger.info(`[Accountant] Balance below threshold. No sweep needed.`);
      return { swept: false };
    }
  } catch (error) {
    logger.error(error, "[Accountant] Sweep failed:");
    return { swept: false, error };
  }
}

async function transferSol(toAddress: string, solAmount: number) {
  // 1. Get the latest blockhash
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();

  // 2. Convert SOL to lamports
  const amount = lamports(BigInt(Math.floor(solAmount * 1_000_000_000)));

  // 3. Create the Transfer Instruction
  const instruction = getTransferSolInstruction({
    source: client.signer,
    destination: address(toAddress),
    amount
  });

  // 4. Build the Transaction Message
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    m => setTransactionMessageFeePayerSigner(client.signer, m),
    m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    m => appendTransactionMessageInstruction(instruction, m)
  );

  // 5. Sign and Send
  const signedTx = await signTransactionMessageWithSigners(message);
  const signature = await client.rpc
    .sendTransaction(signedTx, { encoding: "base64" })
    .send();

  return signature;
}
