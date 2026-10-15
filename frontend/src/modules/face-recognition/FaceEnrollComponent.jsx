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
    // Audio non critique si désactivé par le navigateur
  }
};

export default function FaceEnrollComponent() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [personnelList, setPersonnelList] = useState([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Détection faciale & Compte à rebours automatique
  const [autoCapture, setAutoCapture] = useState(true);
  const [countdown, setCountdown] = useState(null); // 3, 2, 1 ou null
  const [isFlashing, setIsFlashing] = useState(false);
  const [faceAlignment, setFaceAlignment] = useState({
    isCentered: false,
    reason: "no_face",
    message: "Positionnez votre visage dans le repère circulaire",
  });
  const [isAiReady, setIsAiReady] = useState(false);

  // Temporisation post-enrôlement (délai de 10s pour éviter les captures en boucle)
  const [postEnrollCooldown, setPostEnrollCooldown] = useState(null); // 10, 9, ... ou null
  const [enrolledAgentInfo, setEnrolledAgentInfo] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'success' | 'error', message: string }

  // 1. Initialiser la caméra
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
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // 2. Charger les modèles face-api & liste du personnel
  const loadPersonnel = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await faceApi.getPersonnel();
      setPersonnelList(list);
      if (list.length > 0 && !selectedPersonnelId) {
        setSelectedPersonnelId(String(list[0].id));
      }
    } catch (err) {
      setAlert({
        type: "error",
        message: err.message || "Impossible de charger la liste du personnel.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedPersonnelId]);

  useEffect(() => {
    void startCamera();
    void loadPersonnel();

    // Préchargement asynchrone des modèles face-api.js
    loadFaceDetectionModels()
      .then(() => setIsAiReady(true))
      .catch((err) => {
        console.warn("Modèle face-api non disponible immédiatement:", err);
      });

    return () => {
      stopCamera();
    };
  }, [loadPersonnel]);

  // 3. Capture instantanée (manuelle ou appelée par le compte à rebours)
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedPhoto(b64);
    setCountdown(null);
    setAlert(null);
  }, []);

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCountdown(null);
    setAlert(null);
    setFaceAlignment({
      isCentered: false,
      reason: "no_face",
      message: "Positionnez votre visage dans le repère circulaire",
    });

    if (videoRef.current) {
      if (streamRef.current && streamRef.current.active) {
        if (videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        videoRef.current.play().catch(() => {});
      } else {
        void startCamera();
      }
    }
  };

  // Passer à l'agent suivant ou lever le délai de 10s
  const handleProceedNext = useCallback(() => {
    setPostEnrollCooldown(null);
    setCapturedPhoto(null);
    setCountdown(null);
    setEnrolledAgentInfo(null);
    setFaceAlignment({
      isCentered: false,
      reason: "no_face",
      message: "Positionnez votre visage dans le repère circulaire",
    });

    // Pré-sélectionner le prochain agent non enrôlé dans la liste si disponible
    setPersonnelList((prevList) => {
      const nextUnenrolled = prevList.find(
        (p) => !p.is_enrolled && String(p.id) !== String(selectedPersonnelId)
      );
      if (nextUnenrolled) {
        setSelectedPersonnelId(String(nextUnenrolled.id));
      }
      return prevList;
    });

    if (videoRef.current && streamRef.current && streamRef.current.active) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [selectedPersonnelId]);

  // Assurer la continuité de la lecture vidéo quand la photo est réinitialisée
  useEffect(() => {
    if (!capturedPhoto && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [capturedPhoto]);

  // 4. Détection automatique du visage dans le cercle avec face-api.js
  // DÉSACTIVÉE si capturedPhoto est présent OU si postEnrollCooldown est en cours !
  useEffect(() => {
    if (!cameraActive || capturedPhoto || postEnrollCooldown !== null) return;

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
            message: "Positionnez votre visage dans le repère circulaire",
          });
          // Si le visage sort pendant le compte à rebours, on annule
          setCountdown(null);
        } else {
          const alignment = checkFaceAlignment(detection, videoRef.current);
          setFaceAlignment(alignment);

          if (!alignment.isCentered) {
            // Pas centré ou trop loin : annuler le compte à rebours
            setCountdown(null);
          } else if (autoCapture && !capturedPhoto && postEnrollCooldown === null) {
            // Visage parfaitement dans le cercle ! Lancer le compte à rebours de 3s
            setCountdown((prev) => (prev === null ? 3 : prev));
          }
        }
      } catch (err) {
        console.error("Erreur détection automatique:", err);
      } finally {
        isDetecting = false;
      }
    }, 200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraActive, capturedPhoto, autoCapture, postEnrollCooldown]);

  // 5. Gestionnaire du compte à rebours 3s -> 2s -> 1s -> 📸 Capture automatique
  useEffect(() => {
    if (countdown === null || capturedPhoto || postEnrollCooldown !== null) return;

    if (countdown > 0) {
      playBeep(550 + (4 - countdown) * 120, 0.1);
      const timer = setTimeout(() => {
        setCountdown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (countdown === 0) {
      // Déclenchement de la photo automatique !
      setIsFlashing(true);
      playBeep(920, 0.22);
      handleCapture();
      const flashTimer = setTimeout(() => setIsFlashing(false), 380);
      return () => clearTimeout(flashTimer);
    }
  }, [countdown, capturedPhoto, postEnrollCooldown, handleCapture]);

  // 6. Gestionnaire du cooldown post-enrôlement (décompte 10s)
  useEffect(() => {
    if (postEnrollCooldown === null) return;

    if (postEnrollCooldown > 0) {
      const timer = setTimeout(() => {
        setPostEnrollCooldown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (postEnrollCooldown === 0) {
      // Les 10 secondes sont écoulées : réactivation automatique pour le prochain agent
      handleProceedNext();
    }
  }, [postEnrollCooldown, handleProceedNext]);

  // 7. Envoi de l'enrôlement au backend
  const handleEnrollSubmit = async () => {
    if (!selectedPersonnelId) {
      setAlert({
        type: "error",
        message: "Veuillez sélectionner un membre du personnel.",
      });
      return;
    }
    if (!capturedPhoto) {
      setAlert({
        type: "error",
        message: "Veuillez d'abord capturer une photo du visage.",
      });
      return;
    }

    setIsSubmitting(true);
    setAlert(null);

    const targetAgent = personnelList.find((p) => String(p.id) === String(selectedPersonnelId));

    try {
      const response = await faceApi.enrollFace(selectedPersonnelId, capturedPhoto);
      setEnrolledAgentInfo({
        name: targetAgent ? `${targetAgent.prenom} ${targetAgent.nom}` : "Agent",
        photo: capturedPhoto,
      });
      setAlert({
        type: "success",
        message: response.message || "Profil facial enregistré avec succès pour cet agent !",
      });

      // Lancement du délai de 10 secondes avec écran de succès
      setPostEnrollCooldown(10);
      await loadPersonnel();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        "Erreur lors de l'enregistrement biométrique.";
      setAlert({
        type: "error",
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Suppression éventuelle d'un profil
  const handleDeleteProfile = async (personnelId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer le profil facial de cet agent ?")) {
      return;
    }
    try {
      await faceApi.deleteFaceProfile(personnelId);
      setAlert({
        type: "success",
        message: "Profil facial supprimé.",
      });
      await loadPersonnel();
    } catch (err) {
      setAlert({
        type: "error",
        message: err.message || "Erreur lors de la suppression.",
      });
    }
  };

  const selectedAgent = personnelList.find((p) => String(p.id) === String(selectedPersonnelId));

  // Sélection manuelle d'un agent : réinitialise le cooldown
  const handleSelectAgent = (id) => {
    setSelectedPersonnelId(id);
    if (postEnrollCooldown !== null) {
      setPostEnrollCooldown(null);
      setCapturedPhoto(null);
      setCountdown(null);
      setEnrolledAgentInfo(null);
    }
  };

  // Classe dynamique du réticule
  const reticleClass = `face-reticle ${
    faceAlignment.isCentered ? "aligned" : faceAlignment.reason === "no_face" ? "" : "warning"
  }`;

  return (
    <div className="face-module-container">
      {/* En-tête */}
      <div className="face-module-header">
        <div>
          <h1>
            <span>👤</span> Enrôlement Biométrique du Personnel
          </h1>
          <p style={{ color: "#94a3b8", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Détection automatique par IA (face-api.js) avec temporisation de sécurité post-enrôlement
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setAutoCapture(!autoCapture)}
            className="face-btn face-btn-secondary"
            style={{ fontSize: "0.85rem" }}
            title="Activer ou désactiver la capture automatique à 3 secondes"
          >
            {autoCapture ? "⚡ Auto-Capture : Activée" : "✋ Capture : Manuelle"}
          </button>

          <Link to="/kiosk" className="face-btn face-btn-secondary">
            📷 Accéder à la Borne
          </Link>
        </div>
      </div>

      {alert && (
        <div className={`feedback-card ${alert.type}`}>
          <div className="avatar">{alert.type === "success" ? "✓" : "!"}</div>
          <div className="feedback-info">
            <p style={{ fontWeight: 600 }}>{alert.message}</p>
          </div>
        </div>
      )}

      <div className="face-grid">
        {/* Colonne Gauche : Formulaire & Caméra */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Sélection de l'agent */}
          <div className="side-card">
            <div className="enroll-form-group">
              <label className="enroll-label">
                Sélectionner l'agent à enrôler :
              </label>
              <select
                className="enroll-select"
                value={selectedPersonnelId}
                onChange={(e) => handleSelectAgent(e.target.value)}
                disabled={isLoading}
              >
                {personnelList.length === 0 ? (
                  <option value="">Chargement du personnel...</option>
                ) : (
                  personnelList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prenom} {p.nom} ({p.poste || "Agent"}{p.departement_nom ? ` • ${p.departement_nom}` : ""}){" "}
                      {p.is_enrolled ? "— [Déjà Enrôlé]" : "— [Non Enrôlé]"}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedAgent && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255, 255, 255, 0.04)",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.75rem",
                  fontSize: "0.9rem",
                }}
              >
                <div>
                  <span style={{ color: "#94a3b8" }}>Statut actuel : </span>
                  {selectedAgent.is_enrolled ? (
                    <span style={{ color: "#4ade80", fontWeight: 700 }}>
                      ✓ Profil facial actif
                    </span>
                  ) : (
                    <span style={{ color: "#f87171", fontWeight: 700 }}>
                      ✗ Aucun profil enregistré
                    </span>
                  )}
                </div>

                {selectedAgent.is_enrolled && (
                  <button
                    onClick={() => handleDeleteProfile(selectedAgent.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Capture Webcam */}
          <div className="webcam-card">
            <div className="webcam-viewport">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  display: capturedPhoto || postEnrollCooldown !== null ? "none" : "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Réticule de visée biométrique (visible uniquement si pas en cooldown ni capturé) */}
              {!capturedPhoto && postEnrollCooldown === null && (
                <div className={reticleClass} />
              )}

              {/* Bulle d'instruction en temps réel */}
              {!capturedPhoto && postEnrollCooldown === null && (
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
                    <span>⏳ Ne bougez plus ! Capture dans {countdown}s...</span>
                  ) : (
                    <span>
                      {faceAlignment.isCentered ? "✨ " : faceAlignment.reason === "no_face" ? "👤 " : "⚠️ "}
                      {faceAlignment.message}
                    </span>
                  )}
                </div>
              )}

              {/* Compte à rebours animé 3s au centre du cercle */}
              {!capturedPhoto && postEnrollCooldown === null && countdown !== null && (
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

              {/* Flash visuel lors de la prise de vue */}
              {isFlashing && <div className="camera-flash" />}

              {/* Aperçu de la photo capturée (avant validation) */}
              {capturedPhoto && postEnrollCooldown === null && (
                <img
                  src={capturedPhoto}
                  alt="Aperçu capturé"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}

              {/* Écran de succès post-enrôlement avec temporisation de 10s */}
              {postEnrollCooldown !== null && (
                <div className="enroll-success-overlay">
                  <div className="enroll-success-icon">✓</div>
                  <h3 className="enroll-success-title">
                    Enrôlement Réussi !
                  </h3>
                  <p className="enroll-success-desc">
                    Le profil biométrique de <strong style={{ color: "#38bdf8" }}>{enrolledAgentInfo?.name}</strong> est désormais actif et prêt pour le pointage.
                  </p>
                  <div className="enroll-cooldown-badge">
                    <span>⏳ Réactivation de la caméra dans {postEnrollCooldown}s...</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleProceedNext}
                    className="face-btn face-btn-primary"
                    style={{ padding: "0.6rem 1.4rem" }}
                  >
                    ➕ Enrôler le prochain agent maintenant
                  </button>
                </div>
              )}

              {cameraError && !capturedPhoto && postEnrollCooldown === null && (
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
                  }}
                >
                  <p>⚠️ {cameraError}</p>
                </div>
              )}
            </div>

            <div className="webcam-controls">
              {postEnrollCooldown !== null ? (
                <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
                  <button
                    className="face-btn face-btn-primary"
                    onClick={handleProceedNext}
                    style={{ width: "100%" }}
                  >
                    🚀 Enrôler un autre agent (ou attendre {postEnrollCooldown}s)
                  </button>
                </div>
              ) : !capturedPhoto ? (
                <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
                  <button
                    className="face-btn face-btn-primary"
                    onClick={handleCapture}
                    disabled={!cameraActive}
                    style={{ width: "100%" }}
                  >
                    📸 Prendre la Photo Manuellement
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
                  <button
                    className="face-btn face-btn-secondary"
                    onClick={handleRetake}
                    style={{ flex: 1 }}
                    disabled={isSubmitting}
                  >
                    🔄 Reprendre
                  </button>
                  <button
                    className="face-btn face-btn-primary"
                    onClick={handleEnrollSubmit}
                    disabled={isSubmitting}
                    style={{ flex: 2 }}
                  >
                    {isSubmitting ? "Enregistrement en cours..." : "✓ Valider l'Enrôlement de l'Agent"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne Droite : Liste récapitulative des agents */}
        <div className="face-side-panel">
          <div className="side-card">
            <h2>
              <span>Personnel & Agents</span>
              <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                {personnelList.filter((p) => p.is_enrolled).length} / {personnelList.length} enrôlés
              </span>
            </h2>

            <div className="attendance-list">
              {personnelList.map((p) => (
                <div
                  key={p.id}
                  className={`attendance-item ${
                    String(p.id) === String(selectedPersonnelId) ? "selected" : ""
                  }`}
                  onClick={() => handleSelectAgent(String(p.id))}
                  style={{
                    cursor: "pointer",
                    border:
                      String(p.id) === String(selectedPersonnelId)
                        ? "1px solid #38bdf8"
                        : "1px solid transparent",
                  }}
                >
                  <div
                    className="avatar"
                    style={{
                      background: p.is_enrolled
                        ? "rgba(34, 197, 94, 0.2)"
                        : "rgba(148, 163, 184, 0.15)",
                      color: p.is_enrolled ? "#4ade80" : "#94a3b8",
                    }}
                  >
                    {p.prenom?.charAt(0) || "P"}
                  </div>
                  <div className="info">
                    <p className="name">
                      {p.prenom} {p.nom}
                    </p>
                    <p className="time">
                      {p.poste || "Agent"} {p.departement_nom ? `• ${p.departement_nom}` : ""}
                    </p>
                  </div>
                  <span
                    className={`status-badge ${p.is_enrolled ? "success" : "failed"}`}
                  >
                    {p.is_enrolled ? "Enrôlé" : "Non enrôlé"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
