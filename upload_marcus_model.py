#!/usr/bin/env python3
"""
Simple script to upload the Marcus model to Firebase Storage.
Run this locally to upload your custom model.
"""

import os
import json
import base64
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, storage

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

def upload_marcus_model():
    """Upload the Marcus model to Firebase Storage."""
    models_dir = Path("src/piper_tts_web/models")
    
    # Check if Marcus model exists locally
    onnx_path = models_dir / "en_us-marcus.onnx"
    json_path = models_dir / "en_us-marcus.onnx.json"
    
    if not onnx_path.exists():
        raise FileNotFoundError(f"Marcus model not found: {onnx_path}")
    if not json_path.exists():
        raise FileNotFoundError(f"Marcus model JSON not found: {json_path}")
    
    print(f"Found Marcus model locally:")
    print(f"  ONNX: {onnx_path} ({onnx_path.stat().st_size / (1024*1024):.1f} MB)")
    print(f"  JSON: {json_path}")
    
    # Initialize Firebase
    bucket = initialize_firebase()
    
    # Upload to Firebase Storage
    print("\nUploading to Firebase Storage...")
    
    # Upload .onnx file
    onnx_blob = bucket.blob("models/en_us-marcus.onnx")
    onnx_blob.upload_from_filename(str(onnx_path))
    print("✓ Uploaded en_us-marcus.onnx")
    
    # Upload .onnx.json file
    json_blob = bucket.blob("models/en_us-marcus.onnx.json")
    json_blob.upload_from_filename(str(json_path))
    print("✓ Uploaded en_us-marcus.onnx.json")
    
    print(f"\n✓ Marcus model uploaded successfully!")
    print(f"Models are now available at: gs://{bucket.name}/models/")

if __name__ == "__main__":
    try:
        upload_marcus_model()
    except Exception as e:
        print(f"Error: {e}")
        exit(1) 