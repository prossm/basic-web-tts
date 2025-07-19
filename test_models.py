#!/usr/bin/env python3
"""
Test script to check if models are being downloaded and accessible.
"""

import os
from pathlib import Path

def test_models():
    """Test if models are available."""
    models_dir = Path("src/piper_tts_web/models")
    
    print(f"Checking models directory: {models_dir}")
    print(f"Directory exists: {models_dir.exists()}")
    
    if models_dir.exists():
        print(f"Directory contents:")
        for item in models_dir.iterdir():
            print(f"  {item.name} ({item.stat().st_size / (1024*1024):.1f} MB)")
    
    # Check for .onnx files
    onnx_files = list(models_dir.glob("*.onnx")) if models_dir.exists() else []
    print(f"\nFound {len(onnx_files)} .onnx files:")
    for file in onnx_files:
        print(f"  {file.name}")
    
    # Check for .onnx.json files
    json_files = list(models_dir.glob("*.onnx.json")) if models_dir.exists() else []
    print(f"\nFound {len(json_files)} .onnx.json files:")
    for file in json_files:
        print(f"  {file.name}")
    
    # Test the download script
    print(f"\nTesting download script...")
    try:
        import download_models
        download_models.main()
    except Exception as e:
        print(f"Error running download script: {e}")

if __name__ == "__main__":
    test_models() 