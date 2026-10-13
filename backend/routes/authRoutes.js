import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { login, logout, getMe, signup } from "../controllers/authControllers.js";
import { requireAuth } from "../middlewares/authMiddlewares.js";

const router = Router();
router.post("/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "development" ? 100 : 10,
  // Ne pas pénaliser les essais interrompus par une erreur serveur.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode >= 500,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessayez dans 15 minutes." },
}), login);
router.post("/signup", rateLimit({ windowMs: 60 * 60 * 1000, limit: process.env.NODE_ENV === "development" ? 100 : 10, // Ne pas pénaliser les essais interrompus par une erreur serveur.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode >= 500,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { message: "Trop d'inscriptions. Réessayez dans une heure." } }), signup);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
export default router;
