import { Router } from "express";
import {
  enrollFace,
  checkInFace,
  listPersonnel,
  deleteProfile,
  listAttendances,
  healthCheck,
} from "./face.controller.js";

const router = Router();

// Routes principales spécifiées dans le cahier des charges
router.post("/enroll", enrollFace);
router.post("/check-in", checkInFace);

// Routes pour l'enrôlement du personnel
router.get("/personnel", listPersonnel);
router.get("/users", listPersonnel);
router.delete("/personnel/:id", deleteProfile);
router.delete("/users/:id", deleteProfile);

// Historique des pointages et diagnostic
router.get("/attendances", listAttendances);
router.get("/health", healthCheck);

export default router;
