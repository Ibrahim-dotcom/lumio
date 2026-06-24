# Lumio — AI-Native Image Editing Platform

> Photoshop-level capability · Lightroom-level workflow · ChatGPT-level simplicity

Lumio is a production-grade, AI-native image editing platform built for content creators, e-commerce sellers, photographers, and marketing teams. It combines professional-grade editing tools with AI-powered automation in a sleek, dark-first interface.

---

## ✨ Features

### Implemented

- **AI Chat Panel (Natural Language Editing)** — Conversational prompt panel powered by a secure server-side Gemini LLM Proxy (`POST /api/ai/plan/`) with regex fallback for deterministic edits.
- **Adjustment Layers & Mask Painting** — Professional local adjustment layers with unlimited masks. Paint white (reveal) or black (erase) directly on per-layer mask canvases with a red Quick Mask overlay. Apply Exposure, Curves, HSL, and Color Grading selectively to any region.
- **Curves Editor** — Non-destructive RGB and per-channel tone curves via an interactive drag UI, backed by 256-step interpolated LUTs for <1ms per-frame cost.
- **Color Grading Wheels** — Split-toning across Shadows / Midtones / Highlights with smooth luminance-weighted masking.
- **HSL Panel** — Per-hue Hue / Saturation / Luminance control across 8 colour channels.
- **Lightroom-style Adjustments** — Exposure, Brightness, Contrast, Saturation, Hue, Temperature, Tint, Highlights, Shadows, Sharpness, Vignette.
- **Background Removal** — AI-powered via **BRIA RMBG-1.4** (state-of-the-art ONNX segmentation model), processed asynchronously via Celery.
- **Spot Healing Brush / Content-Aware Fill** — Powered by Samsung AI's **LaMa** (Resolution-robust Large Mask Inpainting) model to seamlessly remove objects and hallucinate backgrounds asynchronously via Celery.
- **Clone Stamp Tool** — Circular brush clone stamping with source crosshair overlay (`Alt+Click`), processed asynchronously via Celery + OpenCV.
- **Text Layers Tool** — Draggable, double-clickable, editable overlay text layers with font size, opacity, weight, and colour settings. Burned into the canvas at original resolution on export.
- **Shape Layers Tool** — Add and manipulate vector shape layers (rectangles and circles).
- **Crop & Rotate** — Interactive overlay with corner handles and floating toolbar.
- **Canvas Panning** — Spacebar-drag panning for efficient navigation.
- **Eyedropper Tool** — Pick exact pixel colours from the canvas with a floating preview ring to update Text and Shape layers live.
- **Presets** — Built-in editorial presets + custom user-saved presets (localStorage).
- **Edit History** — Full undo/redo with branching snapshot model.
- **Canvas Pipeline** — Real-time pixel-level adjustment preview in <16 ms (no server round-trips).
- **Before/After Compare** — Hold to compare against original image.
- **Export** — JPEG / PNG / WebP with quality control.
- **Automation Workflows** — Create named multi-step workflows (e.g. Remove BG → Sharpen → Export) and execute them as a single Celery task (`run_workflow_task`).
- **Batch Processing** — Upload 1–1000s of images via the Batch tab. Apply current editor adjustments or any saved workflow to every image asynchronously via Celery. Real-time progress queue with per-image result cards and one-click downloads.

### Coming Next

- Sky Replacement
- Authentication & User Accounts
- S3 Storage Integration

---

## 🏗️ Architecture

```
┌─────────────────┐     REST API      ┌──────────────────────────┐
│  React Frontend  │ ◄────────────── ► │   Django Backend          │
│  (Vite + TS)    │                   │   (DRF + Celery)          │
└─────────────────┘                   └──────────┬───────────────┘
                                                  │
                                       ┌──────────▼───────────────┐
                                       │   Redis (Broker/Cache)    │
                                       └──────────┬───────────────┘
                                                  │
                                       ┌──────────▼───────────────┐
                                       │   Celery Worker           │
                                       │ • BRIA RMBG-1.4 (rembg)  │
                                       │ • OpenCV (inpainting)     │
                                       │ • PIL / libvips           │
                                       │ • Workflow runner         │
                                       └──────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Zustand, Framer Motion |
| Backend | Python 3.10+, Django 4.x, Django REST Framework |
| Task Queue | Celery 5, Redis |
| Image Processing | OpenCV, rembg + BRIA RMBG-1.4, Pillow |
| AI / LLM | Google Gemini (server-side proxy) |
| Database | PostgreSQL |
| Storage | Local (dev) → S3-compatible (prod) |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Redis running on `localhost:6379`
- PostgreSQL database named `lumio_db`

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file
# GEMINI_API_KEY=your_key_here

# Run migrations
python manage.py migrate

# Pre-download the BRIA RMBG-1.4 model (one-time, ~170 MB)
python download_model.py

# Start Django dev server on port 8001
python manage.py runserver 8001

# In a separate terminal — start Celery worker
celery -A lumio_backend worker --loglevel=info -P solo
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

The frontend communicates with the backend at `http://localhost:8001` (configured in `frontend/.env.local`).

---

## 📁 Project Structure

```
PHOTOTOOL/
├── backend/
│   ├── api/
│   │   ├── models.py          # Project, Image, EditHistory, Workflow
│   │   ├── views.py           # ImageViewSet, AIPlannerView, WorkflowViewSet
│   │   ├── tasks.py           # Celery tasks: adjustments, bg-removal, healing,
│   │   │                      #   clone_stamp, workflow runner
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── lumio_backend/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── celery.py
│   ├── download_model.py      # Pre-warm BRIA RMBG-1.4 via rembg
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/        # Main editing canvas + all overlay tools
│   │   │   ├── LeftPanel/     # History, Adjustment Layers, Assets
│   │   │   ├── RightPanel/    # Adjustments, Curves, HSL, Presets, Export,
│   │   │   │                  #   Text Layers, Color Grading, Layer Context
│   │   │   └── TopBar/        # Toolbar, tool selection, AI chat trigger
│   │   ├── store/
│   │   │   └── editorStore.ts # Zustand global state (incl. adjustmentLayers)
│   │   ├── services/
│   │   │   └── api.ts         # Backend API client
│   │   └── utils/
│   │       └── pixelPipeline.ts # Real-time multi-layer canvas processing
│   ├── .env.local             # VITE_API_BASE_URL=http://localhost:8001
│   └── package.json
├── plan.md                    # Full product roadmap
└── README.md
```

---

## 🗺️ Roadmap

| Module | Status |
|--------|--------|
| 1 — Image Workspace (canvas, zoom, pan, compare) | ✅ Done |
| 2 — AI Chat Panel (Gemini LLM + regex fallback) | ✅ Done |
| 3 — Edit History (undo/redo + branching) | ✅ Done |
| 4 — Layer System (adjustment, text, shape layers) | ✅ Done |
| 5 — Lightroom Features (sliders, curves, HSL, color grading) | ✅ Done |
| 6 — Photoshop Features (crop, clone stamp, healing, bg removal) | ✅ Done |
| 7 — AI Planner (NL → edit params via Gemini) | ✅ Done |
| 8 — Computer Vision (BRIA RMBG-1.4 segmentation) | ✅ Done |
| 9 — Generative AI (LaMa Content-Aware Object Removal) | ✅ Done |
| 10 — Automation Workflows (named multi-step Celery tasks) | ✅ Done |
| 11 — Batch Processing (bulk apply workflows to 100s of images) | ✅ Done |
| 12 — Presets (built-in + custom) | ✅ Done |

---

## 📜 License

MIT © 2026 Lumio
