import express from "express";
import cors from "cors";


import { createSessionMiddleware } from "./config/session.js";
import { requireTrustedOrigin } from "./middlewares/authMiddlewares.js";
import authRoutes from "./routes/authRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import organisationsRoutes from "./routes/organisationsRoutes.js";
import personnelsRoutes from "./routes/personnelsRoutes.js";
import departementsRoutes from "./routes/departementsRoutes.js";
import parametresRoutes from "./routes/parametresRoutes.js";
import absenceRoutes from "./routes/absenceRoutes.js";
import presenceRoutes from "./routes/presenceRoutes.js";
import qrCodeRoutes from "./routes/QrCodeRoutes.js";
import faceRoutes from "./modules/face-recognition/face.routes.js";
import { createTrace, errorSummary } from "./utils/diagnostics.js";

export function createApp({ sessionStore } = {}) {
  const app = express();
  const origins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") {
    // En développement, tolérer localhost et 127.0.0.1 sur les ports usuels de Vite (5173, 5174, etc.)
    const devOrigins = [
      "http://localhost:5173", "http://127.0.0.1:5173",
      "http://localhost:5174", "http://127.0.0.1:5174",
      "http://localhost:5175", "http://127.0.0.1:5175",
      "http://localhost:4173", "http://127.0.0.1:4173",
      "http://localhost:3000", "http://127.0.0.1:3000"
    ];
    for (const devOrigin of devOrigins) {
      if (!origins.includes(devOrigin)) origins.push(devOrigin);
    }
  }
  if (process.env.VERCEL_URL) {
    const vercelOrigin = `https://${process.env.VERCEL_URL}`;
    if (!origins.includes(vercelOrigin)) origins.push(vercelOrigin);
  }
  if (process.env.TRUST_PROXY_HOPS) {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1) throw new Error("TRUST_PROXY_HOPS invalide.");
    app.set("trust proxy", hops);
  } else if (process.env.VERCEL) {
    app.set("trust proxy", 1);
  }
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/api/auth/signup") {
      req.signupTrace = createTrace("signup");
      req.signupTrace.result("Request received: POST /api/auth/signup");
      res.once("finish", () => req.signupTrace.result(`Response sent: HTTP ${res.statusCode}`));
      res.once("close", () => {
        if (!res.writableFinished) req.signupTrace.result("Connection closed before response completed");
      });
    }
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) return callback(null, true);
      try {
        const url = new URL(origin);
        if (url.hostname.endsWith(".vercel.app")) return callback(null, true);
      } catch {}
      callback(null, false);
    },
    credentials: true,
  }));
  app.use(requireTrustedOrigin(origins));
  app.use("/api/v1/face-recognition", express.json({ limit: "10mb" }));
  app.use(express.json({ limit: "16kb" }));
  app.use(createSessionMiddleware(sessionStore));
  app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/organisations", organisationsRoutes);
  app.use("/api/personnels", personnelsRoutes);
  app.use("/api/departements", departementsRoutes);
  app.use("/api/parametres", parametresRoutes);
  app.use("/api/badges", qrCodeRoutes);
  app.use("/api/presences", presenceRoutes);
  app.use("/api/absences-autorisees", absenceRoutes);
  app.use("/api/v1/face-recognition", faceRoutes);
  app.use((req, res) => res.status(404).json({ message: "Route introuvable." }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed") return res.status(400).json({ message: "JSON invalide." });
    if (error.type === "entity.too.large") return res.status(413).json({ message: "Requête trop volumineuse." });
    console.error("Erreur serveur :", req.signupTrace ? errorSummary(error) : error);
    res.status(500).json({ message: "Erreur interne du serveur." });
  });
  return app;
}

export default createApp();
