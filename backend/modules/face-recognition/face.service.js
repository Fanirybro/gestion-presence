import pool from "../../config/database.js";

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";

/**
 * Service orchestrateur de reconnaissance faciale.
 * Enrôle et pointe les membres du personnel (agents).
 * Traite les images exclusivement en mémoire vive / buffers pour des raisons de sécurité.
 */
export class FaceService {
  /**
   * Vérifie la disponibilité du micro-service Python biométrique.
   */
  static async checkPythonHealth() {
    try {
      const response = await fetch(`${PYTHON_SERVICE_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { online: false, status: response.status };
      const data = await response.json();
      return { online: true, ...data };
    } catch (error) {
      return { online: false, error: error.message };
    }
  }

  /**
   * Enrôle le profil facial d'un agent du personnel (ou utilisateur).
   * 1. Vérifie l'existence de l'agent dans la table personnel.
   * 2. Transmet l'image au microservice Python pour extraire l'embedding.
   * 3. Enregistre le vecteur biométrique dans la table dédiée face_profiles.
   */
  static async enroll(targetId, imageBase64) {
    if (!targetId) {
      throw Object.assign(new Error("L'identifiant du personnel (personnel_id) est requis."), { status: 400 });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw Object.assign(new Error("Une image au format base64 est requise."), { status: 400 });
    }

    // 1. Recherche prioritaire dans la table personnel
    const personRes = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.poste, p.organisation_id, p.actif, d.nom as departement_nom
       FROM personnel p
       LEFT JOIN departements d ON d.id = p.departement_id
       WHERE p.id = $1`,
      [targetId]
    );

    let isPersonnel = true;
    let target = personRes.rows[0];

    // Fallback éventuel sur users si pas trouvé dans personnel
    if (!target) {
      const userRes = await pool.query(
        "SELECT id, nom, prenom, email, actif FROM users WHERE id = $1",
        [targetId]
      );
      if (userRes.rows[0]) {
        target = userRes.rows[0];
        isPersonnel = false;
      }
    }

    if (!target) {
      throw Object.assign(new Error(`Personnel #${targetId} introuvable.`), { status: 404 });
    }
    if (!target.actif) {
      throw Object.assign(new Error("Impossible d'enrôler un personnel ou compte inactif."), { status: 400 });
    }

    // 2. Appel du micro-service Python (POST /enroll)
    let aiResponse;
    try {
      aiResponse = await fetch(`${PYTHON_SERVICE_URL}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          user_id: target.id,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Object.assign(
        new Error("Le service biométrique Python est injoignable. Assurez-vous qu'il est démarré sur le port 8000."),
        { status: 503 }
      );
    }

    const aiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok || !aiData.success || !aiData.embedding) {
      const msg = aiData.detail || aiData.message || "Erreur lors de la détection faciale.";
      throw Object.assign(new Error(msg), { status: aiResponse.status >= 400 && aiResponse.status < 500 ? aiResponse.status : 422 });
    }

    // 3. Sauvegarde de l'embedding dans la table face_profiles
    const embeddingJson = JSON.stringify(aiData.embedding);
    let dbRes;

    if (isPersonnel) {
      const query = `
        INSERT INTO face_profiles (personnel_id, face_embedding, updated_at)
        VALUES ($1, $2::json, now())
        ON CONFLICT (personnel_id) WHERE (personnel_id IS NOT NULL)
        DO UPDATE SET face_embedding = EXCLUDED.face_embedding, updated_at = now()
        RETURNING id, personnel_id, created_at, updated_at;
      `;
      dbRes = await pool.query(query, [target.id, embeddingJson]);
    } else {
      const query = `
        INSERT INTO face_profiles (user_id, face_embedding, updated_at)
        VALUES ($1, $2::json, now())
        ON CONFLICT (user_id)
        DO UPDATE SET face_embedding = EXCLUDED.face_embedding, updated_at = now()
        RETURNING id, user_id, created_at, updated_at;
      `;
      dbRes = await pool.query(query, [target.id, embeddingJson]);
    }

    return {
      success: true,
      profile: dbRes.rows[0],
      personnel: {
        id: target.id,
        nom: target.nom,
        prenom: target.prenom,
        poste: target.poste || "",
        departement_nom: target.departement_nom || "",
      },
      message: `Profil facial enregistré avec succès pour l'agent ${target.prenom} ${target.nom}.`,
    };
  }

  /**
   * Pointage par reconnaissance faciale (Borne Kiosk).
   * 1. Récupère tous les profils de personnel actifs.
   * 2. Envoie l'image live et les embeddings au microservice Python.
   * 3. Si un agent est reconnu, enregistre le pointage dans attendances et synchronise presences_journalieres.
   */
  static async checkIn(imageBase64, options = {}) {
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw Object.assign(new Error("Une image au format base64 est requise."), { status: 400 });
    }

    // 1. Récupération des profils faciaux enregistrés pour le personnel
    const profilesQuery = `
      SELECT fp.personnel_id, fp.face_embedding, p.nom, p.prenom, p.poste, p.organisation_id, d.nom as departement_nom
      FROM face_profiles fp
      JOIN personnel p ON p.id = fp.personnel_id
      LEFT JOIN departements d ON d.id = p.departement_id
      WHERE p.actif = true
    `;
    const profilesRes = await pool.query(profilesQuery);
    let knownRows = profilesRes.rows;

    // Si aucun profil personnel, tenter les profils utilisateurs
    if (knownRows.length === 0) {
      const userProfiles = await pool.query(`
        SELECT fp.user_id as personnel_id, fp.face_embedding, u.nom, u.prenom, '' as poste, null as organisation_id, '' as departement_nom
        FROM face_profiles fp
        JOIN users u ON u.id = fp.user_id
        WHERE u.actif = true
      `);
      knownRows = userProfiles.rows;
    }

    if (knownRows.length === 0) {
      return {
        match: false,
        message: "Aucun profil facial n'est encore enregistré dans la base de données.",
        confidence: 0,
      };
    }

    const known_faces = knownRows.map((r) => ({
      user_id: r.personnel_id,
      embedding: typeof r.face_embedding === "string" ? JSON.parse(r.face_embedding) : r.face_embedding,
    }));

    // 2. Appel au microservice Python (POST /verify)
    let aiResponse;
    try {
      aiResponse = await fetch(`${PYTHON_SERVICE_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          known_faces,
          threshold: options.threshold || 0.55,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Object.assign(
        new Error("Le service biométrique Python est injoignable."),
        { status: 503 }
      );
    }

    const verifyResult = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      const msg = verifyResult.detail || verifyResult.message || "Erreur de vérification biométrique.";
      throw Object.assign(new Error(msg), { status: aiResponse.status });
    }

    if (!verifyResult.match) {
      return {
        match: false,
        confidence: verifyResult.confidence || 0,
        message: verifyResult.message || "Visage non reconnu ou niveau de confiance insuffisant.",
      };
    }

    // 3. Agent reconnu ! Détermination ARRIVAL vs DEPARTURE
    const matchedPersonnelId = verifyResult.user_id;
    const agent = knownRows.find((a) => String(a.personnel_id) === String(matchedPersonnelId));

    // Vérifier le dernier pointage dans attendances
    const lastAttendanceRes = await pool.query(
      "SELECT type, timestamp FROM attendances WHERE personnel_id = $1 ORDER BY timestamp DESC, id DESC LIMIT 1",
      [matchedPersonnelId]
    );
    const last = lastAttendanceRes.rows[0];

    // Anti-rebond (debounce) : si pointage il y a moins de 30 secondes
    if (last && (new Date() - new Date(last.timestamp)) < 30000) {
      return {
        match: true,
        alreadyProcessed: true,
        type: last.type,
        confidence: verifyResult.confidence,
        personnel: {
          id: matchedPersonnelId,
          nom: agent?.nom || "",
          prenom: agent?.prenom || "",
          poste: agent?.poste || "",
          departement_nom: agent?.departement_nom || "",
        },
        message: `Pointage déjà enregistré il y a un instant pour ${agent?.prenom} ${agent?.nom}.`,
      };
    }

    const nextType = last?.type === "ARRIVAL" ? "DEPARTURE" : "ARRIVAL";

    // Enregistrement dans la table attendances
    const insertQuery = `
      INSERT INTO attendances (personnel_id, type, confidence, source, timestamp)
      VALUES ($1, $2, $3, 'FACE_RECOGNITION', now())
      RETURNING id, personnel_id, type, timestamp, confidence, source;
    `;
    const attendanceRes = await pool.query(insertQuery, [
      matchedPersonnelId,
      nextType,
      verifyResult.confidence,
    ]);
    const attendanceRecord = attendanceRes.rows[0];

    // Synergie directe avec presences_journalieres
    if (agent?.organisation_id) {
      try {
        const clock = (await pool.query(
          `SELECT CURRENT_TIMESTAMP AS now, 
                  to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'YYYY-MM-DD') AS date
           FROM organisations WHERE id = $1`,
          [agent.organisation_id]
        )).rows[0];

        if (clock) {
          if (nextType === "ARRIVAL") {
            await pool.query(
              `INSERT INTO presences_journalieres (organisation_id, personnel_id, date_presence, arrivee_at, statut, retard_minutes, source)
               VALUES ($1, $2, $3, $4, 'PRESENT', 0, 'AUTOMATIC')
               ON CONFLICT (organisation_id, personnel_id, date_presence) 
               DO UPDATE SET 
                 arrivee_at = coalesce(presences_journalieres.arrivee_at, EXCLUDED.arrivee_at),
                 updated_at = now()`,
              [agent.organisation_id, matchedPersonnelId, clock.date, clock.now]
            );
          } else {
            await pool.query(
              `UPDATE presences_journalieres 
               SET depart_at = $3, updated_at = now() 
               WHERE organisation_id = $1 AND personnel_id = $2 AND date_presence = $4 AND depart_at IS NULL`,
              [agent.organisation_id, matchedPersonnelId, clock.now, clock.date]
            );
          }
        }
      } catch (syncErr) {
        console.warn("Avertissement synchro presences_journalieres:", syncErr.message);
      }
    }

    const actionLabel = nextType === "ARRIVAL" ? "Arrivée" : "Départ";
    return {
      match: true,
      attendance: attendanceRecord,
      type: nextType,
      confidence: verifyResult.confidence,
      personnel: {
        id: matchedPersonnelId,
        nom: agent?.nom || "",
        prenom: agent?.prenom || "",
        poste: agent?.poste || "",
        departement_nom: agent?.departement_nom || "",
      },
      message: `${actionLabel} confirmée pour ${agent?.prenom} ${agent?.nom} (confiance: ${Math.round(verifyResult.confidence * 100)}%).`,
    };
  }

  /**
   * Liste les membres du personnel avec l'état de leur profil biométrique.
   */
  static async listPersonnelWithEnrollmentStatus(organisationId = null) {
    let query = `
      SELECT 
        p.id,
        p.nom,
        p.prenom,
        p.poste,
        p.actif,
        p.organisation_id,
        d.nom AS departement_nom,
        (fp.id IS NOT NULL) AS is_enrolled,
        coalesce(fp.updated_at, fp.created_at) AS enrolled_at
      FROM personnel p
      LEFT JOIN departements d ON d.id = p.departement_id
      LEFT JOIN face_profiles fp ON fp.personnel_id = p.id
      WHERE p.actif = true
    `;
    const params = [];
    if (organisationId) {
      query += " AND p.organisation_id = $1";
      params.push(organisationId);
    }
    query += " ORDER BY p.nom, p.prenom";
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Supprime un profil facial enregistré.
   */
  static async deleteFaceProfile(targetId) {
    const res = await pool.query(
      "DELETE FROM face_profiles WHERE personnel_id = $1 OR user_id = $1 RETURNING id",
      [targetId]
    );
    return { success: res.rowCount > 0 };
  }

  /**
   * Récupère l'historique récent des pointages de présence.
   */
  static async getRecentAttendances(limit = 20) {
    const query = `
      SELECT 
        a.id, 
        a.personnel_id,
        a.user_id, 
        a.type, 
        a.timestamp, 
        a.confidence, 
        a.source,
        coalesce(p.nom, u.nom, 'Agent') AS nom, 
        coalesce(p.prenom, u.prenom, '') AS prenom,
        coalesce(p.poste, '') AS poste,
        d.nom AS departement_nom
      FROM attendances a
      LEFT JOIN personnel p ON p.id = a.personnel_id
      LEFT JOIN departements d ON d.id = p.departement_id
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [Math.min(limit, 100)]);
    return rows;
  }
}
