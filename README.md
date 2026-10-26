# Math Lessons

Joshua's workbook math lessons for the iPad: each lesson's video with questions, the worksheet on screen, saved scores, and Pip the owl, who answers spoken questions.

- Site: plain HTML served by GitHub Pages from this branch. Open it in Safari on the iPad (Pip's listening only works in Safari, not from a Home Screen web app).
- Pip's answers: `supabase/functions/ask-pip` runs in the Supabase project `homeschool-pip` and calls Claude (Haiku). The Anthropic key is stored there as the `ANTHROPIC_API_KEY` secret and never sits in these pages.
- Scores are kept in the iPad's browser storage (`mathapp:pNN`).
