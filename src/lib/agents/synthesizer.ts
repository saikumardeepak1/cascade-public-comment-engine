import { getAnthropicClient, MODELS } from "../anthropic";
import type {
  ExtractedArgument,
  ClassifiedComment,
  ArgumentCluster,
  AgencyResponse,
  PolicyFamily,
} from "../types";

const CLUSTER_SYSTEM = `You are a senior regulatory analyst at the Oregon Department of Environmental Quality. You cluster extracted arguments from public comments into POLICY ARGUMENT FAMILIES.

CRITICAL: You cluster by LOGICAL SIMILARITY of the policy argument, NOT by wording similarity, NOT by topic keywords.

Use these hierarchical policy families as top-level categories. Every cluster MUST belong to one:

- Economic Impact
- Environmental Impact
- Administrative Burden
- Equity / Environmental Justice
- Legal Authority / Process Concerns
- Public Health
- Technical / Scientific Methodology

Two comments saying "this will cost jobs" and "small businesses can't afford compliance" belong in the SAME family (Economic Impact) even though the words are different. But "we need more air monitors in valley floors" (Technical / Scientific Methodology) is DISTINCT from "poor air quality causes asthma" (Public Health).

Mark a cluster as "requires_response: true" if the agency is legally obligated under the Oregon APA (ORS 183.335) to address it in the Response-to-Comments document. Generally: contains at least one expert testimony, OR contains a specific factual/legal challenge to the rule.

Use the language "logically similar policy arguments" not "identical arguments."

Respond with valid JSON:

{
  "clusters": [
    {
      "cluster_id": "C1",
      "policy_family": "<one of the families above>",
      "representative_claim": "<one sentence summary>",
      "argument_summary": "<2-3 sentences explaining the cluster's position and reasoning>",
      "comment_ids": ["<id1>", "<id2>"],
      "expert_count": <integer>,
      "requires_response": <boolean>,
      "technical_domain": "<specific sub-area>"
    }
  ]
}

Target 5-12 clusters. Prioritize completeness for expert/substantive arguments.`;

const RESPONSE_SYSTEM = `You are drafting a "DRAFT Staff Review Response" section for the Oregon Department of Environmental Quality's Response-to-Comments document.

CRITICAL FRAMING RULES:
- This is a DRAFT for staff review, NOT a final legal determination, NOT an authoritative ruling.
- Always label output as "DRAFT STAFF REVIEW RESPONSE"
- Use language like "The Department notes..." or "Staff review indicates..." or "Upon preliminary review, the Department observes..."
- NEVER use "The Department has determined..." or "It is the Department's final position..."

Style requirements:
- Formal, neutral, third-person regulatory voice.
- Address commenters as "the commenter(s)" or by organizational affiliation for experts.
- Acknowledge the substance of the argument before responding.
- If the agency would likely agree, state what change might be considered.
- If the agency would likely disagree, state the factual or legal basis.
- Cite commenters by ID in parentheses, e.g., (OR-DEQ-2026-04127).
- Length: 200-400 words.

Begin the response with: "DRAFT STAFF REVIEW RESPONSE — [Policy Family Name]"

Output ONLY the response section text. No JSON, no markdown headers.`;

export async function clusterArguments(
  args: ExtractedArgument[],
  classified: ClassifiedComment[]
): Promise<ArgumentCluster[]> {
  const expertIds = new Set(
    classified.filter((c) => c.category === "expert_testimony").map((c) => c.id)
  );

  const argsList = args
    .map(
      (a) =>
        `${a.comment_id}${expertIds.has(a.comment_id) ? " [EXPERT]" : ""}: claim=${a.claim} | evidence=${a.evidence} | mechanism=${a.mechanism} | policy_area=${a.policy_area}`
    )
    .join("\n");

  const response = await getAnthropicClient().messages.create({
    model: MODELS.synthesizer,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: CLUSTER_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Cluster the following ${args.length} extracted arguments into policy argument families:\n\n${argsList}`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in synthesizer response");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in synthesizer response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { clusters: ArgumentCluster[] };
  return parsed.clusters;
}

export async function draftAgencyResponse(
  cluster: ArgumentCluster,
  args: ExtractedArgument[],
  classified: ClassifiedComment[]
): Promise<AgencyResponse> {
  const clusterArgs = args.filter((a) => cluster.comment_ids.includes(a.comment_id));
  const clusterComments = classified.filter((c) => cluster.comment_ids.includes(c.id));

  const argDetails = clusterArgs
    .map((a) => {
      const cmt = clusterComments.find((c) => c.id === a.comment_id);
      const orgLine = cmt?.submitter_org ? ` (${cmt.submitter_org})` : "";
      return `[${a.comment_id}] ${cmt?.submitter}${orgLine}\nClaim: ${a.claim}\nEvidence: ${a.evidence}\nMechanism: ${a.mechanism}\nAffected parties: ${a.affected_parties}`;
    })
    .join("\n\n");

  const response = await getAnthropicClient().messages.create({
    model: MODELS.synthesizer,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: RESPONSE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Draft the staff review response for this policy argument family.

POLICY FAMILY: ${cluster.policy_family}
CLUSTER: ${cluster.representative_claim}
DOMAIN: ${cluster.technical_domain}
COMMENT COUNT: ${cluster.comment_ids.length}
EXPERT COMMENTS IN CLUSTER: ${cluster.expert_count}

ARGUMENTS:
${argDetails}`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const citations = clusterComments.map((c) => ({
    comment_id: c.id,
    submitter: c.submitter,
    submitter_org: c.submitter_org,
    quote: c.text.slice(0, 250) + (c.text.length > 250 ? "..." : ""),
  }));

  return {
    cluster_id: cluster.cluster_id,
    policy_family: cluster.policy_family as PolicyFamily,
    draft_label: "DRAFT STAFF REVIEW RESPONSE",
    response_text: text.trim(),
    citations,
  };
}
