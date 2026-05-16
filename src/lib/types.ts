export type CommentCategory =
  | "form_letter"
  | "individual_opinion"
  | "substantive_argument"
  | "expert_testimony";

export type PolicyFamily =
  | "Economic Impact"
  | "Environmental Impact"
  | "Administrative Burden"
  | "Equity / Environmental Justice"
  | "Legal Authority / Process Concerns"
  | "Public Health"
  | "Technical / Scientific Methodology"
  | "Other";

export interface RawComment {
  id: string;
  submitter: string;
  submitter_org?: string;
  submitted_at: string;
  text: string;
}

export interface ClassifiedComment extends RawComment {
  category: CommentCategory;
  confidence: number;
  reasoning: string;
  campaign_id?: string;
}

export interface ExtractedArgument {
  comment_id: string;
  claim: string;
  evidence: string;
  mechanism: string;
  affected_parties: string;
  policy_area: string;
}

export interface ArgumentCluster {
  cluster_id: string;
  policy_family: PolicyFamily;
  representative_claim: string;
  argument_summary: string;
  comment_ids: string[];
  expert_count: number;
  requires_response: boolean;
  technical_domain: string;
}

export interface AnalysisResult {
  total_comments: number;
  classified: ClassifiedComment[];
  arguments: ExtractedArgument[];
  clusters: ArgumentCluster[];
  stats: {
    form_letters: number;
    individual_opinions: number;
    substantive: number;
    expert: number;
    unique_arguments: number;
    campaigns_detected: number;
  };
}

export interface AgencyResponse {
  cluster_id: string;
  policy_family: PolicyFamily;
  draft_label: string;
  response_text: string;
  citations: { comment_id: string; submitter: string; submitter_org?: string; quote: string }[];
}

export interface CampaignInfo {
  count: number;
  template_count: number;
  sample_text: string;
}

export interface DemoResults {
  total_comments: number;
  classified: ClassifiedComment[];
  arguments: ExtractedArgument[];
  clusters: ArgumentCluster[];
  responses: Record<string, AgencyResponse>;
  stats: {
    form_letters: number;
    individual_opinions: number;
    substantive: number;
    expert: number;
    unique_arguments: number;
    campaigns_detected: number;
  };
  campaigns: Record<string, CampaignInfo>;
}
