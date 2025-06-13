"""Entry point for the Piper TTS Web Interface."""

from .server import app
import uvicorn

def main():
    """Run the server."""
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main() 