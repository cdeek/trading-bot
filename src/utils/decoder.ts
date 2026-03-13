import {
  getBase64Decoder,
  getStructDecoder,
  getU64Decoder,
  getU8Decoder,
  getBooleanDecoder,
  getAddressDecoder
} from "@solana/kit";

const b64 = getBase64Decoder();

// --- DECORDER SCHEMAS ---

// Pump.fun Trade (81 bytes after discriminator)
const pumpTradeDecoder = getStructDecoder([
  ["mint", getAddressDecoder()],
  ["solAmount", getU64Decoder()],
  ["tokenAmount", getU64Decoder()],
  ["isBuy", getBooleanDecoder()],
  ["user", getAddressDecoder()],
  ["timestamp", getU64Decoder()],
  ["vSolReserves", getU64Decoder()],
  ["vTokenReserves", getU64Decoder()]
]);

// Raydium V4 (Legacy - No discriminator, starts with type byte)
const rayV4SwapDecoder = getStructDecoder([
  ["type", getU8Decoder()],
  ["amountIn", getU64Decoder()],
  ["minOut", getU64Decoder()],
  ["direction", getU64Decoder()],
  ["userSource", getAddressDecoder()],
  ["poolCoin", getU64Decoder()],
  ["poolPc", getU64Decoder()],
  ["amountOut", getU64Decoder()]
]);

// Raydium CPMM / PumpSwap (Modern Anchor - 80 bytes after discriminator)
const cpmmEventDecoder = getStructDecoder([
  ["poolId", getAddressDecoder()],
  ["inputAmount", getU64Decoder()],
  ["outputAmount", getU64Decoder()],
  ["inputMint", getAddressDecoder()],
  ["outputMint", getAddressDecoder()]
]);

// --- THE UNIFIED FUNCTION ---

export function decodeUnifiedEvent(logLine) {
  try {
    // 1. HANDLE RAYDIUM V4 (ray_log)
    if (logLine.includes("ray_log: ")) {
      const bytes = b64.decode(logLine.split("ray_log: ")[1]);
      const disc = bytes[0];

      console.log("ray", bytes);
      if (disc === 3 || disc === 4) {
        const raw = rayV4SwapDecoder.decode(bytes);
        const isSolIn = raw.direction.toString() === "1";
        return {
          platform: "Raydium_V4",
          type: "swap",
          mint: raw.userSource, // Note: V4 logs require context to map userSource back to Mint
          solAmount: isSolIn ? raw.amountIn : raw.amountOut,
          tokenAmount: isSolIn ? raw.amountOut : raw.amountIn,
          solReserves: raw.poolCoin,
          tokenReserves: raw.poolPc,
          isBuy: isSolIn
        };
      }
    }

    // 2. HANDLE ANCHOR PROGRAMS (Pump.fun, CPMM, PumpSwap)
    if (logLine.includes("Program data: ")) {
      const bytes = b64.decode(logLine.split("Program data: ")[1]);
      const body = bytes.slice(8); // Remove 8-byte discriminator

      console.log("data", bytes);
      // Route by Byte Length
      if (body.length === 81) {
        const raw = pumpTradeDecoder.decode(body);
        return {
          platform: "PumpFun",
          type: "trade",
          mint: raw.mint,
          solAmount: raw.solAmount,
          tokenAmount: raw.tokenAmount,
          solReserves: raw.vSolReserves,
          tokenReserves: raw.vTokenReserves,
          isBuy: raw.isBuy
        };
      }

      if (body.length === 80) {
        const raw = cpmmEventDecoder.decode(body);
        const isBuy = raw.inputMint.toString().startsWith("So111"); // Check if input is WSOL
        return {
          platform: "Raydium_CPMM",
          type: "swap",
          mint: isBuy ? raw.outputMint : raw.inputMint,
          solAmount: isBuy ? raw.inputAmount : raw.outputAmount,
          tokenAmount: isBuy ? raw.outputAmount : raw.inputAmount,
          solReserves: 0n, // CPMM logs do not include new reserves
          tokenReserves: 0n,
          isBuy: isBuy
        };
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}
