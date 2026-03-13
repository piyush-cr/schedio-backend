import { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { generateToken } from '../../utils/auth';
import { UserRole } from '../../types';

// Mock Express Request, Response, NextFunction
const createMockRequest = (authHeader?: string): Partial<AuthRequest> => ({
  headers: {
    authorization: authHeader,
  },
} as any);

const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createMockNext = (): NextFunction => {
  return jest.fn();
};

describe('Auth Middleware', () => {
  describe('authenticate', () => {
    it('should call next() when valid token is provided', () => {
      const payload = {
        userId: 'user123',
        employeeId: 'EMP001',
        role: UserRole.JUNIOR,
        email: 'test@test.com',
      };
      const token = generateToken(payload);
      const req = createMockRequest(`Bearer ${token}`) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(payload);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when no authorization header is provided', () => {
      const req = createMockRequest() as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided. Authorization header must be: Bearer <token>',
      });
    });

    it('should return 401 when authorization header does not start with Bearer', () => {
      const req = createMockRequest('Invalid token') as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 when token is invalid', () => {
      const req = createMockRequest('Bearer invalid-token') as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired token',
      });
    });

    it('should handle missing Bearer prefix correctly', () => {
      const payload = {
        userId: 'user123',
        employeeId: 'EMP001',
        role: UserRole.JUNIOR,
        email: 'test@test.com',
      };
      const token = generateToken(payload);
      const req = createMockRequest(token) as AuthRequest; // No Bearer prefix
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
