import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Web3 from 'web3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const port = process.env.PORT || 3001;

// Initialize Web3 with Ethereum mainnet
const web3 = new Web3('https://eth-mainnet.g.alchemy.com/v2/demo');

async function getTokenBalances(address) {
  if (!MORALIS_API_KEY) {
    throw new Error('Moralis API key not configured. Please set MORALIS_API_KEY in .env file');
  }

  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2/${address}/erc20`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
        },
        params: {
          chain: 'eth',
        },
      }
    );

    const balances = await Promise.all(
      response.data.map(async (token) => {
        const decimals = parseInt(token.decimals);
        const amount = parseFloat(token.balance) / Math.pow(10, decimals);
        
        // Get token price from CoinGecko (you should implement proper rate limiting)
        let price = 0;
        try {
          const priceResponse = await axios.get(
            `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${token.token_address}&vs_currencies=usd`
          );
          price = priceResponse.data[token.token_address.toLowerCase()]?.usd || 0;
        } catch (error) {
          console.error('Error fetching price:', error);
        }

        return {
          chain: 'Ethereum',
          token: token.symbol,
          price: price,
          amount: amount,
          usdValue: price * amount,
        };
      })
    );

    return balances.filter(b => b.usdValue > 0.01); // Filter out dust
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Invalid Moralis API key');
    }
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

// API routes
app.get('/api/wallet/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address
    if (!web3.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const balances = await getTokenBalances(address);
    const totalValue = balances.reduce((sum, token) => sum + token.usdValue, 0);

    res.json({
      holdings: balances,
      totalValue: totalValue,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch wallet data',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});