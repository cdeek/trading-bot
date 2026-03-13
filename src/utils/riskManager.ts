import { client } from "../blockchain/solanaClient.ts";
import { config } from "../../config/config.ts";
import logger from "./logger.ts";

export async function getTradeAmount(): Promise<number> {
  const { value: balanceLamports } = await client.rpc
    .getBalance(client.signer.address)
    .send();

  const balanceSol = balanceLamports / 1e9;

  const tradeAmount = balanceSol * config.global.tradePercent;
  logger.info(
    { account: client.wallet.publicKey.toBase58(), balanceSol, tradeAmount },
    "Calculated trade amount"
  );

  return tradeAmount;
}
