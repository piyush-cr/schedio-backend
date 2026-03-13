import { UserModel } from '../../models/u';
import { UserRole } from '../../types';
import { clearUsers, createTestUser, testUsers } from '../helpers/testHelpers';

describe('User Model', () => {
  beforeEach(async () => {
    await clearUsers();
  });

  afterEach(async () => {
    await clearUsers();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const user = await createTestUser(testUsers.junior);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(testUsers.junior.email);
      expect(user.employeeId).toBe(testUsers.junior.employeeId);
      expect(user.role).toBe(UserRole.JUNIOR);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const createdUser = await createTestUser(testUsers.junior);
      const foundUser = await UserModel.findByEmail(testUsers.junior.email);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
      expect(foundUser?.email).toBe(testUsers.junior.email);
    });

    it('should return null for non-existent email', async () => {
      const foundUser = await UserModel.findByEmail('nonexistent@test.com');
      expect(foundUser).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const createdUser = await createTestUser(testUsers.junior);
      const foundUser = await UserModel.findById(createdUser.id);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
    });

    it('should return null for non-existent ID', async () => {
      const foundUser = await UserModel.findById('nonexistent-id');
      expect(foundUser).toBeNull();
    });
  });

  describe('findByEmployeeId', () => {
    it('should find user by employee ID', async () => {
      const createdUser = await createTestUser(testUsers.junior);
      const foundUser = await UserModel.findByEmployeeId(testUsers.junior.employeeId);

      expect(foundUser).toBeDefined();
      expect(foundUser?.employeeId).toBe(testUsers.junior.employeeId);
    });

    it('should return null for non-existent employee ID', async () => {
      const foundUser = await UserModel.findByEmployeeId('NONEXISTENT');
      expect(foundUser).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      await createTestUser(testUsers.junior);
      await createTestUser(testUsers.senior);
      await createTestUser(testUsers.admin);

      const users = await UserModel.findAll();
      expect(users.length).toBe(3);
    });

    it('should return empty array when no users exist', async () => {
      const users = await UserModel.findAll();
      expect(users).toEqual([]);
    });
  });

  describe('findByTeamId', () => {
    it('should find users by team ID', async () => {
      await createTestUser(testUsers.junior);
      await createTestUser(testUsers.senior);
      await createTestUser({
        ...testUsers.admin,
        teamId: 'team2',
      });

      const teamUsers = await UserModel.findByTeamId('team1');
      expect(teamUsers.length).toBe(2);
      expect(teamUsers.every(u => u.teamId === 'team1')).toBe(true);
    });
  });

  describe('findByRole', () => {
    it('should find users by role', async () => {
      await createTestUser(testUsers.junior);
      await createTestUser(testUsers.senior);
      await createTestUser(testUsers.admin);

      const juniors = await UserModel.findByRole(UserRole.JUNIOR);
      expect(juniors.length).toBe(1);
      expect(juniors[0].role).toBe(UserRole.JUNIOR);
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const user = await createTestUser(testUsers.junior);
      const updatedUser = await UserModel.update(user.id, {
        name: 'Updated Name',
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.name).toBe('Updated Name');
      expect(updatedUser?.email).toBe(user.email); // Other fields unchanged
      expect(updatedUser?.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
    });

    it('should return null for non-existent user', async () => {
      const updatedUser = await UserModel.update('nonexistent-id', {
        name: 'Updated Name',
      });
      expect(updatedUser).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      const user = await createTestUser(testUsers.junior);
      const deleted = await UserModel.delete(user.id);

      expect(deleted).toBe(true);
      const foundUser = await UserModel.findById(user.id);
      expect(foundUser).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const deleted = await UserModel.delete('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });
});
