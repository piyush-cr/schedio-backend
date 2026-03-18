# Load Testing Guide for Schedio Backend

This directory contains comprehensive load testing tools to determine the maximum capacity of your backend.

## 📋 Available Tools

### 1. **Quick Test** (Easiest - Recommended for First Time)
Simple and fast load testing with minimal setup.

**Run:**
```bash
# Full test suite (all stages)
node load-tests/quick-test.js

# Specific stage
node load-tests/quick-test.js --stage smoke
node load-tests/quick-test.js --stage load
node load-tests/quick-test.js --stage stress
node load-tests/quick-test.js --stage spike
node load-tests/quick-test.js --stage breakpoint

# Custom configuration
node load-tests/quick-test.js --stage stress --vus 100 --duration 120

# Test remote server
node load-tests/quick-test.js --url https://api.example.com

# Help
node load-tests/quick-test.js --help
```

**Features:**
- No external dependencies
- Simple CLI interface
- Real-time metrics
- Quick results

### 2. **Full Node.js Load Test** (Comprehensive)
Detailed load testing with comprehensive metrics.

**Run:**
```bash
node load-tests/load-test.js
```

**Features:**
- Multiple test stages (Smoke → Load → Stress → Breakpoint → Max Load)
- Real-time metrics display
- Automatic success rate monitoring
- Detailed summary report

### 3. **k6 Load Test** (Requires k6 installation)
Professional load testing with k6.io

**Install k6:**
```bash
# Windows (with winget)
winget install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

**Run:**
```bash
# Smoke test
k6 run load-tests/api-load-test.js

# With custom configuration
k6 run --vus 100 --duration 5m load-tests/api-load-test.js
```

### 4. **Artillery Load Test** (Requires Artillery installation)
YAML-based load testing with detailed reports

**Install Artillery:**
```bash
npm install -g artillery
```

**Run:**
```bash
artillery run load-tests/artillery-config.yml
```

**Generate HTML report:**
```bash
artillery run load-tests/artillery-config.yml --output report.html
```

## 🎯 Test Scenarios

### Smoke Test (5 VUs, 30s)
- Basic connectivity check
- Verify all endpoints are responding

### Load Test (20-50 VUs, 1-2m)
- Normal operating conditions
- Expected production traffic simulation

### Stress Test (50-200 VUs, 2-5m)
- Beyond normal load
- System behavior under pressure

### Spike Test (200-500 VUs, 1m)
- Sudden traffic surge
- Auto-scaling trigger test

### Breakpoint Test (500-1000 VUs, 3-10m)
- Find maximum capacity
- Identify breaking point

## 📊 Metrics Tracked

| Metric | Description | Target |
|--------|-------------|--------|
| **Requests/Second** | Throughput | Higher is better |
| **P95 Response Time** | 95th percentile latency | < 500ms |
| **P99 Response Time** | 99th percentile latency | < 1000ms |
| **Success Rate** | % of successful requests | > 99% |
| **Error Rate** | % of failed requests | < 1% |

## 🔧 Configuration

Edit `load-tests/config.ts` to customize:

```typescript
export const config = {
  baseUrl: 'http://localhost:3000',  // Your API URL
  
  testUser: {
    email: 'test@example.com',        // Test user credentials
    password: 'testpassword123'
  },
  
  thresholds: {
    http_req_duration_p95: 500,      // P95 < 500ms
    http_req_duration_p99: 1000,     // P99 < 1000ms
    http_req_failed: 0.01,           // < 1% failures
  }
};
```

## 📦 NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "load-test": "node load-tests/load-test.js",
    "load-test:quick": "node load-tests/quick-test.js",
    "load-test:smoke": "node load-tests/quick-test.js --stage smoke",
    "load-test:stress": "node load-tests/quick-test.js --stage stress",
    "load-test:k6": "k6 run load-tests/api-load-test.js",
    "load-test:artillery": "artillery run load-tests/artillery-config.yml"
  }
}
```

**Usage:**
```bash
npm run load-test
npm run load-test:quick
npm run load-test:smoke
npm run load-test:stress
```

## 🚀 Quick Start

### 1. Start Your Server
```bash
npm run dev
```

### 2. Seed Test Data
```bash
npm run seed
```

### 3. Run Load Test

**Option A: Quick Test (Recommended)**
```bash
# Full test suite
node load-tests/quick-test.js

# Single stage
node load-tests/quick-test.js --stage smoke
```

**Option B: Full Test**
```bash
node load-tests/load-test.js
```

### 4. Review Results
- Console output shows real-time metrics
- Summary shows maximum capacity
- Check `load-tests/results/` for detailed reports

## 📈 Interpreting Results

### Good Results ✅
```
Maximum Capacity: 500 requests/second
P95 Latency: 150ms
Success Rate: 99.9%
```
**Action:** Your backend is performing well!

### Warning Signs ⚠️
```
Maximum Capacity: 100 requests/second
P95 Latency: 2000ms
Success Rate: 85%
```
**Action:** Consider optimization:
- Database query optimization
- Add caching (Redis)
- Scale horizontally
- Review slow endpoints

### Critical Issues 🚨
```
Maximum Capacity: 20 requests/second
P95 Latency: 5000ms
Success Rate: 50%
```
**Action:** Immediate attention needed:
- Check database connections
- Memory leaks
- Connection pool exhaustion
- API bottlenecks

## 🔍 Endpoint-Specific Testing

Test individual endpoints:

```bash
# Test only authentication
BASE_URL=http://localhost:3000 node -e "
const test = require('./load-tests/load-test.js');
test.runEndpointTest('/api/auth/login');
"

# Test only attendance endpoints
BASE_URL=http://localhost:3000 node -e "
const test = require('./load-tests/load-test.js');
test.runEndpointTest('/api/attendance/weekly');
"
```

## 💡 Tips

1. **Run in Production-like Environment**: Test on staging/production, not development
2. **Monitor Resources**: Watch CPU, Memory, Database during tests
3. **Gradual Increase**: Start small, increase load gradually
4. **Multiple Runs**: Run tests multiple times for consistent results
5. **Database State**: Ensure test database has realistic data volume
6. **Network Latency**: Test from same network region as production

## 🛠️ Troubleshooting

### "Connection Refused" Error
```bash
# Make sure server is running
npm run dev

# Check BASE_URL
export BASE_URL=http://localhost:3000
```

### "Authentication Failed" Error
```bash
# Update test credentials
export TEST_USER_EMAIL=your-test@email.com
export TEST_USER_PASSWORD=your-password
```

### Test Runs Too Fast/Slow
```bash
# Adjust stage duration in config.ts
stages: [
  { name: 'Load', vus: 50, duration: 300 } // 5 minutes
]
```

## 📚 Additional Resources

- [k6 Documentation](https://k6.io/docs/)
- [Artillery Documentation](https://www.artillery.io/docs/)
- [Load Testing Best Practices](https://smashingmagazine.com/2021/08/load-testing-best-practices/)

## 🎯 Next Steps

After identifying maximum capacity:

1. **Document Results**: Save test results for comparison
2. **Set Up Monitoring**: Implement APM (Application Performance Monitoring)
3. **Plan Scaling**: Based on results, plan horizontal/vertical scaling
4. **Regular Testing**: Schedule regular load tests (weekly/monthly)
5. **Optimize Bottlenecks**: Focus on slowest endpoints

---

**Need Help?** Check the logs in `load-tests/results/` or run with verbose mode:
```bash
DEBUG=* node load-tests/load-test.js
```
