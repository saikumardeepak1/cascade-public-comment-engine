import { getAnthropicClient, MODELS } from "../anthropic";
import type { ClassifiedComment, ExtractedArgument } from "../types";

const SYSTEM_PROMPT = `You are an argument-mining specialist for regulatory analysis. Given a single substantive or expert public comment, you decompose it into its underlying structured argument.

This is argument decomposition, NOT summarization, NOT topic modeling.

You must produce ONE PRIMARY argument per comment (the most important one if multiple), in this exact JSON shape:

{
  "claim": "<a single declarative sentence stating what the commenter wants DEQ to do or believe>",
  "evidence": "<the strongest piece of factual support: data, citation, lived experience, or regulatory precedent>",
  "mechanism": "<the causal or legal reasoning connecting the evidence to the claim>",
  "affected_parties": "<who is harmed or benefited if DEQ does/doesn't follow the recommendation>",
  "policy_area": "<one of: air_quality, water_quality, forestry, public_health, tribal_rights, administrative_law, industrial_compliance, agriculture, economics, monitoring_methodology, other>"
}

Be precise. Use the commenter's own framing. Do not editorialize. Respond with only the JSON object.`;

export async function extractArgument(
  comment: ClassifiedComment
): Promise<ExtractedArgument | null> {
  try {
    const response = await getAnthropicClient().messages.create({
      model: MODELS.extractor,
      max_tokens: 1024,
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
          content: `COMMENT ID: ${comment.id}\nSUBMITTER: ${comment.submitter}${
            comment.submitter_org ? "\nORG: " + comment.submitter_org : ""
          }\n\n${comment.text}`,
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      comment_id: comment.id,
      claim: parsed.claim,
      evidence: parsed.evidence,
      mechanism: parsed.mechanism,
      affected_parties: parsed.affected_parties,
      policy_area: parsed.policy_area,
    };
  } catch (err) {
    console.error(`Extraction failed for ${comment.id}:`, err);
    return null;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function extractArgumentsConcurrent(
  comments: ClassifiedComment[],
  concurrency = 3,
  onProgress?: (arg: ExtractedArgument, processed: number, total: number) => void
): Promise<ExtractedArgument[]> {
  const results: ExtractedArgument[] = [];
  let processed = 0;
  const total = comments.length;

  let cursor = 0;
  const inflight = new Set<Promise<void>>();

  const launch = (comment: ClassifiedComment) => {
    const p = extractArgument(comment).then((arg) => {
      processed++;
      if (arg) {
        results.push(arg);
        onProgress?.(arg, processed, total);
      }
      inflight.delete(p);
    });
    inflight.add(p);
  };

  while (cursor < comments.length || inflight.size > 0) {
    while (inflight.size < concurrency && cursor < comments.length) {
      launch(comments[cursor++]);
      await delay(1100);
    }
    if (inflight.size > 0) {
      await Promise.race(inflight);
    }
  }

  return results;
}
