import axios from "axios";

// Base URL pour le backend Express
// En dev avec Vite proxy ou backend direct : "/api/v1/face-recognition"
const API_BASE_URL =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/v1/face-recognition`
    : "/api/v1/face-recognition";

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

export const faceApi = {
  /**
   * Vérifie l'état de santé du module et du micro-service Python.
   */
  async checkHealth() {
    const res = await client.get("/health");
    return res.data;
  },

  /**
   * Enrôle le profil facial d'un agent du personnel.
   * @param {string|number} personnelId Identifiant de l'agent
   * @param {string} imageBase64 Image capturée en base64
   */
  async enrollFace(personnelId, imageBase64) {
    const res = await client.post("/enroll", {
      personnel_id: personnelId,
      user_id: personnelId,
      image: imageBase64,
    });
    return res.data;
  },

  /**
   * Envoie une photo pour vérification et pointage (Borne Kiosk).
   * @param {string} imageBase64 Frame capturée par la webcam
   * @param {object} [options]
   */
  async checkIn(imageBase64, options = {}) {
    const res = await client.post("/check-in", {
      image: imageBase64,
      threshold: options.threshold || 0.55,
    });
    return res.data;
  },

  /**
   * Récupère la liste des agents du personnel et l'état de leur profil facial.
   */
  async getPersonnel() {
    const res = await client.get("/personnel");
    return res.data.personnel || res.data.users || [];
  },

  /**
   * Alias de compatibilité pour getPersonnel().
   */
  async getUsers() {
    return this.getPersonnel();
  },

  /**
   * Supprime le profil facial d'un agent.
   * @param {string|number} personnelId
   */
  async deleteFaceProfile(personnelId) {
    const res = await client.delete(`/personnel/${personnelId}`);
    return res.data;
  },

  /**
   * Alias de compatibilité pour checkIn().
   */
  async recognizeAndCheckIn(imageBase64, options = {}) {
    return this.checkIn(imageBase64, options);
  },

  /**
   * Récupère l'historique récent des pointages par reconnaissance faciale.
   * @param {number} [limit=20]
   */
  async getAttendances(limit = 20) {
    const res = await client.get(`/attendances?limit=${limit}`);
    return res.data.attendances || [];
  },

  /**
   * Alias de compatibilité pour getAttendances().
   */
  async getRecentAttendances(limit = 20) {
    return this.getAttendances(limit);
  },
};

export default faceApi;
