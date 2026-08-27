/** Shared AI-gateway helpers for plan generation (no secrets at module scope). */

const MODEL = "google/gemini-3.1-pro-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function callGateway(
  key: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 402) {
      throw new Error("This workspace is out of AI credits. Add credits to keep generating plans.");
    }
    if (response.status === 429) {
      throw new Error("The AI service is busy right now. Try again in a moment.");
    }
    console.error("AI gateway error", response.status, text);
    throw new Error(`Plan generation failed (${response.status}). ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI returned an empty response. Try again.");
  return content;
}

export function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unreadable plan. Try again.");
    return JSON.parse(match[0]);
  }
}

