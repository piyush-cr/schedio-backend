import { Response, NextFunction } from 'express';
import { requireRole, requireAdmin, requireSenior, requireSeniorOrJunior, canAccessResource } from '../../middleware/rbac';
import { AuthRequest } from '../../middleware/auth';
import { UserRole } from '../../types';

// Mock Express Response, NextFunction
const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createMockNext = (): NextFunction => {
  return jest.fn();
};

const createMockRequest = (user?: any, params?: any, body?: any): Partial<AuthRequest> => {
  return {
    user,
    params,
    body,
  } as any;
};

describe('RBAC Middleware', () => {
  describe('requireRole', () => {
    it('should allow access when user has required role', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.ADMIN,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireRole(UserRole.ADMIN)(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access when user does not have required role', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.JUNIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireRole(UserRole.ADMIN)(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Required role: ADMIN',
      });
    });

    it('should allow access when user has one of multiple allowed roles', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.SENIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireRole(UserRole.SENIOR, UserRole.ADMIN)(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      const req = createMockRequest() as AuthRequest; // No user
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireRole(UserRole.ADMIN)(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('requireAdmin', () => {
    it('should allow ADMIN access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.ADMIN,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny JUNIOR access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.JUNIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireSenior', () => {
    it('should allow SENIOR access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.SENIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSenior(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow ADMIN access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.ADMIN,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSenior(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny JUNIOR access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.JUNIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSenior(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireSeniorOrJunior', () => {
    it('should allow SENIOR access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.SENIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSeniorOrJunior(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow JUNIOR access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.JUNIOR,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSeniorOrJunior(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow ADMIN access', () => {
      const req = createMockRequest({
        userId: 'user123',
        role: UserRole.ADMIN,
      }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireSeniorOrJunior(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('canAccessResource', () => {
    it('should allow ADMIN to access any resource', () => {
      const req = createMockRequest({
        userId: 'admin123',
        role: UserRole.ADMIN,
      }, { userId: 'other123' }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      canAccessResource(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow SENIOR to access any resource', () => {
      const req = createMockRequest({
        userId: 'senior123',
        role: UserRole.SENIOR,
      }, { userId: 'other123' }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      canAccessResource(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow JUNIOR to access own resource', () => {
      const req = createMockRequest({
        userId: 'junior123',
        role: UserRole.JUNIOR,
      }, { userId: 'junior123' }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      canAccessResource(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny JUNIOR access to other user resource', () => {
      const req = createMockRequest({
        userId: 'junior123',
        role: UserRole.JUNIOR,
      }, { userId: 'other123' }) as AuthRequest;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      canAccessResource(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
