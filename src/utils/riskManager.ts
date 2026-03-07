import { client, account } from "../blockchain/solanaClient.js";
import { TRADE_PERCENT } from "../config/config.js";
import logger from "./logger.js";

export async function getTradeAmount(): Promise<number> {
  const { value: balanceLamports } = await client.rpc
    .getBalance(client.wallet)
    .send();

  const balanceSol = balanceLamports / 1e9;

  const tradeAmount = balanceSol * TRADE_PERCENT;
  logger.info(
    { account: client.wallet.publicKey.toBase58(), balanceSol, tradeAmount },
    "Calculated trade amount"
  );

  return tradeAmount;
}
