FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# --- Dependency and Package Installation ---
# Copy setup and requirements files first to leverage Docker cache
COPY requirements.txt setup.py ./

# Install dependencies from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install the project itself as a package.
# This crucial step makes the `project.server:app` import work.
RUN pip install .

# --- Application Code ---
# Copy the source code into the container
COPY ./src ./src

# Define the command to run your app using Gunicorn
# This is the corrected command
CMD ["gunicorn", "piper_tts_web.server:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
