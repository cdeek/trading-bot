import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import fs from 'fs';
import { access, writeFile } from 'fs/promises';
import fetch from 'node-fetch';
import pRetry from 'p-retry';
import config from './config.js';
// import { executeTrade, tradeEmitter } from './transaction/index.js';

// Set __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// --- Configurable thresholds (default values) ---
let thresholds = {
  maxTrade: 5,
  topHoldersPct: 50,
  tradeAmount: 1000000,
  tradeThreshold: 10,
  pollInterval: (10000 * 120)
};

// Add a Set to track processed tokens
const processedTokens = new Set();

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

let autoTradeEnabled = false;
let latestAnalysis = null;

app.post('/thresholds', (req, res) => {
  const newThresholds = req.body;
  if (typeof newThresholds.tradeAmount !== 'number' || newThresholds.tradeAmount <= 0) {
    return res.status(400).json({ error: 'Invalid tradeAmount value' });
  }
  thresholds = { ...thresholds, ...newThresholds };
  io.emit('thresholdsUpdate', thresholds);
  res.json(thresholds);
});

app.get('/', (req, res) => {
  res.render('dashboard', { analysis: latestAnalysis, autoTrade: autoTradeEnabled, thresholds });
});

app.get('/toggle-autotrade', (req, res) => {
  if (autoTradeEnabled) {
    autoTradeEnabled = false;
    return;
  }
  autoTradeEnabled = true;
  io.emit('notification', { message: `🔄 Auto trade turned ${autoTradeEnabled ? 'ON ✅' : 'OFF ❌'}` });
  res.json({ autoTrade: autoTradeEnabled });
});


async function verifyWithRugcheck(tokenAddress) { 
  const url = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
  try {
    const response = await robustFetch(url);
    if (!response.ok) throw new Error(`RugCheck API error: ${response.status}`);
    const report = await response.json();
    console.log(report.rugged)
    if (report.rugged) return false;
    return tokenAddress;
  } catch (err) {
    io.emit('notification', { message: `⚠️ Error verifying token ${tokenAddress}: ${err.message} ` });
    console.log("error verifying rug " + err)
    return false;
  }
}

async function robustFetch(url, options = {}) {
  return pRetry(
    async () => {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    },
    { retries: 3, minTimeout: 1000, factor: 2 },
  );
}

function potentialAddresses(tokens) {
  tokens.forEach((token) => processedTokens.add(token.baseToken.address));
  return tokens
    .filter((token) => {
      const fdv = token.fdv || 0;
      const liquidity = token.liquidity?.usd || 0;
      const age = token.pairCreatedAt 
        ? (Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60) 
        : Infinity; // Prevent errors if pairCreatedAt is missing
      const txns = (token.txns?.h1?.buys || 0) + (token.txns?.h1?.sells || 0);
      const volume24H = token.volume?.h24?.usd || 0;
      const txns24H = (token.txns?.h24?.buys || 0) + (token.txns?.h24?.sells || 0);

      if (age <= 48) {
        return fdv >= 100000 && liquidity >= 10000 && txns >= 50;
      }

      return fdv >= 500000 && liquidity >= 75000 && volume24H >= 1000000 && txns24H >= 50;
  })
    .map((token) => token.baseToken?.address || []); // Default to empty string if address is missing
}

async function fetchTokenData() {
  try {
    const response = await robustFetch(config.DEXSCREENER_API);
    if (!response.ok) throw new Error(`DEXSCREENER_API error: ${response.status}`);
    const data = await response.json();
    const solanaTokens = data
      .filter((token) => token.chainId.toLowerCase() === 'solana')
      .map((token) => token.tokenAddress)
      .join(',');
    if (!solanaTokens) return [];
    const tokenResponse = await robustFetch(`${config.DEXSCREENER_API_SOL}${solanaTokens}`);
    if (!tokenResponse.ok) throw new Error(`DEXSCREENER_API_SOL error: ${tokenResponse.status}`);
    const solanaData = await tokenResponse.json();
    const newTokens = solanaData.filter((token) => !processedTokens.has(token.baseToken.address));
    return potentialAddresses(newTokens);
  } catch (err) {
    io.emit('notification', { message: `🚨 Error fetching token data: ${err.message} ` });
    console.log("error fetching token data" + err)
    return [];
  }
}

async function verifyTokens(tokens) {
  const verifiedTokens = [];
  for (const token of tokens) {
    const result = await verifyWithRugcheck(token);
    if (result) {
      verifiedTokens.push(result);
      io.emit('notification', { message: result });
    }
  }
  return verifiedTokens;
}

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
  if (latestAnalysis) socket.emit('analysisUpdate', latestAnalysis);
});
// tradeEmitter.on('tradeUpdate', (trade) => io.emit('notification', trade));

async function runAnalyzer() {
  io.emit('notification', { message: '📊 Analyzing market data...' });
  const tokens = await fetchTokenData();
  io.emit('notification', { message: `📈 Fetched ${tokens.length} tokens from Dexscreener.` });
  const verifiedTokens = await verifyTokens(tokens);
  io.emit('notification', { message: `✅ Verified tokens: ${verifiedTokens.length}` });

  latestAnalysis = {
    timestamp: new Date().toISOString(),
    totalTokensFetched: tokens.length,
    verifiedCount: verifiedTokens.length,
  };

  io.emit('analysisUpdate', latestAnalysis);
  let failedTrades = 0;
  if (autoTradeEnabled) {
    let executedTrades = 0;
    for (const token of verifiedTokens) {
      if (executedTrades >= thresholds.maxTrade || failedTrades >= 3) break;
      try {
        // await executeTrade({
          // outputMint: token,
          // amount: thresholds.tradeAmount,
          // nextTradeThreshold: thresholds.tradeThreshold,
        // });
       // executedTrades++;
        io.emit('notification', { message: `🚀 Trade executed for ${token} successfully! ` });
      } catch (err) {
        failedTrades++;
        io.emit('notification', { message: `❌ Trade failed for ${token}: ${err.message} ` });
      }
    }
    if (failedTrades >= 3) {
      autoTradeEnabled = false;
      io.emit('notification', { message: '⚠️ Auto trade disabled due to multiple failures' });
    }
  }
}

async function startAnalyzerLoop() {
  while (true) {
    const startTime = Date.now();
    await runAnalyzer();
    const elapsedTime = Date.now() - startTime;
    const delay = Math.max(0, thresholds.pollInterval - elapsedTime);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
startAnalyzerLoop();

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
