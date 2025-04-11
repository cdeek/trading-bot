import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import pRetry from 'p-retry';
import dotenv from 'dotenv';
import { Wallet } from '@coral-xyz/anchor';
import { sendNotification } from '../app.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connection = new Connection(process.env.RPC);
const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')));

export const tradeEmitter = new EventEmitter();
let waitingForConfirmation = false;
const executedTrades = new Set();

const refreshBalances = async (nextTrade) => {
  try { 
    const solBalance = await connection.getBalance(wallet.publicKey);
    if (solBalance < nextTrade.amount * 2) {
      tradeEmitter.emit('tradeUpdate', { message: "Low SOL balance, terminating bot." });
      sendNotification("Low SOL balance, terminating bot")
      console.log("low sol")
      return;
    } else tradeEmitter.emit('tradeUpdate', { message: `Your sol balance is ${solBalance * 1e9}`})
  } catch (error) {
    tradeEmitter.emit('tradeUpdate', { message: `Error refreshing balances: ${error.message}` });
  }
};

const getQuote = async (nextTrade) => {
  const { outputMint, amount, slippageBps } = nextTrade;
  const url = `https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;

  return pRetry(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Jupiter quote error: ${response.status}`);
    return response.json();
  }, { retries: 3 });
};

const executeSwap = async (quote) => {
  await refreshBalances();
  const swapResponse = await fetch("https://api.jup.ag/swap/v1/swap", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toString(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1000000,
          priorityLevel: "high"
        }
      }
    })
  });

  if (!swapResponse.ok) throw new Error(`Swap API error: ${swapResponse.statusText}`);
  const swapData = await swapResponse.json();

  if (!swapData.swapTransaction) {
    throw new Error("No swapTransaction returned in swapData.");
  }

  const transaction = VersionedTransaction.deserialize(
    Buffer.from(swapData.swapTransaction, 'base64')
  );

  transaction.sign([wallet.payer]);

  const transactionBinary = transaction.serialize();

  const signature = await connection.sendRawTransaction(transactionBinary, {
    maxRetries: 2,
    skipPreflight: false
  });

  const confirmation = await connection.confirmTransaction({ signature }, "finalized");

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
  } else {
    console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);
    tradeEmitter.emit('tradeUpdate', {
      message: `<a href="https://solscan.io/tx/${signature}/" target="_blank">Trade successful!</a>`
    });
    sendNotification("BOT bought new token")
  }

  waitingForConfirmation = false;

  return signature;
};

const loadExecutedTrades = async () => {
  const filePath = path.join(__dirname, 'public', 'data', 'executed_trades.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsedData = JSON.parse(data);
    parsedData.forEach(trade => executedTrades.add(trade));
  } catch {
    // Ignore missing file
  }
};

const saveExecutedTrades = async () => {
  const filePath = path.join(__dirname, 'public', 'data', 'executed_trades.json');
  await fs.writeFile(filePath, JSON.stringify([...executedTrades], null, 2));
};

const logSwap = async ({ inputToken, inAmount, outputToken, outAmount, txId, timestamp }) => {
  const filePath = path.join(__dirname, 'public', 'data', 'trades.json');
  const logEntry = { inputToken, inAmount, outputToken, outAmount, txId, timestamp };

  try {
    let trades = [];
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      trades = JSON.parse(data);
    } catch {}

    trades.push(logEntry);
    await fs.writeFile(filePath, JSON.stringify(trades, null, 2));
    executedTrades.add(outputToken);
    await saveExecutedTrades();

    tradeEmitter.emit('tradeUpdate', { message: "New trade executed." });
  } catch (error) {
    tradeEmitter.emit('tradeUpdate', { message: `Error logging trade: ${error.message}` });
  }
};

export const executeTrade = async (nextTrade) => {
  const { outputMint } = nextTrade;
  const bal = await refreshBalances()
 
  await loadExecutedTrades();

  if (executedTrades.has(outputMint)) {
    tradeEmitter.emit('tradeUpdate', { message: `Trade for token ${outputMint} already executed. Skipping...` });
    return;
  }

  if (waitingForConfirmation) {
    tradeEmitter.emit('tradeUpdate', { message: "A trade is already in progress. Waiting..." });
    return;
  }

  try {
    const quote = await getQuote(nextTrade);
  
    tradeEmitter.emit('tradeUpdate', { message: `Executing trade for ${outputMint}` });
    waitingForConfirmation = true;

    const txId = await executeSwap(quote);

    await logSwap({
      inputToken: quote.inputMint,
      inAmount: quote.inAmount,
      outputToken: quote.outputMint,
      outAmount: quote.outAmount,
      txId,
      timestamp: new Date().toISOString()
    });
  
  } catch (error) {
    console.log(error)
    sendNotification(error.message)
    tradeEmitter.emit('tradeUpdate', { message: `Trade execution error: ${error.message}` });
  } finally {
    waitingForConfirmation = false;
  }
};
// executeTrade(nextTrade);
