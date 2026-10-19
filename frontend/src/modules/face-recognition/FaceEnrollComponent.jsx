import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Search,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  UserCheck,
  Users,
  Clock,
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

  // Filtre et recherche dans l'annuaire d'agents
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'unenrolled' | 'enrolled'

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
        // Sélectionner par défaut le premier non enrôlé, ou le premier de la liste
        const firstUnenrolled = list.find((p) => !p.is_enrolled);
        setSelectedPersonnelId(String(firstUnenrolled ? firstUnenrolled.id : list[0].id));
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

  // 4. Détection continue du visage
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
          setCountdown(null);
        } else {
          const alignment = checkFaceAlignment(detection, videoRef.current);
          setFaceAlignment(alignment);

          if (!alignment.isCentered) {
            setCountdown(null);
          } else if (autoCapture && !capturedPhoto && postEnrollCooldown === null) {
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

  // 5. Compte à rebours 3s -> 2s -> 1s -> Capture automatique
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
      setIsFlashing(true);
      playBeep(920, 0.22);
      handleCapture();
      const flashTimer = setTimeout(() => setIsFlashing(false), 380);
      return () => clearTimeout(flashTimer);
    }
  }, [countdown, capturedPhoto, postEnrollCooldown, handleCapture]);

  // 6. Temporisation post-enrôlement 10s
  useEffect(() => {
    if (postEnrollCooldown === null) return;

    if (postEnrollCooldown > 0) {
      const timer = setTimeout(() => {
        setPostEnrollCooldown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (postEnrollCooldown === 0) {
      handleProceedNext();
    }
  }, [postEnrollCooldown, handleProceedNext]);

  // 7. Envoi de l'enrôlement
  const handleEnrollSubmit = async () => {
    if (!selectedPersonnelId) {
      setAlert({
        type: "error",
        message: "Veuillez sélectionner un membre du personnel dans l'annuaire.",
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

  // 8. Suppression d'un profil existant
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

  const handleSelectAgent = (id) => {
    setSelectedPersonnelId(id);
    if (postEnrollCooldown !== null) {
      setPostEnrollCooldown(null);
      setCapturedPhoto(null);
      setCountdown(null);
      setEnrolledAgentInfo(null);
    }
  };

  // Filtrage du personnel pour la liste
  const filteredPersonnel = useMemo(() => {
    return personnelList.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        `${p.prenom || ""} ${p.nom || ""}`.toLowerCase().includes(q) ||
        (p.poste || "").toLowerCase().includes(q) ||
        (p.departement_nom || "").toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filterMode === "enrolled") return p.is_enrolled;
      if (filterMode === "unenrolled") return !p.is_enrolled;
      return true;
    });
  }, [personnelList, searchQuery, filterMode]);

  const enrolledCount = personnelList.filter((p) => p.is_enrolled).length;
  const unenrolledCount = personnelList.length - enrolledCount;

  const reticleClass = `face-reticle ${
    faceAlignment.isCentered ? "aligned" : faceAlignment.reason === "no_face" ? "" : "warning"
  }`;

  const selectedInitials = selectedAgent
    ? `${selectedAgent.prenom?.[0] || ""}${selectedAgent.nom?.[0] || ""}`.toUpperCase()
    : "";

  return (
    <>
      <Heading
        eyebrow="BIOMÉTRIE & SÉCURITÉ"
        title="Enrôlement facial"
        subtitle="Enregistrez et configurez le profil biométrique du personnel pour la borne de pointage"
      >
        <button
          type="button"
          onClick={() => setAutoCapture(!autoCapture)}
          className="button"
          title="Activer ou désactiver la capture automatique après stabilisation du visage"
        >
          <Sparkles size={16} />
          <span>{autoCapture ? "Auto-capture : Activée" : "Capture : Manuelle"}</span>
        </button>

        <Link to="/kiosk" className="button">
          <Camera size={16} />
          <span>Accéder à la borne</span>
        </Link>
      </Heading>

      {alert && (
        <div
          className={`face-feedback-card ${alert.type}`}
          style={{ margin: "0 0 20px 0" }}
        >
          <div className="avatar-icon">
            {alert.type === "success" ? <Check size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="face-feedback-text">
            <h3>{alert.type === "success" ? "Opération réussie" : "Attention"}</h3>
            <p>{alert.message}</p>
          </div>
        </div>
      )}

      <div className="face-page-layout">
        {/* Colonne Gauche : Caméra et Agent Actif */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="face-card">
            {/* Bannière de l'agent actif sélectionné (Remplace le menu déroulant redondant) */}
            <div className="active-agent-banner">
              <div className="active-agent-info">
                <div className="active-agent-avatar">
                  {selectedInitials || "A"}
                </div>
                <div className="active-agent-text">
                  <strong>
                    {selectedAgent
                      ? `${selectedAgent.prenom} ${selectedAgent.nom}`
                      : "Aucun agent sélectionné"}
                  </strong>
                  <small>
                    {selectedAgent
                      ? `${selectedAgent.poste || "Agent"} ${
                          selectedAgent.departement_nom
                            ? `• ${selectedAgent.departement_nom}`
                            : ""
                        }`
                      : "Veuillez choisir un agent dans la liste à droite"}
                  </small>
                </div>
              </div>

              <div className="active-agent-meta">
                {selectedAgent ? (
                  <>
                    <span
                      className={`tag-badge ${
                        selectedAgent.is_enrolled ? "success" : "neutral"
                      }`}
                    >
                      {selectedAgent.is_enrolled ? "✓ Profil actif" : "Non enrôlé"}
                    </span>

                    {selectedAgent.is_enrolled && (
                      <button
                        type="button"
                        className="button agent-delete"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        onClick={() => handleDeleteProfile(selectedAgent.id)}
                        title="Supprimer le profil biométrique actuel"
                      >
                        <Trash2 size={13} />
                        <span>Supprimer</span>
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {/* Cadre Caméra */}
            <div className="face-camera-container">
              <div className="face-camera-viewport">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    display:
                      capturedPhoto || postEnrollCooldown !== null ? "none" : "block",
                  }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />

                {/* Réticule de visée biométrique */}
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
                {!capturedPhoto && postEnrollCooldown === null && countdown !== null && (
                  <div className="face-countdown-container">
                    <div className="face-countdown-circle">{countdown}</div>
                  </div>
                )}

                {/* Flash visuel lors de la prise de vue */}
                {isFlashing && <div className="camera-flash" />}

                {/* Aperçu de la photo capturée */}
                {capturedPhoto && postEnrollCooldown === null && (
                  <img
                    src={capturedPhoto}
                    alt="Aperçu capturé"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}

                {/* Écran de confirmation temporisé 10s */}
                {postEnrollCooldown !== null && (
                  <div className="enroll-success-overlay">
                    <div className="enroll-success-icon">✓</div>
                    <h3 className="enroll-success-title">Enrôlement réussi !</h3>
                    <p className="enroll-success-desc">
                      Le profil biométrique de{" "}
                      <strong style={{ color: "var(--ink, #203b33)" }}>
                        {enrolledAgentInfo?.name}
                      </strong>{" "}
                      est désormais actif et prêt pour la borne de pointage.
                    </p>
                    <div className="enroll-cooldown-badge">
                      <span>Réactivation dans {postEnrollCooldown}s...</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleProceedNext}
                      className="button primary"
                    >
                      Enrôler le prochain agent
                    </button>
                  </div>
                )}

                {cameraError && !capturedPhoto && postEnrollCooldown === null && (
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

            {/* Barre d'actions sous la caméra */}
            <div className="face-camera-controls">
              {postEnrollCooldown !== null ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleProceedNext}
                  style={{ width: "100%" }}
                >
                  Passer immédiatement à l'agent suivant
                </button>
              ) : !capturedPhoto ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleCapture}
                  disabled={!cameraActive}
                  style={{ width: "100%" }}
                >
                  <Camera size={16} />
                  <span>Prendre la photo manuellement</span>
                </button>
              ) : (
                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={handleRetake}
                    style={{ flex: 1 }}
                    disabled={isSubmitting}
                  >
                    <RotateCcw size={15} />
                    <span>Reprendre</span>
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleEnrollSubmit}
                    disabled={isSubmitting}
                    style={{ flex: 2 }}
                  >
                    <Check size={16} />
                    <span>
                      {isSubmitting
                        ? "Enregistrement..."
                        : "Valider l'enrôlement"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne Droite : Annuaire unique du Personnel */}
        <div className="face-side-panel">
          <div className="face-card">
            <div className="section-heading">
              <h2>
                <Users size={16} />
                <span>Personnel & Agents</span>
              </h2>
              <span className="count">
                {enrolledCount} / {personnelList.length} enrôlés
              </span>
            </div>

            {/* Barre de recherche et filtres rapides */}
            <div className="panel-filter-bar">
              <label className="search-input" style={{ width: "100%" }}>
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Rechercher un agent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>

              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${filterMode === "all" ? "active" : ""}`}
                  onClick={() => setFilterMode("all")}
                >
                  Tous ({personnelList.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterMode === "unenrolled" ? "active" : ""}`}
                  onClick={() => setFilterMode("unenrolled")}
                >
                  À enrôler ({unenrolledCount})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterMode === "enrolled" ? "active" : ""}`}
                  onClick={() => setFilterMode("enrolled")}
                >
                  Enrôlés ({enrolledCount})
                </button>
              </div>
            </div>

            {/* Liste unique des agents */}
            {isLoading ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--muted, #536b61)",
                  fontSize: "13px",
                }}
              >
                Chargement de la liste du personnel...
              </div>
            ) : filteredPersonnel.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--muted, #536b61)",
                  fontSize: "13px",
                }}
              >
                Aucun agent ne correspond à votre recherche.
              </div>
            ) : (
              <div className="face-item-list">
                {filteredPersonnel.map((p) => {
                  const isSelected = String(p.id) === String(selectedPersonnelId);
                  const initials = `${p.prenom?.[0] || ""}${p.nom?.[0] || ""}`.toUpperCase();

                  return (
                    <div
                      key={p.id}
                      className={`face-list-item ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectAgent(String(p.id))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleSelectAgent(String(p.id));
                        }
                      }}
                    >
                      <div className="face-list-item-left">
                        <div className="face-item-avatar">
                          {initials || "A"}
                        </div>
                        <div className="face-item-info">
                          <div className="face-item-name">
                            {p.prenom} {p.nom}
                          </div>
                          <div className="face-item-meta">
                            {p.poste || "Agent"}{" "}
                            {p.departement_nom ? `• ${p.departement_nom}` : ""}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`tag-badge ${
                          p.is_enrolled ? "success" : "neutral"
                        }`}
                      >
                        {p.is_enrolled ? "Enrôlé" : "Non enrôlé"}
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
