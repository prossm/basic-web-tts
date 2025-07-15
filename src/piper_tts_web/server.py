import hashlib
import json
import logging
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logger = logging.getLogger("piper_tts_web")

# Get the package directory
PACKAGE_DIR = Path(__file__).parent
logger.info(f"Package directory: {PACKAGE_DIR}")

# Mount static files
app.mount("/static", StaticFiles(directory=PACKAGE_DIR / "static"), name="static")

# Models directory
MODELS_DIR = PACKAGE_DIR / "models"
logger.info(f"Models directory: {MODELS_DIR}")

# Output directory for generated audio files
OUTPUT_DIR = Path("/persistent_output")
OUTPUT_DIR.mkdir(exist_ok=True)


class SynthesisRequest(BaseModel):
    text: str
    voice: str


def find_piper_executable():
    """Find the piper executable in common installation locations."""
    # Check common locations
    possible_paths = [
        os.path.join(os.path.expanduser("~"), "bin", "piper"),  # User's bin directory
        "/usr/local/bin/piper",  # System-wide installation
        "/opt/homebrew/bin/piper",  # Homebrew on Apple Silicon
        "/usr/bin/piper",  # System bin
        "/app/piper",
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "piper",
            "build",
            "piper",
        ),  # Local build
    ]

    for path in possible_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    raise FileNotFoundError(
        "Could not find piper executable. Please make sure it's installed and in your PATH. "
        "You can install it by following the instructions in the README.md file."
    )


@app.get("/", response_class=HTMLResponse)
async def get_index():
    """Serve the main page at /."""
    with open(PACKAGE_DIR / "static" / "index.html") as f:
        return f.read()

@app.get("/about", response_class=HTMLResponse)
async def get_about():
    """Serve the About page at /about."""
    with open(PACKAGE_DIR / "static" / "about.html") as f:
        return f.read()


@app.get("/voices")
async def list_voices():
    """List all available voices."""
    try:
        logger.info("Listing voices...")
        voices = []

        # Check if models directory exists
        if not MODELS_DIR.exists():
            logger.error(f"Models directory does not exist: {MODELS_DIR}")
            raise HTTPException(status_code=500, detail="Models directory not found")

        # List all .onnx files
        onnx_files = list(MODELS_DIR.glob("*.onnx"))
        logger.info(
            f"Found {len(onnx_files)} .onnx files: {[f.name for f in onnx_files]}"
        )

        for file in onnx_files:
            # Look for the .onnx.json file
            json_file = file.with_suffix(".onnx.json")

            logger.info(f"Processing voice file: {file}")
            logger.info(f"Looking for JSON file: {json_file}")

            if json_file.exists():
                try:
                    with open(json_file) as f:
                        voice_info = json.load(f)
                        # Extract language code from filename (e.g., en_GB from en_GB-jenny_dioco-medium.onnx)
                        language_code = file.stem.split("-")[0]
                        voice_data = {
                            "name": file.stem,
                            "language": language_code,
                            "description": voice_info.get(
                                "description", "No description available"
                            ),
                        }
                        voices.append(voice_data)
                        logger.info(f"Added voice: {voice_data}")
                except json.JSONDecodeError as e:
                    logger.error(f"Error reading JSON file {json_file}: {e}")
                except Exception as e:
                    logger.error(f"Error processing voice file {file}: {e}")
            else:
                logger.warning(f"No JSON file found for {file}")

        logger.info(f"Returning {len(voices)} voices: {voices}")
        return voices
    except Exception as e:
        logger.error(f"Error listing voices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize")
async def synthesize_speech(request: SynthesisRequest):
    """Synthesize speech from text using the specified voice."""
    try:
        logger.info(f"Synthesizing speech for voice: {request.voice}")
        logger.info(f"Text length: {len(request.text)} characters")

        # Validate voice file exists
        voice_file = MODELS_DIR / f"{request.voice}.onnx"
        if not voice_file.exists():
            raise HTTPException(
                status_code=404, detail=f"Voice {request.voice} not found"
            )

        # Create output file path with a unique name
        text_hash = hashlib.md5(request.text.encode()).hexdigest()
        output_file = OUTPUT_DIR / f"{request.voice}_{text_hash}.wav"

        # Get the full path to the piper executable
        piper_path = find_piper_executable()
        logger.info(f"Using piper executable: {piper_path}")

        # Run piper command
        cmd = [
            piper_path,
            "--model",
            str(voice_file),
            "--output_file",
            str(output_file),
            "--espeak-data",
            "/usr/share/espeak-ng-data",
        ]

        logger.info(f"Running command: {' '.join(cmd)}")

        # Run the command and capture both stdout and stderr
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        # Send the text to piper's stdin
        stdout, stderr = process.communicate(input=request.text)

        if process.returncode != 0:
            logger.error(f"Piper failed with error: {stderr}")
            raise HTTPException(status_code=500, detail=f"Piper failed: {stderr}")

        # Verify the output file exists
        if not output_file.exists():
            logger.error(f"Output file not found: {output_file}")
            raise HTTPException(status_code=500, detail="Failed to generate audio file")

        logger.info("Speech synthesis completed successfully")

        # Return the generated audio file
        return FileResponse(output_file, media_type="audio/wav", filename="speech.wav")

    except FileNotFoundError as e:
        logger.error(f"File not found error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error synthesizing speech: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
