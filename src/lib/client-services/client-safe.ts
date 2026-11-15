/**
 * Client-safe text check — the gate on the one channel where internal work
 * crosses the wall: text that ALO Labs sends to a client.
 *
 * Output produced inside AgentOS can mention the things a client must never
 * learn (which systems produced it, model or vendor names, prompts, internal
 * identifiers, running costs). Before any such text becomes a deliverable or a
 * message, it is checked here. A hit blocks publication; the reviewer edits
 * the content and tries again.
 *
 * This is a safety net behind human review, not a replacement for it.
 */

interface Rule { label: string; pattern: RegExp }

const RULES: readonly Rule[] = [
  { label: 'internal platform name', pattern: /\bagent\s?os\b/i },
  { label: 'internal workforce reference', pattern: /\b(ai|virtual)\s+(agents?|employees?|workforce)\b|\b(sub-?agents?|multi-?agent|agent\s+(id|name|swarm|team|pool|registry|handoff|profile)s?)\b|\bagent[-_#]\w*\d+\b/i },
  { label: 'internal department reference', pattern: /\b\d{2,}\s+(internal\s+)?departments?\b|\bdepartment\s+(id|#)\s*\w+/i },
  { label: 'workforce size', pattern: /\b\d[\d,]{2,}\s*\+?\s*(ai\s+)?(agents?|ai employees)\b/i },
  { label: 'model provider name', pattern: /\b(openai|anthropic|openrouter|groq|ollama|hugging\s?face|together\.?ai|mistral(\s?ai)?|deepseek|cohere|perplexity|fireworks\s?ai|cerebras|xai|vertex\s?ai|azure\s+openai|bedrock)\b/i },
  { label: 'model name', pattern: /\b(gpt-?\d[\w.-]*|chatgpt|claude[\w .-]*|gemini[\w .-]*|llama[\w .-]*\d|mixtral[\w-]*|qwen[\w.-]*|phi-?\d[\w.-]*|gemma[\w.-]*|o[134]-(mini|preview)|kimi[\w.-]*|grok[\w.-]*)\b/i },
  { label: 'model routing detail', pattern: /\b(model\s+(router|routing|registry|gateway|fallback)|fail-?over|fallback\s+(model|provider)|free[- ](tier|model|api)s?|llm\s+(gateway|router|provider))\b/i },
  { label: 'prompt or instruction detail', pattern: /\b(system\s+(prompt|instructions?|message)|prompt\s+(template|engineering|chain)|few-?shot)\b/i },
  { label: 'orchestration detail', pattern: /\b(orchestrat(or|ion)|task\s+queue|run\s+id|trace\s+id|tool\s+calls?|delegat(ed|ion)\s+to|handed\s+off\s+to)\b/i },
  { label: 'internal cost or usage', pattern: /\b(\d[\d,.]*\s*(k\s+)?tokens?|token\s+(usage|count|cost|budget)|(inference|api|model|compute)\s+(cost|spend|usage)s?|cost\s+per\s+(token|run|call))\b/i },
  { label: 'machine-authorship disclaimer', pattern: /\bas an? (ai|large)\s+(language\s+)?(model|assistant)\b|\bi am an ai\b/i },
];

export interface ClientSafeFinding { label: string; excerpt: string }

/** Every reason this text should not be shown to a client. Empty = safe. */
export function findInternalDetail(text: string): ClientSafeFinding[] {
  if (!text) return [];
  const findings: ClientSafeFinding[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) findings.push({ label: rule.label, excerpt: match[0].slice(0, 60) });
  }
  return findings;
}

export function isClientSafe(text: string): boolean {
  return findInternalDetail(text).length === 0;
}
