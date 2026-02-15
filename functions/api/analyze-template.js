function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function err(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

function base64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function callOpenAI({ apiKey, model, prompt, file }) {
  const fileBytes = await file.arrayBuffer();
  const body = {
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_file",
            filename: file.name || "template",
            file_data: base64FromArrayBuffer(fileBytes),
          },
        ],
      },
    ],
    // Structured output (JSON Schema)
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "school_letter_template",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            doc_type: { type: "string" },
            language: { type: "string" },
            has_letterhead: { type: "boolean" },
            has_signature_block: { type: "boolean" },
            required_fields: {
              type: "array",
              items: { type: "string" },
            },
            sections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  purpose: { type: "string" },
                  fixed_phrases: { type: "array", items: { type: "string" } },
                  variable_slots: { type: "array", items: { type: "string" } },
                },
                required: ["name", "purpose", "fixed_phrases", "variable_slots"],
              },
            },
            style_guide: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone: { type: "string" },
                honorifics: { type: "string" },
                formatting_notes: { type: "array", items: { type: "string" } },
              },
              required: ["tone", "honorifics", "formatting_notes"],
            },
            rendering_rules: {
              type: "object",
              additionalProperties: false,
              properties: {
                date_format: { type: "string" },
                bullet_style: { type: "string" },
                attachments_style: { type: "string" },
              },
              required: ["date_format", "bullet_style", "attachments_style"],
            },
            template_skeleton: {
              type: "string",
              description:
                "A plain-text skeleton with placeholders like {{title}}, {{date}}, etc. No PII.",
            },
          },
          required: [
            "doc_type",
            "language",
            "has_letterhead",
            "has_signature_block",
            "required_fields",
            "sections",
            "style_guide",
            "rendering_rules",
            "template_skeleton",
          ],
        },
      },
    },
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const txt = await resp.text();
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    data = { raw: txt };
  }

  if (!resp.ok) {
    return { ok: false, status: resp.status, data };
  }

  // Responses API: structured output is usually in `output_text` for plain text,
  // but for json_schema we should read `output[...].content[...].text` or `output_parsed`.
  const parsed =
    data.output_parsed ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap((o) => o.content || [])
          .find((c) => c.type === "output_text" || c.type === "output_json")?.text
      : null);

  if (typeof parsed === "string") {
    try {
      return { ok: true, parsed: JSON.parse(parsed), raw: data };
    } catch {
      return { ok: true, parsed, raw: data };
    }
  }

  return { ok: true, parsed: data.output_parsed || null, raw: data };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return err(
      "OPENAI_API_KEY is not configured on the server. Add it in Cloudflare Pages Environment Variables.",
      501
    );
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return err("Expected multipart/form-data with a file field named 'file'.", 400);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return err("Missing file. Use field name 'file'.", 400);
  }

  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return err("File too large. Please upload a smaller file (<= 15MB).", 413, {
      maxBytes,
    });
  }

  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt =
    "You are helping a Korean elementary school teacher.\n" +
    "Analyze the attached school newsletter (가정통신문) template file and extract its structure.\n" +
    "Return a JSON object matching the provided schema. Be conservative: include only what is clearly present.\n" +
    "Do not include any real names, phone numbers, addresses, IDs, or other PII in fixed phrases. Replace with placeholders.\n" +
    "Make `template_skeleton` a plain text outline that can be filled, using {{placeholders}}.\n";

  const result = await callOpenAI({ apiKey, model, prompt, file });
  if (!result.ok) {
    return err("OpenAI request failed.", 502, { upstream: result });
  }

  return json({ ok: true, template: result.parsed }, { status: 200 });
}

