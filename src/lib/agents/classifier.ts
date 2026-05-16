import { getAnthropicClient, MODELS } from "../anthropic";
import type { RawComment, ClassifiedComment, CommentCategory } from "../types";

const SYSTEM_PROMPT = `You are an expert regulatory analyst classifying public comments submitted to the Oregon Department of Environmental Quality during a rulemaking comment period.

For each comment, you must classify it into exactly one of four categories:

1. "form_letter" — The comment is a template/mass-submitted text used by an advocacy campaign. Signs: generic political language, identical phrasing patterns, no specific local detail, no first-person specifics, no technical content.

2. "individual_opinion" — A genuine personal comment from a member of the public. Signs: first-person details (where they live, family, occupation), genuine concern expressed in their own words, may be technically uninformed but is authentically theirs.

3. "substantive_argument" — Contains a specific, reasoned argument with at least some factual basis, real-world context, or specific policy proposal. NOT just an opinion. Lay person can write these.

4. "expert_testimony" — Comment from someone with demonstrated subject-matter expertise (PhD, licensed engineer, attorney, tribal natural resources office, etc.) presenting technical/legal/scientific arguments with citations, data, regulatory references, or peer-reviewed methodology. These MUST be surfaced to the agency.

You will receive a batch of comments. Respond ONLY with valid JSON in this exact shape:
{
  "classifications": [
    { "id": "<comment_id>", "category": "<category>", "confidence": 0.0-1.0, "reasoning": "<one sentence>", "campaign_id": "<optional: 'anti_rule_campaign' or 'pro_rule_campaign' if form_letter>" }
  ]
}

Be especially careful: experts may write in passionate language, and individuals may quote experts. The signal for expert_testimony is verifiable credentials + technical specificity, not just tone.`;

const BATCH_SIZE = 25;

export async function classifyBatch(
  comments: RawComment[]
): Promise<ClassifiedComment[]> {
  const userMessage = comments
    .map((c) => {
      const orgLine = c.submitter_org ? `\nORG: ${c.submitter_org}` : "";
      return `---\nID: ${c.id}\nSUBMITTER: ${c.submitter}${orgLine}\nTEXT: ${c.text}`;
    })
    .join("\n");

  const response = await getAnthropicClient().messages.create({
    model: MODELS.classifier,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Classify the following ${comments.length} comments:\n\n${userMessage}`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in classifier response");
  }

  // Extract JSON from response (model may wrap it)
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in classifier response: " + textBlock.text.slice(0, 200));
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    classifications: Array<{
      id: string;
      category: CommentCategory;
      confidence: number;
      reasoning: string;
      campaign_id?: string;
    }>;
  };

  const byId = new Map(comments.map((c) => [c.id, c]));
  const results: ClassifiedComment[] = [];
  for (const cls of parsed.classifications) {
    const raw = byId.get(cls.id);
    if (!raw) continue;
    results.push({
      ...raw,
      category: cls.category,
      confidence: cls.confidence,
      reasoning: cls.reasoning,
      campaign_id: cls.campaign_id,
    });
  }
  return results;
}

export async function* classifyStream(
  comments: RawComment[],
  concurrency = 8
): AsyncGenerator<{ batch: ClassifiedComment[]; processed: number; total: number }> {
  const batches: RawComment[][] = [];
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    batches.push(comments.slice(i, i + BATCH_SIZE));
  }

  let processed = 0;
  const total = comments.length;

  // Process with limited concurrency, yielding as each batch returns
  let cursor = 0;
  const inflight = new Map<number, Promise<{ idx: number; result: ClassifiedComment[] }>>();

  const launch = (idx: number) => {
    const promise = classifyBatch(batches[idx])
      .then((result) => ({ idx, result }))
      .catch((err) => {
        console.error(`Batch ${idx} failed:`, err);
        return { idx, result: [] as ClassifiedComment[] };
      });
    inflight.set(idx, promise);
  };

  // Prime the pump
  while (cursor < batches.length && inflight.size < concurrency) {
    launch(cursor++);
  }

  while (inflight.size > 0) {
    const { idx, result } = await Promise.race(inflight.values());
    inflight.delete(idx);
    processed += batches[idx].length;
    yield { batch: result, processed, total };
    if (cursor < batches.length) {
      launch(cursor++);
    }
  }
}
