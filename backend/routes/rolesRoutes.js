import { Router } from "express";
import { requireAuth, requireOrganisation, requireRole } from "../middlewares/authMiddlewares.js";
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/rolesControllers.js";

const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getRoles);
router.post("/", requireRole("COORDINATOR"), createRole);
router.patch("/:id", requireRole("COORDINATOR"), updateRole);
router.delete("/:id", requireRole("COORDINATOR"), deleteRole);

export default router;

