import { Router } from "express";
import { requireAuth, requireOrganisation, requireRole } from "../middlewares/authMiddlewares.js";
import { getParametres, updateParametres } from "../controllers/parametresControllers.js";
const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getParametres);
router.patch("/", requireRole("COORDINATOR"), updateParametres);
export default router;
