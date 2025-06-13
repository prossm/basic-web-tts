# Piper TTS Web Interface

This is a web interface for Piper Text-to-Speech that provides a modern, user-friendly way to convert text to speech using various voice models.

## Prerequisites

1. Python 3.8 or higher
2. espeak-ng (required for Piper)
3. Voice models in ONNX format

## Installation

### Local Development

1. Install system dependencies:

   **For macOS:**
   ```bash
   # Install espeak-ng and build dependencies
   brew install espeak-ng cmake ninja
   
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
   sudo apt-get update
   sudo apt-get install espeak-ng
   # For Linux, you'll need to build piper from source
   git clone https://github.com/rhasspy/piper.git
   cd piper
   mkdir build
   cd build
   cmake -DCMAKE_BUILD_TYPE=Release ..
   cmake --build . --config Release
   cd ../..
   ```

2. Install the web interface package:
   ```bash
   pip install -e .
   ```

3. Download voice models:
   - Visit [Piper's voice repository](https://huggingface.co/rhasspy/piper-voices)
   - Download the voice models you want to use (they should be in .onnx format)
   - Place the downloaded .onnx files and their corresponding .json files in the `models` directory

### Production Deployment

#### Using Docker

1. Build the Docker image:
   ```bash
   docker build -t piper-tts-web .
   ```

2. Run the container:
   ```bash
   docker run -p 8000:8000 -v $(pwd)/models:/app/models piper-tts-web
   ```

#### Manual Deployment

1. Install the package:
   ```bash
   pip install .
   ```

2. Start the server with Gunicorn:
   ```bash
   gunicorn server:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```

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
- The web interface supports various playback speeds (0.5x to 2x)
- All processing is done locally on your machine
- For production deployment, use Gunicorn with multiple workers
- Docker deployment is recommended for consistent environments 