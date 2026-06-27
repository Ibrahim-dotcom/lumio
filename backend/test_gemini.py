import urllib.request
import urllib.error
import json

import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY", "")

# Try multiple models in order of preference
MODELS = [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
]

payload = {
    "contents": [{"parts": [{"text": "Return only this JSON: {\"test\": true}"}]}],
    "generationConfig": {"responseMimeType": "application/json"}
}

for MODEL in MODELS:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    print(f"\nTrying: {MODEL}")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        r = urllib.request.urlopen(req, timeout=20)
        data = json.loads(r.read())
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        print(f"  SUCCESS: {text}")
        break
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        print(f"  HTTPError {e.code}: {body}")
    except Exception as e:
        print(f"  Error: {e}")
