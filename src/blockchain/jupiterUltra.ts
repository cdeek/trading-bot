import {
  getBase64EncodedWireTransaction,
  signTransactionWithSigners
} from "@solana/kit";
import { client } from "./solanaClient";

const JUP_API_KEY = process.env.JUPITER_API_KEY || "";
const ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface UltraOrderResponse {
  transaction: string;
  requestId: string;
  quote: any;
}

/**
 * Core Swap Function (Handles Buy & Sell)
 */
export async function executeUltraSwap({
  isSell =false,
  mint,
  amount
}) {
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
    const orderRes = await fetch(`${ULTRA_BASE_URL}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUP_API_KEY
      },
      body: JSON.stringify(params)
    });

    if (!orderRes.ok) throw new Error(`Order failed: ${await orderRes.text()}`);
    const { transaction, requestId }: UltraOrderResponse =
      await orderRes.json();

    // 2. Sign the transaction
    const txObject = getBase64EncodedWireTransaction(transaction);
    const signedTx = await signTransactionWithSigners(txObject, [
      client.signer
    ]);

    // 3. Execute
    const execRes = await fetch(`${ULTRA_BASE_URL}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUP_API_KEY
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
    console.error("Jupiter Ultra Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Utility: Get holdings via Ultra API
 */
export async function getBotHoldings() {
  const res = await fetch(
    `${ULTRA_BASE_URL}/holdings/${client.signer.address}`,
    {
      headers: { "x-api-key": JUP_API_KEY }
    }
  );
  return res.json();
}

/**
 * THE "PANIC BUTTON": Sells all SPL tokens in the wallet back to native SOL.
 * Skips SOL itself to avoid infinite loops or errors.
 */
export async function sellAllHoldings() {
  console.log("!!! [Ultra] Initiating SELL ALL sequence !!!");

  try {
    // 1. Get current holdings from Jupiter's internal indexer
    const holdingsRes = await getBotHoldings();

    // Jupiter Ultra /holdings returns an array like: [{ mint: string, amount: string }, ...]
    const tokensToSell = holdingsRes.filter(
      (h: any) => h.mint !== SOL_MINT && BigInt(h.amount) > 0n
    );

    if (tokensToSell.length === 0) {
      console.log("[Ultra] No SPL tokens found to sell.");
      return { success: true, message: "Clean slate" };
    }

    console.log(`[Ultra] Found ${tokensToSell.length} tokens to offload.`);

    const results = [];
    for (const token of tokensToSell) {
      console.log(`[Ultra] Offloading ${token.mint} (Amount: ${token.amount})`);

      // We use the executeUltraSwap logic to convert to SOL
      const result = await executeUltraSwap(
        token.mint,
        SOL_MINT,
        BigInt(token.amount)
      );

      results.push({
        mint: token.mint,
        success: result.success,
        signature: result.signature
      });

      // Small delay between orders to avoid API rate limits (5 RPS for free tier)
      await new Promise(r => setTimeout(r, 250));
    }

    // 2. After selling, clear your local data/trades.json so the bot knows it's empty
    clearLocalTradeData();

    return { success: true, detailedResults: results };
  } catch (error) {
    console.error("[Ultra] Sell All Critical Failure:", error);
    return { success: false, error };
  }
}

/**
 * Utility to reset your local data folder after a mass sell
 */
function clearLocalTradeData() {
  const filePath = path.join(process.cwd(), "data", "trades.json");
  if (fs.existsSync(filePath)) {
    // We archive it rather than delete it, just in case
    const archivePath = path.join(
      process.cwd(),
      "data",
      `trades_archive_${Date.now()}.json`
    );
    fs.renameSync(filePath, archivePath);
    fs.writeFileSync(filePath, JSON.stringify([]));
    console.log("[Data] Local trade history archived and reset.");
  }
}
