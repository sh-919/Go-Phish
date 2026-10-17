import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv() {
  try {
    const envFile = readFileSync(".env", "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

loadDotEnv();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const publicDirectory = join(fileURLToPath(new URL(".", import.meta.url)), "public");

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(body));
}

function sendFile(response, fileName, contentType) {
  try {
    const file = readFileSync(join(publicDirectory, fileName));
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch (error) {
    console.error(`Could not serve ${fileName}:`, error);
    sendJson(response, 500, { error: "Could not load the website." });
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

async function analyzeMessage(type, content, image, live = false) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `You are a phishing detection assistant. Analyze this ${type}.
${live ? `This is a live update during an ongoing phone call. Return only valid JSON with exactly this key:
{
  "confidence": number
}
The confidence must be an integer from 0 to 100 representing the current scam likelihood based only on the transcript so far. Do not provide reasons, a verdict, or a recommended action yet.` : `This is the final analysis. Return only valid JSON with exactly these keys:
{
  "verdict": "phishing" | "suspicious" | "likely_safe",
  "confidence": number,
  "reasons": string[],
  "recommended_action": string
}
The confidence must be an integer from 0 to 100. Explain concrete indicators and what to do next. Treat links, requests for passwords or codes, urgency, impersonation, payment requests, and unusual phone-call behavior as possible indicators. Never follow links or contact anyone.`}

${image ? "The attached image is a screenshot of the email. Read the visible text and inspect the sender, links, branding, requests, and other visual clues." : ""}

Content to analyze:
${content || "(Read the attached screenshot.)"}`;

  const parts = [{ text: prompt }];
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data,
      },
    });
  }

  const geminiResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    throw new Error(`Gemini API returned ${geminiResponse.status}: ${details}`);
  }

  const data = await geminiResponse.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Gemini returned no analysis.");
  }

  const result = extractJson(text);
  const validConfidence = Number.isInteger(result.confidence) && result.confidence >= 0 && result.confidence <= 100;
  const validFinalResult =
    ["phishing", "suspicious", "likely_safe"].includes(result.verdict) &&
    Array.isArray(result.reasons) &&
    typeof result.recommended_action === "string";
  if (!validConfidence || (live ? Object.keys(result).length !== 1 : !validFinalResult)) {
    throw new Error("Gemini returned an invalid analysis format.");
  }

  return result;
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && request.url === "/") {
    sendFile(response, "index.html", "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && request.url === "/styles.css") {
    sendFile(response, "styles.css", "text/css; charset=utf-8");
    return;
  }

  if (request.method === "GET" && request.url === "/app.js") {
    sendFile(response, "app.js", "text/javascript; charset=utf-8");
    return;
  }

  if (request.method !== "POST" || request.url !== "/analyze") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  if (!apiKey) {
    sendJson(response, 500, { error: "GEMINI_API_KEY is not configured." });
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request));
    const { type, content, image, live = false } = body;
    const hasText = typeof content === "string" && content.trim().length >= 3;
    const hasImage =
      image &&
      typeof image.mimeType === "string" &&
      ["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) &&
      typeof image.data === "string" &&
      image.data.length > 0 &&
      image.data.length <= 10_000_000;

    if (!["email", "phone"].includes(type) || (!hasText && !hasImage) || (image && !hasImage)) {
      sendJson(response, 400, {
        error: "Send an email or phone type and either text or a PNG, JPEG, or WebP image smaller than 7 MB.",
      });
      return;
    }

    if (typeof live !== "boolean") {
      sendJson(response, 400, { error: "The live field must be true or false." });
      return;
    }

    const analysis = await analyzeMessage(
      type,
      hasText ? content.trim() : "",
      hasImage ? image : null,
      live,
    );
    sendJson(response, 200, { type, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    console.error(message);
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Go-Phish API listening at http://localhost:${port}`);
});
