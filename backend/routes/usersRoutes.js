import { Router } from "express";
import { requireAuth, requireOrganisation, requireRole } from "../middlewares/authMiddlewares.js";
import { getUsers, getUserById, createUser, updateUser, updateUserRole, updateUserStatus } from "../controllers/usersControllers.js";

const router = Router();
router.use(requireAuth, requireOrganisation, requireRole("COORDINATOR"));
router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.patch("/:id/role", updateUserRole);
router.patch("/:id/status", updateUserStatus);
export default router;
