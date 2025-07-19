FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    espeak-ng-data \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/lib/x86_64-linux-gnu/espeak-ng-data /usr/share/espeak-ng-data

# Set the working directory in the container
WORKDIR /app

RUN wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz && \
    # The --strip-components=1 flag extracts the contents of the 'piper' directory
    # directly into the current directory (/app), so we get /app/piper, not /app/piper/piper
    tar -xzvf piper_amd64.tar.gz --strip-components=1 && \
    # Clean up the downloaded archive to keep the image size small
    rm piper_amd64.tar.gz

# --- Application Code & Installation ---
# Copy the entire application code first
COPY . .

# Install the project and its dependencies
RUN pip install --no-cache-dir -e .

# Create models directory
RUN mkdir -p src/piper_tts_web/models

# Make startup script executable
RUN chmod +x start.sh

# Use the startup script that handles model downloading and server startup
CMD ["./start.sh"]
