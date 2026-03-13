import { UserRole, UserPosition } from "../types";

export type UserCreateInput = {
  employeeId: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  position?: UserPosition;
  teamId?: string;
  officeLat?: number;
  officeLng?: number;
  shiftStart?: string;
  shiftEnd?: string;
};

export type UserFilter = {
  _id?: any;
  employeeId?: string;
  email?: string;
  role?: UserRole;
  position?: UserPosition;
  teamId?: string;
};

export type UserUpdateInput = {
  name?: string;
  phone?: string;
  role?: UserRole;
  position?: UserPosition;
  teamId?: string;
  officeLat?: number;
  officeLng?: number;
  shiftStart?: string;
  shiftEnd?: string;
  fcmToken?: string;
};

export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}
