function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function err(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

function sanitizeModel(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  let v = raw.trim();
  while (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || fallback;
}

function redactPII(value) {
  // Best-effort redaction. We still ask users not to upload PII.
  let s = String(value ?? "");
  // Korean resident registration number patterns.
  s = s.replace(/\b(\d{6})[- ]?(\d{7})\b/g, "$1-*******");
  // Phone numbers (loose): 0xx-xxxx-xxxx / 01x-xxx(x)-xxxx.
  s = s.replace(/\b(0\d{1,2})[- ]?(\d{3,4})[- ]?(\d{4})\b/g, "$1-****-$3");
  // Emails.
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "(email)");
  return s;
}

function deepRedact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactPII(obj);
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepRedact(v);
    return out;
  }
  return obj;
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

function mimeFromName(name, fallback = "application/octet-stream") {
  const ext = extOf(name);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "txt") return "text/plain";
  return fallback;
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

async function callOpenAI({ apiKey, model, prompt, file, extractedText, debug = false }) {
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
    const mime = file.type || mimeFromName(file.name);
    const b64 = base64FromArrayBuffer(fileBytes);
    if (mime.startsWith("image/")) {
      // For images, use the vision input shape.
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${b64}`,
      });
    } else {
      content.push({
        type: "input_file",
        filename: file.name || "template",
        // Responses API expects a data URL for base64 bytes (see OpenAI docs for PDF file inputs).
        file_data: `data:${mime};base64,${b64}`,
      });
    }
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
    // NOTE: In the Responses API, response_format moved under text.format.
    text: {
      format: {
        type: "json_schema",
        name: "school_letter_template",
        strict: true,
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

  // Debug helper: allows verifying request shape without sending user content upstream.
  // Use from POST /api/analyze-template?debug=1 with a small file.
  if (debug === true) {
    const safeBody = JSON.parse(JSON.stringify(body));
    // Avoid echoing base64 back.
    try {
      const c = safeBody?.input?.[0]?.content;
      if (Array.isArray(c)) {
        for (const item of c) {
          if (item?.type === "input_file") item.file_data = "(omitted)";
          if (item?.type === "input_image") item.image_url = "(omitted)";
        }
      }
    } catch {}
    return {
      ok: true,
      parsed: {
        has_response_format: Object.prototype.hasOwnProperty.call(safeBody, "response_format"),
        has_text_format: Boolean(safeBody?.text?.format),
        top_level_keys: Object.keys(safeBody),
        text_format_type: safeBody?.text?.format?.type || null,
        text_format_name: safeBody?.text?.format?.name || null,
        text_format_keys: safeBody?.text?.format ? Object.keys(safeBody.text.format) : [],
        input_content_types: Array.isArray(safeBody?.input?.[0]?.content)
          ? safeBody.input[0].content.map((x) => x?.type).filter(Boolean)
          : [],
        model: safeBody?.model || null,
      },
      raw: safeBody,
    };
  }

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

  // Try common locations first.
  const outText =
    (typeof data?.output_text === "string" && data.output_text) ||
    (Array.isArray(data?.output)
      ? data.output
          .flatMap((o) => o.content || [])
          .find((c) => c.type === "output_text")?.text
      : null);

  // Responses API may return output_json as { json: {...} } (preferred) or a text string.
  const outJson = Array.isArray(data?.output)
    ? data.output
        .flatMap((o) => o.content || [])
        .find((c) => c.type === "output_json")
    : null;

  if (outJson && typeof outJson.json === "object" && outJson.json) {
    return { ok: true, parsed: outJson.json, raw: data };
  }

  if (typeof outJson?.text === "string" && outJson.text.trim()) {
    try {
      return { ok: true, parsed: JSON.parse(outJson.text), raw: data };
    } catch {
      return { ok: true, parsed: outJson.text, raw: data };
    }
  }

  if (typeof outText === "string" && outText.trim()) {
    try {
      return { ok: true, parsed: JSON.parse(outText), raw: data };
    } catch {
      // Fallback: return raw text if parsing fails.
      return { ok: true, parsed: outText, raw: data };
    }
  }

  if (data?.output_parsed) return { ok: true, parsed: data.output_parsed, raw: data };
  return { ok: true, parsed: null, raw: data };
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

  const model = sanitizeModel(env.OPENAI_MODEL, "gpt-4o-mini");
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
    "In `required_fields`, list field NAMES only (e.g., '부서', '연락처', '팩스', '주소'), not actual values.\n" +
    "Make `template_skeleton` a plain text outline that can be filled, using {{placeholders}}.\n";

  const debug = url.searchParams.get("debug") === "1";
  const result = await callOpenAI({ apiKey, model, prompt, file, extractedText, debug });
  if (!result.ok) {
    return err("OpenAI request failed.", 502, { upstream: result });
  }

  // Best-effort PII redaction on the extracted template structure.
  const safeTemplate = deepRedact(result.parsed);

  return json({ ok: true, template: safeTemplate }, { status: 200 });
}
