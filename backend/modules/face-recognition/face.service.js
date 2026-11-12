import pool from "../../config/database.js";

function getPythonServiceUrl() {
  let url = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
  url = url.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export class FaceService {
  static async checkPythonHealth() {
    const baseUrl = getPythonServiceUrl();
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return { online: false, status: response.status, url: baseUrl };
      const data = await response.json();
      return { online: true, ...data, url: baseUrl };
    } catch (error) {
      console.warn(`Health check échoué vers ${baseUrl}:`, error.message);
      return { online: false, error: error.message, url: baseUrl };
    }
  }

  // Enrôlement du profil facial d'un agent
  static async enroll(targetId, imageBase64, organisationId = null, accessibleDivisions = null) {
    if (!targetId) {
      throw Object.assign(new Error("L'identifiant du personnel est requis."), { status: 400 });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw Object.assign(new Error("Une image au format base64 est requise."), { status: 400 });
    }

    // Recherche de l'agent
    let personQuery = `SELECT p.id, p.nom, p.prenom, p.poste, p.organisation_id, p.division_id, p.actif, d.nom as departement_nom, d.nom as division_nom
       FROM personnel p
       LEFT JOIN divisions d ON d.id = p.division_id
       WHERE p.id = $1`;
    const personParams = [targetId];
    if (organisationId) {
      personQuery += " AND p.organisation_id = $2";
      personParams.push(organisationId);
    }
    const personRes = await pool.query(personQuery, personParams);

    let isPersonnel = true;
    let target = personRes.rows[0];

    // Fallback users si non trouvé dans personnel
    if (!target && !organisationId) {
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
      throw Object.assign(new Error("Impossible d'enrôler un personnel inactif."), { status: 400 });
    }

    if (target && isPersonnel && accessibleDivisions !== null) {
      if (!accessibleDivisions.includes(String(target.division_id))) {
        throw Object.assign(new Error("Accès refusé : cet agent appartient à une autre division / niveau."), { status: 403 });
      }
    }

    // Appel au service Python
    const baseUrl = getPythonServiceUrl();
    let aiResponse;
    try {
      aiResponse = await fetch(`${baseUrl}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          user_id: target.id,
        }),
        signal: AbortSignal.timeout(35000),
      });
    } catch (fetchErr) {
      console.error(`Échec appel POST ${baseUrl}/enroll:`, fetchErr);
      const isTimeout = fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError";
      throw Object.assign(
        new Error(
          isTimeout
            ? "Le service biométrique met du temps à répondre. Réessayez dans un instant."
            : `Le service biométrique est injoignable (${baseUrl}) : ${fetchErr.message}`
        ),
        { status: 503 }
      );
    }

    const aiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok || !aiData.success || !aiData.embedding) {
      const msg = aiData.detail || aiData.message || "Erreur lors de la détection faciale.";
      throw Object.assign(new Error(msg), { status: aiResponse.status >= 400 && aiResponse.status < 500 ? aiResponse.status : 422 });
    }

    // Sauvegarde du vecteur facial
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
      message: `Profil facial enregistré pour ${target.prenom} ${target.nom}.`,
    };
  }

  // Pointage par scan facial
  static async checkIn(imageBase64, options = {}) {
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw Object.assign(new Error("Une image au format base64 est requise."), { status: 400 });
    }

    // Profils faciaux existants filtrés par organisation si disponible
    let profilesQuery = `
      SELECT fp.personnel_id, fp.face_embedding, p.nom, p.prenom, p.poste, p.organisation_id, d.nom as departement_nom, d.nom as division_nom
      FROM face_profiles fp
      JOIN personnel p ON p.id = fp.personnel_id
      LEFT JOIN divisions d ON d.id = p.division_id
      WHERE p.actif = true
    `;
    const profileParams = [];
    if (options.organisationId) {
      profilesQuery += " AND p.organisation_id = $1";
      profileParams.push(options.organisationId);
    }
    const profilesRes = await pool.query(profilesQuery, profileParams);
    let knownRows = profilesRes.rows;

    if (knownRows.length === 0 && !options.organisationId) {
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
        message: "Aucun profil facial n'est encore enregistré.",
        confidence: 0,
      };
    }

    const known_faces = knownRows.map((r) => ({
      user_id: r.personnel_id,
      embedding: typeof r.face_embedding === "string" ? JSON.parse(r.face_embedding) : r.face_embedding,
    }));

    // Vérification via Python
    const baseUrl = getPythonServiceUrl();
    let aiResponse;
    try {
      aiResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          known_faces,
          threshold: options.threshold || 0.55,
        }),
        signal: AbortSignal.timeout(35000),
      });
    } catch (fetchErr) {
      console.error(`Échec appel POST ${baseUrl}/verify:`, fetchErr);
      const isTimeout = fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError";
      throw Object.assign(
        new Error(
          isTimeout
            ? "Le service biométrique met du temps à répondre. Réessayez dans un instant."
            : `Le service biométrique est injoignable (${baseUrl}) : ${fetchErr.message}`
        ),
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
        message: verifyResult.message || "Visage non reconnu ou confiance insuffisante.",
      };
    }

    // Gestion de l'arrivée / départ
    const matchedPersonnelId = verifyResult.user_id;
    const agent = knownRows.find((a) => String(a.personnel_id) === String(matchedPersonnelId));

    const lastAttendanceRes = await pool.query(
      "SELECT type, horodatage AS timestamp FROM pointages WHERE personnel_id = $1 ORDER BY horodatage DESC, id DESC LIMIT 1",
      [matchedPersonnelId]
    );
    const last = lastAttendanceRes.rows[0];

    // Ignorer si double scan dans les 30 secondes
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
        message: `Pointage déjà enregistré pour ${agent?.prenom} ${agent?.nom}.`,
      };
    }

    let nextType = "ARRIVAL";
    let clock = null;
    let schedule = null;
    let currentSlot = "MATIN";
    let previous = null;

    if (agent?.organisation_id) {
      clock = (await pool.query(
        `SELECT CURRENT_TIMESTAMP AS now, 
                to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'YYYY-MM-DD') AS date,
                to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'HH24:MI') AS time,
                extract(dow FROM CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire)::int AS day,
                pointage_facial
         FROM organisations WHERE id = $1`,
        [agent.organisation_id]
      )).rows[0];

      if (clock && clock.pointage_facial === false) {
        return {
          match: false,
          confidence: verifyResult.confidence,
          message: "Le pointage par reconnaissance faciale est désactivé pour cette organisation.",
        };
      }

      if (clock) {
        const schedules = (await pool.query(
          `SELECT jour_semaine, periode, fin_jour_suivant, to_char(heure_debut, 'HH24:MI') AS start,
                  to_char(heure_fin, 'HH24:MI') AS end, to_char(heure_limite_absence, 'HH24:MI') AS cutoff,
                  tolerance_retard_minutes AS tolerance
           FROM horaires_travail
           WHERE organisation_id = $1 AND jour_travaille = true ORDER BY heure_debut`,
          [agent.organisation_id]
        )).rows;

        previous = schedules.find(s => s.jour_semaine === (clock.day + 6) % 7 && s.fin_jour_suivant && clock.time < s.end);
        const today = schedules.filter(s => s.jour_semaine === clock.day);
        schedule = previous ?? today.find(s => clock.time >= s.start && (s.fin_jour_suivant || clock.time < s.end)) ?? today.find(s => clock.time < s.start) ?? today.at(-1);
        currentSlot = schedule?.periode || "MATIN";

        let slotDate = clock.date;
        if (previous) {
          const day = new Date(`${slotDate}T12:00:00Z`);
          day.setUTCDate(day.getUTCDate() - 1);
          slotDate = day.toISOString().slice(0, 10);
        }

        // Créneau en cours déjà ouvert ?
        const currentOpen = (await pool.query(
          `SELECT id FROM presences_journalieres 
           WHERE organisation_id = $1 AND personnel_id = $2 AND date_presence = $3 AND periode = $4
             AND arrivee_at IS NOT NULL AND depart_at IS NULL 
           LIMIT 1`,
          [agent.organisation_id, matchedPersonnelId, slotDate, currentSlot]
        )).rows[0];

        nextType = currentOpen ? "DEPARTURE" : "ARRIVAL";

        if (nextType === "ARRIVAL" && schedule?.cutoff) {
          const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
          const arrivalMin = minutes(clock.time) + (previous ? 1440 : 0);
          const cutoffMin = minutes(schedule.cutoff) + (schedule.fin_jour_suivant && schedule.cutoff < schedule.start ? 1440 : 0);
          if (arrivalMin > cutoffMin) {
            const periodeName = currentSlot.toLowerCase();
            return {
              match: true,
              rejected: true,
              confidence: verifyResult.confidence,
              personnel: {
                id: matchedPersonnelId,
                nom: agent?.nom || "",
                prenom: agent?.prenom || "",
                poste: agent?.poste || "",
                departement_nom: agent?.departement_nom || "",
              },
              cutoff: schedule.cutoff,
              slot: periodeName,
              message: `Heure limite de retard dépassée (${schedule.cutoff}). Pointage non validé.`,
            };
          }
        }
      }
    } else {
      nextType = last?.type === "ARRIVAL" ? "DEPARTURE" : "ARRIVAL";
    }

    // Sauvegarde du pointage dans la table unifiée pointages
    const orgId = agent?.organisation_id || options.organisationId;
    const insertQuery = `
      INSERT INTO pointages (organisation_id, personnel_id, type, confidence, source, horodatage, cle_idempotence)
      VALUES ($1, $2, $3, $4, 'FACE_RECOGNITION', now(), gen_random_uuid())
      RETURNING id, organisation_id, personnel_id, type, horodatage AS timestamp, confidence, source;
    `;
    const attendanceRes = await pool.query(insertQuery, [
      orgId,
      matchedPersonnelId,
      nextType,
      verifyResult.confidence,
    ]);
    const attendanceRecord = attendanceRes.rows[0];

    // Synchro avec presences_journalieres
    if (agent?.organisation_id && clock) {
      try {
        let date = clock.date;
        if (previous) {
          const day = new Date(`${date}T12:00:00Z`);
          day.setUTCDate(day.getUTCDate() - 1);
          date = day.toISOString().slice(0, 10);
        }

        const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        const late = schedule ? Math.max(0, minutes(clock.time) + (previous ? 1440 : 0) - minutes(schedule.start) - schedule.tolerance) : 0;

        if (nextType === "ARRIVAL") {
          // Fermer un éventuel créneau non clôturé
          const staleOpen = (await pool.query(
            `SELECT id FROM presences_journalieres 
             WHERE organisation_id = $1 AND personnel_id = $2 AND arrivee_at IS NOT NULL AND depart_at IS NULL 
             ORDER BY date_presence DESC, id DESC LIMIT 1`,
            [agent.organisation_id, matchedPersonnelId]
          )).rows[0];
          if (staleOpen) {
            await pool.query(
              "UPDATE presences_journalieres SET depart_at = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2",
              [agent.organisation_id, staleOpen.id, clock.now]
            );
          }

          await pool.query(
            `INSERT INTO presences_journalieres (organisation_id, personnel_id, date_presence, periode, arrivee_at, statut, retard_minutes, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'AUTOMATIC')
             ON CONFLICT (organisation_id, personnel_id, date_presence, periode) 
             DO UPDATE SET 
               arrivee_at = coalesce(presences_journalieres.arrivee_at, EXCLUDED.arrivee_at),
               statut = CASE WHEN presences_journalieres.arrivee_at IS NULL THEN EXCLUDED.statut ELSE presences_journalieres.statut END,
               retard_minutes = CASE WHEN presences_journalieres.arrivee_at IS NULL THEN EXCLUDED.retard_minutes ELSE presences_journalieres.retard_minutes END,
               updated_at = now()`,
            [agent.organisation_id, matchedPersonnelId, date, currentSlot, clock.now, late ? "LATE" : "PRESENT", late]
          );
        } else {
          const open = (await pool.query(
            `SELECT id FROM presences_journalieres 
             WHERE organisation_id = $1 AND personnel_id = $2 AND date_presence = $3 AND periode = $4 AND arrivee_at IS NOT NULL AND depart_at IS NULL 
             ORDER BY date_presence DESC, id DESC LIMIT 1`,
            [agent.organisation_id, matchedPersonnelId, date, currentSlot]
          )).rows[0];
          if (open) {
            await pool.query(
              `UPDATE presences_journalieres 
               SET depart_at = $3, updated_at = now() 
               WHERE organisation_id = $1 AND id = $2`,
              [agent.organisation_id, open.id, clock.now]
            );
          }
        }
      } catch (syncErr) {
        console.warn("Synchro presences_journalieres:", syncErr.message);
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
      message: `${actionLabel} enregistrée pour ${agent?.prenom} ${agent?.nom}.`,
    };
  }

  static async listPersonnelWithEnrollmentStatus(organisationId = null, accessibleDivisions = null) {
    if (!organisationId && process.env.NODE_ENV !== "test") {
      return [];
    }

    let query = `
      SELECT 
        p.id,
        p.nom,
        p.prenom,
        p.poste,
        p.actif,
        p.organisation_id,
        p.division_id,
        d.nom AS departement_nom,
        d.nom AS division_nom,
        (fp.id IS NOT NULL) AS is_enrolled,
        coalesce(fp.updated_at, fp.created_at) AS enrolled_at
      FROM personnel p
      LEFT JOIN divisions d ON d.id = p.division_id
      LEFT JOIN face_profiles fp ON fp.personnel_id = p.id
      WHERE p.actif = true
    `;
    const params = [];
    if (organisationId) {
      query += " AND p.organisation_id = $1";
      params.push(organisationId);
    }
    if (accessibleDivisions !== null) {
      params.push(accessibleDivisions);
      query += ` AND p.division_id::text = ANY($${params.length})`;
    }
    query += " ORDER BY p.nom, p.prenom";
    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async deleteFaceProfile(targetId, organisationId = null, accessibleDivisions = null) {
    if (organisationId) {
      const check = await pool.query(
        "SELECT id, division_id FROM personnel WHERE id = $1 AND organisation_id = $2",
        [targetId, organisationId]
      );
      if (check.rows.length === 0) {
        return { success: false, message: "Personnel introuvable dans votre organisation." };
      }
      if (accessibleDivisions !== null && !accessibleDivisions.includes(String(check.rows[0].division_id))) {
        throw Object.assign(new Error("Accès refusé : cet agent appartient à une autre division / niveau."), { status: 403 });
      }
    }
    const res = await pool.query(
      "DELETE FROM face_profiles WHERE personnel_id = $1 OR user_id = $1 RETURNING id",
      [targetId]
    );
    return { success: res.rowCount > 0 };
  }

  static async getRecentAttendances(limit = 20, orgId = null, accessibleDivisions = null) {
    // Si aucun orgId n'est fourni et qu'on n'est pas en test unitaire mocké,
    // on ne doit absolument JAMAIS renvoyer les données d'autres organisations.
    if (!orgId && process.env.NODE_ENV !== "test") {
      return [];
    }

    let whereClause = "";
    const params = [Math.min(limit, 100)];

    if (orgId) {
      params.push(orgId);
      whereClause = `WHERE pt.organisation_id = $2`;
      if (accessibleDivisions !== null) {
        params.push(accessibleDivisions);
        whereClause += ` AND p.division_id::text = ANY($${params.length})`;
      }
    }

    const query = `
      SELECT 
        pt.id, 
        pt.personnel_id,
        pt.organisation_id,
        pt.type, 
        pt.horodatage AS timestamp, 
        pt.confidence, 
        pt.source,
        coalesce(p.nom, 'Agent') AS nom, 
        coalesce(p.prenom, '') AS prenom,
        coalesce(p.poste, '') AS poste,
        d.nom AS departement_nom,
        d.nom AS division_nom
      FROM pointages pt
      LEFT JOIN personnel p ON p.id = pt.personnel_id
      LEFT JOIN divisions d ON d.id = p.division_id
      ${whereClause}
      ORDER BY pt.horodatage DESC, pt.id DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }
}
