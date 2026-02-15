function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function err(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  if (!Array.isArray(data?.output)) return "";
  const content = data.output.flatMap((o) => o?.content || []);
  const first = content.find((c) => (c?.type === "output_text" || c?.type === "output_json") && typeof c?.text === "string");
  return first?.text || "";
}

async function callOpenAI({ apiKey, model, template, values }) {
  const system =
    "You are a Korean elementary school teacher assistant.\n" +
    "Generate a Korean school newsletter (가정통신문) that strictly follows the provided template structure.\n" +
    "Output must be plain text only.\n" +
    "Do not invent personal data. Use placeholders like OOO when needed.\n";

  const user =
    "TEMPLATE(JSON):\n" +
    JSON.stringify(template, null, 2) +
    "\n\nVALUES(JSON):\n" +
    JSON.stringify(values, null, 2) +
    "\n\nInstructions:\n" +
    "- Fill the template_skeleton and sections using VALUES.\n" +
    "- Preserve fixed phrases where appropriate.\n" +
    "- If a required field is missing, leave the placeholder like {{field}} or write '(미입력)'.\n" +
    "- Keep tone/honorifics per style_guide.\n";

  const body = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    max_output_tokens: 900,
    text: { format: { type: "text" } },
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { ok: false, status: resp.status, data };
  }

  const text = extractOutputText(data);
  return { ok: true, text, raw: data };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return err(
      "OPENAI_API_KEY is not configured on the server. Add it in Cloudflare Pages Environment Variables.",
      501
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return err("Expected JSON body.", 400);
  }

  const template = payload?.template;
  const values = payload?.values;
  if (!template || typeof template !== "object") return err("Missing 'template' object.", 400);
  if (!values || typeof values !== "object") return err("Missing 'values' object.", 400);

  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const result = await callOpenAI({ apiKey, model, template, values });
  if (!result.ok) {
    return err("OpenAI request failed.", 502, { upstream: result });
  }

  if (!result.text || !result.text.trim()) {
    const debug = url.searchParams.get("debug") === "1";
    return err("OpenAI returned empty text.", 502, {
      upstream: debug
        ? {
            ok: true,
            status: 200,
            output_text_len:
              typeof result.raw?.output_text === "string" ? result.raw.output_text.length : null,
            output_content_types: Array.isArray(result.raw?.output)
              ? result.raw.output.flatMap((o) => o?.content || []).map((c) => c?.type).filter(Boolean)
              : [],
            raw: result.raw,
          }
        : { ok: true, status: 200 },
    });
  }

  return json({ ok: true, text: result.text }, { status: 200 });
}
