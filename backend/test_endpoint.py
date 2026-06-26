import urllib.request
import urllib.error
import json

BASE = "http://127.0.0.1:8001/api/ai/plan/"

PROMPTS = [
    "make the sky warm",
    "smooth the skin tone",
    "darken the background",
    "make the subject pop",
    "add cinematic look",
    "make it warmer",
    "write me a poem",
]

for prompt in PROMPTS:
    req = urllib.request.Request(
        BASE,
        data=json.dumps({"prompt": prompt}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        r = urllib.request.urlopen(req, timeout=30)
        data = json.loads(r.read())
        scope = data.get('scope', '???')
        src   = data.get('source', '???')
        deltas = data.get('deltas', {})
        print(f"[{src.upper():8}] [{scope:12}] '{prompt}'")
        print(f"             => {deltas}")
    except Exception as e:
        print(f"[ERROR   ] '{prompt}' => {e}")
    print()
