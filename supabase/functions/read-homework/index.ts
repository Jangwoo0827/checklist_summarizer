// Reads a homework photo with Gemini and returns plain checklist text.
// The Gemini key never reaches the browser: set it as the GEMINI_API_KEY secret.
// Only signed-in users of this project can call it; the optional ALLOWED_USERS secret
// (comma-separated emails) narrows that further.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `이 사진은 학생의 숙제나 할 일 목록이에요. 사진 속 할 일을 빠짐없이 그대로 옮겨 적어주세요.
규칙:
- 사진에 있는 글자만 쓰고, 없는 내용을 지어내지 마세요.
- 큰 항목은 "1. 문법"처럼 번호와 마침표로 시작해요.
- 큰 항목 아래 세부 항목은 앞에 공백 4칸을 두고 "1) 워크북 p.10"처럼 써요. 그 아래 단계는 공백 8칸씩 늘려요.
- 사진에 번호가 없으면 위 형식으로 번호를 붙여주세요.
- 설명, 인사말, 코드블록 없이 목록 텍스트만 출력하세요.
- 할 일을 찾을 수 없으면 아무것도 출력하지 마세요.`;

const MAX_IMAGE_CHARS = 8_000_000; // ~6MB of base64

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST만 돼요." }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았어요." }, 500);

  // Ask Supabase Auth who owns this access token (works with any signing-key setup).
  const auth = req.headers.get("Authorization") || "";
  const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" },
  });
  if (!who.ok) return json({ error: "로그인해야 사진 인식을 쓸 수 있어요." }, 401);
  const email = String((await who.json()).email || "").toLowerCase();
  const allowed = (Deno.env.get("ALLOWED_USERS") || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return json({ error: "이 계정은 사진 인식을 쓸 수 없어요." }, 403);

  let body: { image?: string; mimeType?: string };
  try { body = await req.json(); } catch { return json({ error: "요청 형식이 잘못됐어요." }, 400); }

  const image = String(body.image || "");
  const mimeType = String(body.mimeType || "image/jpeg");
  if (!image || !/^image\//.test(mimeType)) return json({ error: "사진이 없어요." }, 400);
  if (image.length > MAX_IMAGE_CHARS) return json({ error: "사진이 너무 커요." }, 413);

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: image } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    console.error("gemini error", res.status, detail.slice(0, 500));
    if (res.status === 429) return json({ error: "오늘 무료 사용량을 다 썼어요. 내일 다시 해주세요." }, 429);
    return json({ error: "Gemini가 사진을 읽지 못했어요." }, 502);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p.text || "").join("")
    .replace(/^```[a-z]*\n?|```$/gim, "").trim();
  return json({ text });
});
