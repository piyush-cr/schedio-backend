/**
 * Node.js Load Testing Script
 * Uses native Node.js with no external dependencies (except node-fetch)
 * Tests maximum load capacity of the backend
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// Configuration
const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  testUser: {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'testpassword123'
  },
  stages: [
    { name: 'Smoke', vus: 5, duration: 30 },
    { name: 'Load', vus: 20, duration: 60 },
    { name: 'Stress', vus: 50, duration: 120 },
    { name: 'High Stress', vus: 100, duration: 120 },
    { name: 'Breakpoint', vus: 200, duration: 180 },
    { name: 'Max Load', vus: 500, duration: 180 }
  ]
};

// Metrics
class Metrics {
  constructor() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    this.errors = {};
    this.startTime = Date.now();
  }

  recordResponse(duration, success, statusCode) {
    this.totalRequests++;
    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
    this.responseTimes.push(duration);
    
    if (!success) {
      const key = `status_${statusCode}`;
      this.errors[key] = (this.errors[key] || 0) + 1;
    }
  }

  getStats() {
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
    const p90 = sorted[Math.floor(sorted.length * 0.90)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length || 0;
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      successRate: ((this.successfulRequests / this.totalRequests) * 100).toFixed(2),
      avgResponseTime: avg.toFixed(2),
      minResponseTime: min.toFixed(2),
      maxResponseTime: max.toFixed(2),
      p50ResponseTime: p50.toFixed(2),
      p90ResponseTime: p90.toFixed(2),
      p95ResponseTime: p95.toFixed(2),
      p99ResponseTime: p99.toFixed(2),
      requestsPerSecond: (this.totalRequests / ((Date.now() - this.startTime) / 1000)).toFixed(2),
      errors: this.errors
    };
  }

  reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    this.errors = {};
    this.startTime = Date.now();
  }
}

// HTTP Client
class HttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.agent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
  }

  async request(method, path, body = null, headers = {}) {
    const url = new URL(path, this.baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      agent: this.agent
    };

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const duration = Date.now() - startTime;
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(data),
              duration,
              headers: res.headers
            });
          } catch {
            resolve({
              status: res.statusCode,
              body: data,
              duration,
              headers: res.headers
            });
          }
        });
      });

      req.on('error', (e) => {
        const duration = Date.now() - startTime;
        reject({ error: e.message, duration, status: 0 });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        const duration = Date.now() - startTime;
        reject({ error: 'Timeout', duration, status: 0 });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async get(path, headers = {}) {
    return this.request('GET', path, null, headers);
  }

  async post(path, body, headers = {}) {
    return this.request('POST', path, body, headers);
  }
}

// Load Test Worker
class LoadTestWorker {
  constructor(client, metrics) {
    this.client = client;
    this.metrics = metrics;
    this.accessToken = null;
    this.running = true;
  }

  async login() {
    try {
      const res = await this.client.post('/api/auth/login', {
        email: CONFIG.testUser.email,
        password: CONFIG.testUser.password
      });
      
      this.metrics.recordResponse(res.duration, res.status === 200, res.status);
      
      if (res.status === 200 && res.body.data?.access_token) {
        this.accessToken = res.body.data.access_token;
        return true;
      }
    } catch (e) {
      this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
    }
    return false;
  }

  async runScenario() {
    while (this.running) {
      try {
        // Login if no token
        if (!this.accessToken) {
          await this.login();
        }

        const headers = this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {};

        // Health check
        try {
          const res = await this.client.get('/health');
          this.metrics.recordResponse(res.duration, res.status === 200, res.status);
        } catch (e) {
          this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
        }

        // Get current user
        if (this.accessToken) {
          try {
            const res = await this.client.get('/api/auth/me', headers);
            this.metrics.recordResponse(res.duration, res.status === 200, res.status);
          } catch (e) {
            this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
            if (e.status === 401) this.accessToken = null;
          }
        }

        // Get weekly attendance
        if (this.accessToken) {
          try {
            const res = await this.client.get('/api/attendance/weekly', headers);
            this.metrics.recordResponse(res.duration, res.status === 200, res.status);
          } catch (e) {
            this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
          }
        }

        // Get today's attendance
        if (this.accessToken) {
          try {
            const res = await this.client.get('/api/attendance/today', headers);
            this.metrics.recordResponse(res.duration, res.status === 200, res.status);
          } catch (e) {
            this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
          }
        }

        // Get tasks
        if (this.accessToken) {
          try {
            const res = await this.client.get('/api/tasks?page=1&limit=10', headers);
            this.metrics.recordResponse(res.duration, res.status === 200, res.status);
          } catch (e) {
            this.metrics.recordResponse(e.duration || 0, false, e.status || 0);
          }
        }

        // Small delay between requests
        await this.sleep(100 + Math.random() * 200);
      } catch (e) {
        console.error('Worker error:', e.message);
      }
    }
  }

  stop() {
    this.running = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Load Test Runner
class LoadTestRunner {
  constructor() {
    this.client = new HttpClient(CONFIG.baseUrl);
    this.metrics = new Metrics();
    this.workers = [];
  }

  async runStage(stage) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting ${stage.name} Test: ${stage.vus} VUs for ${stage.duration}s`);
    console.log('='.repeat(60));

    this.metrics.reset();
    this.workers = [];

    // Create workers
    for (let i = 0; i < stage.vus; i++) {
      const worker = new LoadTestWorker(this.client, this.metrics);
      this.workers.push(worker);
      worker.runScenario();
    }

    // Monitor progress
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const stats = this.metrics.getStats();
      console.log(`[${elapsed}s/${stage.duration}s] Requests: ${stats.totalRequests} | Success: ${stats.successRate}% | Avg: ${stats.avgResponseTime}ms | RPS: ${stats.requestsPerSecond}`);
    }, 5000);

    // Wait for stage duration
    await this.sleep(stage.duration * 1000);

    // Stop workers
    this.workers.forEach(w => w.stop());
    clearInterval(interval);

    // Print stage results
    const finalStats = this.metrics.getStats();
    console.log(`\n${stage.name} Test Results:`);
    console.log(`  Total Requests: ${finalStats.totalRequests}`);
    console.log(`  Success Rate: ${finalStats.successRate}%`);
    console.log(`  Avg Response Time: ${finalStats.avgResponseTime}ms`);
    console.log(`  P95 Response Time: ${finalStats.p95ResponseTime}ms`);
    console.log(`  P99 Response Time: ${finalStats.p99ResponseTime}ms`);
    console.log(`  Requests/Second: ${finalStats.requestsPerSecond}`);
    
    if (Object.keys(finalStats.errors).length > 0) {
      console.log(`  Errors:`, finalStats.errors);
    }

    return finalStats;
  }

  async runAllStages() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║          SCHEDIO BACKEND LOAD TEST                        ║');
    console.log(`║          Target: ${CONFIG.baseUrl.padEnd(40)} ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');

    const results = [];
    
    for (const stage of CONFIG.stages) {
      const stats = await this.runStage(stage);
      results.push({ stage: stage.name, ...stats });
      
      // Check if we should stop (too many errors)
      if (parseFloat(stats.successRate) < 90) {
        console.log('\n⚠️  Stopping test: Success rate dropped below 90%');
        break;
      }
      
      // Brief pause between stages
      await this.sleep(5000);
    }

    // Print summary
    this.printSummary(results);
  }

  printSummary(results) {
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    
    results.forEach(r => {
      console.log(`║ ${r.stage.padEnd(15)} | RPS: ${r.requestsPerSecond.padEnd(8)} | P95: ${r.p95ResponseTime.padEnd(8)}ms | Success: ${(r.successRate + '%').padEnd(8)} ║`);
    });
    
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    // Find breakpoint
    const maxRpsStage = results.reduce((max, r) => 
      parseFloat(r.requestsPerSecond) > parseFloat(max.requestsPerSecond) ? r : max
    );
    
    console.log(`\n📊 Maximum Capacity: ${maxRpsStage.requestsPerSecond} requests/second`);
    console.log(`   Achieved during: ${maxRpsStage.stage} test`);
    console.log(`   P95 Latency: ${maxRpsStage.p95ResponseTime}ms`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
const runner = new LoadTestRunner();

// Export for programmatic usage
export function runStage(stageName) {
  const stage = CONFIG.stages.find(s => s.name.toLowerCase() === stageName.toLowerCase());
  if (stage) {
    runner.runStage(stage);
  } else {
    console.error(`Stage "${stageName}" not found. Available stages:`, CONFIG.stages.map(s => s.name).join(', '));
  }
}

export function runAllStages() {
  return runner.runAllStages();
}

// Run if executed directly
if (process.argv[1]?.includes('load-test.js') && !process.argv.includes('--require')) {
  runner.runAllStages().catch(console.error);
}
