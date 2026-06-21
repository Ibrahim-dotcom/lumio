"""
Pre-warm the BRIA RMBG-1.4 background removal model.

rembg will automatically download the model from Hugging Face
the first time a session is created. Run this once to download it:

    python download_model.py

This avoids the first-request delay on the Celery worker.
"""
import sys


def main():
    print("Initialising BRIA RMBG-1.4 via rembg...")
    print("(The model will be auto-downloaded from Hugging Face if not cached)")
    print()

    try:
        from rembg import new_session
        session = new_session('bria_rmbg')
        print("[OK] Model ready. Session created successfully.")
        print()
        print("Restart the Celery worker to pick up the new model, then try Cutout BG.")
    except Exception as e:
        print(f"[FAIL] Could not load model: {e}")
        print()
        print("=" * 60)
        print("Troubleshooting:")
        print("  1. Ensure you have internet access.")
        print("  2. Make sure rembg >= 2.0.57 is installed:")
        print("       python -m pip install -U rembg")
        print("  3. Re-run this script.")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()
