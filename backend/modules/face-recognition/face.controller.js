import { FaceService } from "./face.service.js";
import pool from "../../config/database.js";
import { loadAccount } from "../../utils/account.js";

function getOrgId(req) {
  return (
    req.user?.organisation_id ||
    req.session?.organisationId ||
    req.query.organisation_id ||
    req.body?.organisation_id ||
    null
  );
}

async function getAccessibleDivisions(req, orgId) {
  const userId = req.session?.userId || req.user?.id;
  if (!userId || !orgId) return null;
  const actor = await loadAccount(pool, { id: String(userId), organisationId: orgId });
  if (!actor || actor.role === "COORDINATOR") return null;
  return Array.isArray(actor.managed_division_ids) ? actor.managed_division_ids.map(String) : [];
}

// contrôleur reconnaissance faciale
export async function enrollFace(req, res, next) {
  try {
    const { personnel_id, personnelId, agentId, user_id, userId, image } = req.body || {};
    const targetId = personnel_id || personnelId || agentId || user_id || userId;
    const orgId = getOrgId(req);

    if (!targetId) {
      return res.status(400).json({ message: "L'identifiant de l'agent (personnel_id) est obligatoire." });
    }
    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "L'image Base64 est obligatoire." });
    }

    const accessibleDivisions = await getAccessibleDivisions(req, orgId);
    const result = await FaceService.enroll(targetId, image, orgId, accessibleDivisions);
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
    const orgId = getOrgId(req);

    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "L'image Base64 capturée par la borne est obligatoire." });
    }

    const result = await FaceService.checkIn(image, { threshold, organisationId: orgId });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Erreur lors du pointage facial:", error.message || error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Erreur lors du pointage facial." });
  }
}

export async function listPersonnel(req, res, next) {
  try {
    const orgId = getOrgId(req);
    const accessibleDivisions = await getAccessibleDivisions(req, orgId);
    const personnel = await FaceService.listPersonnelWithEnrollmentStatus(orgId, accessibleDivisions);
    // Fournit personnel et users pour compatibilité descendante totale
    return res.status(200).json({ personnel, users: personnel });
  } catch (error) {
    next(error);
  }
}

export async function deleteProfile(req, res, next) {
  try {
    const targetId = req.params.personnelId || req.params.userId || req.params.id;
    const orgId = getOrgId(req);
    if (!targetId) {
      return res.status(400).json({ message: "Identifiant personnel requis." });
    }
    const accessibleDivisions = await getAccessibleDivisions(req, orgId);
    const result = await FaceService.deleteFaceProfile(targetId, orgId, accessibleDivisions);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listAttendances(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 20;
    const orgId = getOrgId(req);
    const accessibleDivisions = await getAccessibleDivisions(req, orgId);
    const attendances = await FaceService.getRecentAttendances(limit, orgId, accessibleDivisions);
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
