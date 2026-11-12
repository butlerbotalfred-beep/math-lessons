"""Makes Steve's spoken lines for the challenges (assessment exams), in Steve's own voice (Kokoro style blend in
voice/steve.bin: 0.6 am_michael + 0.4 am_puck, speed 0.9, half a second between sentences).
usage (repo root): python3 tools/exam_voice.py [exam ids...]   (no ids = every challenges/exams/*.json)
Writes challenges/audio/<hash>.mp3 (one file per distinct text, shared by all exams), challenges/exams/<id>.audio.json
({key: file} for "intro", "outro", "q1", "q1.why", "q1.o0" ...) and challenges/audio/common.json for the shared
feedback lines below. Text a child must read himself ("text" on read questions) is never voiced.
{...} in a text is a count, said slowly as one piece. Kokoro model files: $KOKORO_DIR (default /tmp/claude-0/kok)
holding kokoro-int8.onnx and voices-v1.0.bin."""
import glob, hashlib, json, os, re, subprocess, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

COMMON = {
    "right0": "Yes! Great job!", "right1": "You got it!", "right2": "That's right! Awesome!",
    "again": "Hmm, good try. Let's try a different one.",
    "reveal": "That was a tricky one. Here's the answer. Let's keep going!",
    "readdone0": "Great reading! Thank you!", "readdone1": "Nice work! I heard you!",
    "whydone": "Thanks for telling me!",
    "skip": "Want to skip this one? Tap the arrow again to skip.",
    "skipped": "That's okay! Let's do the next one.",
    "nomic": "I can't hear you right now. Ask a grown-up to help me hear you.",
    "stopping": "Let's stop here for today. You can finish later!",
}

kd = os.environ.get("KOKORO_DIR", "/tmp/claude-0/kok")
K = Kokoro(f"{kd}/kokoro-int8.onnx", f"{kd}/voices-v1.0.bin")
SR = 24000
STY = np.fromfile("voice/steve.bin", dtype=np.float32).reshape(510, 1, 256).copy()
STY[:40] = STY[40]   # short pieces slur with the low style rows

def pieces(text):
    out = []
    for slow, plain in re.findall(r"\{([^}]*)\}|([^{}]+)", text):
        if slow: out.append((slow.strip(), 0.7))
        else: out += [(s.strip(), 0.9) for s in re.split(r"(?<=[.?!:])\s+", plain) if s.strip()]
    return out
def trim(s, th=0.004):
    i = np.where(np.abs(s) > th)[0]
    return s if not len(i) else s[max(0, i[0] - 480): i[-1] + 1440]
def make(text, out):
    pcs = []
    for t, sp in pieces(text):
        s, _ = K.create(t, voice=STY, speed=sp, lang="en-us")
        gap = 0.4 if t.endswith(":") else 0.5
        pcs += [trim(np.asarray(s, np.float32)), np.zeros(int(gap * SR), np.float32)]
    a = np.concatenate([np.zeros(int(0.08 * SR), np.float32)] + pcs[:-1] + [np.zeros(int(0.15 * SR), np.float32)])
    wav = out[:-4] + ".wav"; sf.write(wav, a, SR)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ar", "44100", "-b:a", "64k", out], check=True); os.remove(wav)

name = lambda t: hashlib.sha1(("steve|" + t).encode()).hexdigest()[:12] + ".mp3"
os.makedirs("challenges/audio", exist_ok=True)
want = {}
def use(index, key, text):
    if not text: return
    index[key] = name(text); want[name(text)] = text

common = {}
for k, t in COMMON.items(): use(common, k, t)
json.dump(common, open("challenges/audio/common.json", "w"), indent=0)

ids = sys.argv[1:] or [os.path.basename(p)[:-5] for p in glob.glob("challenges/exams/*.json") if not p.endswith(".audio.json")]
for eid in ids:
    ex = json.load(open(f"challenges/exams/{eid}.json")); index = {}
    use(index, "intro", ex.get("intro")); use(index, "outro", ex.get("outro"))
    for q in ex["questions"]:
        use(index, q["id"], q["say"]); use(index, q["id"] + ".why", q.get("why"))
        for i, o in enumerate(q.get("options", [])):
            # a one-word answer is said inside "Is it ...?" so Kokoro doesn't mumble it
            s = o.get("say")
            if s and len(s.split()) == 1: s = f"Is it {s}?"
            use(index, f"{q['id']}.o{i}", s)
    json.dump(index, open(f"challenges/exams/{eid}.audio.json", "w"), indent=0)

made = 0
for f, t in want.items():
    p = f"challenges/audio/{f}"
    if not os.path.exists(p): make(t, p); made += 1; print(f, t[:70], flush=True)
print(len(want), "lines,", made, "new")
