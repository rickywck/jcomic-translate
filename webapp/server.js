import express from 'express';
import cors from 'cors';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fetch from 'node-fetch';
import mime from 'mime-types';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Keep these aligned with the extension
const DEFAULT_PROMPT = 'Extract the text from the manga page image, which is in Japanese, and provide an Traditional Chinese translation while preserving the original formatting as much as possible. Make sure only text in manga content are translated. There are usually two pages of manga on the image - the right page and the left page, start extraction and translation from top right, then bottom right, then top left and finally bottom left. Return the original text and translated text in a json array with each object containing "original" and "translation" fields.';
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(cors());

// Ensure uploads folder exists
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

// Multer storage that writes files into a per-request folder under uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use provided dirName or timestamp
    const dirName = (req.body && req.body.dirName) ? String(req.body.dirName) : Date.now().toString();
    const dest = path.join(UPLOADS_ROOT, dirName);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Serve static frontend
app.use('/', express.static(path.join(__dirname, 'public')));

function isImageFile(p) {
  const ext = path.extname(p).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
}

// Extract the trailing numeric sequence from a filename (before extension),
// optionally enclosed in brackets/parentheses. If none, return Infinity so
// those sort to the end.
function extractSeqFromName(fname) {
  const base = path.parse(fname).name;
  // Grab the last group of digits in the base name
  const matches = [...base.matchAll(/\d+/g)];
  if (!matches.length) return Number.POSITIVE_INFINITY;
  const last = matches[matches.length - 1][0];
  return Number.parseInt(last, 10);
}

function fileSeqComparator(a, b) {
  const sa = extractSeqFromName(a);
  const sb = extractSeqFromName(b);
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b);
}

async function translateImageWithGemini({ apiKey, modelName, prompt, filePath }) {
  const buf = await fsp.readFile(filePath);
  const b64 = buf.toString('base64');
  const mimeType = mime.lookup(filePath) || 'image/jpeg';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: b64 } }
        ]
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status} ${res.statusText}: ${text}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// Batch translate endpoint
// POST /api/translate-dir { dir, overwrite?: boolean, apiKey?: string, modelName?: string, prompt?: string }
app.post('/api/translate-dir', async (req, res) => {
  const { dir, overwrite = false, apiKey, modelName, prompt } = req.body || {};
  try {
    if (!dir || typeof dir !== 'string') {
      return res.status(400).json({ error: 'dir is required' });
    }
    const full = path.resolve(dir);
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return res.status(400).json({ error: 'dir not found or not a directory' });
    }

    const key = (apiKey && String(apiKey)) || process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(400).json({ error: 'No Gemini API key provided (pass in body.apiKey or set GEMINI_API_KEY env var)' });
    }

    const files = await fsp.readdir(full);
    const imageFiles = files.filter(f => isImageFile(f)).sort(fileSeqComparator);

    const results = [];
    for (const fname of imageFiles) {
      const imgPath = path.join(full, fname);
      const txtPath = path.join(full, path.parse(fname).name + '.txt');
      const exists = fs.existsSync(txtPath);
      if (exists && !overwrite) {
        results.push({ file: fname, status: 'skipped' });
        continue;
      }
      try {
        const llmText = await translateImageWithGemini({
          apiKey: key,
          modelName: modelName || GEMINI_MODEL_NAME,
          prompt: prompt || DEFAULT_PROMPT,
          filePath: imgPath
        });
        await fsp.writeFile(txtPath, llmText, 'utf8');
        results.push({ file: fname, status: 'ok' });
      } catch (e) {
        results.push({ file: fname, status: 'error', message: String(e?.message || e) });
      }
    }

    res.json({ dir: full, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// List images and whether txt exists
// GET /api/list?dir=...
app.get('/api/list', async (req, res) => {
  const dir = req.query.dir;
  try {
    if (!dir) return res.status(400).json({ error: 'dir is required' });
    const full = path.resolve(String(dir));
    const files = await fsp.readdir(full);
    const images = files.filter(f => isImageFile(f)).sort(fileSeqComparator);
    const list = images.map(f => {
      const txt = path.join(full, path.parse(f).name + '.txt');
      return { file: f, hasText: fs.existsSync(txt) };
    });
    res.json({ dir: full, files: list });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Serve an image file
// GET /api/image?dir=...&file=...
app.get('/api/image', async (req, res) => {
  const { dir, file } = req.query;
  try {
    const full = path.resolve(String(dir || ''));
    const p = path.join(full, String(file || ''));
    if (!isImageFile(p)) return res.status(400).send('Not an image file');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    const mimeType = mime.lookup(p) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
});

// Read text (raw llm output) for a file
// GET /api/text?dir=...&file=...
app.get('/api/text', async (req, res) => {
  const { dir, file } = req.query;
  try {
    const full = path.resolve(String(dir || ''));
    const base = path.parse(String(file || '')).name;
    const txtPath = path.join(full, base + '.txt');
    if (!fs.existsSync(txtPath)) return res.status(404).send('Text not found');
    const text = await fsp.readFile(txtPath, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
});

// Upload a directory (via browser file input with webkitdirectory) and translate
// Expects files in multipart form-data under 'files', optional dirName and apiKey in body
app.post('/api/upload-and-translate', upload.array('files'), async (req, res) => {
  try {
    const apiKey = (req.body && req.body.apiKey) ? String(req.body.apiKey) : process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'No API key provided' });

    // Multer saved files into a single directory for this upload; derive the folder
    const savedDir = req.files && req.files.length ? path.dirname(req.files[0].path) : null;
    if (!savedDir) return res.status(400).json({ error: 'No files uploaded' });

    // Now run translation on savedDir (similar to /api/translate-dir)
    const files = await fsp.readdir(savedDir);
    const imageFiles = files.filter(f => isImageFile(f)).sort(fileSeqComparator);
    const results = [];
    for (const fname of imageFiles) {
      const imgPath = path.join(savedDir, fname);
      const txtPath = path.join(savedDir, path.parse(fname).name + '.txt');
      const exists = fs.existsSync(txtPath);
      if (exists && req.body.overwrite !== 'true') {
        results.push({ file: fname, status: 'skipped' });
        continue;
      }
      try {
        const llmText = await translateImageWithGemini({ apiKey, modelName: GEMINI_MODEL_NAME, prompt: DEFAULT_PROMPT, filePath: imgPath });
        await fsp.writeFile(txtPath, llmText, 'utf8');
        results.push({ file: fname, status: 'ok' });
      } catch (e) {
        results.push({ file: fname, status: 'error', message: String(e?.message || e) });
      }
    }

    res.json({ dir: savedDir, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`Web app running at http://localhost:${PORT}`);
});
