// import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
// import { Wallet } from '@coral-xyz/anchor';
// import bs58 from 'bs58';
// import fetch from 'cross-fetch';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import { EventEmitter } from 'events';
// import fs from 'fs/promises';
// import pRetry from 'p-retry';
// import config from '../config.js';
//
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
//
// // Initialize Solana connection
// const connection = new Connection(config.SOLANA_RPC);
// const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || "")));
//
// // EventEmitter for trade updates
// export const tradeEmitter = new EventEmitter();
//
// // Avoid overlapping trades
// let waitingForConfirmation = false;
// const executedTrades = new Set(); // Track executed trades
//
// // Ensure sufficient SOL balance
// const refreshBalances = async () => {
//   try {
//     const solBalance = await connection.getBalance(wallet.publicKey);
//     if (solBalance < 0.01 * 1e9) {
//       tradeEmitter.emit('tradeUpdate', { message: "Low SOL balance, terminating bot." });
//       process.exit(1);
//     }
//   } catch (error) {
//     tradeEmitter.emit('tradeUpdate', { message: `Error refreshing balances: ${error.message}` });
//   }
// };
//
// // Load executed trades from file
// const loadExecutedTrades = async () => {
//   const filePath = path.join(__dirname, 'executed_trades.json');
//   try {
//     const data = await fs.readFile(filePath, 'utf-8');
//     const parsedData = JSON.parse(data);
//     parsedData.forEach(trade => executedTrades.add(trade));
//   } catch {
//     // File doesn't exist or empty, no problem
//   }
// };
//
// // Save executed trades to file
// const saveExecutedTrades = async () => {
//   const filePath = path.join(__dirname, 'executed_trades.json');
//   await fs.writeFile(filePath, JSON.stringify([...executedTrades], null, 2));
// };
//
// // Get quote from Jupiter API using p-retry
// const getQuote = async (nextTrade) => {
//   const { outputMint, amount } = nextTrade;
//   const url = `${config.JUPITER_QUOTE_API}?inputMint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU&outputMint=${outputMint}&amount=${amount}&slippageBps=${config.slippageBps}&restrictIntermediateTokens=true`;
//
//   return pRetry(async () => {
//     const response = await fetch(url);
//     if (!response.ok) throw new Error(`Jupiter quote error: ${response.status}`);
//     return response.json();
//   }, { retries: 3 });
// };
//
// // Execute the swap using Jupiter API
// const executeSwap = async (quote) => {
//   const swapResponse = await fetch(config.JUPITER_SWAP_API, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       quoteResponse: quote,
//       userPublicKey: wallet.publicKey.toString(),
//       dynamicComputeUnitLimit: true,
//       dynamicSlippage: true,
//       prioritizationFeeLamports: {
//         priorityLevelWithMaxLamports: {
//           maxLamports: config.priorityLamports,
//           priorityLevel: config.priorityLevel
//         }
//       }
//     })
//   });
//
//   if (!swapResponse.ok) throw new Error(`Swap API error: ${swapResponse.statusText}`);
//
//   const swapData = await swapResponse.json();
//   const transactionBase64 = swapData.swapTransaction;
//   const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
//
//   // Sign and send the transaction
//   transaction.sign([wallet.payer]);
//   const signature = await connection.sendRawTransaction(transaction.serialize(), {
//     maxRetries: 2,
//     skipPreflight: true
//   });
//
//   const confirmation = await connection.confirmTransaction({ signature }, "finalized");
//
//   if (confirmation.value.err) {
//     throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
//   }
//
//   // Trade executed successfully
//   tradeEmitter.emit('tradeUpdate', { message: `Trade successful! TX: https://solscan.io/tx/${signature}/` });
//   waitingForConfirmation = false;
//   await refreshBalances();
//
//   return signature;
// };
//
// // Log the trade and update executedTrades
// const logSwap = async ({ inputToken, inAmount, outputToken, outAmount, txId, timestamp }) => {
//   const logEntry = { inputToken, inAmount, outputToken, outAmount, txId, timestamp };
//   const filePath = path.join(__dirname, 'trades.json');
//
//   try {
//     let trades = [];
//     try {
//       const data = await fs.readFile(filePath, 'utf-8');
//       trades = JSON.parse(data);
//     } catch {
//       // Start with empty array if file doesn't exist
//     }
//
//     trades.push(logEntry);
//     await fs.writeFile(filePath, JSON.stringify(trades, null, 2));
//
//     // Store executed trade and persist it
//     executedTrades.add(outputToken);
//     await saveExecutedTrades();
//
//     tradeEmitter.emit('tradeUpdate', { message: "New trade executed." });
//   } catch (error) {
//     tradeEmitter.emit('tradeUpdate', { message: `Error logging trade: ${error.message}` });
//   }
// };
//
// // Execute trade with filtering mechanism
// export const executeTrade = async (nextTrade) => {
//   const { outputMint } = nextTrade;
//
//   // Load previously executed trades on startup
//   await loadExecutedTrades();
//
//   // Prevent re-executing the same token
//   if (executedTrades.has(outputMint)) {
//     tradeEmitter.emit('tradeUpdate', { message: `Trade for token ${outputMint} already executed. Skipping...` });
//     return;
//   }
//
//   if (waitingForConfirmation) {
//     tradeEmitter.emit('tradeUpdate', { message: "A trade is already in progress. Waiting..." });
//     return;
//   }
//
//   try {
//     const quote = await getQuote(nextTrade);
//
//     if (parseInt(quote.outAmount) > nextTrade.nextTradeThreshold) {
//       tradeEmitter.emit('tradeUpdate', { message: `Executing trade for ${outputMint}` });
//       waitingForConfirmation = true;
//       const txId = await executeSwap(quote);
//
//       // Log trade details
//       await logSwap({
//         inputToken: quote.inputMint,
//         inAmount: quote.inAmount,
//         outputToken: quote.outputMint,
//         outAmount: quote.outAmount,
//         txId,
//         timestamp: new Date().toISOString()
//       });
//
//     } else {
//       tradeEmitter.emit('tradeUpdate', { message: `Trade condition not met for ${outputMint}, skipping.` });
//     }
//   } catch (error) {
//     tradeEmitter.emit('tradeUpdate', { message: `Trade execution error: ${error.message}` });
//   } finally {
//     waitingForConfirmation = false;
//   }
// };
