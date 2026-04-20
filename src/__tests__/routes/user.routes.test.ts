import request from 'supertest';
import express from 'express';
import userRoutes from '../../routes/user.routes';
import { authenticate } from '../../middleware/auth';
import { requireSenior } from '../../middleware/rbac';
import { clearUsers, createTestUser, testUsers, generateAuthToken } from '../helpers/testHelpers';
import { UserRole } from '../../types';

const app = express();
app.use(express.json());
app.use('/api/users', authenticate, requireSenior, userRoutes);

describe('User Routes', () => {
  let adminUser: any;
  let seniorUser: any;
  let juniorUser: any;
  let adminToken: string;
  let seniorToken: string;
  let juniorToken: string;

  beforeEach(async () => {
    await clearUsers();
    adminUser = await createTestUser(testUsers.admin);
    seniorUser = await createTestUser(testUsers.senior);
    juniorUser = await createTestUser(testUsers.junior);
    adminToken = generateAuthToken(adminUser);
    seniorToken = generateAuthToken(seniorUser);
    juniorToken = generateAuthToken(juniorUser);
  });

  afterEach(async () => {
    await clearUsers();
  });

  describe('GET /api/users', () => {
    it('should get all users (Senior/Admin only)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      // Should not include passwords
      response.body.data.forEach((user: any) => {
        expect(user).not.toHaveProperty('password');
      });
    });

    it('should not allow Junior to access user list', async () => {
      // This would be blocked by requireSenior middleware
      // But let's test the endpoint structure
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/users/:userId', () => {
    it('should get user by ID (Senior/Admin)', async () => {
      const response = await request(app)
        .get(`/api/users/${juniorUser.id}`)
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(juniorUser.id);
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/nonexistent-id')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('GET /api/users/team/status', () => {
    it('should get team status (Senior only)', async () => {
      const response = await request(app)
        .get('/api/users/team/status')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('teamId');
      expect(response.body.data).toHaveProperty('members');
      expect(Array.isArray(response.body.data.members)).toBe(true);
    });

    it('should require Senior role', async () => {
      const response = await request(app)
        .get('/api/users/team/status')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
