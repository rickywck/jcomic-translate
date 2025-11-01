# JComic Translate Web App

A local web application that works alongside the Chrome extension to:

- Scan a directory of images
- Call Gemini (same prompt/model as the extension) to translate each image
- Save raw LLM output to a `.txt` with the same base filename
- View images and translations side-by-side with arrow key navigation

## Run

1. Install dependencies
2. Start the server
3. Open http://localhost:5173

You can provide the Gemini API key either via the input field in the UI or export it as an environment variable before starting the server:

- `GEMINI_API_KEY` environment variable (preferred)

## Notes

- Translation prompt and model mirror the extension (`DEFAULT_PROMPT`, `gemini-2.5-flash`).
- Images supported: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Outputs are saved next to the images as `.txt` files (raw LLM text). The viewer attempts to parse JSON arrays in the same tolerant way as the extension; otherwise it shows the raw text.
- Use the Overwrite checkbox to regenerate `.txt` even if already present.