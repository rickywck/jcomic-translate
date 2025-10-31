import { DEFAULT_PROMPT, GEMINI_MODEL_NAME } from './config.js';

let currentGeminiApiKey = '';
let currentImageBaseName = '';
let currentJpegQuality = 0.5; // Default JPEG quality
let currentColorThreshold = 60; // Default color threshold

async function getGeminiApiKey() {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  return geminiApiKey;
}

async function loadConfigIntoForm(apiKeyInput, imagePrefixInput, jpegQualityInput, colorThresholdInput) {
  // Fetch all config values in a single, more efficient call
  const config = await chrome.storage.local.get({
    geminiApiKey: '',
    imageBaseName: 'capture',
    jpegQuality: 0.5,
    colorThreshold: 60
  });

  // Update global state from the loaded config
  currentGeminiApiKey = config.geminiApiKey;
  currentImageBaseName = config.imageBaseName;
  currentJpegQuality = config.jpegQuality;
  currentColorThreshold = config.colorThreshold;

  apiKeyInput.value = config.geminiApiKey; // Show the stored key, which might be empty
  imagePrefixInput.value = currentImageBaseName;
  jpegQualityInput.value = currentJpegQuality;
  colorThresholdInput.value = currentColorThreshold;
  console.log('Loading colorThreshold:', currentColorThreshold); // Debugging line
}

function cropBlackEdges(imageDataUrl, quality) {
  const MAX_PROCESSING_WIDTH = 1920; // Max width before we scale down for processing

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // --- SPEED IMPROVEMENT: Scale down large images before processing ---
      let scale = 1;
      if (img.width > MAX_PROCESSING_WIDTH) {
        scale = MAX_PROCESSING_WIDTH / img.width;
      }
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      // Draw the scaled-down image to the canvas for analysis
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Now, all subsequent operations are on a smaller, faster canvas
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const colorThreshold = currentColorThreshold; // Use configurable color threshold

      let minX = 0;
      let maxX = canvas.width - 1;

      // Find minX (first column from left with non-black/non-grey pixel)
      outerLoopLeft: for (let x = 0; x < canvas.width; x++) {
        for (let y = 0; y < canvas.height; y++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Check if the average of R, G, B is above the threshold
          if ((r + g + b) / 3 > colorThreshold) {
            minX = x;
            break outerLoopLeft;
          }
        }
      }

      // Find maxX (first column from right with non-black/non-grey pixel)
      outerLoopRight: for (let x = canvas.width - 1; x >= 0; x--) {
        for (let y = 0; y < canvas.height; y++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Check if the average of R, G, B is above the threshold
          if ((r + g + b) / 3 > colorThreshold) {
            maxX = x;
            break outerLoopRight;
          }
        }
      }

      // If minX is still 0 and maxX is still canvas.width - 1, it means no non-black/non-grey pixels were found
      // Or if minX somehow became greater than maxX (e.g., very thin image or all black)
      if (minX >= maxX) { 
        resolve(imageDataUrl); // Return original if no effective cropping is needed or possible
        return;
      }

      const croppedWidth = maxX - minX + 1;
      const croppedCanvas = document.createElement('canvas');
      const croppedCtx = croppedCanvas.getContext('2d');
      croppedCanvas.width = croppedWidth;
      croppedCanvas.height = canvas.height;

      // Draw the cropped section from the *original* full-resolution image
      // to the new canvas to maintain quality.
      // We use the coordinates we found on the scaled-down image, but apply them
      // to the full-sized one.
      const sourceX = minX / scale;
      const sourceWidth = croppedWidth / scale;
      const sourceHeight = canvas.height / scale;

      // The final canvas will have the cropped width but at the scaled-down resolution.
      croppedCanvas.width = croppedWidth;
      croppedCanvas.height = canvas.height;

      croppedCtx.drawImage(img, sourceX, 0, sourceWidth, sourceHeight, 0, 0, croppedWidth, canvas.height);

      resolve(croppedCanvas.toDataURL('image/jpeg', quality));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Captures the visible tab, crops it, and returns the processed image data URL.
 * @returns {Promise<string|null>} A promise that resolves with the cropped image data URL, or null on error.
 */
async function captureAndProcessScreen() {
  try {
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: Math.round(currentJpegQuality * 100) });
    if (!screenshotUrl) {
      throw new Error("Failed to capture visible tab (screenshot was null).");
    }
    return await cropBlackEdges(screenshotUrl, currentJpegQuality);
  } catch (error) {
    console.error("Error during screen capture/processing:", error);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const translateButton = document.getElementById('translateButton');
  const saveScreenshotButton = document.getElementById('saveScreenshotButton');
  const configButton = document.getElementById('configButton');
  const configSection = document.getElementById('configSection');
  const apiKeyInput = document.getElementById('api_key_input');
  const imagePrefixInput = document.getElementById('image_prefix_input');
  const jpegQualityInput = document.getElementById('jpeg_quality_input');
  const colorThresholdInput = document.getElementById('color_threshold_input');
  const saveConfigButton = document.getElementById('saveConfigButton');
  const resultDiv = document.getElementById('result');
  const statusDiv = document.getElementById('status');

  // Load all configuration settings once on startup
  const config = await chrome.storage.local.get({
    geminiApiKey: '', imageBaseName: 'capture', jpegQuality: 0.5, colorThreshold: 60
  });
  currentGeminiApiKey = config.geminiApiKey;
  currentImageBaseName = config.imageBaseName;
  currentJpegQuality = config.jpegQuality;
  currentColorThreshold = config.colorThreshold;

  translateButton.addEventListener('click', async function() {
    statusDiv.textContent = 'Capturing screen...';
    resultDiv.textContent = '';

    if (!currentGeminiApiKey || currentGeminiApiKey === 'YOUR_GEMINI_API_KEY') {
      statusDiv.textContent = 'Error: Gemini API Key is not set. Please configure it via the Config button.';
      resultDiv.textContent = '';
      return;
    }

    statusDiv.textContent = 'Processing image...';
    const croppedScreenshotUrl = await captureAndProcessScreen();

    if (!croppedScreenshotUrl) {
      statusDiv.textContent = 'Error: Could not process screen capture.';
      return;
    }
      statusDiv.textContent = 'Sending to Gemini LLM...';

      // Extract base64 data from the data URL
      const base64Data = croppedScreenshotUrl.split(',')[1];

      const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${currentGeminiApiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {text: DEFAULT_PROMPT},
              {inline_data: {mime_type: 'image/jpeg', data: base64Data}}
            ]
          }
        ]
      };

      fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(`API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
          resultDiv.textContent = data.candidates[0].content.parts[0].text;
          statusDiv.textContent = 'Translation complete.';
        } else {
          resultDiv.textContent = 'No translation found.';
          statusDiv.textContent = 'Gemini LLM response empty.';
        }
      })
      .catch(error => {
        statusDiv.textContent = 'Error communicating with Gemini LLM: ' + error.message;
        console.error('Gemini LLM Error:', error);
        resultDiv.textContent = 'Please check your API key and network connection.';
      });
  });

  saveScreenshotButton.addEventListener('click', async function() {
    statusDiv.textContent = 'Capturing screen for download...';
    resultDiv.textContent = '';

    const croppedScreenshotUrl = await captureAndProcessScreen();

    if (!croppedScreenshotUrl) {
      statusDiv.textContent = 'Error: Could not process screen capture for saving.';
      return;
    }
      const link = document.createElement('a');
      link.href = croppedScreenshotUrl;
      link.download = `${currentImageBaseName}.jpeg`; // Use the currentImageBaseName
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      statusDiv.textContent = 'Screenshot saved.';
  });

  configButton.addEventListener('click', async function() {
    if (configSection.style.display === 'block') {
      configSection.style.display = 'none';
    } else {
      await loadConfigIntoForm(apiKeyInput, imagePrefixInput, jpegQualityInput, colorThresholdInput);
      configSection.style.display = 'block';
    }
  });

  saveConfigButton.addEventListener('click', function() {
    const newApiKey = apiKeyInput.value;
    const newImageBaseName = imagePrefixInput.value;
    const newJpegQuality = parseFloat(jpegQualityInput.value);
    const newColorThreshold = parseInt(colorThresholdInput.value); // Get the new color threshold value

    chrome.storage.local.set({ 'geminiApiKey': newApiKey, 'imageBaseName': newImageBaseName, 'jpegQuality': newJpegQuality, 'colorThreshold': newColorThreshold }, function() {
      console.log('Saving colorThreshold:', newColorThreshold); // Debugging line
      currentGeminiApiKey = newApiKey;
      currentImageBaseName = newImageBaseName;
      currentJpegQuality = newJpegQuality;
      currentColorThreshold = newColorThreshold; // Update currentColorThreshold
      statusDiv.textContent = 'Configuration saved!';
      configSection.style.display = 'none';
      // Clear status after a short delay
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    });
  });
});