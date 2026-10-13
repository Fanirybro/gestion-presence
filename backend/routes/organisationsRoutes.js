import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createOrganisation, joinOrganisation, getOrganisation, updateOrganisation } from "../controllers/organisationsControllers.js";
import { requireAuth, requireOrganisation, requireRole } from "../middlewares/authMiddlewares.js";
const router = Router();
router.use(requireAuth);
const onboardingLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === "development" ? 100 : 15, // Ne pas pénaliser les essais interrompus par une erreur serveur.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode >= 500,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessayez dans 15 minutes." } });
router.post("/", onboardingLimit, createOrganisation);
router.post("/join", onboardingLimit, joinOrganisation);
router.get("/me", requireOrganisation, getOrganisation);
router.patch("/me", requireOrganisation, requireRole("COORDINATOR"), updateOrganisation);
export default router;
