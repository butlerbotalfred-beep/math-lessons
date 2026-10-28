"""Makes the worksheet's spoken lines for one lesson: each box's question and its explanation (said after three
misses), with the narrator voice (Kokoro af_heart, speed 0.92, half a second between sentences).
usage (repo root): node tools/ws_texts.js p46 > /tmp/p46.json && python3 tools/ws_voice.py p46 /tmp/p46.json
Writes pNN/ws/<hash>.mp3 (one file per distinct text) and pNN/ws/index.json ({box id: {q: file, x: file}}), and
removes files no longer used. {...} in a text is a count, said slowly as one piece: Kokoro garbles words said alone.
Kokoro model files: $KOKORO_DIR (default /tmp/claude-0/kok) holding kokoro-int8.onnx and voices-v1.0.bin."""
import hashlib, json, os, re, subprocess, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

pid, texts = sys.argv[1], json.load(open(sys.argv[2]))
kd = os.environ.get("KOKORO_DIR", "/tmp/claude-0/kok")
K = Kokoro(f"{kd}/kokoro-int8.onnx", f"{kd}/voices-v1.0.bin")
SR = 24000
STY = K.get_voice_style("af_heart").copy(); STY[:40] = STY[40]   # short pieces slur with the low style rows

def pieces(text):
    out = []
    for slow, plain in re.findall(r"\{([^}]*)\}|([^{}]+)", text):
        if slow: out.append((slow.strip(), 0.7))
        else: out += [(s.strip(), 0.92) for s in re.split(r"(?<=[.?!])\s+", plain) if s.strip()]
    return out
def trim(s, th=0.004):
    i = np.where(np.abs(s) > th)[0]
    return s if not len(i) else s[max(0, i[0] - 480): i[-1] + 1440]
def make(text, out):
    gap = np.zeros(int(0.5 * SR), np.float32); pcs = []
    for t, sp in pieces(text):
        s, _ = K.create(t, voice=STY, speed=sp, lang="en-us"); pcs += [trim(np.asarray(s, np.float32)), gap]
    a = np.concatenate([np.zeros(int(0.08 * SR), np.float32)] + pcs[:-1] + [np.zeros(int(0.15 * SR), np.float32)])
    wav = out[:-4] + ".wav"; sf.write(wav, a, SR)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ar", "44100", "-b:a", "64k", out], check=True); os.remove(wav)

d = f"{pid}/ws"; os.makedirs(d, exist_ok=True)
name = lambda t: hashlib.sha1(t.encode()).hexdigest()[:10] + ".mp3"
index, want = {}, {}
for b in texts:
    index[b["id"]] = {"q": name(b["ask"]), "x": name(b["why"])}
    want[name(b["ask"])] = b["ask"]; want[name(b["why"])] = b["why"]
for f, t in want.items():
    if not os.path.exists(f"{d}/{f}"): make(t, f"{d}/{f}"); print(f, t[:70], flush=True)
for f in os.listdir(d):
    if f.endswith(".mp3") and f not in want: os.remove(f"{d}/{f}")
json.dump(index, open(f"{d}/index.json", "w"), indent=0)
print(pid, len(texts), "boxes,", len(want), "lines")
