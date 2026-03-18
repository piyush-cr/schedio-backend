/**
 * Load Test Configuration
 * Adjust these values based on your testing needs
 */
export const config = {
  // Base URL of your API
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  
  // Test scenarios
  scenarios: {
    smoke: {
      vus: 5,           // Virtual users
      duration: '30s',  // Test duration
      description: 'Smoke test - basic connectivity'
    },
    load: {
      vus: 50,
      duration: '2m',
      description: 'Load test - normal operating conditions'
    },
    stress: {
      vus: 200,
      duration: '5m',
      description: 'Stress test - beyond normal load'
    },
    spike: {
      vus: 500,
      duration: '1m',
      description: 'Spike test - sudden traffic surge'
    },
    breakpoint: {
      vus: 1000,
      duration: '10m',
      description: 'Breakpoint test - find maximum capacity'
    }
  },

  // API endpoints to test
  endpoints: {
    health: '/health',
    login: '/api/auth/login',
    me: '/api/users/me',
    checkIn: '/api/attendance/check-in',
    checkOut: '/api/attendance/check-out',
    weekly: '/api/attendance/weekly',
    tasks: '/api/tasks'
  },

  // Test credentials (use test database)
  testUser: {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'testpassword123'
  },

  // Performance thresholds
  thresholds: {
    http_req_duration_p95: 500,  // 95% of requests should complete below 500ms
    http_req_duration_p99: 1000, // 99% of requests should complete below 1000ms
    http_req_failed: 0.01,       // Less than 1% failed requests
    checks: 0.99                 // 99% success rate on checks
  }
};

export default config;
