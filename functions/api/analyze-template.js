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

function extOf(name) {
  const n = (name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : "";
}

function decodeUtf8(u8) {
  return new TextDecoder("utf-8", { fatal: false }).decode(u8);
}

function stripXmlToText(xml) {
  // Very simple XML->text pass suitable for templates.
  return (xml || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function u16le(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8);
}
function u32le(bytes, off) {
  return (
    bytes[off] |
    (bytes[off + 1] << 8) |
    (bytes[off + 2] << 16) |
    (bytes[off + 3] << 24)
  ) >>> 0;
}

async function inflateMaybeRaw(dataU8) {
  // Cloudflare runtime supports DecompressionStream in Workers.
  // Zip uses raw deflate; try 'deflate-raw' first, then 'deflate'.
  const tryFormats = ["deflate-raw", "deflate"];
  for (const fmt of tryFormats) {
    try {
      const ds = new DecompressionStream(fmt);
      const stream = new Blob([dataU8]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      // try next
    }
  }
  throw new Error("Failed to inflate ZIP entry (deflate).");
}

async function unzipLocalEntries(zipBytes) {
  // Minimal ZIP reader (local file headers only). Good enough for HWPX.
  const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes);
  const out = new Map(); // name -> Uint8Array
  let off = 0;
  while (off + 30 <= bytes.length) {
    const sig = u32le(bytes, off);
    if (sig !== 0x04034b50) break;
    const method = u16le(bytes, off + 8);
    const compSize = u32le(bytes, off + 18);
    const nameLen = u16le(bytes, off + 26);
    const extraLen = u16le(bytes, off + 28);
    const nameOff = off + 30;
    const dataOff = nameOff + nameLen + extraLen;
    if (dataOff > bytes.length) break;
    const name = decodeUtf8(bytes.subarray(nameOff, nameOff + nameLen));
    const dataEnd = dataOff + compSize;
    if (dataEnd > bytes.length) break;
    const comp = bytes.subarray(dataOff, dataEnd);
    let fileData;
    if (method === 0) fileData = comp;
    else if (method === 8) fileData = await inflateMaybeRaw(comp);
    else fileData = null;
    if (fileData) out.set(name, fileData);
    off = dataEnd;
  }
  return out;
}

async function extractHwpxText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipLocalEntries(bytes);
  const xmlNames = Array.from(entries.keys())
    .filter((n) => n.toLowerCase().startsWith("contents/") && n.toLowerCase().endsWith(".xml"))
    .sort();
  if (!xmlNames.length) throw new Error("HWPX에서 XML 내용을 찾지 못했습니다.");

  const parts = [];
  for (const n of xmlNames) {
    // Prefer sections; but keep header-like docs too.
    if (!/contents\/(section\d+|header|document|content)\.xml/i.test(n)) continue;
    const xml = decodeUtf8(entries.get(n));
    const text = stripXmlToText(xml);
    if (text) parts.push(`[${n}]\n${text}`);
  }
  const joined = parts.join("\n\n").trim();
  if (!joined) throw new Error("HWPX에서 추출된 텍스트가 비어있습니다.");
  return joined;
}

async function callOpenAI({ apiKey, model, prompt, file, extractedText }) {
  const content = [{ type: "input_text", text: prompt }];
  if (extractedText) {
    // Keep within reasonable limits; raw templates can be huge.
    const maxChars = 180_000;
    const clipped = extractedText.length > maxChars ? extractedText.slice(0, maxChars) : extractedText;
    content.push({ type: "input_text", text: `\n\n[TEMPLATE_TEXT_BEGIN]\n${clipped}\n[TEMPLATE_TEXT_END]\n` });
    if (extractedText.length > maxChars) {
      content.push({ type: "input_text", text: `\nNOTE: template text was truncated to first ${maxChars} chars.\n` });
    }
  } else {
    const fileBytes = await file.arrayBuffer();
    content.push({
      type: "input_file",
      filename: file.name || "template",
      file_data: base64FromArrayBuffer(fileBytes),
    });
  }

  const body = {
    model,
    input: [
      {
        role: "user",
        content,
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
  const ext = extOf(file.name);
  let extractedText = null;
  if (ext === "hwp") {
    // Legacy HWP (OLE) parsing isn't feasible on the edge without heavy libs.
    return err(
      "HWP(.hwp) 직접 분석은 현재 지원하지 않습니다. 파일을 PDF로 저장하거나 HWPX(.hwpx)로 변환 후 업로드해 주세요.",
      415,
      { supported: ["pdf", "hwpx", "png", "jpg", "jpeg", "webp"] }
    );
  }
  if (ext === "hwpx") {
    try {
      extractedText = await extractHwpxText(file);
    } catch (e) {
      return err(String(e?.message || e || "HWPX 텍스트 추출 실패"), 415);
    }
  }

  const prompt =
    "You are helping a Korean elementary school teacher.\n" +
    "Analyze the provided school newsletter (가정통신문) template and extract its structure.\n" +
    "Return a JSON object matching the provided schema. Be conservative: include only what is clearly present.\n" +
    "Do not include any real names, phone numbers, addresses, IDs, or other PII in fixed phrases. Replace with placeholders.\n" +
    "Make `template_skeleton` a plain text outline that can be filled, using {{placeholders}}.\n";

  const result = await callOpenAI({ apiKey, model, prompt, file, extractedText });
  if (!result.ok) {
    return err("OpenAI request failed.", 502, { upstream: result });
  }

  return json({ ok: true, template: result.parsed }, { status: 200 });
}
