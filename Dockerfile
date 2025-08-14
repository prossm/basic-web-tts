FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    espeak-ng-data \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/lib/x86_64-linux-gnu/espeak-ng-data /usr/share/espeak-ng-data

# Set the working directory in the container
WORKDIR /app

# --- Application Code & Installation ---
# Copy the entire application code first
COPY . .

# Install the project and its dependencies
RUN pip install --no-cache-dir -e .

# Make startup script executable
RUN chmod +x start.sh

# Use the startup script that handles server startup
CMD ["./start.sh"]
