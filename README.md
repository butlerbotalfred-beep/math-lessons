# Math Lessons

Joshua's workbook math lessons for the iPad: each lesson's video with questions, the worksheet on screen, saved scores, and Pip the owl, who answers spoken questions.

- Site: plain HTML served by GitHub Pages from this branch. Open it in Safari on the iPad (Pip's listening only works in Safari, not from a Home Screen web app).
- Pip's answers: `supabase/functions/ask-pip` runs in the Supabase project `homeschool-pip` and calls Claude (Haiku). The Anthropic key is stored there as the `ANTHROPIC_API_KEY` secret and never sits in these pages.
- Scores are kept in the iPad's browser storage (`mathapp:pNN`).
- Pip's voice: the same Kokoro voice as the videos ("am_puck"), made on the iPad by `voice/pip-voice-worker.js` (onnxruntime-web + espeak-ng phonemizer, int8 Kokoro model in `voice/`). Source is `tools/pip-voice-worker.src.js`; rebuild with `npx esbuild tools/pip-voice-worker.src.js --bundle --format=esm --minify --outfile=voice/pip-voice-worker.js` after `npm i onnxruntime-web phonemizer`. Fixed lines in `voice/lines/` were made with kokoro-onnx in Python.
