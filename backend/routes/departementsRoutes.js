import { Router } from "express";
import { requireAuth, requireOrganisation, requireRole } from "../middlewares/authMiddlewares.js";
import { getDepartements, createDepartement, updateDepartement } from "../controllers/personnelsControllers.js";
const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getDepartements);
router.post("/", requireRole("COORDINATOR"), createDepartement);
router.patch("/:id", requireRole("COORDINATOR"), updateDepartement);
export default router;
