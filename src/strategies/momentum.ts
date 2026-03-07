import { PublicKey } from '@solana/web3.js';
import { connection } from '../blockchain/solanaClient.js';
import { getTradeAmount } from '../utils/riskManager.js';
import logger from '../utils/logger.js';

export async function momentumStrategy(
  poolAddress: string | PublicKey,
  minLiquidity: number,
  volumeMultiplier: number,
  executeTrade: (pool: string | PublicKey, amount: number) => Promise<void>
) {
  try {
    const poolPubKey = typeof poolAddress === 'string' ? new PublicKey(poolAddress) : poolAddress;
    const poolInfo = await connection.getAccountInfo(poolPubKey);

    if (!poolInfo) {
      logger.warn({ pool: poolAddress }, 'Pool not found');
      return;
    }

    // Dummy values: replace with real on-chain or aggregator data
    const currentLiquidity = Math.random() * 1000;
    const currentVolume = Math.random() * 500;
    const avgVolume = 100;

    logger.info({ pool: poolAddress, currentLiquidity, currentVolume, avgVolume }, 'Pool checked');

    if (currentLiquidity < minLiquidity) {
      logger.warn({ pool: poolAddress, liquidity: currentLiquidity }, 'Liquidity too low');
      return;
    }

    if (currentVolume >= avgVolume * volumeMultiplier) {
      const tradeAmount = await getTradeAmount();
      logger.info({ pool: poolAddress, tradeAmount }, 'Volume spike detected, executing trade');
      await executeTrade(poolAddress, tradeAmount);
    }
  } catch (err) {
    logger.error({ err }, 'Momentum strategy error');
  }
}