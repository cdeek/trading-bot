import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import pRetry from 'p-retry';
import { executeTrade, tradeEmitter } from './transaction/index.js'; 
import webPush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

let thresholds = {
  liquidity: 8000,
  fdv: 30000,
  mc: 2000,
  age: 3,
  txns: 20,
  maxTrade: 20,
  slippageBps: 100,
  tradeAmount: (0.0287 * 1e9),
  pollInterval: (1000 * 60), 
};

let autoTradeEnabled = false;
let latestAnalysis = null;
let userSubscription = null; // Store the subscription for one client

webPush.setVapidDetails(
  'mailto:sabubakarsadiq77@gmail.com', // This should be your email
   process.env.PUBLIC_VAPID_KEY,          // Use the generated public key here
   process.env.PRIVATE_VAPID_KEY          // Use the generated private key here
);

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

function sendNotification(message) {
  const payload = JSON.stringify({ title: 'Solana Sniper Bot', body: message });
  if (!userSubscription) return;
  // Send notification to the one subscription
  webPush.sendNotification(userSubscription, payload)
    .then(response => console.log('Notification sent'))
    .catch(err => console.error('Error sending notification:', err));
}

app.post('/subscribe', (req, res) => {
  const subscription = req.body;

  // Store the subscription for later use
  userSubscription = subscription;
  res.status(201).json({ message: 'Subscription successful' });
});

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
  res.render('dashboard', { analysis: latestAnalysis, autoTrade: autoTradeEnabled, thresholds, vapidKey: process.env.PUBLIC_VAPID_KEY });
});

app.get('/trades-history', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'data', 'trades.json');
  res.sendFile(filePath);
});

app.get('/toggle-autotrade', (req, res) => {
  autoTradeEnabled = !autoTradeEnabled;
  io.emit('notification', { message: `🔄 Auto trade turned ${autoTradeEnabled ? 'ON ✅' : 'OFF ❌'}` });
  res.json({ autoTrade: autoTradeEnabled });
});

async function verifyWithRugcheck(tokenAddress) {
  const url = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
  try {
    const response = await robustFetch(url);
    if (!response.ok) throw new Error(`RugCheck API error: ${response.status}`);
    const report = await response.json();
    if (report?.rugged) return false;
    return tokenAddress;
  } catch (err) {
    io.emit('notification', { message: `⚠️ Error verifying token ${tokenAddress}: ${err.message}` });
    sendNotification("Error verifying token RugCheck")
    console.error('Error verifying rug:', err);
    return false;
  }
}

async function robustFetch(url, options = {}) {
  return pRetry(
    async () => {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (err) {
        throw new Error(`Network error: ${err.message}`);
      }
    },
    { retries: 3, minTimeout: 1000, factor: 2 },
  );
}

function potentialAddresses(tokens) {
  return tokens
    .filter((token) => { 
      const fdv = token.fdv || 0;
      const mc = token.marketCap || 0;
      const liquidity = token.liquidity?.usd || 0;
      const age = token.pairCreatedAt
        ? (Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60)
        : Infinity; // Prevent errors if pairCreatedAt is missing
      // const txns = (token.txns?.m5?.buys || 0) + (token.txns?.m5?.sells || 0);
      // const volume24H = token.volume?.h24?.usd || 0;
      
      if (age <= thresholds.age) {
        return fdv >= thresholds.fdv && mc >= thresholds.mc && liquidity >= thresholds.liquidity
      }

  })
    .map((token) => token.baseToken?.address || ""); // Default to empty string if address is missing
}

async function fetchTokenData() {
  try {
    const response = await robustFetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!response.ok) throw new Error(`DEXSCREENER_API error: ${response.status}`);
    const data = await response.json();
    const solanaTokens = data
      .filter((token) => token.chainId.toLowerCase() === 'solana')
      .map((token) => token.tokenAddress)
      .join(',');
    if (!solanaTokens.length) return [];
    const tokenResponse = await robustFetch(`https://api.dexscreener.com/tokens/v1/solana/${solanaTokens}`);
    if (!tokenResponse.ok) throw new Error(`DEXSCREENER_API_SOL error: ${tokenResponse.status}`);
    const solanaData = await tokenResponse.json();
    return potentialAddresses(solanaData);
  } catch (err) {
    io.emit('notification', { message: `🚨 Error fetching token data: ${err.message}` });
    sendNotification("Error fetching token on Dexscreener")
    console.error('Error fetching token data:', err);
    return [];
  }
}

async function verifyTokens(tokens) {
  const verifiedTokens = [];
  for (const token of tokens) {
    const result = await verifyWithRugcheck(token);
    if (result) {
      verifiedTokens.push(result);
    }
  }
  return verifiedTokens;
}

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
  if (latestAnalysis) socket.emit('analysisUpdate', latestAnalysis);
}); 

tradeEmitter.on('tradeUpdate', (trade) => {
  sendNotification(trade.message);
  io.emit('notification', trade);
});

async function runAnalyzer() {
  io.emit('notification', { message: '📊 Analyzing market data...' });
  const tokens = await fetchTokenData();
  const verifiedTokens = await verifyTokens(tokens);
  sendNotification(`${verifiedTokens.length} tokens verified`);
  io.emit('notification', { message: verifiedTokens});
  // console.log('verifiedTokens');
  // console.log(verifiedTokens);
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
        await executeTrade({ 
          amount: thresholds.tradeAmount,
          outputMint: token,
          slippageBps: thresholds.slippageBps,
          tradeThreshold
        });
        executedTrades++;
        sendNotification(`🚀 Trade executed for ${token} successfully!`);
        io.emit('notification', { message: `🚀 Trade executed for ${token} successfully!` });
      } catch (err) {
        failedTrades++;
        sendNotification(`❌ Trade failed for ${token}: ${err.message}`);
        io.emit('notification', { message: `❌ Trade failed for ${token}: ${err.message}` });
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


// Generate VAPID keys
// const vapidKeys = webPush.generateVAPIDKeys();
// console.log(vapidKeys);
