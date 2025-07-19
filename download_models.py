#!/usr/bin/env python3
"""
Script to download Piper TTS models from HuggingFace and custom models from Firebase Storage.
Automatically uploads custom models to Firebase Storage if they don't exist.
"""

import os
import json
import requests
import tempfile
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, storage
import base64

# Official Piper models to download from HuggingFace
OFFICIAL_MODELS = [
    "en_GB-alan-medium",
    "en_GB-alba-medium", 
    "en_GB-jenny_dioco-medium",
    "en_GB-northern_english_male-medium",
    "en_US-amy-medium",
    "en_US-kathleen-low",
    "en_US-kristin"
]

# Custom models (stored in Firebase Storage)
CUSTOM_MODELS = [
    "en_us-marcus"
]

def download_from_huggingface(model_name, models_dir):
    """Download a model from HuggingFace."""
    base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
    
    # Download .onnx file
    onnx_url = f"{base_url}/{model_name}.onnx"
    onnx_path = models_dir / f"{model_name}.onnx"
    
    print(f"Downloading {model_name}.onnx...")
    response = requests.get(onnx_url, stream=True)
    response.raise_for_status()
    
    with open(onnx_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    # Download .onnx.json file
    json_url = f"{base_url}/{model_name}.onnx.json"
    json_path = models_dir / f"{model_name}.onnx.json"
    
    print(f"Downloading {model_name}.onnx.json...")
    response = requests.get(json_url, stream=True)
    response.raise_for_status()
    
    with open(json_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"✓ Downloaded {model_name}")

def upload_to_firebase(model_name, models_dir, bucket):
    """Upload a custom model to Firebase Storage."""
    print(f"Uploading custom model {model_name} to Firebase Storage...")
    
    # Upload .onnx file
    onnx_path = models_dir / f"{model_name}.onnx"
    if not onnx_path.exists():
        raise FileNotFoundError(f"Model file not found: {onnx_path}")
    
    onnx_blob = bucket.blob(f"models/{model_name}.onnx")
    onnx_blob.upload_from_filename(str(onnx_path))
    print(f"✓ Uploaded {model_name}.onnx")
    
    # Upload .onnx.json file
    json_path = models_dir / f"{model_name}.onnx.json"
    if not json_path.exists():
        raise FileNotFoundError(f"Model JSON file not found: {json_path}")
    
    json_blob = bucket.blob(f"models/{model_name}.onnx.json")
    json_blob.upload_from_filename(str(json_path))
    print(f"✓ Uploaded {model_name}.onnx.json")

def download_from_firebase(model_name, models_dir, bucket):
    """Download a custom model from Firebase Storage."""
    print(f"Downloading custom model {model_name} from Firebase Storage...")
    
    # Download .onnx file
    onnx_blob = bucket.blob(f"models/{model_name}.onnx")
    onnx_path = models_dir / f"{model_name}.onnx"
    onnx_blob.download_to_filename(str(onnx_path))
    
    # Download .onnx.json file
    json_blob = bucket.blob(f"models/{model_name}.onnx.json")
    json_path = models_dir / f"{model_name}.onnx.json"
    json_blob.download_to_filename(str(json_path))
    
    print(f"✓ Downloaded custom model {model_name}")

def check_firebase_model_exists(model_name, bucket):
    """Check if a model exists in Firebase Storage."""
    onnx_blob = bucket.blob(f"models/{model_name}.onnx")
    json_blob = bucket.blob(f"models/{model_name}.onnx.json")
    return onnx_blob.exists() and json_blob.exists()

def initialize_firebase():
    """Initialize Firebase Admin SDK."""
    FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not FIREBASE_SERVICE_ACCOUNT_JSON:
        print("Warning: FIREBASE_SERVICE_ACCOUNT_JSON not set, skipping custom models")
        return None
    
    try:
        if FIREBASE_SERVICE_ACCOUNT_JSON.strip().startswith('{'):
            cred_dict = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
        else:
            cred_dict = json.loads(base64.b64decode(FIREBASE_SERVICE_ACCOUNT_JSON).decode('utf-8'))
        
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.environ.get("FIREBASE_STORAGE_BUCKET")
        })
        bucket = storage.bucket()
        print(f"✓ Firebase Storage initialized: {bucket.name}")
        return bucket
    except Exception as e:
        print(f"Warning: Failed to initialize Firebase: {e}")
        return None

def main():
    """Main function to download all models."""
    # Create models directory
    models_dir = Path("src/piper_tts_web/models")
    models_dir.mkdir(parents=True, exist_ok=True)
    
    print("Starting model download...")
    
    # Download official models from HuggingFace
    print("\n=== Downloading Official Models ===")
    for model in OFFICIAL_MODELS:
        try:
            download_from_huggingface(model, models_dir)
        except Exception as e:
            print(f"✗ Failed to download {model}: {e}")
    
    # Initialize Firebase and handle custom models
    print("\n=== Handling Custom Models ===")
    bucket = initialize_firebase()
    
    if bucket:
        for model in CUSTOM_MODELS:
            try:
                # Check if model exists in Firebase Storage
                if check_firebase_model_exists(model, bucket):
                    # Download from Firebase Storage
                    download_from_firebase(model, models_dir, bucket)
                else:
                    # Upload to Firebase Storage if it doesn't exist
                    print(f"Custom model {model} not found in Firebase Storage, uploading...")
                    upload_to_firebase(model, models_dir, bucket)
            except Exception as e:
                print(f"✗ Failed to handle custom model {model}: {e}")
    else:
        print("Skipping custom models (Firebase not available)")
    
    print(f"\n✓ Model download complete! Models saved to: {models_dir}")
    
    # List downloaded models
    print("\n=== Downloaded Models ===")
    onnx_files = list(models_dir.glob("*.onnx"))
    for file in sorted(onnx_files):
        size_mb = file.stat().st_size / (1024 * 1024)
        print(f"  {file.name} ({size_mb:.1f} MB)")

if __name__ == "__main__":
    main() 