import hashlib
import json
import logging
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import firebase_admin
from firebase_admin import credentials, firestore
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

# Get the package directory
PACKAGE_DIR = Path(__file__).parent
logger.info(f"Package directory: {PACKAGE_DIR}")

# Mount static files
app.mount("/static", StaticFiles(directory=PACKAGE_DIR / "static"), name="static")

# Models directory
MODELS_DIR = PACKAGE_DIR / "models"
logger.info(f"Models directory: {MODELS_DIR}")

# Output directory for generated audio files
OUTPUT_DIR = Path("/persistent_output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Initialize Firebase Admin with service account from env var
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
if FIREBASE_SERVICE_ACCOUNT_JSON:
    if FIREBASE_SERVICE_ACCOUNT_JSON.strip().startswith('{'):
        cred = credentials.Certificate(json.loads(FIREBASE_SERVICE_ACCOUNT_JSON))
    else:
        cred = credentials.Certificate(json.loads(base64.b64decode(FIREBASE_SERVICE_ACCOUNT_JSON).decode('utf-8')))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
else:
    db = None

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
    if not authorization or not authorization.startswith("Bearer "):
        return None
    id_token = authorization.split(" ", 1)[1]
    try:
        decoded = firebase_admin.auth.verify_id_token(id_token)
        return decoded["uid"]
    except Exception:
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
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ref = db.collection("users").document(uid).collection("recordings")
    docs = ref.stream()
    return [doc.to_dict() for doc in docs]

@app.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str, uid: str = Depends(get_user_uid)):
    if not db or not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ref = db.collection("users").document(uid).collection("recordings").document(recording_id)
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
    """List all available voices."""
    try:
        logger.info("Listing voices...")
        voices = []

        # Check if models directory exists
        if not MODELS_DIR.exists():
            logger.error(f"Models directory does not exist: {MODELS_DIR}")
            raise HTTPException(status_code=500, detail="Models directory not found")

        # List all .onnx files
        onnx_files = list(MODELS_DIR.glob("*.onnx"))
        logger.info(
            f"Found {len(onnx_files)} .onnx files: {[f.name for f in onnx_files]}"
        )

        for file in onnx_files:
            # Look for the .onnx.json file
            json_file = file.with_suffix(".onnx.json")

            logger.info(f"Processing voice file: {file}")
            logger.info(f"Looking for JSON file: {json_file}")

            if json_file.exists():
                try:
                    with open(json_file) as f:
                        voice_info = json.load(f)
                        # Extract language code from filename (e.g., en_GB from en_GB-jenny_dioco-medium.onnx)
                        language_code = file.stem.split("-")[0]
                        voice_data = {
                            "name": file.stem,
                            "language": language_code,
                            "description": voice_info.get(
                                "description", "No description available"
                            ),
                        }
                        voices.append(voice_data)
                        logger.info(f"Added voice: {voice_data}")
                except json.JSONDecodeError as e:
                    logger.error(f"Error reading JSON file {json_file}: {e}")
                except Exception as e:
                    logger.error(f"Error processing voice file {file}: {e}")
            else:
                logger.warning(f"No JSON file found for {file}")

        logger.info(f"Returning {len(voices)} voices: {voices}")
        return voices
    except Exception as e:
        logger.error(f"Error listing voices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize")
async def synthesize_speech(request: SynthesisRequest, req: Request, authorization: Optional[str] = Header(None)):
    """Synthesize speech from text using the specified voice. If user is authenticated, save recording metadata to Firestore with audio URL."""
    try:
        logger.info(f"Synthesizing speech for voice: {request.voice}")
        logger.info(f"Text length: {len(request.text)} characters")

        # Validate voice file exists
        voice_file = MODELS_DIR / f"{request.voice}.onnx"
        if not voice_file.exists():
            raise HTTPException(
                status_code=404, detail=f"Voice {request.voice} not found"
            )

        # Create output file path with a unique name
        text_hash = hashlib.md5(request.text.encode()).hexdigest()
        output_file = OUTPUT_DIR / f"{request.voice}_{text_hash}.wav"

        # Get the full path to the piper executable
        piper_path = find_piper_executable()
        logger.info(f"Using piper executable: {piper_path}")

        # Run piper command
        cmd = [
            piper_path,
            "--model",
            str(voice_file),
            "--output_file",
            str(output_file),
            "--espeak-data",
            "/usr/share/espeak-ng-data",
        ]

        logger.info(f"Running command: {' '.join(cmd)}")

        # Run the command and capture both stdout and stderr
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        # Send the text to piper's stdin
        stdout, stderr = process.communicate(input=request.text)

        if process.returncode != 0:
            logger.error(f"Piper failed with error: {stderr}")
            raise HTTPException(status_code=500, detail=f"Piper failed: {stderr}")

        # Verify the output file exists
        if not output_file.exists():
            logger.error(f"Output file not found: {output_file}")
            raise HTTPException(status_code=500, detail="Failed to generate audio file")

        logger.info("Speech synthesis completed successfully")

        # If user is authenticated, save recording metadata to Firestore
        uid = None
        if authorization and authorization.startswith("Bearer "):
            id_token = authorization.split(" ", 1)[1]
            try:
                decoded = firebase_admin.auth.verify_id_token(id_token)
                uid = decoded["uid"]
            except Exception:
                uid = None
        if db and uid:
            # Build public URL to audio file
            proto = req.headers.get("x-forwarded-proto", req.url.scheme)
            host = req.headers.get("x-forwarded-host", req.headers.get("host", "localhost"))
            base_url = f"{proto}://{host}"
            audio_url = f"{base_url}/output/{output_file.name}"
            import time
            recording_doc = {
                "id": f"{request.voice}_{text_hash}",
                "voice": request.voice,
                "text": request.text,
                "created": int(time.time()),
                "audioUrl": audio_url
            }
            db.collection("users").document(uid).collection("recordings").document(recording_doc["id"]).set(recording_doc)

        # Return the generated audio file
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
