# Colab Notebook: Convert DocCornerNet → TensorFlow.js

## Purpose

Converts the pre-trained DocCornerNet `.keras` model into a TF.js **Graph model** that runs 100% in-browser for auto document corner detection.

## How to Re-run

1. Open [convert_model_colab.ipynb](convert_model_colab.ipynb) in Google Colab
2. **Runtime → Run all** (takes ~2 minutes)
3. After completion, download `tfjs_model.zip` from the Colab file browser (folder icon on left)
4. Extract and replace the folder: `assets/models/doccornernet/`

### Output files
- `model.json` — Graph model definition
- `group1-shard1of1.bin` — Model weights (~2.6MB)

### When to re-run
- The model files get corrupted/deleted
- You want to test a different model checkpoint
- You upgrade TensorFlow.js and need compatibility changes

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **ML Model** | DocCornerNet (MobileNetV2 α=0.35, SimCC) | Corner coordinate classification |
| **Browser ML** | TensorFlow.js 4.21.0 | Run model in-browser |
| **CV Fallback** | OpenCV.js 4.9.0 | 13+ contour/edge strategies |
| **Image Editor** | Cropper.js | Crop, rotate, zoom UI |
| **UI** | jQuery + Bootstrap 5 | Controls panel, layout |
| **Backend** | PHP 7.2+ | Save, proxy, integration |
| **Model Convert** | TensorFlow.js Converter (Colab) | `.keras` → TF.js Graph |

## Open Source

All code written from scratch. Third-party dependencies:

| Library | License |
|---------|---------|
| DocCornerNet model | MIT |
| TensorFlow.js | Apache 2.0 |
| OpenCV.js | Apache 2.0 |
| Cropper.js | MIT |
| jQuery | MIT |
| Bootstrap | MIT |

**This project can be open-sourced.** No proprietary code, no API keys, all processing is client-side. Suggested license: MIT.
