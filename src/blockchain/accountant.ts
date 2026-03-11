import { client } from "./solanaClient";
import { config, COLD_WALLET } from "../../config/config.ts";
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

      // Leave a tiny bit extra for future gas fees
      const sweepAmount = excess - 0.01;

      const signature = await transferSol(COLD_WALLET, sweepAmount);
      logger.info(
        `[Accountant] Sweep Successful! ${sweepAmount} SOL sent to Cold Wallet.`
      );
      logger.info(`[Accountant] TX: https://solscan.io/tx/${signature}`);

      return { swept: true, amount: sweepAmount, signature };
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
  try {
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

    return { success: true, signature };
  } catch (error: any) {
    logger.error(error, "[Transfer] SOL Transfer Failed:");
    return { success: false, error: error.message };
  }
}
