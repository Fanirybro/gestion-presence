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
  // 
  async checkHealth() {
    const res = await client.get("/health");
    return res.data;
  },

  // 
  async enrollFace(personnelId, imageBase64, organisationId = null) {
    const res = await client.post("/enroll", {
      personnel_id: personnelId,
      user_id: personnelId,
      image: imageBase64,
      organisation_id: organisationId || undefined,
    });
    return res.data;
  },

  // 
  async checkIn(imageBase64, options = {}) {
    const res = await client.post("/check-in", {
      image: imageBase64,
      threshold: options.threshold || 0.55,
      organisation_id: options.organisation_id || options.organisationId || undefined,
    });
    return res.data;
  },

  // 
  async getPersonnel(organisationId = null) {
    const params = organisationId ? `?organisation_id=${organisationId}` : "";
    const res = await client.get(`/personnel${params}`);
    return res.data.personnel || res.data.users || [];
  },

  // 
  async getUsers(organisationId = null) {
    return this.getPersonnel(organisationId);
  },

  // 
  async deleteFaceProfile(personnelId, organisationId = null) {
    const params = organisationId ? `?organisation_id=${organisationId}` : "";
    const res = await client.delete(`/personnel/${personnelId}${params}`);
    return res.data;
  },

  // 
  async recognizeAndCheckIn(imageBase64, options = {}) {
    return this.checkIn(imageBase64, options);
  },

  // 
  async getAttendances(limit = 20, organisationId = null) {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (organisationId) searchParams.append("organisation_id", organisationId);
    const res = await client.get(`/attendances?${searchParams.toString()}`);
    return res.data.attendances || [];
  },

  // 
  async getRecentAttendances(limit = 20, organisationId = null) {
    return this.getAttendances(limit, organisationId);
  },
};

export default faceApi;
