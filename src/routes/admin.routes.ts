import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import {
  changeUserPassword,
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "../controllers/admin.controller";
import { sensitiveLimiter } from "../middleware/rateLimiter";
import { logout } from "../controllers/auth.controller";

const router = Router();

router.use(authenticate, requireAdmin);
router.use(sensitiveLimiter); // Apply sensitive limiter to all admin routes (10 requests/hour)

router.post("/users", createUser);
router.get("/users", getAllUsers);
router.get("/users/:userId", getUserById);
router.patch("/users/:userId/password", changeUserPassword);
router.patch("/users/:userId/updateUser", updateUser);
router.delete("/users/:userId", deleteUser);
router.post("/logout", logout);

export default router;
