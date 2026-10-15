import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from utils import (
    decode_base64_image,
    extract_face_embedding,
    verify_face_match,
    HAS_FACE_RECOGNITION,
)

app = FastAPI(
    title="Face Recognition Microservice",
    description="Microservice isolé de reconnaissance faciale pour pointage de présence.",
    version="1.0.0",
)

# Enable CORS for local development and microservice isolation
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KnownFaceItem(BaseModel):
    user_id: Any
    embedding: List[float]


class EnrollRequest(BaseModel):
    image: str = Field(..., description="Image encodée en base64")
    user_id: Optional[Any] = Field(None, description="Identifiant de l'utilisateur")


class VerifyRequest(BaseModel):
    image: str = Field(..., description="Image encodée en base64")
    known_faces: List[KnownFaceItem] = Field(..., description="Liste des profils enregistrés")
    threshold: Optional[float] = Field(0.55, description="Seuil minimal de similarité cosinique")


@app.get("/")
@app.get("/health")
def health_check():
    """Vérification de l'état du microservice."""
    return {
        "status": "online",
        "service": "face-recognition-ai",
        "engine": "face_recognition" if HAS_FACE_RECOGNITION else "opencv_yunet_sface",
    }


@app.post("/enroll")
def enroll_face(req: EnrollRequest):
    """
    1. Reçoit l'image en Base64.
    2. Détecte le visage et extrait son embedding (128 dimensions).
    3. Renvoie { success: True, embedding: [...] }.
    """
    try:
        img = decode_base64_image(req.image)
        embedding = extract_face_embedding(img)
        return {
            "success": True,
            "user_id": req.user_id,
            "embedding": embedding,
            "dimension": len(embedding),
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'extraction biométrique : {str(exc)}",
        )


@app.post("/verify")
def verify_face(req: VerifyRequest):
    """
    1. Reçoit l'image en direct + la liste des known_faces.
    2. Extrait l'embedding du visage présent sur l'image.
    3. Compare avec les profils connus via similarité cosinique.
    4. Renvoie { match: True, user_id: ..., confidence: ... } ou { match: False }.
    """
    try:
        img = decode_base64_image(req.image)
        live_embedding = extract_face_embedding(img)

        # Convert known faces Pydantic models to dicts
        known_faces_data = [item.model_dump() for item in req.known_faces]

        result = verify_face_match(
            live_embedding=live_embedding,
            known_faces=known_faces_data,
            threshold=req.threshold or 0.55,
        )
        return result
    except ValueError as ve:
        # Visage absent ou image non traitable
        return {
            "match": False,
            "message": str(ve),
            "confidence": 0.0,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la vérification biométrique : {str(exc)}",
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

