import hashlib
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
import shutil
import time

from fastapi import FastAPI, HTTPException, Request, status
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
    # Always store the user's email in the Firestore user doc
    if 'email' not in user or not user['email']:
        # Try to fetch email from Firebase Auth
        try:
            auth_user = firebase_admin.auth.get_user(uid)
            user['email'] = auth_user.email
        except Exception as e:
            user['email'] = None
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
    ref = db.collection("users").document(uid).collection("recordings").document(recording_id)
    # Mark as deleted instead of deleting
    ref.set({"deleted": True}, merge=True)
    return {"status": "marked_deleted"}

@app.get("/dashboard-recordings")
async def dashboard_recordings(
    authorization: Optional[str] = Header(None), 
    page: int = 1, 
    limit: int = 50,
    search: Optional[str] = None,
    voice: Optional[str] = None,
    user_email: Optional[str] = None,
    duration: Optional[str] = None
):
    if not db:
        raise HTTPException(status_code=500, detail="Firestore not available")
    # Authenticate and check superuser
    uid = None
    if authorization and authorization.startswith("Bearer "):
        id_token = authorization.split(" ", 1)[1]
        try:
            decoded = firebase_admin.auth.verify_id_token(id_token)
            uid = decoded["uid"]
        except Exception:
            uid = None
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists or not user_doc.to_dict().get("superuser"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Build user email lookup
    user_id_to_email = {}
    for user in db.collection("users").stream():
        user_id_to_email[user.id] = user.to_dict().get("email", "")

    def duration_matches_filter(duration_value, duration_filter):
        """Check if duration matches the filter criteria"""
        if not duration_filter or not duration_value:
            return True
        
        duration_secs = float(duration_value)
        
        if duration_filter == "<5":
            return duration_secs < 5
        elif duration_filter == "5-10":
            return 5 <= duration_secs < 10
        elif duration_filter == "10-30":
            return 10 <= duration_secs < 30
        elif duration_filter == "30-60":
            return 30 <= duration_secs < 60
        elif duration_filter == "60-300":
            return 60 <= duration_secs < 300
        elif duration_filter == ">300":
            return duration_secs >= 300
        
        return True

    results = []
    
    # Query user recordings
    for user_id, email in user_id_to_email.items():
        if user_email and user_email.lower() not in email.lower():
            continue
            
        # Get all recordings for this user (no Firestore filters for compatibility)
        query = db.collection("users").document(user_id).collection("recordings")
        
        # Get results and filter in Python (for compatibility with existing records)
        for doc in query.stream():
            rec_data = doc.to_dict()
            
            # Apply voice filter
            if voice and rec_data.get("voice", "").lower() != voice.lower():
                continue
                
            # Apply text search filter
            if search:
                text_content = rec_data.get("text", "").lower()
                if search.lower() not in text_content:
                    continue
            
            # Apply duration filter
            if not duration_matches_filter(rec_data.get("duration"), duration):
                continue
            
            entry = {
                "id": rec_data.get("id"),
                "voice": rec_data.get("voice"),
                "text": rec_data.get("text"),
                "created": rec_data.get("created"),
                "audioUrl": rec_data.get("audioUrl"),
                "storagePath": rec_data.get("storagePath"),
                "duration": rec_data.get("duration"),
                "user_email": email,
                "user_uid": user_id,
            }
            results.append(entry)
    
    # Query anonymous recordings
    if not user_email:  # Only include anonymous if not filtering by user
        query = db.collection("recordings")
        
        # Get results and filter in Python (for compatibility with existing records)
        for doc in query.stream():
            rec_data = doc.to_dict()
            
            # Apply voice filter
            if voice and rec_data.get("voice", "").lower() != voice.lower():
                continue
                
            # Apply text search filter
            if search:
                text_content = rec_data.get("text", "").lower()
                if search.lower() not in text_content:
                    continue
            
            # Apply duration filter
            if not duration_matches_filter(rec_data.get("duration"), duration):
                continue
            
            entry = {
                "id": rec_data.get("id"),
                "voice": rec_data.get("voice"),
                "text": rec_data.get("text"),
                "created": rec_data.get("created"),
                "audioUrl": rec_data.get("audioUrl"),
                "storagePath": rec_data.get("storagePath"),
                "duration": rec_data.get("duration"),
                "user_email": None,
                "user_uid": None,
            }
            results.append(entry)
    
    # Sort by creation time
    results.sort(key=lambda r: r.get("created", 0), reverse=True)
    
    # Apply pagination
    total_count = len(results)
    start_index = (page - 1) * limit
    end_index = start_index + limit
    paginated_results = results[start_index:end_index]
    
    return {
        "recordings": paginated_results,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "total_pages": (total_count + limit - 1) // limit,
            "has_next": end_index < total_count,
            "has_prev": page > 1
        }
    }

@app.get("/dashboard-voices")
async def get_dashboard_voices(authorization: Optional[str] = Header(None)):
    if not db:
        raise HTTPException(status_code=500, detail="Firestore not available")
    # Authenticate and check superuser
    uid = None
    if authorization and authorization.startswith("Bearer "):
        id_token = authorization.split(" ", 1)[1]
        try:
            decoded = firebase_admin.auth.verify_id_token(id_token)
            uid = decoded["uid"]
        except Exception:
            uid = None
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists or not user_doc.to_dict().get("superuser"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    voices = set()
    
    # Get voices from user recordings
    for user in db.collection("users").stream():
        for rec in db.collection("users").document(user.id).collection("recordings").stream():
            rec_data = rec.to_dict()
            voice = rec_data.get("voice")
            if voice:
                voices.add(voice)
    
    # Get voices from anonymous recordings
    for rec in db.collection("recordings").stream():
        rec_data = rec.to_dict()
        voice = rec_data.get("voice")
        if voice:
            voices.add(voice)
    
    # Convert to sorted list
    sorted_voices = sorted(list(voices))
    return {"voices": sorted_voices}

@app.get("/user-info")
async def get_user_info(authorization: Optional[str] = Header(None)):
    if not db:
        raise HTTPException(status_code=500, detail="Firestore not available")
    uid = None
    if authorization and authorization.startswith("Bearer "):
        id_token = authorization.split(" ", 1)[1]
        try:
            decoded = firebase_admin.auth.verify_id_token(id_token)
            uid = decoded["uid"]
        except Exception:
            uid = None
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    return user_doc.to_dict()


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

@app.get("/library", response_class=HTMLResponse)
async def get_library():
    library_path = PACKAGE_DIR / "static" / "library.html"
    if not library_path.exists():
        raise HTTPException(status_code=404, detail="Library page not found")
    return FileResponse(library_path)

@app.get("/terms", response_class=HTMLResponse)
async def get_terms():
    terms_path = PACKAGE_DIR / "static" / "terms.html"
    if not terms_path.exists():
        raise HTTPException(status_code=404, detail="Terms page not found")
    return FileResponse(terms_path)

@app.get("/privacy", response_class=HTMLResponse)
async def get_privacy():
    privacy_path = PACKAGE_DIR / "static" / "privacy.html"
    if not privacy_path.exists():
        raise HTTPException(status_code=404, detail="Privacy page not found")
    return FileResponse(privacy_path)

@app.get("/dashboard", response_class=HTMLResponse)
async def get_dashboard():
    dashboard_path = PACKAGE_DIR / "static" / "dashboard.html"
    if not dashboard_path.exists():
        raise HTTPException(status_code=404, detail="Dashboard page not found")
    return FileResponse(dashboard_path)

@app.get("/dashboard.html", response_class=HTMLResponse)
async def get_dashboard_html():
    dashboard_path = PACKAGE_DIR / "static" / "dashboard.html"
    if not dashboard_path.exists():
        raise HTTPException(status_code=404, detail="Dashboard page not found")
    return FileResponse(dashboard_path)


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
            # Calculate audio duration
            duration = None
            try:
                import wave
                with wave.open(str(output_file), 'rb') as wav_file:
                    frames = wav_file.getnframes()
                    sample_rate = wav_file.getframerate()
                    duration = frames / sample_rate
            except Exception as e:
                logger.warning(f"Could not calculate audio duration: {e}")
            
            if db:
                # Create searchable fields
                text_words = [word.lower().strip('.,!?;:"()[]{}') for word in request.text.lower().split() if len(word.strip('.,!?;:"()[]{}')) > 2]
                
                if uid:
                    recording_doc = {
                        "id": f"{request.voice}_{text_hash}",
                        "voice": request.voice,
                        "text": request.text,
                        "created": int(time.time()),
                        "audioUrl": firebase_url,
                        "storagePath": storage_path,
                        "duration": duration,
                        "textWords": text_words,
                        "voiceLower": request.voice.lower()
                    }
                    db.collection("users").document(uid).collection("recordings").document(recording_doc["id"]).set(recording_doc)
                else:
                    # Store anonymous recording in top-level 'recordings' collection
                    recording_doc = {
                        "id": f"{request.voice}_{text_hash}",
                        "voice": request.voice,
                        "text": request.text,
                        "created": int(time.time()),
                        "audioUrl": firebase_url,
                        "storagePath": storage_path,
                        "anonymous": True,
                        "duration": duration,
                        "textWords": text_words,
                        "voiceLower": request.voice.lower()
                    }
                    db.collection("recordings").document(recording_doc["id"]).set(recording_doc)
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
