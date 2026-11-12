// réconciliation automatique des absences
import pool from "../config/database.js";
import { reconcileAbsences } from "../utils/presence.js";

// intervalle de 60s
const INTERVAL_MS = 60_000;

let timer = null;

// vérif des absences du jour
async function tick() {
  let client;
  try {
    client = await pool.connect();

    // Récupérer toutes les organisations actives et leur date locale du jour.
    const { rows: orgs } = await client.query(
      `SELECT id,
              (CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire)::date AS today
       FROM organisations
       WHERE actif = true`
    );

    for (const org of orgs) {
      try {
        await client.query("BEGIN");
        // Verrouiller l'organisation pour éviter les exécutions concurrentes.
        await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [org.id]);
        const day = org.today.toISOString().slice(0, 10);
        await reconcileAbsences(client, org.id, day, day);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        // Ne pas planter le scheduler entier si une seule organisation échoue.
        console.error(`[absence-scheduler] Erreur org ${org.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[absence-scheduler] Erreur globale:", err.message);
  } finally {
    client?.release();
  }
}

// lance le scheduler
export function startAbsenceScheduler() {
  if (timer) return;
  console.log("[absence-scheduler] Démarré — vérification toutes les 60 s.");
  // Exécuter un premier cycle immédiatement au démarrage du serveur.
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  // Permettre au processus Node de s'arrêter proprement sans bloquer sur ce timer.
  timer.unref();
}

// stop scheduler
export function stopAbsenceScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[absence-scheduler] Arrêté.");
  }
}

