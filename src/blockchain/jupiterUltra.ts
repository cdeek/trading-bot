import {
  getBase64EncodedWireTransaction,
  signTransactionWithSigners,
  type Transaction
} from "@solana/kit";
import { client } from "./solanaClient"; // Adjust path to where your signer is defined

const JUP_API_KEY = process.env.JUPITER_API_KEY || "";
const ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";

export interface UltraOrderResponse {
  transaction: string; // base64
  requestId: string;
  quote: any;
}

/**
 * Jupiter Ultra: Request an order and execute it immediately.
 * No RPC required for execution - Jupiter handles landing.
 */
export async function executeUltraSwap(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  slippageBps: number = 50
) {
  try {
    // 1. Request the Order
    const orderRes = await fetch(`${ULTRA_BASE_URL}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUP_API_KEY
      },
      body: JSON.stringify({
        inputMint,
        outputMint,
        amount: amount.toString(),
        taker: botSigner.address,
      })
    });

    if (!orderRes.ok) throw new Error(`Order failed: ${await orderRes.text()}`);
    const { transaction, requestId }: UltraOrderResponse =
      await orderRes.json();

    // 2. Sign the transaction using @solana/kit
    const txObject = getBase64EncodedWireTransaction(transaction);
    const signedTx = await signTransactionWithSigners(txObject, [
      client.signer
    ]);

    // 3. Execute the signed transaction back through Jupiter
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

    if (!execRes.ok)
      throw new Error(`Execution failed: ${await execRes.text()}`);

    const result = await execRes.json();
    return {
      success: true,
      signature: result.signature,
      requestId
    };
  } catch (error) {
    console.error("Jupiter Ultra Error:", error);
    return { success: false, error };
  }
}

/**
 * Utility: Check holdings via Ultra API (bypass RPC limits)
 */
export async function getBotHoldings() {
  const res = await fetch(`${ULTRA_BASE_URL}/holdings/${botSigner.address}`, {
    headers: { "x-api-key": JUP_API_KEY }
  });
  return res.json();
}
