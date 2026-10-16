import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Charger le fichier avant les imports qui utilisent process.env.
// Le chemin reste valide quel que soit le dossier depuis lequel Node est lancé.
try {
  loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch (error) {
  // En production, les variables peuvent être fournies sans fichier .env.
  if (error.code !== "ENOENT") throw error;
}

const { default: app } = await import("./server.js");
const { startAbsenceScheduler } = await import("./utils/absenceScheduler.js");

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`API démarrée sur le port ${port}`);
  startAbsenceScheduler();
});
