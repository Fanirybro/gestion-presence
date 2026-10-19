import { Router } from "express";
import { requireAuth, requireOrganisation, requirePermission } from "../middlewares/authMiddlewares.js";
import { getDepartements, createDepartement, updateDepartement } from "../controllers/personnelsControllers.js";
const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getDepartements);
router.post("/", requirePermission("departments"), createDepartement);
router.patch("/:id", requirePermission("departments"), updateDepartement);
export default router;
