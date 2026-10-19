import { Router } from "express";
import { requireAuth, requireOrganisation, requirePermission } from "../middlewares/authMiddlewares.js";
import { getParametres, updateParametres } from "../controllers/parametresControllers.js";
const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getParametres);
router.patch("/", requirePermission("settings"), updateParametres);
export default router;
