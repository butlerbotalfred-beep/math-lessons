// Ask Pip: a child speaks a question on the lesson site, this function asks Claude and returns a short spoken-style answer.
// The Anthropic key lives in the ANTHROPIC_API_KEY secret and never reaches the page.
import Anthropic from "npm:@anthropic-ai/sdk";

const ALLOWED_ORIGINS = [
  "https://butlerbotalfred-beep.github.io",
  "http://localhost:8765",
];

const LESSONS: Record<string, string> = {
  p45: `Worksheet page 45, "Patterns Don't Always Repeat!" (Patterns of Addition). It teaches that a repeating pattern brings back the same things in the same order (red, blue, green, red, blue, green), and that a pattern can also be a rule that keeps happening even when the numbers never repeat, like adding two every time: 2, 4, 6, 8, 10. Pip the owl asked "How can that be a pattern if no numbers repeat?" and learned the RULE repeats.`,
  p46: `Worksheet page 46, "Make a Graph". It teaches sorting things into groups, tally marks (one line for each thing; the fifth line goes across the other four), coloring one box per thing to make a bar graph, reading a graph (longest bar = most, shortest bar = fewest, "in all" or "total" means add), and sorting addition facts by their sum (the number after the equals sign). Turnaround facts like 1 + 2 and 2 + 1 are two different facts. The worksheet asks him to tally and graph the addition facts for sums 1 to 5, then answer how many facts there are for the sum of 3, which sum has the most facts, which has the fewest, and how many in all for the sum of 3 and the sum of 1. Do not give those answers.`,
  p47: `Worksheet page 47, "Review Day: Sums and the Sums of 5". It reviews three tricks: adding zero keeps the number the same; counting on (start with the bigger number and count on, so 6 + 1 is "six, seven"); turning a fact around (1 + 4 is the same as 4 + 1). It also shows writing an addition sentence for two groups of blocks, and the six ways to make 5: 0 + 5, 1 + 4, 2 + 3, 3 + 2, 4 + 1, 5 + 0. The worksheet has find-the-sum problems, pictures to write addition sentences for, and "write the sums of 5". You may explain the ways to make 5 with blocks, but don't fill in his specific worksheet problems.`,
  p48: `Worksheet page 48, "Domino Facts and Turnarounds" (Review). Every domino shows a number fact: the top dots plus the bottom dots equal all the dots (2 on top and 3 on the bottom is 2 + 3 = 5). Turning a domino around gives the turnaround fact, also called the related addition fact: 2 + 3 and 3 + 2 both make 5, because it is the same dots in a different order. Dominoes that make 7: 1 + 6, 2 + 5, 3 + 4 and their turnarounds. On the worksheet he writes the fact for each domino (sums of 6) and the related fact for addition problems. Give hints, not the worksheet's answers.`,
  p49: `Worksheet page 49, "Draw Circles to Show Addition!" (Review). Each addition fact gets a box with a left side and a right side. The first number tells how many circles to draw on the left, the second number how many on the right, and counting them all gives the answer. Zero means that side stays empty, you don't draw anything. Turnaround facts (2 + 1 and 1 + 2) have the same total. The worksheet lists facts for sums 0 to 6 and he draws circles for each. Help him think about which side and how many, without drawing the whole page for him.`,
};

const RULES = `You are Pip, a friendly, playful owl who helps Joshua, a young boy (about 6 to 8 years old), with his homeschool math lesson. He cannot read yet: he asked his question out loud, and your answer will be read aloud to him by a computer voice.
His question came from speech recognition, so it may have wrong or missing words. Guess what he most likely meant. If you truly can't tell, ask him one short, simple question to find out.
How to answer:
- Use one to three short, simple sentences a six year old understands. Be warm and encouraging. Praise his thinking.
- Use tiny real-world examples with blocks, balls, fingers, or dominoes.
- Don't give the answers to his worksheet. Give a hint that helps him find it himself, like "Let's count the dots together."
- Never tell him he is wrong. Say something like "Let's check that together."
- If he asks about something that isn't math, kindly say you're a math owl and bring him back to the lesson in one sentence.
- If he seems sad or upset, or asks about anything unsafe or personal, kindly tell him to go ask his dad or a grown-up.
- Plain spoken words only. No lists, emojis, symbols, or markdown. Write numbers as digits and say "plus" and "equals" instead of + and =.`;

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// Small in-memory limit so a stuck button or a stranger can't run up the bill.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 60;
}

function cors(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) return json({ error: "rate_limited" }, 429, origin);

  let body: { page?: string; question?: string; history?: { role: string; text: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const question = String(body.question || "").trim().slice(0, 400);
  if (!question) return json({ error: "empty" }, 400, origin);
  const lesson = LESSONS[String(body.page)] || "General first-grade addition practice.";

  // Up to 3 earlier exchanges, so "what about the next one?" makes sense.
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .filter(h => (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .map(h => ({ role: h.role as "user" | "assistant", content: h.text.slice(0, 600) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length && history[history.length - 1].role === "user") history.pop();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `${RULES}\n\nToday's lesson: ${lesson}`,
      messages: [...history, { role: "user", content: question }],
    });
    if (response.stop_reason === "refusal") {
      return json({ answer: "Hoo! That's a good one to ask your dad. Let's get back to our math!" }, 200, origin);
    }
    const answer = response.content.flatMap(b => b.type === "text" ? [b.text] : []).join(" ").trim();
    return json({ answer: answer || "Hoo! Can you ask me that one more time?" }, 200, origin);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429, origin);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "no_key" }, 503, origin);
    console.error(e);
    return json({ error: "upstream" }, 502, origin);
  }
});
