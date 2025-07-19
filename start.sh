#!/bin/bash

# Startup script for Basic TTS Web Application
# Downloads models and starts the server

set -e

echo "Starting Basic TTS Web Application..."

# Create models directory if it doesn't exist
mkdir -p src/piper_tts_web/models

# Download models if they don't exist
echo "Checking for models..."
if [ ! -f "src/piper_tts_web/models/en_GB-alan-medium.onnx" ]; then
    echo "Models not found, downloading..."
    python download_models.py
else
    echo "Models already exist, skipping download."
fi

# Verify models were downloaded
echo "Verifying models..."
python test_models.py

# Check if we have any .onnx files
ONNX_COUNT=$(find src/piper_tts_web/models -name "*.onnx" | wc -l)
echo "Found $ONNX_COUNT .onnx files"

if [ $ONNX_COUNT -eq 0 ]; then
    echo "ERROR: No models found! Attempting to download again..."
    python download_models.py
    ONNX_COUNT=$(find src/piper_tts_web/models -name "*.onnx" | wc -l)
    if [ $ONNX_COUNT -eq 0 ]; then
        echo "ERROR: Still no models found after retry!"
        exit 1
    fi
fi

echo "Models verified successfully!"

# Start the server
echo "Starting server..."
exec gunicorn piper_tts_web.server:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 600 