import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairSignerFromBytes,
  getBase58Encoder
} from "@solana/kit";
import logger from "../utils/logger.ts";

export let client: any | undefined;

export async function createClient(): Promise<any> {
  if (!client) {
    const secretKeyString = process.env.BOT_SECRET_KEY;
    if (!secretKeyString) {
      throw new Error("BOT_SECRET_KEY is not defined in environment variables");
    }

    const secretKeyBytes = getBase58Encoder().encode(secretKeyString);

    const signer = await createKeyPairSignerFromBytes(secretKeyBytes);

    client = {
      rpc: createSolanaRpc(process.env.RPC_URL || "http://127.0.0.1:8899"),
      rpcSubscriptions: createSolanaRpcSubscriptions(
        process.env.WSS_URL || "ws://127.0.0.1:8900"
      ),
      signer: signer
    };

    logger.info(`[Bot] Initialized with address: ${client.signer.address}`);
  }
  return client;
}
