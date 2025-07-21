# Piper TTS Web Interface

See it live!: [BasicTTS.com](https://basictts.com)

This is a simple web interface for [Piper Text-to-Speech](https://github.com/rhasspy/piper) that provides a user-friendly way to convert text to speech using various voice models.

This repo was almost entirely vibe-coded in [Cursor](https://www.cursor.com/).

## Prerequisites

1. Python 3.8 or higher
2. espeak-ng (required for Piper)
3. Git LFS (for managing voice model files)
4. Voice models in ONNX + JSON format

## Installation

### Local Development

1. Install system dependencies:

   **For macOS:**
   ```bash
   # Install espeak-ng, git-lfs and build dependencies
   brew install espeak-ng cmake ninja git-lfs
   
   # Initialize Git LFS
   git lfs install
   
   # Clone and build Piper
   git clone https://github.com/rhasspy/piper.git
   cd piper
   mkdir build
   cd build
   cmake -DCMAKE_BUILD_TYPE=Release ..
   cmake --build . --config Release
   cd ../..
   ```

   **For Linux:**
   ```bash
   # Install espeak-ng and git-lfs
   sudo apt-get update
   sudo apt-get install espeak-ng git-lfs
   
   # Initialize Git LFS
   git lfs install
   
   # For Linux, you'll need to build piper from source
   git clone https://github.com/rhasspy/piper.git
   cd piper
   mkdir build
   cd build
   cmake -DCMAKE_BUILD_TYPE=Release ..
   cmake --build . --config Release
   cd ../..
   ```

   **For Windows:**
   ```bash
   # Install Git LFS using the installer from https://git-lfs.com
   # Or using Chocolatey:
   choco install git-lfs
   
   # Initialize Git LFS
   git lfs install
   ```

2. Install the web interface package:
   ```bash
   pip install -e .
   ```

3. Download voice files from [Piper Samples](https://rhasspy.github.io/piper-samples/) (you can listen to samples and download the ones you like)
   - Place the downloaded .onnx files and their corresponding .json files in the `models` directory

### Production Deployment

The application is designed to be deployed using Docker and is configured for deployment on servers running Linux 24.04 or compatible distributions.

1. Build the Docker image:
   ```bash
   docker build -t piper-tts-web .
   ```

2. Run the container:
   ```bash
   docker run -p 8000:8000 -v $(pwd)/models:/app/models piper-tts-web
   ```

3. For production deployment:
   - The application is configured to work with Linux-based infrastructure
   - Use the provided Dockerfile for consistent deployment
   - Ensure proper volume mounting for voice models
   - Configure appropriate environment variables for production settings

## Usage

1. Start the server (development mode):
   ```bash
   python server.py
   ```
   The server will start on `http://localhost:8000`

2. Open your web browser and navigate to `http://localhost:8000`

3. Select a voice from the dropdown menu

4. Enter the text you want to convert to speech

5. Click "Convert to Speech" and wait for the audio to be generated

6. Use the audio player to:
   - Play/pause the generated audio
   - Adjust the playback speed
   - Download the audio file

## Development

### Setting up a development environment

1. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On macOS/Linux
   ```

2. Install development dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

3. Run tests:
   ```bash
   pytest
   ```

4. Format code:
   ```bash
   black .
   ```

## Troubleshooting

1. If you get a "piper command not found" error:
   - Make sure espeak-ng is installed
   - Verify that Piper is installed correctly
   - Check that the package is in your Python path
   - Try running `which piper` to verify the installation
   - Make sure your PATH includes the directory where piper is installed

2. If no voices appear in the dropdown:
   - Check that you have .onnx files in the `models` directory
   - Make sure each .onnx file has a corresponding .json file
   - Verify that the files are properly named (e.g., `en_US-amy-medium.onnx`)

3. If the conversion fails:
   - Check the server logs for detailed error messages
   - Verify that the selected voice model exists
   - Make sure the text input is not empty

## Notes

- The server expects voice model files to be in ONNX format
- Temporary audio files are automatically cleaned up after processing
- The web interface supports various playback speeds (0.25x to 2x)
- All processing is done locally on your machine
- Docker deployment is recommended for consistent environments 
- Consider using [disco](https://disco.cloud/) for production deployments