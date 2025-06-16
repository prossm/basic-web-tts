FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy project files
COPY src/piper_tts_web .

# Install Python dependencies
RUN pip install --no-cache-dir .

# Create directory for voice models
# RUN mkdir -p models

# Start the server with Gunicorn
CMD ["gunicorn", "server:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
