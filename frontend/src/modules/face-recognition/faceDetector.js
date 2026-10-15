/**
 * Service de détection faciale côté client avec face-api.js
 * Détecte les visages dans le flux vidéo et vérifie le positionnement dans le réticule.
 */
import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let modelLoadingPromise = null;

/**
 * Charge les modèles TinyFaceDetector depuis /models/face-api
 */
export async function loadFaceDetectionModels() {
  if (modelsLoaded) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      const MODEL_URL = "/models/face-api";
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      modelsLoaded = true;
      return true;
    } catch (err) {
      console.warn("Échec du chargement du modèle TinyFaceDetector local:", err);
      // Fallback vers le CDN si les fichiers locaux ne répondent pas
      try {
        const CDN_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
        await faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL);
        modelsLoaded = true;
        return true;
      } catch (cdnErr) {
        console.error("Impossible de charger les modèles face-api:", cdnErr);
        throw cdnErr;
      }
    }
  })();

  return modelLoadingPromise;
}

/**
 * Détecte un visage unique dans l'élément vidéo
 * @param {HTMLVideoElement} video
 * @returns {Promise<faceapi.FaceDetection | null>}
 */
export async function detectSingleFace(video) {
  if (!video || video.readyState < 2) return null;

  try {
    await loadFaceDetectionModels();
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224, // Léger et rapide (10-30ms)
      scoreThreshold: 0.45,
    });
    const detection = await faceapi.detectSingleFace(video, options);
    return detection || null;
  } catch (err) {
    console.error("Erreur lors de la détection faciale:", err);
    return null;
  }
}

/**
 * Vérifie si le visage détecté est bien positionné dans le cercle (réticule)
 * @param {faceapi.FaceDetection} detection
 * @param {HTMLVideoElement} video
 * @returns {{ isCentered: boolean, reason: string, box: any }}
 */
export function checkFaceAlignment(detection, video) {
  if (!detection || !video) {
    return { isCentered: false, reason: "no_face", box: null };
  }

  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;

  // Centre théorique du flux vidéo
  const centerX = vWidth / 2;
  const centerY = vHeight / 2;

  const box = detection.box;
  // Centre du visage détecté
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;

  // Distance entre le centre du visage et le centre de la caméra
  const distance = Math.hypot(faceCenterX - centerX, faceCenterY - centerY);

  // Le cercle a un rayon approximatif d'environ 35% de la plus petite dimension
  const circleRadius = Math.min(vWidth, vHeight) * 0.35;

  // Taille minimale du visage (pour éviter les visages trop lointains en arrière-plan)
  const minFaceWidth = vWidth * 0.18;
  const maxFaceWidth = vWidth * 0.65;

  if (box.width < minFaceWidth) {
    return {
      isCentered: false,
      reason: "too_far",
      message: "Rapprochez-vous un peu de la caméra",
      box,
    };
  }

  if (box.width > maxFaceWidth) {
    return {
      isCentered: false,
      reason: "too_close",
      message: "Reculez légèrement",
      box,
    };
  }

  // Tolérance d'alignement au centre (60% du rayon du réticule)
  if (distance > circleRadius * 0.6) {
    return {
      isCentered: false,
      reason: "off_center",
      message: "Centrez votre visage dans le cercle",
      box,
    };
  }

  return {
    isCentered: true,
    reason: "centered",
    message: "Parfait ! Ne bougez plus...",
    box,
  };
}

