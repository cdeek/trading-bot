import {
  getBase64EncodedWireTransaction,
  signTransactionMessageWithSigners
} from "@solana/kit";
import { client } from "./solanaClient.ts";
import logger from "../utils/logger.ts";

export interface UltraOrderResponse {
  transaction: string;
  requestId: string;
  quote: any;
}

/**
 * Core Swap Function (Handles Buy & Sell)
 */
export async function executeUltraSwap({ isSell = false, mint, amount }) {
  try {
    const params = {
      inputMint: BASE_MINT,
      outputMint: mint,
      amount: amount.toString(),
      taker: client.signer.address
    };

    if (isSell) {
      params.inputMint = mint;
      params.outputMint = BASE_MINT;
    }

    // 1. Request the Order
    const orderRes = await fetch(`${JUPITER_API}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUPITER_API_KEY
      },
      body: JSON.stringify(params)
    });

    if (!orderRes.ok) throw new Error(`Order failed: ${await orderRes.text()}`);
    const { transaction, requestId }: UltraOrderResponse =
      await orderRes.json();

    // 2. Sign the transaction
    const txObject = getBase64EncodedWireTransaction(transaction);
    // const transactionBytes = getBase64Encoder().encode(base64Transaction);

    const signedTx = await signTransactionMessageWithSigners(txObject, [
      client.signer
    ]);

    // 3. Execute
    const execRes = await fetch(`${JUPITER_API}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUPITER_API_KEY
      },
      body: JSON.stringify({
        signedTransaction: signedTx.base64EncodedWireTransaction,
        requestId
      })
    });

    const result = await execRes.json();

    // In Ultra, success is usually determined by the presence of a signature
    return {
      success: !!result.signature,
      signature: result.signature,
      code: result.code,
      requestId
    };
  } catch (error: any) {
    logger.error(error, "Jupiter Ultra Error:");
    return { success: false, error: error.message };
  }
}

export async function sellAllHoldings() {
  logger.info("!!! [Ultra] Initiating SELL ALL sequence !!!");

  try {
    // 1. Get current holdings from Jupiter's internal indexer
    const holdingsRes = await getBotHoldings();

    // Jupiter Ultra /holdings returns an array like: [{ mint: string, amount: string }, ...]
    const tokensToSell = holdingsRes.filter(
      (h: any) => h.mint !== BASE_MINT && BigInt(h.amount) > 0n
    );

    if (tokensToSell.length === 0) {
      logger.info("[Ultra] No SPL tokens found to sell.");
      return { success: true, message: "Clean slate" };
    }

    const results = [];
    for (const token of tokensToSell) {
      // We use the executeUltraSwap logic to convert to SOL
      const result = await executeUltraSwap({
        isSell: true,
        mint: token.mint,
        amount: BigInt(token.amount)
      });

      results.push({
        mint: token.mint,
        success: result.success,
        signature: result.signature
      });

      // Small delay between orders to avoid API rate limits (5 RPS for free tier)
      await new Promise(r => setTimeout(r, 250));
    }

    return { success: true, detailedResults: results };
  } catch (error) {
    logger.error(error, "[Ultra] Sell All Critical Failure:");
    return { success: false, error };
  }
}
