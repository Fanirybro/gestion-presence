import base64
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

import shutil
import tempfile

# Try importing face_recognition if available in the environment
try:
    import face_recognition  # type: ignore
    HAS_FACE_RECOGNITION = True
except Exception:
    HAS_FACE_RECOGNITION = False

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet.onnx")
SFACE_PATH = os.path.join(MODELS_DIR, "face_recognition_sface.onnx")

_detector = None
_recognizer = None


def ensure_ascii_safe_model_path(source_path: str, filename: str) -> str:
    """
    On Windows, OpenCV DNN C++ ONNX parser cannot open paths containing non-ASCII
    characters (such as 'é'). If the source path contains non-ASCII characters,
    copy the model to an ASCII-safe cache directory in LOCALAPPDATA or TEMP.
    """
    try:
        source_path.encode("ascii")
        return source_path
    except UnicodeEncodeError:
        safe_dir = os.path.join(
            os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(),
            "biometric_face_models",
        )
        os.makedirs(safe_dir, exist_ok=True)
        safe_path = os.path.join(safe_dir, filename)
        if not os.path.exists(safe_path) or os.path.getsize(safe_path) != os.path.getsize(source_path):
            shutil.copyfile(source_path, safe_path)
        return safe_path


def get_opencv_models():
    """Lazily load YuNet detector and SFace recognizer."""
    global _detector, _recognizer
    if _detector is None or _recognizer is None:
        if not os.path.exists(YUNET_PATH) or not os.path.exists(SFACE_PATH):
            raise RuntimeError(
                f"Modèles ONNX introuvables dans {MODELS_DIR}. "
                "Veuillez vérifier le téléchargement de YuNet et SFace."
            )
        
        safe_yunet = ensure_ascii_safe_model_path(YUNET_PATH, "face_detection_yunet.onnx")
        safe_sface = ensure_ascii_safe_model_path(SFACE_PATH, "face_recognition_sface.onnx")

        # Initialize detector with default size (320, 320)
        _detector = cv2.FaceDetectorYN_create(
            safe_yunet,
            "",
            (320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000,
        )
        _recognizer = cv2.FaceRecognizerSF_create(safe_sface, "")
    return _detector, _recognizer


def decode_base64_image(image_data: str) -> np.ndarray:
    """
    Décode une image encodée en base64 en mémoire vive vers un tableau NumPy (OpenCV BGR).
    Aucun enregistrement sur disque pour respecter les contraintes de sécurité et de confidentialité.
    """
    if not image_data or not isinstance(image_data, str):
        raise ValueError("Données d'image invalides ou absentes.")

    # Remove data URI header if present (ex: data:image/jpeg;base64,...)
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    # Clean whitespace or line breaks
    image_data = re.sub(r"\s+", "", image_data)

    try:
        raw_bytes = base64.b64decode(image_data)
    except Exception as exc:
        raise ValueError("Échec du décodage Base64 de l'image.") from exc

    if len(raw_bytes) == 0:
        raise ValueError("L'image fournie est vide.")

    # Decode directly in RAM buffer
    nparr = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Impossible de décoder le format de l'image.")

    return img


def extract_face_embedding(img: np.ndarray) -> List[float]:
    """
    Détecte le visage et extrait un vecteur biométrique (embedding) de 128 dimensions.
    Priorise face_recognition si disponible, sinon utilise OpenCV YuNet + SFace ONNX.
    """
    # 1. Option face_recognition (si installé)
    if HAS_FACE_RECOGNITION:
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb_img, model="hog")
        if not locations:
            raise ValueError("Aucun visage détecté sur l'image.")
        encodings = face_recognition.face_encodings(rgb_img, locations)
        if not encodings:
            raise ValueError("Impossible d'extraire les caractéristiques faciales.")
        # Return first face embedding normalized
        vec = encodings[0].tolist()
        return vec

    # 2. Option OpenCV YuNet + SFace (Deep Learning natif)
    detector, recognizer = get_opencv_models()
    h, w = img.shape[:2]
    detector.setInputSize((w, h))

    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0:
        raise ValueError("Aucun visage détecté sur l'image.")

    # Pick the face with largest area or highest confidence
    best_face = None
    max_area = -1.0
    for face in faces:
        bbox = face[0:4]
        area = float(bbox[2] * bbox[3])
        if area > max_area:
            max_area = area
            best_face = face

    if best_face is None:
        raise ValueError("Aucun visage valide trouvé.")

    # Align & crop face according to 5 facial landmarks
    aligned_face = recognizer.alignCrop(img, best_face)
    feature = recognizer.feature(aligned_face)

    # Normalize L2
    norm = np.linalg.norm(feature)
    if norm > 0:
        feature = feature / norm

    return feature.flatten().tolist()


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Calcule la similarité cosinique entre deux vecteurs."""
    a = np.array(vec_a, dtype=np.float32).flatten()
    b = np.array(vec_b, dtype=np.float32).flatten()
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    return max(-1.0, min(1.0, sim))


def verify_face_match(
    live_embedding: List[float],
    known_faces: List[Dict[str, Any]],
    threshold: float = 0.55,
) -> Dict[str, Any]:
    """
    Compare l'embedding direct avec la liste des visages connus.
    Renvoie le candidat ayant la plus forte similarité si celle-ci dépasse le seuil.
    """
    if not known_faces:
        return {"match": False, "message": "Aucun visage connu fourni pour la comparaison."}

    best_match_user_id = None
    best_confidence = -1.0

    for item in known_faces:
        user_id = item.get("user_id")
        known_emb = item.get("embedding")

        if not known_emb or user_id is None:
            continue

        sim = cosine_similarity(live_embedding, known_emb)

        # Map cosine similarity to 0..1 confidence score
        # For normalized embeddings, positive values range from 0 to 1
        confidence = max(0.0, sim)

        if confidence > best_confidence:
            best_confidence = confidence
            best_match_user_id = user_id

    if best_confidence >= threshold and best_match_user_id is not None:
        return {
            "match": True,
            "user_id": best_match_user_id,
            "confidence": round(best_confidence, 2),
        }

    return {
        "match": False,
        "confidence": round(max(0.0, best_confidence), 2),
        "threshold": threshold,
    }

