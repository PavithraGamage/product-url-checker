/**
 * Local CORS Proxy Server for Product URL Checker
 *
 * Returns JSON in AllOrigins-compatible format:
 *   { status: { http_code: 200, url: "https://final-url.com/..." }, contents: "..." }
 *
 * Usage:
 *   npm install express cors node-fetch@2
 *   node cors-proxy-server.js
 *
 * Then set the proxy prefix in the checker to:
 *   http://localhost:9876/get?url=
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 9876;

app.use(cors());

// ── follow redirects manually so we can capture the chain ──
function fetchWithRedirects(urlStr, maxRedirects = 10, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let redirectsLeft = maxRedirects;
    let currentUrl = urlStr;

    function doRequest(url) {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const req = lib.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: timeoutMs,
        },
        (res) => {
          // Handle redirects (301, 302, 303, 307, 308)
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            if (redirectsLeft <= 0) {
              resolve({
                http_code: res.statusCode,
                url: currentUrl,
                error: 'Too many redirects',
              });
              return;
            }
            redirectsLeft--;
            // Handle relative redirects
            try {
              currentUrl = new URL(res.headers.location, url).href;
            } catch (e) {
              currentUrl = res.headers.location;
            }
            // Consume the response body to free up the socket
            res.resume();
            doRequest(currentUrl);
            return;
          }

          // Non-redirect: read a small chunk of the body and resolve
          let body = '';
          let resolved = false;
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            if (resolved) return;
            body += chunk;
            if (body.length > 2000) {
              resolved = true;
              resolve({
                http_code: res.statusCode,
                url: currentUrl,
              });
              res.destroy();
            }
          });
          res.on('end', () => {
            if (resolved) return;
            resolved = true;
            resolve({
              http_code: res.statusCode,
              url: currentUrl,
            });
          });
          res.on('error', () => {
            if (resolved) return;
            resolved = true;
            resolve({
              http_code: res.statusCode,
              url: currentUrl,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    }

    doRequest(currentUrl);
  });
}

// ── main endpoint (AllOrigins-compatible) ──
app.get('/get', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  try {
    const result = await fetchWithRedirects(targetUrl);
    res.json({
      status: {
        url: result.url,
        http_code: result.http_code,
        response_time: 0,
      },
      contents: '',
    });
  } catch (err) {
    res.status(502).json({
      error: err.message,
      status: {
        url: targetUrl,
        http_code: 0,
      },
    });
  }
});

// ── health check ──
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  CORS Proxy Server running at:');
  console.log(`      http://localhost:${PORT}`);
  console.log('');
  console.log('  📋  Set this in the checker\'s Advanced Settings → CORS proxy prefix:');
  console.log(`      http://localhost:${PORT}/get?url=`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
