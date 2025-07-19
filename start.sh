#!/bin/bash

# Startup script for Basic TTS Web Application
set -e

echo "Starting Basic TTS Web Application..."

echo "Starting server..."
exec gunicorn piper_tts_web.server:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 600 