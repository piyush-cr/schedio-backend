import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import { validateRequest } from "../middleware/validate";
import {
  changeUserPassword,
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "../controllers/admin.controller";
// import { sensitiveLimiter } from "../middleware/rateLimiter";
import { logout } from "../controllers/auth.controller";
import { createUserSchema, updateUserSchema, changePasswordSchema } from "../validations/user.validations";
import { userIdParamSchema } from "../validations/common.validations";

const router = Router();

router.use(authenticate, requireAdmin);
// router.use(sensitiveLimiter);

router.post("/users", validateRequest({ body: createUserSchema }), createUser);
router.get("/users", getAllUsers);
router.get("/users/:userId", validateRequest({ params: userIdParamSchema }), getUserById);
router.patch("/users/:userId/password", validateRequest({ params: userIdParamSchema, body: changePasswordSchema }), changeUserPassword);
router.patch("/users/:userId/updateUser", validateRequest({ params: userIdParamSchema, body: updateUserSchema }), updateUser);
router.delete("/users/:userId", validateRequest({ params: userIdParamSchema }), deleteUser);
router.post("/logout", logout);

export default router;
