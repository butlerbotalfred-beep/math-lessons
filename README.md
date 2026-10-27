# Math Lessons

Joshua's workbook math lessons for the iPad: each lesson's video with questions, the worksheet on screen, saved scores, and Steve, the boy hero who answers spoken questions.

- Site: plain HTML served by GitHub Pages from this branch. Open it in Safari on the iPad (Steve's listening only works in Safari, not from a Home Screen web app).
- Steve's answers: `supabase/functions/ask-pip` runs in the Supabase project `homeschool-pip` and calls Claude (Haiku). The Anthropic key is stored there as the `ANTHROPIC_API_KEY` secret and never sits in these pages.
- Scores are kept in the iPad's browser storage (`mathapp:pNN`).
- Steve's voice: the same Kokoro voice as the videos ("am_puck"), made on the iPad by `voice/pip-voice-worker.js` (onnxruntime-web + espeak-ng phonemizer, int8 Kokoro model in `voice/`). Source is `tools/pip-voice-worker.src.js`; rebuild with `npx esbuild tools/pip-voice-worker.src.js --bundle --format=esm --minify --outfile=voice/pip-voice-worker.js` after `npm i onnxruntime-web phonemizer`. Fixed lines in `voice/lines/` were made with kokoro-onnx in Python.
- Walkable world (pilot on page 45, `p45/world.html`): the lesson video is cut into one clip per question using the QUIZ cue times in the lesson's `index.html`, each clip grows out of a signpost and shrinks back into it after a right answer, coins pop out (4, 3, 2 or 1 by try), and Steve walks to the next sign. The last stop is the interactive worksheet (3 tries per box, 1 coin per right box). Shared code is in `world/`; spoken prompts are in `world/voice/` and the page's `audio/ws-*.mp3`. Progress is saved under `mathapp:pNN:world`.
