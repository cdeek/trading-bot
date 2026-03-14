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
    const secretKeyBytes = getBase58Encoder().encode(process.env.PRIVATE_KEY);

    const signer = await createKeyPairSignerFromBytes(secretKeyBytes);

    client = {
      rpc: createSolanaRpc(process.env.RPC_URL),
      rpcSubscriptions: createSolanaRpcSubscriptions(process.env.WSS_URL),
      signer: signer
    };

    logger.info(`[Bot] Initialized with address: ${client.signer.address}`);
  }
  return client;
}

