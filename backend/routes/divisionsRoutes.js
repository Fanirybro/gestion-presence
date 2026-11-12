import { Router } from "express";
import { requireAuth, requireOrganisation, requirePermission } from "../middlewares/authMiddlewares.js";
import { getDivisions, createDivision, updateDivision, assignPersonnelsToDivision } from "../controllers/personnelsControllers.js";

const router = Router();
router.use(requireAuth, requireOrganisation);
router.get("/", getDivisions);
router.post("/", requirePermission("departments"), createDivision);
router.patch("/:id", requirePermission("departments"), updateDivision);
router.post("/:id/assign-personnels", requirePermission("departments"), assignPersonnelsToDivision);

export default router;

