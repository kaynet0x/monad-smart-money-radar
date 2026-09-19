const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
const nansenBaseUrl = process.env.NANSEN_API_BASE_URL || 'https://api.nansen.ai';

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function readNansenResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { message: text };
  }
}

app.post('/api/token-report', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const requestedChain = req.body?.chain;

  if (!token) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  if (requestedChain !== undefined && typeof requestedChain !== 'string') {
    return res.status(400).json({ error: 'invalid_chain' });
  }

  const chain = requestedChain?.trim().toLowerCase() || 'monad';
  const apiKey = process.env.NANSEN_API_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({ error: 'missing_nansen_key' });
  }

  const headers = {
    apikey: apiKey,
    'content-type': 'application/json'
  };

  try {
    const tokenInfoResponse = await fetch(`${nansenBaseUrl}/api/v1/tgm/token-information`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chain, token_address: token, timeframe: '1d' })
    });
    const tokenInfo = await readNansenResponse(tokenInfoResponse);

    if (!tokenInfoResponse.ok) {
      return res.status(tokenInfoResponse.status >= 400 ? tokenInfoResponse.status : 502).json({
        error: 'nansen_upstream_error',
        status: tokenInfoResponse.status
      });
    }

    const nansen = { token_info: tokenInfo };

    // Nansen documents Smart Money Holdings support for Monad. This report remains
    // useful if an account tier or an upstream capability prevents this extra call.
    if (chain === 'monad') {
      try {
        const holdingsResponse = await fetch(`${nansenBaseUrl}/api/v1/smart-money/holdings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chains: [chain],
            filters: { token_address: token }
          })
        });

        if (holdingsResponse.ok) {
          nansen.smart_money_holdings = await readNansenResponse(holdingsResponse);
        } else {
          nansen.smart_money_holdings = {
            available: false,
            status: holdingsResponse.status
          };
        }
      } catch {
        nansen.smart_money_holdings = { available: false, error: 'upstream_unavailable' };
      }
    }

    return res.status(200).json({ token, chain, nansen });
  } catch {
    return res.status(502).json({ error: 'nansen_upstream_unavailable' });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  return res.status(500).json({ error: 'internal_server_error' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
