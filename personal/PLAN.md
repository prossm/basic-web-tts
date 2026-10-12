# Personal TTS — Plan

A single-user rebuild of Basic TTS: type text, pick a voice, get audio, keep a library of past generations. It runs on the existing soundcurious disco server behind a single username and password.

## Decisions

| Topic | Decision |
|---|---|
| Code location | `basic-web-tts/personal/`, a subfolder of this public repo. The original app in `src/` stays untouched as the reference. |
| Server | `disco.soundcurious.com` (5.161.110.188), new disco project `tts` |
| Deploy | `disco deploy --project tts --dir personal`. No GitHub link is needed, but one can be added later. |
| Auth | One username and password from disco env vars, plus a signed session cookie |
| Storage | Disco persistent volume `data` mounted at `/data`. Audio, voices and the library index all live there. |
| Firebase / RevenueCat / usage limits | Removed entirely |
| Domain | **TBD.** For example `tts.soundcurious.com`, which needs an A record pointing to `5.161.110.188`. |

### Stays out of git
- **Secrets:** username, password and session secret are disco env vars only.
- **Generated audio:** personal content that only grows. It lives on the volume.
- **Voice models:** about 63 MB each. The custom-trained voices (`kristin`, `marcus`) must never be published. They're uploaded straight to the volume.

## Layout

```
personal/
  PLAN.md
  disco.json            # web service on :8000, volume "data" -> /data
  Dockerfile            # python:3.11-slim + espeak-ng + ffmpeg
  .dockerignore
  requirements.txt      # fastapi, uvicorn, piper-tts, itsdangerous, python-multipart
  app/
    main.py             # routes, auth, synthesis, library
    static/
      index.html        # login-gated single page: compose + library
      app.js
      styles.css
      login.html
```

Volume layout:

```
/data/
  voices/   <name>.onnx + <name>.onnx.json
  audio/    <id>.mp3
  tts.db    SQLite: recordings(id, voice, text, created, duration, bytes)
```

## Backend (`app/main.py`)

**Auth**
- `TTS_USERNAME`, `TTS_PASSWORD` and `SESSION_SECRET` are read from the environment. The app refuses to start if any of them is missing.
- `POST /login` compares the credentials with `hmac.compare_digest`. On success it sets an `HttpOnly; Secure; SameSite=Lax` cookie signed with `itsdangerous`, valid for 30 days.
- Login is rate-limited to 5 failed attempts per IP per 15 minutes, tracked in memory.
- `POST /logout` clears the cookie.
- Every other route requires a session, except `/login`, the login page assets and `/healthz`. Audio is served through an authenticated endpoint, never as public static files.

**Voices**
- `GET /api/voices` lists the `*.onnx` files in `/data/voices`, with display names taken from the JSON metadata.
- Voices are loaded lazily with `PiperVoice.load` (Piper's Python API instead of the old three-way subprocess fallback). A small LRU cache keeps at most 2 voices in RAM, which keeps memory low next to soundcurious.

**Synthesis**
- `POST /api/synthesize {text, voice}`:
  - Splits long text by sentence and synthesizes in a threadpool so the event loop stays free.
  - Writes one WAV, converts it to MP3 with ffmpeg (about 10× smaller) and stores it in `/data/audio/<id>.mp3`.
  - Inserts a row in `tts.db` and returns the recording.
- Text is capped at a generous size (e.g. 50k characters) so a mistake can't hang the server.

**Library**
- `GET /api/recordings?q=` lists recordings, newest first, with an optional text search.
- `GET /api/recordings/{id}/audio` streams the file and supports range requests so seeking works.
- `DELETE /api/recordings/{id}` removes both the row and the file.

**Ops**
- `GET /healthz` reports whether the app is running and the volume is writable.
- Runs as a single uvicorn worker, which is plenty for one user and avoids loading voices once per worker.

## Frontend

One page with two sections:
1. **Compose:** a textarea with a character count, a voice dropdown that remembers the last choice in `localStorage`, a Generate button with a progress state, and an inline player with a download link when it finishes.
2. **Library:** a searchable list showing the text snippet, voice, date and duration, with play, download and delete actions.

It reuses the visual feel of the old `styles.css` without the marketing pages, paywall or Firebase code. The pages are plain HTML/JS with no build step.

## Setup steps

1. **Check server headroom.** Use `disco run` to check free RAM and disk on the soundcurious server, since soundcurious already loads TensorFlow.
2. **Build locally.** Run `personal/` with `/data` pointed at a local folder, then test login, synthesis, the library and deletion.
3. **DNS.** Add an A record for the chosen domain pointing to `5.161.110.188`.
4. **Create the project.**
   ```bash
   disco projects:add --disco disco.soundcurious.com --name tts --domain <domain> \
     TTS_USERNAME=... TTS_PASSWORD=... SESSION_SECRET=$(openssl rand -hex 32)
   disco deploy --disco disco.soundcurious.com --project tts --dir personal
   ```
5. **Load the voices.** Tar the 8 models from `basic-tts-util/models` into `voices/` and run:
   ```bash
   disco volumes:import --disco disco.soundcurious.com --project tts --volume data --input voices.tar.gz
   ```
   Do this **before** generating any audio, because the import may replace the volume's contents.
6. **Smoke test.** Log in on the live domain, generate a clip with each voice and check that it shows up in the library after a redeploy.
7. **README.** Add one line under the retirement notice that points to `personal/`.

## Backups

The volume is the only copy. Back it up periodically:

```bash
disco volumes:export --disco disco.soundcurious.com --project tts --volume data > tts-backup-$(date +%F).tar.gz
```

If off-site durability becomes important, the audio can move to Backblaze B2 later. That would only change the storage functions, not the API.

## Open questions

- Which domain?
- Is MP3 OK, or should the app keep the original WAVs as well?
- Should any of the old Firebase recordings be migrated? This assumes no, and that the library starts empty.
