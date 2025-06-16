FROM python:3.11-slim

RUN git lfs fetch
RUN git lfs pull

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# --- Dependency Installation ---
# 1. Copy only the files needed for dependency installation.
# This leverages Docker's layer cache. This layer only rebuilds
# if requirements.txt or setup.py change.
COPY requirements.txt setup.py ./

# 2. Install external dependencies from requirements.txt
# (Make sure gunicorn is in this file)
RUN pip install --no-cache-dir -r requirements.txt

# --- Application Code & Installation ---
# 3. Copy the rest of the application source code into the container.
# This includes your 'src' directory. The build will re-run from here
# if you change any of your source code.
COPY . .

# 4. Install the local project. `pip` now has access to setup.py
# and the 'src' directory, so it can find and install 'piper_tts_web'.
RUN pip install .

# Define the command to run your app using Gunicorn
CMD ["gunicorn", "piper_tts_web.server:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
