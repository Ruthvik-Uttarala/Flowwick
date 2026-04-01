const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are an elite ecommerce copywriter.

STRICT RULES:
- NEVER hallucinate information
- NEVER add details not present in input
- ALWAYS preserve original meaning
- ONLY rewrite wording for clarity and appeal
- DO NOT change product attributes
- DO NOT invent materials, sizes, or features
- Output ONLY the rewritten text
- NO quotes
- NO explanations`;

function buildTitlePrompt(text: string): string {
  return `Rewrite this product title:
- Make it short, catchy, premium
- Maximum 10 words
- Preserve exact meaning
- Do not remove key product identifiers

INPUT:
${text}`;
}

function buildDescriptionPrompt(text: string, targetSentences: number): string {
  return `Rewrite this product description:

RULES:
- Preserve ALL details
- DO NOT hallucinate
- DO NOT remove information
- Maintain original meaning

FORMAT:
- EXACTLY ${targetSentences} sentences
- Improve clarity, flow, and premium tone

INPUT:
${text}`;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

async function callOpenAI(messages: OpenAIMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OpenAIResponse;

  if (!response.ok) {
    const errMsg = data?.error?.message ?? `OpenAI request failed with status ${response.status}.`;
    throw new Error(errMsg);
  }

  const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return content;
}

export async function enhanceTitleViaOpenAI(titleRaw: string): Promise<string> {
  if (!titleRaw.trim()) {
    throw new Error("Title is empty.");
  }

  const enhanced = await callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildTitlePrompt(titleRaw) },
  ]);

  return enhanced.slice(0, 255);
}

export async function enhanceDescriptionViaOpenAI(descriptionRaw: string): Promise<string> {
  if (!descriptionRaw.trim()) {
    throw new Error("Description is empty.");
  }

  const sentenceCount = descriptionRaw.split(/[.!?]+/).filter(Boolean).length;
  const targetSentences = sentenceCount < 5 ? 5 : sentenceCount;

  const enhanced = await callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildDescriptionPrompt(descriptionRaw, targetSentences) },
  ]);

  return enhanced;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
