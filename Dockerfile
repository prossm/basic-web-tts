FROM python:3.11-slim

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    espeak-ng \
    espeak-ng-data \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/lib/x86_64-linux-gnu/espeak-ng-data /usr/share/espeak-ng-data

# Set the working directory in the container
WORKDIR /app

# --- Application Code & Installation ---
# Copy package.json and package-lock.json first for better Docker caching
COPY package.json ./
COPY package-lock.json* ./

# Install frontend dependencies
RUN npm install

# Copy the entire application code
COPY . .

# Install the Python project and its dependencies
RUN pip install --no-cache-dir -e .

# Make startup script executable
RUN chmod +x start.sh

# Use the startup script that handles server startup
CMD ["./start.sh"]
