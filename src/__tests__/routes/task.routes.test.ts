import request from 'supertest';
import express from 'express';
import taskRoutes from '../../routes/task.routes';
import { authenticate } from '../../middleware/auth';
import { requireSenior, requireSeniorOrJunior } from '../../middleware/rbac';
import { clearUsers, createTestUser, testUsers, generateAuthToken } from '../helpers/testHelpers';
import { Priority, TaskStatus } from '../../types';

const app = express();
app.use(express.json());

// Apply middleware based on route
app.use('/api/tasks', authenticate, (req, res, next) => {
  // For POST and DELETE, require Senior
  if (req.method === 'POST' || req.method === 'DELETE') {
    requireSenior(req, res, next);
  } else {
    requireSeniorOrJunior(req, res, next);
  }
}, taskRoutes);

describe('Task Routes', () => {
  let seniorUser: any;
  let juniorUser: any;
  let seniorToken: string;
  let juniorToken: string;

  beforeEach(async () => {
    await clearUsers();
    seniorUser = await createTestUser(testUsers.senior);
    juniorUser = await createTestUser(testUsers.junior);
    seniorToken = generateAuthToken(seniorUser);
    juniorToken = generateAuthToken(juniorUser);
  });

  afterEach(async () => {
    await clearUsers();
  });

  describe('POST /api/tasks', () => {
    it('should create a task successfully (Senior only)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({
          title: 'Complete API documentation',
          description: 'Write comprehensive API docs',
          assignedToId: juniorUser.id,
          priority: Priority.HIGH,
          deadline: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Task created successfully');
      expect(response.body.data.title).toBe('Complete API documentation');
      expect(response.body.data.assignedToId).toBe(juniorUser.id);
      expect(response.body.data.assignedById).toBe(seniorUser.id);
      expect(response.body.data.status).toBe(TaskStatus.TODO);
    });

    it('should not allow Junior to create tasks', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          title: 'Test Task',
          assignedToId: juniorUser.id,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({
          // Missing title and assignedToId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should use default priority if not provided', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({
          title: 'Test Task',
          assignedToId: juniorUser.id,
        })
        .expect(201);

      expect(response.body.data.priority).toBe(Priority.LOW);
    });
  });

  describe('GET /api/tasks', () => {
    it('should get tasks list (requires auth)', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('should get task by ID', async () => {
      const response = await request(app)
        .get('/api/tasks/task123')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/tasks/task123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/tasks/:taskId', () => {
    it('should update task status', async () => {
      const response = await request(app)
        .patch('/api/tasks/task123')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          status: TaskStatus.IN_PROGRESS,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Task updated successfully');
    });

    it('should validate task status enum', async () => {
      const response = await request(app)
        .patch('/api/tasks/task123')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/tasks/:taskId', () => {
    it('should delete task (Senior only)', async () => {
      const response = await request(app)
        .delete('/api/tasks/task123')
        .set('Authorization', `Bearer ${seniorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Task deleted successfully');
    });

    it('should not allow Junior to delete tasks', async () => {
      const response = await request(app)
        .delete('/api/tasks/task123')
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
