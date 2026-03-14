#!/usr/bin/env node

/**
 * Quick Load Test Runner
 * Usage: node load-tests/quick-test.js [options]
 * 
 * Options:
 *   --stage <name>    Run specific stage (smoke, load, stress, spike, breakpoint)
 *   --vus <number>    Override number of virtual users
 *   --duration <sec>  Override test duration in seconds
 *   --url <url>       Target API URL (default: http://localhost:3000)
 *   --help            Show this help message
 */

const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  testUser: {
    email: 'test@example.com',
    password: 'testpassword123'
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  stage: null,
  vus: null,
  duration: null,
  url: CONFIG.baseUrl,
  help: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stage' && args[i + 1]) {
    options.stage = args[++i];
  } else if (args[i] === '--vus' && args[i + 1]) {
    options.vus = parseInt(args[++i]);
  } else if (args[i] === '--duration' && args[i + 1]) {
    options.duration = parseInt(args[++i]);
  } else if (args[i] === '--url' && args[i + 1]) {
    options.url = args[++i];
  } else if (args[i] === '--help') {
    options.help = true;
  }
}

if (options.help) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              SCHEDIO LOAD TEST - QUICK START              ║
╚═══════════════════════════════════════════════════════════╝

Usage: node load-tests/quick-test.js [options]

Options:
  --stage <name>    Run specific test stage
                    Choices: smoke, load, stress, spike, breakpoint
                    Default: runs all stages sequentially
  
  --vus <number>    Override number of virtual users
                    Example: --vus 100
  
  --duration <sec>  Override test duration in seconds
                    Example: --duration 60
  
  --url <url>       Target API URL
                    Default: http://localhost:3000
                    Example: --url http://api.example.com
  
  --help            Show this help message

Examples:
  # Run full test suite
  node load-tests/quick-test.js
  
  # Run only smoke test
  node load-tests/quick-test.js --stage smoke
  
  # Run stress test with 200 users for 2 minutes
  node load-tests/quick-test.js --stage stress --vus 200 --duration 120
  
  # Test remote server
  node load-tests/quick-test.js --url https://api.example.com

Stages Description:
  smoke      - 5 VUs, 30s   - Basic connectivity check
  load       - 20 VUs, 60s  - Normal operating conditions
  stress     - 50 VUs, 120s - Beyond normal load
  spike      - 200 VUs, 60s - Sudden traffic surge
  breakpoint - 500 VUs, 180s - Find maximum capacity

Requirements:
  - Node.js 18+
  - Target server must be running
  - Test user must exist in database (run: npm run seed)

For detailed documentation, see: load-tests/README.md
`);
  process.exit(0);
}

// Simple HTTP client
const http = require('http');

class SimpleLoadTest {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.metrics = {
      total: 0,
      success: 0,
      failed: 0,
      responseTimes: [],
      startTime: Date.now()
    };
  }

  async request(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
      const startTime = Date.now();
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
        timeout: 30000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const duration = Date.now() - startTime;
          resolve({
            status: res.statusCode,
            body: data,
            duration,
            headers: res.headers
          });
        });
      });

      req.on('error', () => {
        const duration = Date.now() - startTime;
        resolve({ status: 0, body: '', duration, error: true });
      });

      req.on('timeout', () => {
        req.destroy();
        const duration = Date.now() - startTime;
        resolve({ status: 0, body: '', duration, error: true });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async runWorker(vuId, duration) {
    const endTime = Date.now() + (duration * 1000);
    let token = null;

    while (Date.now() < endTime) {
      try {
        // Login
        if (!token) {
          const loginRes = await this.request('POST', '/api/auth/login', {
            email: CONFIG.testUser.email,
            password: CONFIG.testUser.password
          });
          
          this.metrics.total++;
          this.metrics.responseTimes.push(loginRes.duration);
          
          if (loginRes.status === 200) {
            this.metrics.success++;
            try {
              const body = JSON.parse(loginRes.body);
              token = body.data?.access_token;
            } catch {}
          } else {
            this.metrics.failed++;
          }
        }

        // Health check
        const healthRes = await this.request('GET', '/health');
        this.metrics.total++;
        this.metrics.responseTimes.push(healthRes.duration);
        if (healthRes.status === 200) {
          this.metrics.success++;
        } else {
          this.metrics.failed++;
        }

        // Authenticated requests
        if (token) {
          const headers = { 'Authorization': `Bearer ${token}` };
          
          const endpoints = [
            '/api/auth/me',
            '/api/attendance/weekly',
            '/api/attendance/today',
            '/api/tasks?page=1&limit=10'
          ];

          for (const endpoint of endpoints) {
            const res = await this.request('GET', endpoint, null, headers);
            this.metrics.total++;
            this.metrics.responseTimes.push(res.duration);
            if (res.status === 200) {
              this.metrics.success++;
            } else {
              this.metrics.failed++;
              if (res.status === 401) token = null;
            }
            
            // Small delay
            await new Promise(r => setTimeout(r, 50));
          }
        }

        // Delay between cycles
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
      } catch (e) {
        this.metrics.failed++;
      }
    }
  }

  async runTest(vus, duration) {
    console.log(`\n🚀 Starting Load Test`);
    console.log(`   Target: ${this.baseUrl}`);
    console.log(`   Virtual Users: ${vus}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   ${'='.repeat(50)}`);

    this.metrics = {
      total: 0,
      success: 0,
      failed: 0,
      responseTimes: [],
      startTime: Date.now()
    };

    // Start workers
    const workers = [];
    for (let i = 0; i < vus; i++) {
      workers.push(this.runWorker(i, duration));
    }

    // Monitor progress
    const monitorInterval = setInterval(() => {
      const elapsed = ((Date.now() - this.metrics.startTime) / 1000).toFixed(0);
      const rps = (this.metrics.total / ((Date.now() - this.metrics.startTime) / 1000)).toFixed(2);
      const avgTime = this.metrics.responseTimes.length > 0
        ? (this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length).toFixed(2)
        : 0;
      const successRate = this.metrics.total > 0
        ? ((this.metrics.success / this.metrics.total) * 100).toFixed(2)
        : 100;

      console.log(`   [${elapsed}s/${duration}s] Requests: ${this.metrics.total} | RPS: ${rps} | Avg: ${avgTime}ms | Success: ${successRate}%`);
    }, 5000);

    // Wait for all workers
    await Promise.all(workers);
    clearInterval(monitorInterval);

    // Calculate final stats
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = sorted.length > 0
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length
      : 0;
    const totalDuration = (Date.now() - this.metrics.startTime) / 1000;
    const finalRps = (this.metrics.total / totalDuration).toFixed(2);
    const successRate = ((this.metrics.success / this.metrics.total) * 100).toFixed(2);

    // Print results
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Test Complete!`);
    console.log(`\n📊 Results:`);
    console.log(`   Total Requests: ${this.metrics.total}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Requests/Second: ${finalRps}`);
    console.log(`   Avg Response Time: ${avg.toFixed(2)}ms`);
    console.log(`   P95 Response Time: ${p95.toFixed(2)}ms`);
    console.log(`   P99 Response Time: ${p99.toFixed(2)}ms`);
    console.log(`\n${'='.repeat(50)}\n`);

    return {
      totalRequests: this.metrics.total,
      successRate: parseFloat(successRate),
      requestsPerSecond: parseFloat(finalRps),
      avgResponseTime: avg.toFixed(2),
      p95ResponseTime: p95.toFixed(2),
      p99ResponseTime: p99.toFixed(2)
    };
  }
}

// Predefined stages
const stages = {
  smoke: { vus: 5, duration: 30 },
  load: { vus: 20, duration: 60 },
  stress: { vus: 50, duration: 120 },
  spike: { vus: 200, duration: 60 },
  breakpoint: { vus: 500, duration: 180 }
};

// Run test
async function main() {
  const tester = new SimpleLoadTest(options.url);

  if (options.stage) {
    const stage = stages[options.stage.toLowerCase()];
    if (!stage) {
      console.error(`❌ Unknown stage: ${options.stage}`);
      console.error(`   Available stages: ${Object.keys(stages).join(', ')}`);
      process.exit(1);
    }

    const vus = options.vus || stage.vus;
    const duration = options.duration || stage.duration;

    await tester.runTest(vus, duration);
  } else {
    // Run all stages
    for (const [name, stage] of Object.entries(stages)) {
      const vus = options.vus || stage.vus;
      const duration = options.duration || stage.duration;

      await tester.runTest(vus, duration);
      
      // Pause between stages
      if (name !== 'breakpoint') {
        console.log('⏳ Pausing for 5 seconds...\n');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

main().catch(console.error);
