# Lumio — AI-Native Image Editing Platform

> Photoshop-level capability · Lightroom-level workflow · ChatGPT-level simplicity

Lumio is a production-grade, AI-native image editing platform built for content creators, e-commerce sellers, photographers, and marketing teams. It combines professional-grade editing tools with AI-powered automation in a sleek, modern interface.

---

## ✨ Features

### Implemented
- **Lightroom-style Adjustments** — Exposure, Brightness, Contrast, Saturation, Hue, Temperature, Tint, Highlights, Shadows, Sharpness, Vignette
- **HSL Panel** — Per-hue Hue/Saturation/Luminance control across 8 color channels
- **Background Removal** — AI-powered rembg (U2Net) via Celery worker
- **Spot Healing Brush** — OpenCV inpainting (TELEA algorithm), GPU-accelerated
- **Crop & Rotate** — Interactive overlay with corner handles and floating toolbar
- **Presets** — Built-in editorial presets + custom user-saved presets (localStorage)
- **Edit History** — Full undo/redo with branching snapshot model
- **Canvas Pipeline** — Real-time pixel-level adjustment preview (no server round-trips)
- **Before/After Compare** — Hold-to-compare against original image
- **Export** — JPEG/PNG/WebP with quality control

### Coming Next
- AI Chat Panel (natural language editing)
- Text & Shape Layers
- Clone Stamp Tool
- Batch Processing & Workflow Engine
- Sky Replacement
- Content-Aware Fill / Object Removal
- Authentication & User Accounts
- S3 Storage Integration

---

## 🏗️ Architecture

```
┌─────────────────┐     REST API      ┌──────────────────────┐
│   React Frontend │ ◄────────────── ► │   Django Backend      │
│   (Vite + TS)   │                   │   (DRF + Celery)      │
└─────────────────┘                   └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │   Redis (Broker)      │
                                       └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │   Celery Worker       │
                                       │ • rembg (bg removal)  │
                                       │ • OpenCV (inpainting) │
                                       │ • PIL / libvips       │
                                       └──────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Zustand, Framer Motion |
| Backend | Python 3.8, Django 4.x, Django REST Framework |
| Task Queue | Celery 5, Redis |
| Image Processing | OpenCV, rembg, Pillow |
| Database | SQLite (dev) → PostgreSQL (prod) |
| Storage | Local (dev) → S3-compatible (prod) |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Node.js 18+
- Redis (running on `localhost:6379`)

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start Django dev server
python manage.py runserver

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

---

## 📁 Project Structure

```
PHOTOTOOL/
├── backend/
│   ├── api/
│   │   ├── models.py          # Project, Image, EditHistory, Workflow
│   │   ├── views.py           # ImageViewSet (process, remove_background, heal)
│   │   ├── tasks.py           # Celery tasks (adjustments, bg-removal, healing)
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── lumio_backend/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── celery.py
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/        # Main editing canvas + crop/heal overlays
│   │   │   ├── LeftPanel/     # History, Layers, Assets
│   │   │   ├── RightPanel/    # Adjustments, HSL, Presets, Export
│   │   │   └── TopBar/        # Toolbar, tool selection
│   │   ├── store/
│   │   │   └── editorStore.ts # Zustand global state
│   │   ├── services/
│   │   │   └── api.ts         # Backend API client
│   │   └── utils/
│   │       └── pixelPipeline.ts # Real-time canvas processing
│   └── package.json
├── plan.md                    # Full product roadmap
└── README.md
```

---

## 📜 License

MIT © 2026 Lumio
