#!/bin/bash

# Startup script for Basic TTS Web Application
# Downloads models and starts the server

set -e

echo "Starting Basic TTS Web Application..."

# Download models if they don't exist
echo "Checking for models..."
if [ ! -f "src/piper_tts_web/models/en_GB-alan-medium.onnx" ]; then
    echo "Models not found, downloading..."
    python download_models.py
else
    echo "Models already exist, skipping download."
fi

# Start the server
echo "Starting server..."
exec gunicorn piper_tts_web.server:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 600 