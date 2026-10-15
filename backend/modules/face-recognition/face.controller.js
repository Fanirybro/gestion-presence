import { FaceService } from "./face.service.js";

/**
 * Contrôleur du module de reconnaissance faciale.
 */
export async function enrollFace(req, res, next) {
  try {
    const { personnel_id, personnelId, agentId, user_id, userId, image } = req.body || {};
    const targetId = personnel_id || personnelId || agentId || user_id || userId;

    if (!targetId) {
      return res.status(400).json({ message: "L'identifiant de l'agent (personnel_id) est obligatoire." });
    }
    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "L'image Base64 est obligatoire." });
    }

    const result = await FaceService.enroll(targetId, image);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Erreur lors de l'enrôlement facial:", error.message || error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Erreur lors de l'enrôlement biométrique." });
  }
}

export async function checkInFace(req, res, next) {
  try {
    const { image, threshold } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "L'image Base64 capturée par la borne est obligatoire." });
    }

    const result = await FaceService.checkIn(image, { threshold });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Erreur lors du pointage facial:", error.message || error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Erreur lors du pointage facial." });
  }
}

export async function listPersonnel(req, res, next) {
  try {
    const orgId = req.user?.organisation_id || req.query.organisation_id || null;
    const personnel = await FaceService.listPersonnelWithEnrollmentStatus(orgId);
    // Fournit personnel et users pour compatibilité descendante totale
    return res.status(200).json({ personnel, users: personnel });
  } catch (error) {
    next(error);
  }
}

export async function deleteProfile(req, res, next) {
  try {
    const targetId = req.params.personnelId || req.params.userId || req.params.id;
    if (!targetId) {
      return res.status(400).json({ message: "Identifiant personnel requis." });
    }
    const result = await FaceService.deleteFaceProfile(targetId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listAttendances(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 20;
    const attendances = await FaceService.getRecentAttendances(limit);
    return res.status(200).json({ attendances });
  } catch (error) {
    next(error);
  }
}

export async function healthCheck(req, res, next) {
  try {
    const pythonStatus = await FaceService.checkPythonHealth();
    return res.status(200).json({
      status: "ok",
      module: "face-recognition-orchestrator",
      pythonService: pythonStatus,
    });
  } catch (error) {
    next(error);
  }
}
