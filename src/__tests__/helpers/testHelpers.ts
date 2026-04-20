import { User, IUser } from '../../models/User';
import { UserRole } from '../../types';
import { generateToken } from '../../utils/auth';

// Test user data
export const testUsers = {
  admin: {
    employeeId: 'ADMIN001',
    name: 'Admin User',
    email: 'admin@test.com',
    phone: '+15550000001',
    password: 'password123',
    role: UserRole.ADMIN,
  },
  senior: {
    employeeId: 'SENIOR001',
    name: 'Senior User',
    email: 'senior@test.com',
    phone: '+15550000002',
    password: 'password123',
    role: UserRole.SENIOR,
    teamId: 'team1',
    officeLat: 28.7041,
    officeLng: 77.1025,
    shiftStart: '09:00',
    shiftEnd: '18:00',
  },
  junior: {
    employeeId: 'JUNIOR001',
    name: 'Junior User',
    email: 'junior@test.com',
    phone: '+15550000003',
    password: 'password123',
    role: UserRole.JUNIOR,
    teamId: 'team1',
    officeLat: 28.7041,
    officeLng: 77.1025,
    shiftStart: '09:00',
    shiftEnd: '18:00',
  },
};

// Create a test user in the database
export async function createTestUser(userData: any): Promise<IUser> {
  return await User.create(userData);
}

// Generate auth token for a user
export function generateAuthToken(user: IUser): string {
  return generateToken({
    userId: user._id.toString(),
    employeeId: user.employeeId,
    role: user.role,
    email: user.email,
  });
}

// Clear all users from the database (for cleanup)
export async function clearUsers(): Promise<void> {
  await User.deleteMany({});
}

// Get auth header for a user
export function getAuthHeader(token: string): { Authorization: string } {
  return {
    Authorization: `Bearer ${token}`,
  };
}
