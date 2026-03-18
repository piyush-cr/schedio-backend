#!/usr/bin/env node
/**
 * Big Bang Load Test
 * - Targets very high concurrency (e.g., 5k VUs)
 * - Stops after N total requests (e.g., 1,000,000)
 * - Rotates access tokens (from file OR by logging in per worker)
 * - Writes a shareable report (JSON + HTML + MD) to load-tests/results/
 *
 * Notes:
 * - "1 million requests at once" is not physically "at once" on one machine;
 *   this script approximates it by running high concurrency until the total request
 *   count reaches the target.
 * - 5k concurrent connections may exceed OS/file-descriptor limits on Windows.
 *   If you see socket errors/timeouts, run from a stronger machine or distribute.
 */
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const DEFAULTS = {
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  vus: Number(process.env.VUS || 5000),
  totalRequests: Number(process.env.TOTAL_REQUESTS || 1_000_000),
  durationSec: Number(process.env.DURATION_SEC || 0), // optional hard stop
  loginEmail: process.env.TEST_USER_EMAIL || "test@example.com",
  loginPassword: process.env.TEST_USER_PASSWORD || "testpassword123",
  tokensFile: process.env.TOKENS_FILE || "",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 30_000),
  // For high RPS, default to no think time.
  thinkTimeMinMs: Number(process.env.THINK_MIN_MS || 0),
  thinkTimeMaxMs: Number(process.env.THINK_MAX_MS || 0),
  // Profile controls which endpoints are hit. Options:
  // - "health-only": maximize RPS without auth/DB
  // - "read-heavy": authenticated GETs (more realistic)
  // - "mixed": default mix (auth + reads)
  profile: (process.env.PROFILE || "mixed").toLowerCase(),
  // If TOKENS_FILE is not provided, prefetch a pool of tokens once and reuse them
  // instead of logging in from every worker (helps push higher RPS and avoids login bottleneck).
  prefetchTokens: Number(process.env.PREFETCH_TOKENS || 2000),
  prefetchConcurrency: Number(process.env.PREFETCH_CONCURRENCY || 50),
};

function getEndpoints(profile) {
  if (profile === "health-only") {
    return [{ method: "GET", path: "/health", auth: false, weight: 1 }];
  }

  if (profile === "read-heavy") {
    return [
      { method: "GET", path: "/api/auth/me", auth: true, weight: 4 },
      { method: "GET", path: "/api/attendance/today", auth: true, weight: 3 },
      { method: "GET", path: "/api/attendance/weekly", auth: true, weight: 2 },
      { method: "GET", path: "/api/tasks?page=1&limit=10", auth: true, weight: 1 },
    ];
  }

  // mixed (default)
  return [
    { method: "GET", path: "/health", auth: false, weight: 2 },
    { method: "GET", path: "/api/auth/me", auth: true, weight: 2 },
    { method: "GET", path: "/api/attendance/today", auth: true, weight: 2 },
    { method: "GET", path: "/api/attendance/weekly", auth: true, weight: 2 },
    { method: "GET", path: "/api/tasks?page=1&limit=10", auth: true, weight: 1 },
  ];
}

function nowIsoCompact() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

function pickWeighted(list) {
  const total = list.reduce((s, x) => s + (x.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of list) {
    r -= item.weight || 1;
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Metrics {
  constructor() {
    this.startedAt = Date.now();
    this.total = 0;
    this.success = 0;
    this.failed = 0;
    this.byStatus = {}; // { "200": n, "429": n, "500": n, "0": n }
    this.responseTimesMs = [];
    this.sampled = 0;
    this.maxSamples = 200_000; // cap memory
  }

  record(status, durationMs) {
    this.total++;
    const key = String(status);
    this.byStatus[key] = (this.byStatus[key] || 0) + 1;
    if (status >= 200 && status < 400) this.success++;
    else this.failed++;

    // Keep a bounded sample of response times
    if (this.sampled < this.maxSamples) {
      this.responseTimesMs.push(durationMs);
      this.sampled++;
    } else if (Math.random() < 0.05) {
      // reservoir-ish replacement
      const idx = Math.floor(Math.random() * this.maxSamples);
      this.responseTimesMs[idx] = durationMs;
    }
  }

  snapshot() {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const sorted = [...this.responseTimesMs].sort((a, b) => a - b);
    const avg =
      sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const rps = elapsedSec > 0 ? this.total / elapsedSec : 0;
    const successRate = this.total > 0 ? (this.success / this.total) * 100 : 0;

    return {
      totalRequests: this.total,
      successRate: Number(successRate.toFixed(2)),
      requestsPerSecond: Number(rps.toFixed(2)),
      avgResponseTimeMs: Number(avg.toFixed(2)),
      p50ResponseTimeMs: Number(percentile(sorted, 0.5).toFixed(2)),
      p95ResponseTimeMs: Number(percentile(sorted, 0.95).toFixed(2)),
      p99ResponseTimeMs: Number(percentile(sorted, 0.99).toFixed(2)),
      byStatus: this.byStatus,
      sampledResponseTimes: this.sampled,
      elapsedSec: Number(elapsedSec.toFixed(1)),
    };
  }
}

class HttpClient {
  constructor(baseUrl, timeoutMs) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    const isHttps = /^https:/i.test(baseUrl);
    this.httpMod = isHttps ? https : http;
    this.agent = isHttps
      ? new https.Agent({ keepAlive: true, maxSockets: 50_000 })
      : new http.Agent({ keepAlive: true, maxSockets: 50_000 });
  }

  request(method, reqPath, body, headers) {
    const url = new URL(reqPath, this.baseUrl);
    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      agent: this.agent,
    };

    return new Promise((resolve) => {
      const start = Date.now();
      const req = this.httpMod.request(options, (res) => {
        // We don't need the body; drain it to keep sockets healthy.
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, durationMs: Date.now() - start });
        });
      });

      req.on("error", () => {
        resolve({ status: 0, durationMs: Date.now() - start });
      });

      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        resolve({ status: 0, durationMs: Date.now() - start });
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async login(email, password) {
    // expects response with { data: { access_token } }, but we only need the token
    const url = new URL("/api/auth/login", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;
    const agent = this.agent;

    const payload = JSON.stringify({ email, password });
    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      agent,
    };

    return new Promise((resolve) => {
      const start = Date.now();
      const req = mod.request(options, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const durationMs = Date.now() - start;
          try {
            const json = JSON.parse(data);
            const token = json?.data?.access_token || null;
            resolve({ status: res.statusCode || 0, durationMs, token });
          } catch {
            resolve({ status: res.statusCode || 0, durationMs, token: null });
          }
        });
      });
      req.on("error", () => resolve({ status: 0, durationMs: Date.now() - start, token: null }));
      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        resolve({ status: 0, durationMs: Date.now() - start, token: null });
      });
      req.write(payload);
      req.end();
    });
  }
}

function loadTokensFromFile(tokensFile) {
  if (!tokensFile) return [];
  const p = path.isAbsolute(tokensFile)
    ? tokensFile
    : path.join(process.cwd(), tokensFile);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function main() {
  const startedAt = Date.now();
  const runId = `big-bang-${nowIsoCompact()}`;
  const resultsDir = path.join(process.cwd(), "load-tests", "results", runId);
  mkdirp(resultsDir);

  const tokensFromFile = loadTokensFromFile(DEFAULTS.tokensFile);
  const tokenMode = tokensFromFile.length > 0 ? "file" : "prefetch";
  const ENDPOINTS = getEndpoints(DEFAULTS.profile);

  console.log("==================================================");
  console.log("SCHEDIO BIG BANG LOAD TEST");
  console.log(`Run ID: ${runId}`);
  console.log(`Target: ${DEFAULTS.baseUrl}`);
  console.log(`VUs: ${DEFAULTS.vus}`);
  console.log(`Total Requests Target: ${DEFAULTS.totalRequests}`);
  console.log(`Profile: ${DEFAULTS.profile}`);
  console.log(`Token Mode: ${tokenMode}${tokenMode === "file" ? ` (${tokensFromFile.length} tokens)` : ""}`);
  if (DEFAULTS.durationSec > 0) console.log(`Hard stop after: ${DEFAULTS.durationSec}s`);
  console.log("==================================================");

  const client = new HttpClient(DEFAULTS.baseUrl, DEFAULTS.requestTimeoutMs);
  const metrics = new Metrics();

  let stop = false;
  const stopAtMs = DEFAULTS.durationSec > 0 ? Date.now() + DEFAULTS.durationSec * 1000 : 0;

  // Shared token ring
  let tokenIdx = 0;
  const nextTokenFromPool = (pool) => {
    if (!pool.length) return null;
    tokenIdx = (tokenIdx + 1) % pool.length;
    return pool[tokenIdx];
  };

  // Prefetch tokens (only if auth endpoints are part of the profile)
  let tokenPool = tokensFromFile;
  const needsAuth = ENDPOINTS.some((e) => e.auth);
  if (!tokenPool.length && needsAuth) {
    const target = Math.min(DEFAULTS.prefetchTokens, DEFAULTS.vus);
    console.log(`Prefetching ${target} access tokens (concurrency=${DEFAULTS.prefetchConcurrency})...`);
    tokenPool = await prefetchTokens(client, metrics, target, DEFAULTS.prefetchConcurrency, DEFAULTS.loginEmail, DEFAULTS.loginPassword);
    console.log(`Prefetched tokens: ${tokenPool.length}`);
    if (!tokenPool.length) {
      console.log("⚠️  No tokens prefetched. Authenticated endpoints will likely fail with 401.");
    }
  }

  const shouldStop = () => {
    if (stop) return true;
    if (metrics.total >= DEFAULTS.totalRequests) return true;
    if (stopAtMs && Date.now() >= stopAtMs) return true;
    return false;
  };

  const worker = async (workerId) => {
    let token = needsAuth ? nextTokenFromPool(tokenPool) : null;

    while (!shouldStop()) {
      const ep = pickWeighted(ENDPOINTS);
      let headers = {};

      if (ep.auth) {
        if (token) headers = { Authorization: `Bearer ${token}` };
      }

      const res = await client.request(ep.method, ep.path, null, headers);
      metrics.record(res.status, res.durationMs);

      // Rotate token on 401 (expired/invalid) and optionally on lots of 429.
      if (ep.auth && (res.status === 401 || res.status === 403 || res.status === 429)) {
        token = nextTokenFromPool(tokenPool);
      }

      if (DEFAULTS.thinkTimeMaxMs > 0) {
        const jitter =
          DEFAULTS.thinkTimeMinMs +
          Math.floor(Math.random() * (DEFAULTS.thinkTimeMaxMs - DEFAULTS.thinkTimeMinMs + 1));
        if (jitter > 0) await sleep(jitter);
      }

      // Fail-safe: stop if asked
      if (shouldStop()) break;
    }

    return workerId;
  };

  const reporter = setInterval(() => {
    const s = metrics.snapshot();
    const ok = s.byStatus["200"] || 0;
    const rl = s.byStatus["429"] || 0;
    const err5xx =
      Object.entries(s.byStatus)
        .filter(([k]) => /^\d+$/.test(k) && Number(k) >= 500)
        .reduce((sum, [, v]) => sum + v, 0) || 0;
    const timeouts = s.byStatus["0"] || 0;

    console.log(
      `[${s.elapsedSec}s] total=${s.totalRequests} rps=${s.requestsPerSecond} success=${s.successRate}% p95=${s.p95ResponseTimeMs}ms 200=${ok} 429=${rl} 5xx=${err5xx} timeout=${timeouts}`
    );
  }, 5000);

  // Start workers
  const workers = [];
  for (let i = 0; i < DEFAULTS.vus; i++) workers.push(worker(i));

  // Stop when done
  await Promise.all(workers).catch(() => {});
  clearInterval(reporter);
  stop = true;

  const summary = metrics.snapshot();
  const endedAt = Date.now();

  const reportJson = {
    runId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSec: Number(((endedAt - startedAt) / 1000).toFixed(2)),
    config: DEFAULTS,
    endpoints: ENDPOINTS,
    summary,
  };

  const jsonPath = path.join(resultsDir, "report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), "utf8");

  const mdPath = path.join(resultsDir, "report.md");
  fs.writeFileSync(
    mdPath,
    [
      `# Schedio Load Test Report`,
      ``,
      `- **Run ID**: ${runId}`,
      `- **Target**: ${DEFAULTS.baseUrl}`,
      `- **VUs**: ${DEFAULTS.vus}`,
      `- **Total Requests Target**: ${DEFAULTS.totalRequests}`,
      `- **Token Mode**: ${tokenMode}`,
      `- **Profile**: ${DEFAULTS.profile}`,
      `- **Duration (sec)**: ${reportJson.durationSec}`,
      ``,
      `## Summary`,
      ``,
      `- **Total Requests**: ${summary.totalRequests}`,
      `- **Success Rate**: ${summary.successRate}%`,
      `- **RPS**: ${summary.requestsPerSecond}`,
      `- **Avg (ms)**: ${summary.avgResponseTimeMs}`,
      `- **P95 (ms)**: ${summary.p95ResponseTimeMs}`,
      `- **P99 (ms)**: ${summary.p99ResponseTimeMs}`,
      ``,
      `## Status Code Breakdown`,
      ``,
      "```json",
      JSON.stringify(summary.byStatus, null, 2),
      "```",
      ``,
      `## Notes`,
      ``,
      `- If **429** is high, you are hitting rate limiting (expected if testing limiter).`,
      `- If **5xx** or **0/timeouts** are high, the backend (or DB/Redis) is saturating or crashing under load.`,
      `- To maximize generator RPS, use \`PROFILE=health-only\` and \`THINK_MAX_MS=0\`.`,
      ``,
      `Artifacts:`,
      `- JSON: \`${path.relative(process.cwd(), jsonPath)}\``,
      `- MD: \`${path.relative(process.cwd(), mdPath)}\``,
    ].join("\n"),
    "utf8"
  );

  const htmlPath = path.join(resultsDir, "report.html");
  fs.writeFileSync(
    htmlPath,
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Schedio Load Test Report - ${runId}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color: #111; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 12px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    code, pre { background: #0b1020; color: #e5e7eb; border-radius: 10px; padding: 12px; overflow:auto; }
    h1 { margin: 0 0 6px 0; }
    .muted { color: #6b7280; }
    .k { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Schedio Load Test Report</h1>
  <div class="muted">Run ID: <span class="k">${runId}</span></div>
  <div class="card grid">
    <div><div class="muted">Target</div><div class="k">${DEFAULTS.baseUrl}</div></div>
    <div><div class="muted">VUs</div><div class="k">${DEFAULTS.vus}</div></div>
    <div><div class="muted">Total Requests</div><div class="k">${summary.totalRequests}</div></div>
    <div><div class="muted">Success Rate</div><div class="k">${summary.successRate}%</div></div>
    <div><div class="muted">RPS</div><div class="k">${summary.requestsPerSecond}</div></div>
    <div><div class="muted">Avg / P95 / P99 (ms)</div><div class="k">${summary.avgResponseTimeMs} / ${summary.p95ResponseTimeMs} / ${summary.p99ResponseTimeMs}</div></div>
  </div>

  <div class="card">
    <h2>Status Codes</h2>
    <pre>${JSON.stringify(summary.byStatus, null, 2)}</pre>
  </div>

  <div class="card">
    <h2>Config</h2>
    <pre>${JSON.stringify(DEFAULTS, null, 2)}</pre>
  </div>

  <div class="card">
    <h2>How to interpret</h2>
    <ul>
      <li><b>429 high</b> means rate limiting triggered (expected if you are testing it).</li>
      <li><b>5xx/0 high</b> means backend/DB/Redis saturation, crashes, or timeouts.</li>
      <li>On a single Windows box, 5k concurrent sockets may require tuning OS limits or distributing the test.</li>
    </ul>
  </div>
</body>
</html>`,
    "utf8"
  );

  console.log("==================================================");
  console.log("✅ Test Complete!");
  console.log("");
  console.log("📊 Results:");
  console.log(`   Total Requests: ${summary.totalRequests}`);
  console.log(`   Success Rate: ${summary.successRate}%`);
  console.log(`   Requests/Second: ${summary.requestsPerSecond}`);
  console.log(`   Avg Response Time: ${summary.avgResponseTimeMs}ms`);
  console.log(`   P95 Response Time: ${summary.p95ResponseTimeMs}ms`);
  console.log(`   P99 Response Time: ${summary.p99ResponseTimeMs}ms`);
  console.log("");
  console.log("📁 Report saved:");
  console.log(`   JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`   HTML: ${path.relative(process.cwd(), htmlPath)}`);
  console.log(`   MD:   ${path.relative(process.cwd(), mdPath)}`);
  console.log("==================================================");
}

async function prefetchTokens(client, metrics, count, concurrency, email, password) {
  const tokens = [];
  let idx = 0;

  const runOne = async () => {
    while (idx < count) {
      const my = idx++;
      const res = await client.login(email, password);
      metrics.record(res.status, res.durationMs);
      if (res.status === 200 && res.token) tokens.push(res.token);
      // tiny jitter to avoid synchronized bursts
      if (my % 25 === 0) await sleep(10);
    }
  };

  const workers = [];
  const c = Math.max(1, Math.min(concurrency, 500));
  for (let i = 0; i < c; i++) workers.push(runOne());
  await Promise.all(workers);
  return tokens;
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

