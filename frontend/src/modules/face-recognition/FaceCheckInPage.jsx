import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import faceApi from "./faceApi";
import {
  loadFaceDetectionModels,
  detectSingleFace,
  checkFaceAlignment,
} from "./faceDetector";
import "./face-recognition.css";

// Petit bip audio via Web Audio API (aucun fichier externe requis)
const playBeep = (freq = 600, duration = 0.1) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio non critique
  }
};

export default function FaceCheckInPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [healthStatus, setHealthStatus] = useState(null);

  // Détection faciale & Compte à rebours 3s
  const [countdown, setCountdown] = useState(null); // 3, 2, 1 ou null
  const [isFlashing, setIsFlashing] = useState(false);
  const [faceAlignment, setFaceAlignment] = useState({
    isCentered: false,
    reason: "no_face",
    message: "Placez votre visage dans le repère circulaire",
  });

  // Modal de résultat directement dans le cadre caméra
  const [cameraModal, setCameraModal] = useState(null); // { status: 'success' | 'error', title, message, agent, type, confidence }
  const [resultCooldown, setResultCooldown] = useState(null); // 5s pour succès, 3s pour erreur

  const [attendances, setAttendances] = useState([]);
  const lastRequestTimeRef = useRef(0);

  // 1. Initialisation de la caméra
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Erreur accès webcam:", err);
      setCameraError(
        "Accès à la caméra refusé ou périphérique non disponible. Veuillez autoriser l'accès."
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // 2. Vérification de la santé du service & historique
  const fetchHealthAndHistory = async () => {
    try {
      const health = await faceApi.checkHealth();
      setHealthStatus(health);
    } catch {
      setHealthStatus({ online: false });
    }
    try {
      const list = await faceApi.getAttendances(10);
      setAttendances(list);
    } catch (err) {
      console.warn("Impossible de charger les pointages récents:", err);
    }
  };

  useEffect(() => {
    startCamera();
    fetchHealthAndHistory();
    loadFaceDetectionModels().catch((e) => console.warn("face-api loading:", e));

    return () => {
      stopCamera();
    };
  }, []);

  // 3. Capture d'une frame webcam vers Base64
  const captureFrameBase64 = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  // 4. Exécution du pointage biométrique
  const performCheckIn = useCallback(async () => {
    const now = Date.now();
    if (now - lastRequestTimeRef.current < 1000) return;
    if (isProcessing) return;

    const base64Image = captureFrameBase64();
    if (!base64Image) return;

    lastRequestTimeRef.current = now;
    setIsProcessing(true);
    setCountdown(null);

    try {
      const response = await faceApi.checkIn(base64Image);

      if (response.match) {
        const agent = response.personnel || response.user;
        playBeep(920, 0.28);

        // Affichage du modal de succès dans le cadre caméra
        setCameraModal({
          status: "success",
          title: response.alreadyProcessed ? "Pointage Déjà Enregistré" : "Pointage Validé !",
          message: response.message,
          agent,
          type: response.type,
          confidence: response.confidence,
        });

        // 5 secondes d'affichage pour laisser le temps à la personne de lire
        setResultCooldown(5);

        // Mise à jour de l'historique
        try {
          const updated = await faceApi.getAttendances(10);
          setAttendances(updated);
        } catch {}
      } else {
        playBeep(280, 0.2);

        // Affichage du modal d'erreur dans le cadre caméra
        setCameraModal({
          status: "error",
          title: "Visage Non Reconnu",
          message: response.message || "Aucun profil biométrique correspondant trouvé.",
          confidence: response.confidence || 0,
        });

        // 3 secondes de pause avant de relancer la détection
        setResultCooldown(3);
      }
    } catch (err) {
      playBeep(280, 0.2);
      setCameraModal({
        status: "error",
        title: "Erreur de Pointage",
        message:
          err.response?.data?.message ||
          err.message ||
          "Erreur lors de la communication avec la borne.",
      });
      setResultCooldown(3);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, captureFrameBase64]);

  // 5. Fermeture du modal de résultat et reprise
  const dismissModal = useCallback(() => {
    setCameraModal(null);
    setResultCooldown(null);
    setCountdown(null);
    setFaceAlignment({
      isCentered: false,
      reason: "no_face",
      message: "Placez votre visage dans le repère circulaire",
    });
  }, []);

  // Décompte de temporisation pour le modal de résultat
  useEffect(() => {
    if (resultCooldown === null) return;

    if (resultCooldown > 0) {
      const timer = setTimeout(() => {
        setResultCooldown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (resultCooldown === 0) {
      dismissModal();
    }
  }, [resultCooldown, dismissModal]);

  // 6. Détection faciale automatique en continu avec compte à rebours 3s
  // Activée seulement si caméra active, autoScan activé, pas de modal affiché et pas en traitement
  useEffect(() => {
    if (!cameraActive || !autoScan || cameraModal !== null || isProcessing) return;

    let isMounted = true;
    let isDetecting = false;

    const interval = setInterval(async () => {
      if (isDetecting || !videoRef.current || videoRef.current.readyState < 2) return;
      isDetecting = true;

      try {
        const detection = await detectSingleFace(videoRef.current);
        if (!isMounted) return;

        if (!detection) {
          setFaceAlignment({
            isCentered: false,
            reason: "no_face",
            message: "Placez votre visage dans le repère circulaire",
          });
          setCountdown(null);
        } else {
          const alignment = checkFaceAlignment(detection, videoRef.current);
          setFaceAlignment(alignment);

          if (!alignment.isCentered) {
            setCountdown(null);
          } else if (autoScan && cameraModal === null && !isProcessing) {
            // Visage parfaitement dans le cercle ! Lancer le compte à rebours 3s
            setCountdown((prev) => (prev === null ? 3 : prev));
          }
        }
      } catch (err) {
        console.error("Erreur détection borne:", err);
      } finally {
        isDetecting = false;
      }
    }, 200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraActive, autoScan, cameraModal, isProcessing]);

  // 7. Gestionnaire du compte à rebours 3s -> 2s -> 1s -> 📸 Pointage
  useEffect(() => {
    if (countdown === null || cameraModal !== null || isProcessing) return;

    if (countdown > 0) {
      playBeep(550 + (4 - countdown) * 120, 0.1);
      const timer = setTimeout(() => {
        setCountdown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (countdown === 0) {
      setIsFlashing(true);
      performCheckIn();
      const flashTimer = setTimeout(() => setIsFlashing(false), 350);
      return () => clearTimeout(flashTimer);
    }
  }, [countdown, cameraModal, isProcessing, performCheckIn]);

  const reticleClass = `face-reticle ${
    faceAlignment.isCentered ? "aligned" : faceAlignment.reason === "no_face" ? "" : "warning"
  }`;

  return (
    <div className="face-module-container">
      {/* En-tête */}
      <div className="face-module-header">
        <div>
          <h1>
            <span>📸</span> Borne de Pointage Faciale
          </h1>
          <p style={{ color: "#94a3b8", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Détection automatique par IA (face-api.js) avec compte à rebours et confirmation directe
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div
            className={`face-status-pill ${
              healthStatus?.pythonService?.online ? "online" : "offline"
            }`}
            title={
              healthStatus?.pythonService?.online
                ? `Moteur IA actif : ${healthStatus.pythonService.engine}`
                : "Microservice IA injoignable"
            }
          >
            <span className="dot" />
            <span>
              {healthStatus?.pythonService?.online ? "IA Connectée" : "IA Déconnectée"}
            </span>
          </div>

          <Link to="/admin/face-setup" className="face-btn face-btn-secondary">
            ⚙️ Enrôlement
          </Link>
        </div>
      </div>

      {/* Grille principale */}
      <div className="face-grid">
        {/* Colonne Gauche : Webcam et Action */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="webcam-card">
            <div className="webcam-viewport">
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Réticule de visée (visible quand aucun modal n'est affiché) */}
              {cameraModal === null && <div className={reticleClass} />}

              {/* Bulle d'instruction en temps réel */}
              {cameraModal === null && (
                <div
                  className={`face-instruction-pill ${
                    countdown !== null
                      ? "aligned"
                      : faceAlignment.isCentered
                      ? "aligned"
                      : faceAlignment.reason === "no_face"
                      ? ""
                      : "warning"
                  }`}
                >
                  {countdown !== null ? (
                    <span>⏳ Ne bougez plus ! Pointage dans {countdown}s...</span>
                  ) : (
                    <span>
                      {faceAlignment.isCentered ? "✨ " : faceAlignment.reason === "no_face" ? "👤 " : "⚠️ "}
                      {faceAlignment.message}
                    </span>
                  )}
                </div>
              )}

              {/* Compte à rebours animé 3s au centre du cercle */}
              {cameraModal === null && countdown !== null && (
                <div className="face-countdown-container">
                  <div className="face-countdown-circle">{countdown}</div>
                  <p
                    style={{
                      color: "#ffffff",
                      fontWeight: 700,
                      marginTop: "0.75rem",
                      fontSize: "1rem",
                      textShadow: "0 2px 10px rgba(0, 0, 0, 0.8)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Ne bougez plus...
                  </p>
                </div>
              )}

              {/* Flash visuel lors du déclenchement */}
              {isFlashing && <div className="camera-flash" />}

              {/* MODAL DE RÉSULTAT DIRECTEMENT DANS LA CAMÉRA (SUCCÈS / ERREUR) */}
              {cameraModal !== null && (
                <div className="kiosk-camera-modal">
                  <div className={`kiosk-modal-icon ${cameraModal.status}`}>
                    {cameraModal.status === "success" ? "✓" : "✗"}
                  </div>

                  <h3 className="kiosk-modal-title">{cameraModal.title}</h3>

                  {cameraModal.status === "success" && cameraModal.agent && (
                    <>
                      {cameraModal.type && (
                        <span
                          className={`kiosk-modal-type-tag ${
                            cameraModal.type === "ARRIVAL" ? "arrival" : "departure"
                          }`}
                        >
                          {cameraModal.type === "ARRIVAL"
                            ? "🟢 Pointage : ARRIVÉE"
                            : "🟣 Pointage : DÉPART"}
                        </span>
                      )}

                      <p className="kiosk-modal-name">
                        {cameraModal.agent.prenom} {cameraModal.agent.nom}
                      </p>

                      <p className="kiosk-modal-dept">
                        {cameraModal.agent.poste || "Agent"}{" "}
                        {cameraModal.agent.departement_nom
                          ? `• ${cameraModal.agent.departement_nom}`
                          : ""}
                      </p>
                    </>
                  )}

                  <p className="kiosk-modal-desc">{cameraModal.message}</p>

                  {resultCooldown !== null && (
                    <div className="kiosk-cooldown-timer">
                      <span>⏳ Prochain scan dans {resultCooldown}s...</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={dismissModal}
                    className="face-btn face-btn-primary"
                    style={{ padding: "0.55rem 1.4rem" }}
                  >
                    {cameraModal.status === "success" ? "➕ Agent Suivant" : "🔄 Réessayer"}
                  </button>
                </div>
              )}

              {cameraError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(15, 23, 42, 0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem",
                    textAlign: "center",
                    color: "#f87171",
                    zIndex: 40,
                  }}
                >
                  <div>
                    <p style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>⚠️ {cameraError}</p>
                    <button className="face-btn face-btn-primary" onClick={startCamera}>
                      Réactiver la caméra
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Barre de contrôles */}
            <div className="webcam-controls">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setAutoScan(!autoScan)}
                  className="face-btn face-btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  {autoScan ? "⚡ Auto-Pointage : Activé" : "✋ Pointage : Manuel"}
                </button>
              </div>

              <button
                className="face-btn face-btn-primary"
                onClick={performCheckIn}
                disabled={isProcessing || !cameraActive || cameraModal !== null}
              >
                {isProcessing ? "Vérification..." : "📸 Pointer Manuellement"}
              </button>
            </div>
          </div>

          {/* Feedback sous la caméra */}
          <div className={`feedback-card ${cameraModal?.status || "idle"}`}>
            <div className="avatar">
              {cameraModal?.status === "success"
                ? "✓"
                : cameraModal?.status === "error"
                ? "✗"
                : "👤"}
            </div>
            <div className="feedback-info">
              {cameraModal?.status === "success" && cameraModal.agent ? (
                <>
                  <h3 style={{ color: "#22c55e" }}>
                    {cameraModal.agent.prenom} {cameraModal.agent.nom}
                  </h3>
                  <p>
                    {cameraModal.type === "ARRIVAL" ? "🟢 Arrivée confirmée" : "🟣 Départ confirmé"}
                    {cameraModal.confidence
                      ? ` (Confiance: ${Math.round(cameraModal.confidence * 100)}%)`
                      : ""}
                  </p>
                </>
              ) : cameraModal?.status === "error" ? (
                <>
                  <h3 style={{ color: "#ef4444" }}>Visage Inconnu</h3>
                  <p>{cameraModal.message}</p>
                </>
              ) : (
                <>
                  <h3>En attente d'un visage...</h3>
                  <p>Placez votre visage dans le repère pour lancer le compte à rebours automatique.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Colonne Droite : Historique des pointages récents */}
        <div className="face-side-panel">
          <div className="side-card">
            <h2>
              <span>Derniers Pointages</span>
              <button
                onClick={fetchHealthAndHistory}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                Actualiser
              </button>
            </h2>

            {attendances.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem", textAlign: "center", margin: "2rem 0" }}>
                Aucun pointage récent par reconnaissance faciale.
              </p>
            ) : (
              <div className="attendance-list">
                {attendances.map((item) => (
                  <div key={item.id} className="attendance-item">
                    <div>
                      <div className="user-name">
                        {item.prenom} {item.nom}
                      </div>
                      <div className="meta">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        • {new Date(item.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      className={`badge-tag ${
                        item.type === "ARRIVAL" ? "arrival" : "departure"
                      }`}
                    >
                      {item.type === "ARRIVAL" ? "Arrivée" : "Départ"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
