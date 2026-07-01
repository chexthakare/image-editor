# Image Editor

Browser-based document image editor with ML-powered auto corner detection, perspective correction, and enhancement filters — like CamScanner, but free and fully client-side.

## Features

- **Auto Corner Detection** — ML model (DocCornerNet, MobileNetV2) via TensorFlow.js detects document corners on image load. Falls back to 13+ OpenCV strategies if ML fails.
- **Perspective Correction** — Drag corner handles to adjust, then warp to a flat rectangle.
- **Enhancement Filters** — Auto levels, Grayscale, B&W (binarized).
- **Brightness / Contrast Sliders** — Real-time CSS preview on workspace, pixel-accurate on output.
- **Crop, Rotate, Flip, Zoom** — Powered by Cropper.js.
- **Save & Replace** — Overwrites the original file (integration mode for external apps).
- **100% Client-Side** — No server-side ML inference. No API keys. No external calls.
- **Mobile Friendly** — Works on mobile browsers with touch support.

## Quick Start

### Requirements
- PHP 7.2+ with `curl` and `finfo` extensions
- Apache with `mod_rewrite` (or any server that supports `.htaccess`)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Setup
1. Clone or copy the project to your web root
2. Ensure `uploads/` is writable by the web server
3. Open in browser: `http://localhost/image-editor/`

### Usage
1. **Upload an image** — corner detection runs automatically (~500ms)
2. **Adjust corners** if needed, then click **Apply**
3. **Enhance** with filters and sliders
4. **Crop / Rotate / Zoom** as desired
5. **Save** — downloads the result or replaces the original

## Integration

The editor can replace images in-place for external applications (e.g., admin portals). See [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) for details.

## ML Model

Uses [DocCornerNet-CoordClass](https://github.com/mapo80/DocCornerNet-CoordClass) (MIT license) — a MobileNetV2 backbone with SimCC coordinate classification. The model is pre-converted to TF.js Graph format and requires no server-side Python.

To re-convert the model: see [COLAB_NOTEBOOK.md](COLAB_NOTEBOOK.md).

## Tech Stack

| Layer | Technology | License |
|-------|-----------|---------|
| ML Model | DocCornerNet (MobileNetV2 α=0.35, SimCC) | MIT |
| Browser ML | TensorFlow.js 4.21.0 | Apache 2.0 |
| CV Fallback | OpenCV.js 4.9.0 | Apache 2.0 |
| Image Editor | Cropper.js | MIT |
| UI Framework | Bootstrap 5 + jQuery | MIT |
| Backend | PHP 7.2+ | — |

## Project Structure

```
image-editor/
├── index.php              # Main application
├── save.php               # Save edited image (download)
├── save-replace.php       # Save & replace original (integration)
├── proxy.php              # Load image by URL
├── assets/
│   ├── css/style.css      # Styles
│   ├── js/app.js          # All client-side logic (3100+ lines)
│   └── models/
│       └── doccornernet/  # TF.js Graph model
│           ├── model.json
│           └── group1-shard1of1.bin
├── sample-images/         # Test images
├── uploads/               # Saved output images
├── COLAB_NOTEBOOK.md      # ML model conversion guide
└── INTEGRATION_GUIDE.md   # Integration guide
```

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies retain their own licenses.
