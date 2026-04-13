import { UserRole } from "../../../types";
import userCrud from "../../../crud/user.crud";

/**
 * Assert that the user has ADMIN or SENIOR role
 */
export function assertAdminOrSenior(role: string): { valid: true } | { valid: false; message: string } {
  if (role !== UserRole.ADMIN && role !== UserRole.SENIOR) {
    return {
      valid: false,
      message: "Unauthorized: Only Admins and Seniors can view attendance lists",
    };
  }
  return { valid: true };
}

/**
 * Assert that the user is not a JUNIOR
 */
export function assertNotJunior(role: string): { valid: true } | { valid: false; message: string } {
  if (role === UserRole.JUNIOR) {
    return {
      valid: false,
      message: "Juniors can't check attendance of others",
    };
  }
  return { valid: true };
}

/**
 * Get team filter for senior users
 */
export async function getSeniorTeamFilter(
  requesterId: string
): Promise<{ valid: true; filter: { teamId?: string; role?: object } } | { valid: false; message: string }> {
  const requester = await userCrud.findById(requesterId);
  if (!requester || !requester.teamId) {
    return {
      valid: false,
      message: "Senior team assignment not found",
    };
  }
  return {
    valid: true,
    filter: {
      teamId: requester.teamId,
      role: { $ne: UserRole.ADMIN },
    },
  };
}
