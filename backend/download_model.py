"""
Download the rembg u2net.onnx model to the correct location.
Run this once: python download_model.py
"""
import os
import sys
import urllib.request
from pathlib import Path

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"

# rembg/pooch stores models here on Windows
DEST_DIR = Path.home() / ".u2net"
DEST_FILE = DEST_DIR / "u2net.onnx"

def show_progress(block_num, block_size, total_size):
    downloaded = block_num * block_size
    if total_size > 0:
        pct = min(downloaded / total_size * 100, 100)
        mb = downloaded / 1_048_576
        total_mb = total_size / 1_048_576
        sys.stdout.write(f"\r  {pct:5.1f}%  {mb:.1f} / {total_mb:.1f} MB   ")
        sys.stdout.flush()

def main():
    DEST_DIR.mkdir(parents=True, exist_ok=True)

    if DEST_FILE.exists() and DEST_FILE.stat().st_size > 10_000_000:
        size_mb = DEST_FILE.stat().st_size / 1_048_576
        print(f"[OK] Model already present: {DEST_FILE}  ({size_mb:.1f} MB)")
        print("     If removal still fails, delete the file and re-run.")
        return

    print(f"Downloading u2net.onnx (~175 MB) ...")
    print(f"Destination: {DEST_FILE}\n")

    try:
        urllib.request.urlretrieve(MODEL_URL, DEST_FILE, show_progress)
        size_mb = DEST_FILE.stat().st_size / 1_048_576
        print(f"\n\n[OK] Saved to {DEST_FILE}  ({size_mb:.1f} MB)")
        print("\nRestart the Celery worker, then try Cutout BG again.")
    except Exception as e:
        if DEST_FILE.exists():
            DEST_FILE.unlink()
        print(f"\n[FAIL] Download failed: {e}")
        print()
        print("=" * 60)
        print("MANUAL DOWNLOAD (if network is blocked):")
        print("  1. Open this URL in your browser:")
        print(f"     {MODEL_URL}")
        print(f"  2. Save the file to:")
        print(f"     {DEST_FILE}")
        print("  3. Restart the Celery worker.")
        print("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()
