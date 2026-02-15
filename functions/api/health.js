function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

async function pingOpenAI(apiKey, model) {
  // Minimal request to verify the key works + outbound connectivity.
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: "ping" }] }],
      max_output_tokens: 16,
    }),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const hasKey = Boolean(env.OPENAI_API_KEY);
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  // Default: just report whether env is present. Use ?ping=1 to actually call OpenAI.
  const doPing = url.searchParams.get("ping") === "1";
  if (!doPing) {
    return json({
      ok: true,
      env: { OPENAI_API_KEY: hasKey ? "set" : "missing", OPENAI_MODEL: model },
      ping: "disabled (add ?ping=1)",
    });
  }

  if (!hasKey) {
    return json(
      {
        ok: false,
        env: { OPENAI_API_KEY: "missing", OPENAI_MODEL: model },
        error: "OPENAI_API_KEY is not configured.",
      },
      { status: 501 }
    );
  }

  const upstream = await pingOpenAI(env.OPENAI_API_KEY, model);
  if (!upstream.ok) {
    return json(
      {
        ok: false,
        env: { OPENAI_API_KEY: "set", OPENAI_MODEL: model },
        upstream,
      },
      { status: 502 }
    );
  }

  return json({
    ok: true,
    env: { OPENAI_API_KEY: "set", OPENAI_MODEL: model },
    upstream: { ok: true, status: upstream.status },
  });
}
