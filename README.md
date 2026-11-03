# Broken Product URL Checker

A small internal tool for the Oscar Wylee SEO / URL audit. It takes a CSV of old Magento-style catalog URLs
(e.g. `/catalog/product/view/id/1051/s/leo-optical/category/3/`), checks each one, and produces a redirect map
showing where every broken URL should point.

The tool has two parts:

| File | What it does |
| --- | --- |
| `index.html` | The checker UI. Runs entirely in the browser: upload a CSV, run the checks, and download `Output.csv`. |
| `cors-proxy-server.js` | A local Node/Express proxy. The browser can't read status codes or redirects from `oscarwylee.com.au` directly (no CORS headers), so it asks this proxy to fetch each URL and report the result. |

## Requirements

- Node.js 18 or newer (Express 5 needs it)
- A modern browser (Chrome, Edge, Firefox, Safari)
- Internet access (the page loads [PapaParse](https://www.papaparse.com/) from a CDN for CSV parsing)

## Setup

```bash
npm install
```

## Usage

### 1. Start the proxy

```bash
npm start
```

You should see:

```
  ✅  CORS Proxy Server running at:
      http://localhost:9876
```

Leave this terminal running while you use the checker. To use a different port, run `PORT=8080 npm start` and
update the proxy prefix in the checker (see [Settings](#settings)).

### 2. Open the checker

Open `index.html` in your browser (double-click it, or run `open index.html` on macOS).

### 3. Run a check

1. **Upload your CSV.** Click the upload area or drag the file onto it. The checker reads a column named `Full URL`.
   If there isn't one, it uses the first column.
2. Click **Start check**. Progress and live counts (checked, already redirected, needs new redirect, errors)
   update as each URL finishes.
3. If any rows end in an error, click **Retry errors only** to re-check just those rows.
4. Click **Download Output.csv** to save the results.

You can click **Stop** at any time. Rows that finished are kept and can still be downloaded.

## How the redirect target is chosen

For each URL in the input:

1. **Check the original URL.** If it already redirects somewhere, report it as `Already redirected`, together with
   the final URL it lands on.
2. **Otherwise, build the clean product URL.** Take the product slug from the `/s/<slug>/` part of the path and
   rebuild it as `/<slug>.html`.
   For example, `.../catalog/product/view/id/1052/s/leo-sunglasses/category/8/locations.html` becomes `/leo-sunglasses.html`.
3. **Check the clean URL:**
   - **200**: use the clean URL as the redirect target.
   - **Redirects**: use the URL it finally lands on.
   - **Anything else (e.g. 404)**: fall back to a category page. If the slug contains `sunglass`, use
     `/sunglasses.html`; otherwise use `/glasses.html`.

## Output format

`Output.csv` always has these four columns:

| Column | Possible values |
| --- | --- |
| `Full URL` | The original URL from your input file. |
| `Full URL Status` | The HTTP status of the original URL (e.g. `404`, `200`). `301` if it already redirects. `Error` if it couldn't be checked. |
| `Full URL Redirect` | The URL to redirect to, or one of: `Already redirected` · `Could not determine product slug` · `Could not check (…)` · `Could not verify correct URL (…)` |
| `Already redirected URL` | The final URL that an already-redirecting URL lands on, otherwise `None`. |

Example row (made up to show the format):

```csv
Full URL,Full URL Status,Full URL Redirect,Already redirected URL
https://www.oscarwylee.com.au/catalog/product/view/id/1051/s/leo-optical/category/3/,404,https://www.oscarwylee.com.au/leo-optical.html,None
```

> **Note on 301 vs 302:** A redirect is detected by comparing the requested URL with the final URL the proxy
> reaches. Only the path is compared; the query string, a trailing slash and letter case are ignored. The proxy
> doesn't report whether the redirect was a 301 or a 302, so already-redirected URLs are always labelled `301`.

## Settings

Open **Advanced settings** under the buttons in the checker:

| Setting | Default | Notes |
| --- | --- | --- |
| Concurrent requests | `3` | How many URLs are checked at the same time (1–15). Higher is faster but more likely to be rate-limited. |
| CORS proxy prefix | `http://localhost:9876/get?url=` | Change this if you run the proxy on another port or host. |
| Request timeout (ms) | `20000` | Time allowed for each request before it is aborted. |
| Delay between requests (ms) | `400` | Pause before the next request starts, to avoid flooding the site. |
| Max retries per URL | `3` | Failed requests are retried with exponential backoff: about 2s, then 4s, then 8s, up to a 16s maximum. |

## Proxy API

The proxy returns JSON in the same shape as the [AllOrigins](https://allorigins.win/) `/get` endpoint, so any
AllOrigins-compatible proxy can be used in its place.

**`GET /get?url=<encoded-url>`**

The proxy follows up to 10 redirects (301, 302, 303, 307, 308). It returns the final status and URL; the page
content itself is not returned.

```json
{ "status": { "url": "https://final-url/...", "http_code": 200, "response_time": 0 }, "contents": "" }
```

If the request to the site fails, it returns HTTP `502` with an `error` message instead.
If the `url` parameter is missing, it returns HTTP `400`.

**`GET /health`**: returns `{ "ok": true, "uptime": <seconds> }`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Every row shows `Error … Failed to fetch` | The proxy isn't running, or the proxy prefix setting doesn't match the proxy's address. Start it with `npm start` and check `http://localhost:9876/health`. |
| `Could not check (signal is aborted without reason)` | The request timed out. Increase **Request timeout**, reduce **Concurrent requests**, then click **Retry errors only**. |
| `proxy HTTP 502` | The proxy couldn't reach the site (network or DNS problem, or the site refused the connection). Retry once the connection is back. |
| `Could not determine product slug` | The URL doesn't contain the `/catalog/product/view/id/<n>/s/<slug>` pattern, so no product URL can be built from it. Pick a redirect for it manually. |
| Lots of errors partway through a large file | The site is probably rate-limiting you. Lower concurrency, raise the delay, and retry the errors. |

## Project structure

```
.
├── index.html             # Checker UI (open in a browser)
├── cors-proxy-server.js   # Local proxy (npm start)
├── package.json
└── Output.csv             # Example output from a previous run
```
