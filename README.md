# jcomic-translate

jcomic-translate is a small proof-of-concept project that helps translate Japanese comics (manga) by combining a browser extension UI with a local web viewer/back-end for batch processing and display.

The repository contains two main parts:

- A browser extension (manifest, popup UI) for quickly sending images or pages to be translated.
- A lightweight webapp for uploading, translating, and viewing translated comic images locally.

**Features**

- Translate individual comic pages or images using a configurable backend.
- Local web viewer to batch-upload images and inspect translation results.
- Simple extension popup for quick access inside the browser.

**Repository Structure**

- `manifest.json`, `popup.html`, `popup.js`, `config.js` — browser extension files.
- `webapp/` — local web server and viewer.
	- `webapp/server.js` — Express server that serves the viewer and handles uploads.
	- `webapp/public/` — static assets used by the web viewer.
- `uploads/` — (created at runtime) temporary storage for uploaded images.

**Quick Start — Browser Extension**

1. Open Chrome (or any Chromium-based browser) and go to `chrome://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select the repository root folder containing `manifest.json`.
4. The extension's popup provides a minimal UI to interact with the translation workflow.

**Quick Start — Local Web Viewer**

1. Install dependencies and run the web server:

```bash
cd webapp
npm install
npm start
# or: node server.js
```

2. Open `http://localhost:3000` (or the port printed by the server) in your browser.
3. Use the web UI to upload images and view translation results.

Note: The server is intentionally small and designed for local use. The code can be extended to call an LLM or OCR/translation backend (for example, Gemini or other providers) if you add the appropriate API integration and credentials.

**Development**

- Update extension UI in `popup.html` / `popup.js` and reload the extension in `chrome://extensions` to see changes.
- Edit the viewer in `webapp/public/` and restart the web server to load changes.

**Notes & Next Steps**

- This is a proof-of-concept; it intentionally keeps translation/back-end integration minimal. If you want, I can:
	- Add a configurable LLM/OCR integration example (e.g., with environment-based API keys).
	- Add a Dockerfile to run the webapp in a container.
	- Improve the extension to capture images directly from the page.

**License & Contact**

This project is experimental. Use and modify freely. For questions or contributions, open an issue or contact the repository owner.
