import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import faceApi from "./faceApi";
import {
  loadFaceDetectionModels,
  detectSingleFace,
  checkFaceAlignment,
} from "./faceDetector";
import { Heading } from "../../components/ui";
import {
  Camera,
  CameraOff,
  Sparkles,
  RefreshCw,
  ScanLine,
  UserCheck,
  CheckCircle2,
  Clock,
  User,
  AlertTriangle,
  X,
} from "lucide-react";
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
      setHealthStatus({
        status: "DEGRADED",
        pythonService: { online: false },
      });
    }

    try {
      const history = await faceApi.getRecentAttendances();
      setAttendances(history || []);
    } catch (err) {
      console.warn("Échec récupération historique pointages:", err);
    }
  };

  useEffect(() => {
    void startCamera();
    void fetchHealthAndHistory();

    loadFaceDetectionModels().catch((err) => {
      console.warn("Modèle face-api non disponible immédiatement:", err);
    });

    const interval = setInterval(fetchHealthAndHistory, 30000);
    return () => {
      clearInterval(interval);
      stopCamera();
    };
  }, []);

  // Décompte de temporisation post-pointage
  useEffect(() => {
    if (resultCooldown === null) return;
    if (resultCooldown <= 0) {
      setResultCooldown(null);
      setCameraModal(null);
      setFaceAlignment({
        isCentered: false,
        reason: "no_face",
        message: "Placez votre visage dans le repère circulaire",
      });
      return;
    }
    const timer = setTimeout(() => {
      setResultCooldown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resultCooldown]);

  const dismissModal = () => {
    setResultCooldown(null);
    setCameraModal(null);
    setFaceAlignment({
      isCentered: false,
      reason: "no_face",
      message: "Placez votre visage dans le repère circulaire",
    });
  };

  // 3. Traitement du pointage (automatique ou manuel)
  const performCheckIn = useCallback(async () => {
    const now = Date.now();
    if (now - lastRequestTimeRef.current < 2500) return;
    if (isProcessing || !videoRef.current || cameraModal !== null) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    lastRequestTimeRef.current = now;
    setIsProcessing(true);
    setCountdown(null);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64Image = canvas.toDataURL("image/jpeg", 0.9);

    try {
      const res = await faceApi.recognizeAndCheckIn(b64Image);

      if (res.status === "MATCH_FOUND") {
        playBeep(880, 0.25);
        setCameraModal({
          status: "success",
          title: "Pointage Confirmé !",
          agent: res.agent,
          type: res.attendance_type,
          confidence: res.confidence,
          message:
            res.attendance_type === "ARRIVAL"
              ? "Bienvenue ! Votre arrivée a été enregistrée avec succès."
              : "Au revoir ! Votre départ a été enregistré avec succès.",
        });
        setResultCooldown(5);
        void fetchHealthAndHistory();
      } else {
        playBeep(300, 0.3);
        setCameraModal({
          status: "error",
          title: "Visage Non Reconnu",
          agent: null,
          message:
            res.message ||
            "Profil non répertorié. Veuillez vous rapprocher de l'administration pour l'enrôlement.",
        });
        setResultCooldown(4);
      }
    } catch (err) {
      playBeep(250, 0.35);
      setCameraModal({
        status: "error",
        title: "Erreur de Pointage",
        agent: null,
        message: err.message || "Erreur de communication avec le serveur.",
      });
      setResultCooldown(4);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, cameraModal]);

  // 4. Détection continue du visage
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

          if (alignment.isCentered) {
            setCountdown((prev) => {
              if (prev === null) return 3;
              return prev;
            });
          } else {
            setCountdown(null);
          }
        }
      } catch {
        // Détection silencieuse
      } finally {
        isDetecting = false;
      }
    }, 250);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraActive, autoScan, cameraModal, isProcessing]);

  // 5. Gestionnaire du compte à rebours 3s
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
    <>
      <Heading
        eyebrow="BORNE DE POINTAGE"
        title="Pointage facial"
        subtitle="Détection automatique et enregistrement instantané des arrivées et départs par caméra"
      >
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

        <Link to="/admin/face-setup" className="button">
          <UserCheck size={16} />
          <span>Enrôlement</span>
        </Link>
      </Heading>

      <div className="face-page-layout">
        {/* Colonne Gauche : Caméra et Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="face-card">
            <div className="section-heading">
              <h2>
                <ScanLine size={18} />
                <span>Caméra biométrique</span>
              </h2>
              <span className={`badge ${cameraActive ? "present" : ""}`}>
                {cameraActive ? "Caméra active" : "Caméra arrêtée"}
              </span>
            </div>

            <div className="face-camera-container">
              <div className="face-camera-viewport">
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
                        {faceAlignment.isCentered
                          ? "✨ "
                          : faceAlignment.reason === "no_face"
                          ? "👤 "
                          : "⚠️ "}
                        {faceAlignment.message}
                      </span>
                    )}
                  </div>
                )}

                {/* Compte à rebours animé 3s au centre */}
                {cameraModal === null && countdown !== null && (
                  <div className="face-countdown-container">
                    <div className="face-countdown-circle">{countdown}</div>
                  </div>
                )}

                {/* Flash visuel lors du déclenchement */}
                {isFlashing && <div className="camera-flash" />}

                {/* MODAL DE RÉSULTAT DIRECTEMENT DANS LA CAMÉRA */}
                {cameraModal !== null && (
                  <div className="kiosk-camera-modal">
                    <div className={`kiosk-modal-icon ${cameraModal.status}`}>
                      {cameraModal.status === "success" ? "✓" : "✕"}
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
                              ? "Pointage : ARRIVÉE"
                              : "Pointage : DÉPART"}
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
                        <span>Prochain scan dans {resultCooldown}s...</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={dismissModal}
                      className="button primary"
                    >
                      {cameraModal.status === "success"
                        ? "Agent suivant"
                        : "Réessayer"}
                    </button>
                  </div>
                )}

                {cameraError && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(15, 23, 42, 0.92)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "24px",
                      textAlign: "center",
                      color: "#f87171",
                      zIndex: 40,
                    }}
                  >
                    <div>
                      <AlertTriangle
                        size={36}
                        style={{ margin: "0 auto 12px", display: "block" }}
                      />
                      <p style={{ fontSize: "14px", marginBottom: "16px" }}>
                        {cameraError}
                      </p>
                      <button
                        type="button"
                        className="button primary"
                        onClick={startCamera}
                      >
                        Réactiver la caméra
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Barre de contrôles sous la caméra */}
            <div className="face-camera-controls">
              <button
                type="button"
                onClick={() => setAutoScan(!autoScan)}
                className="button"
              >
                <Sparkles size={16} />
                <span>
                  {autoScan ? "Auto-pointage : Activé" : "Pointage : Manuel"}
                </span>
              </button>

              <button
                type="button"
                className="button primary"
                onClick={performCheckIn}
                disabled={isProcessing || !cameraActive || cameraModal !== null}
              >
                <Camera size={16} />
                <span>
                  {isProcessing
                    ? "Vérification en cours..."
                    : "Pointer manuellement"}
                </span>
              </button>
            </div>
          </div>

          {/* Feedback sous la caméra */}
          <div className={`face-feedback-card ${cameraModal?.status || "idle"}`}>
            <div className="avatar-icon">
              {cameraModal?.status === "success" ? (
                <CheckCircle2 size={20} />
              ) : cameraModal?.status === "error" ? (
                <AlertTriangle size={20} />
              ) : (
                <User size={20} />
              )}
            </div>
            <div className="face-feedback-text">
              {cameraModal?.status === "success" && cameraModal.agent ? (
                <>
                  <h3>
                    {cameraModal.agent.prenom} {cameraModal.agent.nom}
                  </h3>
                  <p>
                    {cameraModal.type === "ARRIVAL"
                      ? "Arrivée confirmée"
                      : "Départ confirmé"}
                    {cameraModal.confidence
                      ? ` (Confiance: ${Math.round(
                          cameraModal.confidence * 100
                        )}%)`
                      : ""}
                  </p>
                </>
              ) : cameraModal?.status === "error" ? (
                <>
                  <h3>Visage non reconnu</h3>
                  <p>{cameraModal.message}</p>
                </>
              ) : (
                <>
                  <h3>En attente d'un visage...</h3>
                  <p>
                    Placez votre visage dans le repère pour déclencher le
                    pointage automatique.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Colonne Droite : Derniers Pointages */}
        <div className="face-side-panel">
          <div className="face-card">
            <div className="section-heading">
              <h2>
                <Clock size={16} />
                <span>Derniers pointages</span>
              </h2>
              <button
                type="button"
                className="button"
                style={{ padding: "4px 10px", fontSize: "12px" }}
                onClick={fetchHealthAndHistory}
              >
                <RefreshCw size={13} />
                <span>Actualiser</span>
              </button>
            </div>

            {attendances.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--muted, #536b61)",
                  fontSize: "13px",
                }}
              >
                Aucun pointage facial récent enregistré aujourd'hui.
              </div>
            ) : (
              <div className="face-item-list">
                {attendances.map((item) => {
                  const initials = `${item.prenom?.[0] || ""}${
                    item.nom?.[0] || ""
                  }`.toUpperCase();
                  const time = new Date(item.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const date = new Date(item.timestamp).toLocaleDateString();

                  return (
                    <div key={item.id} className="face-list-item">
                      <div className="face-list-item-left">
                        <div className="face-item-avatar">
                          {initials || "A"}
                        </div>
                        <div className="face-item-info">
                          <div className="face-item-name">
                            {item.prenom} {item.nom}
                          </div>
                          <div className="face-item-meta">
                            {time} • {date}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`tag-badge ${
                          item.type === "ARRIVAL" ? "arrival" : "departure"
                        }`}
                      >
                        {item.type === "ARRIVAL" ? "Arrivée" : "Départ"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
