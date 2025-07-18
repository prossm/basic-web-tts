#!/usr/bin/env python3
"""
Script to upload custom Piper TTS models to Firebase Storage.
"""

import os
import json
import base64
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, storage

# Custom models to upload to Firebase Storage
CUSTOM_MODELS = [
    "en_us-marcus"
]

def initialize_firebase():
    """Initialize Firebase Admin SDK."""
    FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not FIREBASE_SERVICE_ACCOUNT_JSON:
        raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set")
    
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
        raise Exception(f"Failed to initialize Firebase: {e}")

def upload_model_to_firebase(model_name, models_dir, bucket):
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

def main():
    """Main function to upload custom models."""
    models_dir = Path("src/piper_tts_web/models")
    
    if not models_dir.exists():
        raise FileNotFoundError(f"Models directory not found: {models_dir}")
    
    print("Starting custom model upload...")
    
    # Initialize Firebase
    bucket = initialize_firebase()
    
    # Upload custom models
    for model in CUSTOM_MODELS:
        try:
            upload_model_to_firebase(model, models_dir, bucket)
        except Exception as e:
            print(f"✗ Failed to upload {model}: {e}")
            return 1
    
    print(f"\n✓ Custom model upload complete!")
    print(f"Models uploaded to Firebase Storage bucket: {bucket.name}")
    print(f"Models will be available at: gs://{bucket.name}/models/")
    
    return 0

if __name__ == "__main__":
    exit(main()) 