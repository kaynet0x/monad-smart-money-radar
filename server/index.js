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
    apiKey,
    'Content-Type': 'application/json'
  };

  try {
    let tokenAddress = token;

    if (!token.startsWith('0x')) {
      const searchResponse = await fetch(`${nansenBaseUrl}/api/v1/search/general`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          search_query: token,
          result_type: 'token',
          chain,
          limit: 5
        })
      });
      const searchData = await readNansenResponse(searchResponse);

      if (!searchResponse.ok) {
        return res.status(searchResponse.status >= 400 ? searchResponse.status : 502).json({
          error: 'nansen_api_error',
          status: searchResponse.status,
          upstream: searchData
        });
      }

      tokenAddress = searchData?.tokens?.find(
        (result) => typeof result?.address === 'string' && result.address
      )?.address;

      if (!tokenAddress) {
        return res.status(404).json({
          error: 'token_not_found',
          message: `No token address found for search query: ${token}`
        });
      }
    }

    const tokenInfoResponse = await fetch(`${nansenBaseUrl}/api/v1/tgm/token-information`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chain, token_address: tokenAddress, timeframe: '1d' })
    });
    const tokenInfo = await readNansenResponse(tokenInfoResponse);

    if (!tokenInfoResponse.ok) {
      return res.status(tokenInfoResponse.status >= 400 ? tokenInfoResponse.status : 502).json({
        error: 'nansen_api_error',
        status: tokenInfoResponse.status,
        upstream: tokenInfo
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
            filters: { token_address: tokenAddress }
          })
        });
        const holdingsData = await readNansenResponse(holdingsResponse);

        if (holdingsResponse.ok) {
          nansen.smart_money_holdings = holdingsData;
        } else {
          return res.status(holdingsResponse.status >= 400 ? holdingsResponse.status : 502).json({
            error: 'nansen_api_error',
            status: holdingsResponse.status,
            upstream: holdingsData
          });
        }
      } catch {
        return res.status(502).json({
          error: 'nansen_api_error',
          status: 502,
          upstream: { error: 'upstream_unavailable' }
        });
      }
    }

    return res.status(200).json({ token, token_address: tokenAddress, chain, nansen });
  } catch {
    return res.status(502).json({
      error: 'nansen_api_error',
      status: 502,
      upstream: { error: 'upstream_unavailable' }
    });
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
