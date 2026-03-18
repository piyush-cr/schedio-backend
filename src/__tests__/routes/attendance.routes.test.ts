import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import attendanceRoutes from '../../routes/attendance.routes';
import { authenticate } from '../../middleware/auth';
import { requireSeniorOrJunior } from '../../middleware/rbac';
import { clearUsers, createTestUser, testUsers, generateAuthToken } from '../helpers/testHelpers';
import { connectDB } from '../../db/db';

const app = express();
app.use(express.json());
app.use('/api/attendance', authenticate, requireSeniorOrJunior, attendanceRoutes);

describe('Attendance Routes', () => {
  let juniorUser: any;
  let seniorUser: any;
  let juniorToken: string;
  let seniorToken: string;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await clearUsers();
    juniorUser = await createTestUser(testUsers.junior);
    seniorUser = await createTestUser(testUsers.senior);
    juniorToken = generateAuthToken(juniorUser);
    seniorToken = generateAuthToken(seniorUser);
  });

  afterEach(async () => {
    await clearUsers();
  });

  describe('POST /api/attendance/check-in', () => {
    it('should check in successfully with valid data', async () => {
      const response = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 28.7041,
          longitude: 77.1025,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Check-in successful');
      expect(response.body.data).toHaveProperty('clockInTime');
      expect(response.body.data).toHaveProperty('latitude');
      expect(response.body.data).toHaveProperty('longitude');
    });

    it('should check in with custom timestamp', async () => {
      const customTimestamp = Date.now() - 3600000; // 1 hour ago
      const response = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 28.7041,
          longitude: 77.1025,
          timestamp: customTimestamp,
        })
        .expect(200);

      expect(response.body.data.clockInTime).toBe(customTimestamp);
    });

    it('should validate latitude range', async () => {
      const response = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 100, // Invalid latitude (> 90)
          longitude: 77.1025,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate longitude range', async () => {
      const response = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 28.7041,
          longitude: 200, // Invalid longitude (> 180)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/attendance/check-in')
        .send({
          latitude: 28.7041,
          longitude: 77.1025,
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/attendance/check-out', () => {
    it('should check out successfully with valid data', async () => {
      const response = await request(app)
        .post('/api/attendance/check-out')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 28.7041,
          longitude: 77.1025,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Check-out successful');
      expect(response.body.data).toHaveProperty('clockOutTime');
    });

    it('should check out with auto flag', async () => {
      const response = await request(app)
        .post('/api/attendance/check-out')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: 28.7041,
          longitude: 77.1025,
          isAuto: true,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate coordinates', async () => {
      const response = await request(app)
        .post('/api/attendance/check-out')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          latitude: -100, // Invalid
          longitude: 77.1025,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/attendance/weekly', () => {
    it('should get weekly attendance history', async () => {
      const response = await request(app)
        .get('/api/attendance/weekly')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('weekRange');
      expect(response.body.data).toHaveProperty('totalHoursThisWeek');
      expect(response.body.data).toHaveProperty('dailyLogs');
      expect(Array.isArray(response.body.data.dailyLogs)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/attendance/weekly')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/attendance/today', () => {
    it('should get today attendance status', async () => {
      const response = await request(app)
        .get('/api/attendance/today')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('date');
      expect(response.body.data).toHaveProperty('clockedIn');
      expect(response.body.data).toHaveProperty('clockedOut');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/attendance/today')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/attendance/monthly', () => {
    it('should get monthly attendance report', async () => {
      const response = await request(app)
        .get('/api/attendance/monthly')
        .query({ month: new Date().getMonth() })
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('month');
      expect(response.body.data).toHaveProperty('totalHoursThisMonth');
      expect(response.body.data).toHaveProperty('dailyLogs');
      expect(Array.isArray(response.body.data.dailyLogs)).toBe(true);
    });
  });

  describe('GET /api/attendance/day', () => {
    it('should get attendance for specific date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request(app)
        .get('/api/attendance/day')
        .query({ date: today })
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Data might be null if no record exists, but success should be true
    });

    it('should fail if date is missing', async () => {
      await request(app)
        .get('/api/attendance/day')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(400);
    });
  });

  describe('GET /api/attendance/users (Senior access)', () => {
    it('should return users list for senior', async () => {
      const response = await request(app)
        .get('/api/attendance/users')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should deny junior access', async () => {
      await request(app)
        .get('/api/attendance/users')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);
    });
  });
});
