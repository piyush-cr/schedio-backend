import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config } from './config.js';

// Custom metrics
const loginSuccessRate = new Rate('login_success_rate');
const apiResponseTime = new Trend('api_response_time');
const activeUsers = new Counter('active_users');
const errorRate = new Rate('error_rate');

// Test configuration
export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      tags: { testType: 'smoke' },
    },
    load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
      startTime: '30s',
      tags: { testType: 'load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 },
      ],
      startTime: '2m30s',
      tags: { testType: 'stress' },
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '20s', target: 0 },
      ],
      startTime: '7m30s',
      tags: { testType: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    login_success_rate: ['rate>0.95'],
    api_response_time: ['p(95)<500'],
    error_rate: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Test data
const testCredentials = {
  email: 'test@example.com',
  password: 'testpassword123',
};

export function setup() {
  // Health check before starting
  const healthRes = http.get(`${config.baseUrl}/health`);
  check(healthRes, {
    'setup: health check passed': (r) => r.status === 200,
  });
  return { startTime: Date.now() };
}

export default function () {
  activeUsers.add(1);
  
  let accessToken = '';

  // 1. Health Check
  const healthStart = Date.now();
  const healthRes = http.get(`${config.baseUrl}/health`);
  apiResponseTime.add(Date.now() - healthStart);
  
  check(healthRes, {
    'health: status is 200': (r) => r.status === 200,
    'health: response time < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(0.5);

  // 2. Login
  const loginStart = Date.now();
  const loginRes = http.post(
    `${config.baseUrl}/api/auth/login`,
    JSON.stringify(testCredentials),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
  apiResponseTime.add(Date.now() - loginStart);
  
  const loginSuccess = check(loginRes, {
    'login: status is 200': (r) => r.status === 200,
    'login: has access_token': (r) => {
      try {
        const body = JSON.parse(r.body);
        accessToken = body.data?.access_token || '';
        return !!accessToken;
      } catch {
        return false;
      }
    },
  });
  
  loginSuccessRate.add(loginSuccess ? 1 : 0);

  if (!accessToken) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  sleep(0.5);

  // 3. Get Current User
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const meStart = Date.now();
  const meRes = http.get(`${config.baseUrl}/api/auth/me`, { headers });
  apiResponseTime.add(Date.now() - meStart);
  
  check(meRes, {
    'me: status is 200': (r) => r.status === 200,
    'me: response time < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(0.5);

  // 4. Get Weekly Attendance
  const weeklyStart = Date.now();
  const weeklyRes = http.get(
    `${config.baseUrl}/api/attendance/weekly`,
    { headers }
  );
  apiResponseTime.add(Date.now() - weeklyStart);
  
  check(weeklyRes, {
    'weekly: status is 200': (r) => r.status === 200,
    'weekly: response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5);

  // 5. Get Today's Attendance
  const todayStart = Date.now();
  const todayRes = http.get(
    `${config.baseUrl}/api/attendance/today`,
    { headers }
  );
  apiResponseTime.add(Date.now() - todayStart);
  
  check(todayRes, {
    'today: status is 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 6. Get Tasks
  const tasksStart = Date.now();
  const tasksRes = http.get(
    `${config.baseUrl}/api/tasks?page=1&limit=10`,
    { headers }
  );
  apiResponseTime.add(Date.now() - tasksStart);
  
  check(tasksRes, {
    'tasks: status is 200': (r) => r.status === 200,
    'tasks: response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    './load-tests/results/summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { metrics } = data;
  return `
╔═══════════════════════════════════════════════════════════╗
║                    LOAD TEST SUMMARY                      ║
╠═══════════════════════════════════════════════════════════╣
║  HTTP Requests: ${metrics.http_reqs?.values?.count?.toString().padEnd(10) || 'N/A'}                     ║
║  Request Duration (avg): ${metrics.http_req_duration?.values?.avg?.toFixed(2).padEnd(8) || 'N/A'} ms          ║
║  Request Duration (p95): ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2).padEnd(8) || 'N/A'} ms          ║
║  Request Duration (p99): ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2).padEnd(8) || 'N/A'} ms          ║
║  Failed Requests: ${metrics.http_req_failed?.values?.rate?.toFixed(4).padEnd(10) || 'N/A'}                  ║
╠═══════════════════════════════════════════════════════════╣
║  Login Success Rate: ${metrics.login_success_rate?.values?.rate?.toFixed(4).padEnd(8) || 'N/A'}                  ║
║  API Response Time (avg): ${metrics.api_response_time?.values?.avg?.toFixed(2).padEnd(8) || 'N/A'} ms          ║
║  Error Rate: ${metrics.error_rate?.values?.rate?.toFixed(4).padEnd(15) || 'N/A'}                  ║
╚═══════════════════════════════════════════════════════════╝
`;
}
