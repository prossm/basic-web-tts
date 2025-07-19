import hashlib
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
import shutil

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
import base64
from typing import Optional

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logger = logging.getLogger("piper_tts_web")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler("/var/log/piper_tts_web.log"),
        logging.StreamHandler()
    ]
)

# Get the package directory
PACKAGE_DIR = Path(__file__).parent
logger.info(f"Package directory: {PACKAGE_DIR}")

# Mount static files
app.mount("/static", StaticFiles(directory=PACKAGE_DIR / "static"), name="static")

# Models directory
MODELS_DIR = PACKAGE_DIR / "models"
logger.info(f"Models directory: {MODELS_DIR}")

# Initialize Firebase Admin with service account from env var
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
firebase_app = None
db = None
bucket = None

if FIREBASE_SERVICE_ACCOUNT_JSON:
    try:
        if FIREBASE_SERVICE_ACCOUNT_JSON.strip().startswith('{'):
            cred_dict = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
        else:
            cred_dict = json.loads(base64.b64decode(FIREBASE_SERVICE_ACCOUNT_JSON).decode('utf-8'))
        logger.info(f"Loaded Firebase service account for project: {cred_dict.get('project_id')}")
        cred = credentials.Certificate(cred_dict)
        firebase_app = firebase_admin.initialize_app(cred, {
            'storageBucket': os.environ.get("FIREBASE_STORAGE_BUCKET")
        })
        db = firestore.client()
        bucket = storage.bucket()
        logger.info(f"Firebase Storage bucket initialized: {bucket.name}")
    except Exception as e:
        logger.error(f"Failed to load Firebase service account: {e}")
        db = None
        bucket = None
else:
    logger.error("FIREBASE_SERVICE_ACCOUNT_JSON not set!")
    db = None
    bucket = None

# Set the Firebase Storage models path
FIREBASE_MODELS_PATH = "models/"

# Endpoint to serve Firebase config to frontend
@app.get("/firebase-config")
async def get_firebase_config():
    config = {
        "apiKey": os.environ.get("FIREBASE_API_KEY"),
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.environ.get("FIREBASE_PROJECT_ID"),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.environ.get("FIREBASE_APP_ID"),
        "measurementId": os.environ.get("FIREBASE_MEASUREMENT_ID"),
    }
    return config

# --- Firestore User & Recording Endpoints ---
from fastapi import Depends, Header

# Helper: get user UID from Authorization header (Firebase ID token)
def get_user_uid(authorization: Optional[str] = Header(None)):
    logger.info(f"get_user_uid called. Authorization header: {authorization}")
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning("No or invalid Authorization header.")
        return None
    id_token = authorization.split(" ", 1)[1]
    try:
        decoded = firebase_admin.auth.verify_id_token(id_token)
        logger.info(f"Token verified for uid: {decoded['uid']}")
        return decoded["uid"]
    except Exception as e:
        logger.error(f"Failed to verify ID token: {e}")
        return None

@app.post("/user")
async def create_or_update_user(user: dict, uid: str = Depends(get_user_uid)):
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    db.collection("users").document(uid).set(user, merge=True)
    return {"status": "ok"}

@app.post("/recordings")
async def save_recording(recording: dict, uid: str = Depends(get_user_uid)):
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ref = db.collection("users").document(uid).collection("recordings").document(recording["id"])
    ref.set(recording)
    return {"status": "ok"}

@app.get("/recordings")
async def list_recordings(uid: str = Depends(get_user_uid)):
    logger.info(f"list_recordings called. uid: {uid} db: {db}")
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ref = db.collection("users").document(uid).collection("recordings")
    docs = ref.stream()
    return [doc.to_dict() for doc in docs]

@app.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str, uid: str = Depends(get_user_uid)):
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Get the recording to find the Firebase Storage file path
    ref = db.collection("users").document(uid).collection("recordings").document(recording_id)
    recording = ref.get()
    if recording.exists:
        recording_data = recording.to_dict()
        # Delete from Firebase Storage if we have the file path
        if bucket and recording_data.get("storagePath"):
            try:
                blob = bucket.blob(recording_data["storagePath"])
                blob.delete()
                logger.info(f"Deleted file from Firebase Storage: {recording_data['storagePath']}")
            except Exception as e:
                logger.error(f"Failed to delete file from Firebase Storage: {e}")
    
    # Delete from Firestore
    ref.delete()
    return {"status": "deleted"}


class SynthesisRequest(BaseModel):
    text: str
    voice: str


def find_piper_executable():
    """Find the piper executable in common installation locations."""
    # Check common locations
    possible_paths = [
        os.path.join(os.path.expanduser("~"), "bin", "piper"),  # User's bin directory
        "/usr/local/bin/piper",  # System-wide installation
        "/opt/homebrew/bin/piper",  # Homebrew on Apple Silicon
        "/usr/bin/piper",  # System bin
        "/app/piper",
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "piper",
            "build",
            "piper",
        ),  # Local build
    ]

    for path in possible_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    raise FileNotFoundError(
        "Could not find piper executable. Please make sure it's installed and in your PATH. "
        "You can install it by following the instructions in the README.md file."
    )


@app.get("/", response_class=HTMLResponse)
async def get_index():
    """Serve the main page at /."""
    with open(PACKAGE_DIR / "static" / "index.html") as f:
        return f.read()

@app.get("/about", response_class=HTMLResponse)
async def get_about():
    """Serve the About page at /about."""
    with open(PACKAGE_DIR / "static" / "about.html") as f:
        return f.read()


@app.get("/voices")
async def list_voices():
    """List all available voices from Firebase Storage."""
    try:
        logger.info("Listing voices from Firebase Storage...")
        voices = []
        if not bucket:
            logger.error("Firebase Storage bucket not initialized.")
            raise HTTPException(status_code=500, detail="Firebase Storage not available")
        # List all .onnx files in the models/ folder in the bucket
        blobs = bucket.list_blobs(prefix=FIREBASE_MODELS_PATH)
        onnx_files = [blob.name for blob in blobs if blob.name.endswith('.onnx') and not blob.name.endswith('.onnx.json')]
        logger.info(f"Found {len(onnx_files)} .onnx files in Firebase Storage: {onnx_files}")
        for onnx_blob_name in onnx_files:
            base_name = Path(onnx_blob_name).stem
            json_blob_name = f"{FIREBASE_MODELS_PATH}{base_name}.onnx.json"
            # Download the .onnx.json metadata file to a temp location
            with tempfile.NamedTemporaryFile(suffix=".json", delete=True) as temp_json:
                try:
                    json_blob = bucket.blob(json_blob_name)
                    if not json_blob.exists():
                        logger.warning(f"No JSON file found for {onnx_blob_name}")
                        continue
                    json_blob.download_to_filename(temp_json.name)
                    with open(temp_json.name) as f:
                        voice_info = json.load(f)
                    language_code = base_name.split("-")[0]
                    voice_data = {
                        "name": base_name,
                        "language": language_code,
                        "description": voice_info.get("description", "No description available"),
                    }
                    voices.append(voice_data)
                    logger.info(f"Added voice: {voice_data}")
                except Exception as e:
                    logger.error(f"Error processing voice {onnx_blob_name}: {e}")
        logger.info(f"Returning {len(voices)} voices from Firebase Storage.")
        return voices
    except Exception as e:
        logger.error(f"Error listing voices from Firebase Storage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/synthesize")
async def synthesize_speech(request: SynthesisRequest, req: Request, authorization: Optional[str] = Header(None)):
    """Synthesize speech from text using the specified voice. Download model from Firebase Storage."""
    try:
        logger.info(f"Synthesize: Downloading model for voice: {request.voice}")
        if not bucket:
            raise HTTPException(status_code=500, detail="Firebase Storage not available")
        # Download the .onnx model and .onnx.json metadata from Firebase Storage
        onnx_blob_name = f"{FIREBASE_MODELS_PATH}{request.voice}.onnx"
        json_blob_name = f"{FIREBASE_MODELS_PATH}{request.voice}.onnx.json"
        onnx_blob = bucket.blob(onnx_blob_name)
        json_blob = bucket.blob(json_blob_name)
        if not onnx_blob.exists():
            logger.error(f"Model file not found in Firebase Storage: {onnx_blob_name}")
            raise HTTPException(status_code=404, detail=f"Voice {request.voice} not found")
        import shutil
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            model_filename = f"{request.voice}.onnx"
            config_filename = f"{request.voice}.onnx.json"
            model_path = temp_dir_path / model_filename
            config_path = temp_dir_path / config_filename
            onnx_blob.download_to_filename(str(model_path))
            logger.info(f"Downloaded model to {model_path}")
            if json_blob.exists():
                json_blob.download_to_filename(str(config_path))
                logger.info(f"Downloaded metadata to {config_path}")
            text_hash = hashlib.md5(request.text.encode()).hexdigest()
            filename = f"{request.voice}_{text_hash}.wav"
            output_file = temp_dir_path / filename
            piper_path = find_piper_executable()
            logger.info(f"Using piper executable: {piper_path}")
            cmd = [
                piper_path,
                "--model",
                str(model_path),
                "--output_file",
                str(output_file),
                "--espeak-data",
                "/usr/share/espeak-ng-data",
            ]
            logger.info(f"Running command: {' '.join(cmd)}")
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = process.communicate(input=request.text)
            if process.returncode != 0:
                logger.error(f"Piper failed with error: {stderr}")
                raise HTTPException(status_code=500, detail=f"Piper failed: {stderr}")
            if not output_file.exists():
                logger.error(f"Output file not found: {output_file}")
                raise HTTPException(status_code=500, detail="Failed to generate audio file")
            logger.info("Speech synthesis completed successfully")
            firebase_url = None
            storage_path = None
            if bucket:
                try:
                    storage_path = f"audio/{filename}"
                    blob = bucket.blob(storage_path)
                    blob.upload_from_filename(str(output_file))
                    blob.make_public()
                    firebase_url = blob.public_url
                    logger.info(f"Uploaded to Firebase Storage: {firebase_url}")
                except Exception as e:
                    logger.error(f"Failed to upload to Firebase Storage: {e}")
                    firebase_url = None
                    storage_path = None
            uid = None
            if authorization and authorization.startswith("Bearer "):
                id_token = authorization.split(" ", 1)[1]
                try:
                    decoded = firebase_admin.auth.verify_id_token(id_token)
                    uid = decoded["uid"]
                except Exception:
                    uid = None
            logger.info(f"uid: {uid}")
            if db and uid:
                import time
                recording_doc = {
                    "id": f"{request.voice}_{text_hash}",
                    "voice": request.voice,
                    "text": request.text,
                    "created": int(time.time()),
                    "audioUrl": firebase_url,
                    "storagePath": storage_path
                }
                db.collection("users").document(uid).collection("recordings").document(recording_doc["id"]).set(recording_doc)
            # Return the audio file as a response
            if firebase_url:
                return {"audioUrl": firebase_url}
            else:
                return FileResponse(output_file, media_type="audio/wav", filename="speech.wav")
    except FileNotFoundError as e:
        logger.error(f"File not found error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error synthesizing speech: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
