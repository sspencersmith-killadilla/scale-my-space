/** Shared AI-gateway helpers for plan generation (no secrets at module scope). */

const MODEL = "google/gemini-3.1-pro-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** A gateway failure that carries the pass it happened in and whether retrying can help. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly pass: string,
    readonly retryable: boolean,
    readonly upstream: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/** Human label for each generation pass, used in logs and user-facing errors. */
export const PASS_LABELS = {
  read: "reading the photos",
  measure: "measuring the subject",
  review: "reviewing the draft",
  detail: "adding shape detail",
} as const;

export type PassName = keyof typeof PASS_LABELS;

export async function callGateway(
  key: string,
  body: Record<string, unknown>,
  pass: PassName = "measure",
): Promise<string> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const label = PASS_LABELS[pass];
    // Log the shape of what we sent so a 400 can be traced without the photos.
    console.error("AI gateway error", {
      pass,
      status: response.status,
      upstream: text.slice(0, 600),
      hasSchema: Boolean(body['response_format']),
    });

    if (response.status === 402) {
      throw new GatewayError(
        "This workspace is out of AI credits. Add credits to keep generating plans.",
        402,
        pass,
        false,
        text,
      );
    }
    if (response.status === 403) {
      throw new GatewayError(
        "AI access is blocked for this workspace. An admin needs to re-enable it.",
        403,
        pass,
        false,
        text,
      );
    }
    if (response.status === 429) {
      throw new GatewayError(
        "The AI service is busy right now. Try again in a moment.",
        429,
        pass,
        true,
        text,
      );
    }
    if (response.status >= 500) {
      throw new GatewayError(
        `The AI service failed while ${label}. Try again in a moment.`,
        response.status,
        pass,
        true,
        text,
      );
    }
    throw new GatewayError(
      `The AI request was rejected while ${label}.`,
      response.status,
      pass,
      false,
      text,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new GatewayError(
      `The AI returned nothing while ${PASS_LABELS[pass]}. Try again.`,
      200,
      pass,
      true,
      "",
    );
  }
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
