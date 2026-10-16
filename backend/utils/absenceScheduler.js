/**
 * Planificateur de réconciliation automatique des absences.
 *
 * Exécute `reconcileAbsences` pour chaque organisation active toutes les
 * minutes.  Seules les lignes dont le `cutoff` (heure_limite_absence) est
 * dépassé seront matérialisées en base — la requête SQL embarque déjà cette
 * condition (`WHERE cutoff <= CURRENT_TIMESTAMP`).
 *
 * Aucune dépendance externe : utilise `setInterval` natif de Node.js.
 */
import pool from "../config/database.js";
import { reconcileAbsences } from "../utils/presence.js";

/** Intervalle par défaut (ms) — toutes les 60 secondes. */
const INTERVAL_MS = 60_000;

let timer = null;

/**
 * Un cycle de réconciliation : pour chaque organisation active, matérialise
 * les absences du jour si l'heure limite est dépassée.
 */
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

/** Démarre le planificateur. Sans effet si déjà actif. */
export function startAbsenceScheduler() {
  if (timer) return;
  console.log("[absence-scheduler] Démarré — vérification toutes les 60 s.");
  // Exécuter un premier cycle immédiatement au démarrage du serveur.
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  // Permettre au processus Node de s'arrêter proprement sans bloquer sur ce timer.
  timer.unref();
}

/** Arrête le planificateur (utile pour les tests). */
export function stopAbsenceScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[absence-scheduler] Arrêté.");
  }
}

