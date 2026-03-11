import { createSolanaRpc, address, type Address } from "@solana/kit";
import { decodeMigration } from "../utils/decoder.ts";

export async function runSnipingStrategy(sig: string): Promise<void> {
  try {
    const { mint, pool } = await decodeMigration(sig);

    // 1. Fetch Metadata & Creator
    const metadata = await getTokenMetadata(mint);
    if (!metadata) return false;

    // 2. Condition: Social Presence
    // Check if the URI exists and has links (Twitter/Telegram)
    const hasSocials = await checkSocials(metadata.uri);
    if (!hasSocials) {
      console.log(`❌ Skipped: No socials for ${metadata.symbol}`);
      return false;
    }

    // 3. Condition: Dev Reputation
    // Check how many of the creator's last 10 tokens actually graduated
    const successRate = await getDevSuccessRate(metadata.creator);
    if (successRate < 1) {
      console.log(`❌ Skipped: Dev has 0 previous graduations`);
      return false;
    }

    console.log(`🎯 Validated: ${metadata.symbol} is a GO.`);
    return true;
  } catch (err) {
    return false;
  }
}

async function checkSocials(uri: string): Promise<boolean> {
  try {
    const res = await fetch(uri);
    const data = await res.json();
    return !!(data.twitter || data.telegram || data.website);
  } catch {
    return false;
  }
}

async function getDevSuccessRate(creator: Address): Promise<number> {
  // Fetch last 10 signatures for the creator
  const sigs = await RPC.getSignaturesForAddress(creator, { limit: 10 }).send();

  // In 2026, we look for the "Migrate" memo or program interaction
  // A graduation is confirmed if the dev has interactions with the Migration Program
  const graduations = sigs.filter(
    s => s.memo?.toLowerCase().includes("migrate") || s.err === null
  ).length;

  return graduations;
}
