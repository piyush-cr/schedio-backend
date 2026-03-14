import userCrud from "../crud/user.crud";
import { generateToken, generateRefreshToken } from "../utils/auth";
import { ApiError } from "../utils/ApiError";

export interface LoginResult {
  user: Record<string, unknown>;
  access_token: string;
  refresh_token: string;
}

async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userCrud.validatePassword(email, password);
  if (!user) {
    throw new ApiError("Invalid email or password", 401);
  }

  const tokenPayload = {
    userId: user._id.toString(),
    employeeId: user.employeeId,
    role: user.role,
    email: user.email,
  };

  const access_token = generateToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  const userObj = user.toObject();
  // Ensure password is never returned
  delete (userObj as any).password;

  return { user: userObj as Record<string, unknown>, access_token, refresh_token };
}

const authService = { login };
export default authService;
