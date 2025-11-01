# jcomic-translate

This is a Chrome extension for translating Japanese comics.

## Translation output

When the LLM returns a JSON array of objects with `original` and `translation` fields, the popup renders each item as two rows:

- Original text row: light grey background
- Translated text row: light red background

These rows use the CSS classes `line-original` and `line-translation` respectively (both extend `line-row`). If the response cannot be parsed as JSON, the raw text is shown as a fallback.

## Capture Book

Use the "Capture Book" button to capture multiple pages in sequence:

1. You will be prompted for the number of pages.
2. The current page is captured first.
3. The extension simulates a Left Arrow key press to move to the next page after each capture.
4. This repeats until the requested number of pages is captured.
5. Each file is saved using the configured prefix followed by a sequence number starting at 1 (e.g., `capture1.jpeg`, `capture2.jpeg`, ...).

Notes:
- Requires the `downloads` permission (configured in `manifest.json`).
- Some sites may not respond to synthetic key events; if navigation doesn't occur, you may need to manually turn pages.
