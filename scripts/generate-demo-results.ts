import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const comments = JSON.parse(
  readFileSync(join(process.cwd(), "data", "comments.json"), "utf-8")
);

// Classify every comment deterministically based on seed data structure
const ANTI_TEMPLATES = [
  "I oppose this proposed rule",
  "As a concerned Oregonian, I strongly oppose",
  "Please do NOT adopt this rule",
  "This rule is a job-killer",
  "I am writing to oppose the proposed rule",
];
const PRO_TEMPLATES = [
  "I support this rule",
  "Please adopt this rule",
  "I urge DEQ to adopt this rule",
  "Strongly support!",
  "Yes to this rule",
];

const EXPERT_ORGS = [
  "Oregon Health & Science University",
  "Pacific Northwest Pulp & Paper Coalition",
  "Confederated Tribes of the Umatilla Indian Reservation",
  "Oregon State University",
  "Environmental Law Alliance Worldwide",
];

interface Classified {
  id: string;
  submitter: string;
  submitter_org?: string;
  submitted_at: string;
  text: string;
  category: string;
  confidence: number;
  reasoning: string;
  campaign_id?: string;
}

const classified: Classified[] = comments.map((c: any) => {
  const isAnti = ANTI_TEMPLATES.some((t) => c.text.startsWith(t));
  const isPro = PRO_TEMPLATES.some((t) => c.text.startsWith(t));
  const isExpert = EXPERT_ORGS.some(
    (org) => c.submitter_org && c.submitter_org.includes(org)
  );

  if (isExpert) {
    return {
      ...c,
      category: "expert_testimony",
      confidence: 0.97,
      reasoning:
        "Verifiable credentials and technical/legal specificity with citations to peer-reviewed data",
    };
  }
  if (isAnti) {
    return {
      ...c,
      category: "form_letter",
      confidence: 0.99,
      reasoning:
        "Template language matching anti-rule campaign; no personal details or local specifics",
      campaign_id: "anti_rule_campaign",
    };
  }
  if (isPro) {
    return {
      ...c,
      category: "form_letter",
      confidence: 0.98,
      reasoning:
        "Template language matching pro-rule advocacy campaign; generic support without specifics",
      campaign_id: "pro_rule_campaign",
    };
  }
  // Individual opinion
  return {
    ...c,
    category: "individual_opinion",
    confidence: 0.88,
    reasoning:
      "Personal experience described with local detail; no technical evidence or campaign template match",
  };
});

const formLetters = classified.filter((c) => c.category === "form_letter");
const individuals = classified.filter((c) => c.category === "individual_opinion");
const experts = classified.filter((c) => c.category === "expert_testimony");

// Extract arguments from experts + a sample of individuals (to simulate some being substantive)
const substantiveIndividuals = individuals.slice(0, 40).map((c) => ({
  ...c,
  category: "substantive_argument" as const,
  confidence: 0.82,
  reasoning: "Contains specific factual claim or policy proposal beyond personal opinion",
}));

// Update classified with reclassified substantive
for (const s of substantiveIndividuals) {
  const idx = classified.findIndex((c) => c.id === s.id);
  if (idx !== -1) classified[idx] = s;
}

interface ExtractedArg {
  comment_id: string;
  claim: string;
  evidence: string;
  mechanism: string;
  affected_parties: string;
  policy_area: string;
}

const expertArguments: ExtractedArg[] = [
  {
    comment_id: experts[0]?.id || "OR-DEQ-2026-05123",
    claim:
      "DEQ must expand the monitoring network to include at least 12 additional valley-floor sites and adopt a 1-hour peak metric",
    evidence:
      "Chen et al. 2024 (Environmental Research Letters) shows current monitor placement undersamples valley-floor inversion zones by 34%",
    mechanism:
      "24-hour averaging smooths over peak exposure events that drive cardiopulmonary admissions; current wood-stove emission factors are outdated by 22%",
    affected_parties:
      "Residents of Willamette and Rogue valley floors, particularly children and elderly with respiratory conditions",
    policy_area: "monitoring_methodology",
  },
  {
    comment_id: experts[1]?.id || "OR-DEQ-2026-05124",
    claim:
      "DEQ should adopt a 0.5 deg C delta with shading-credit offsets instead of the proposed 0.3 deg C delta at point of discharge",
    evidence:
      "Washington Ecology WAC 173-201A-200 (2022) compliance data shows equivalent thermal-stress reduction at 40% of capital cost",
    mechanism:
      "The 0.3 deg C limit requires mechanical cooling towers consuming 4.2 MW additional load per facility, increasing carbon footprint in contradiction of OAR 340-200",
    affected_parties:
      "Seven pulp and paper facilities operating under Title V permits and their workforce; downstream salmonid populations",
    policy_area: "water_quality",
  },
  {
    comment_id: experts[2]?.id || "OR-DEQ-2026-05125",
    claim:
      "DEQ must adopt quarterly monitoring during March-October and use 90th percentile for compliance instead of annual mean",
    evidence:
      "CTUIR DNR data (2019-2025) shows nitrate exceeding 18 mg/L during May-June irrigation pulses in 11 of 14 monitored wells, masked by annual averaging",
    mechanism:
      "Annual mean dilutes seasonal peaks, producing false compliance determinations that fail to protect populations during peak exposure",
    affected_parties:
      "Tribal members and rural residents in Mission and Cayuse communities; children drinking water exceeding federal MCL seasonally",
    policy_area: "tribal_rights",
  },
  {
    comment_id: experts[3]?.id || "OR-DEQ-2026-05126",
    claim:
      "DEQ should adopt a slope-and-soil-class-weighted buffer schedule instead of the linear buffer-width model in Appendix C",
    evidence:
      "30 years of paired-watershed data from H.J. Andrews and Alsea studies; buffer effectiveness for sediment trapping is logarithmic, not linear",
    mechanism:
      "Expanding 60-foot buffers to 100 feet yields only 8% marginal benefit vs. 71% from expanding 10 to 30 feet; current rule is cost-regressive",
    affected_parties:
      "Forest landowners bearing disproportionate compliance costs; downstream water quality in Cascade Range watersheds",
    policy_area: "forestry",
  },
  {
    comment_id: experts[4]?.id || "OR-DEQ-2026-05127",
    claim:
      "Section 9.2(d) variance provision must be revised to include the seven-factor framework from Bonneville Power v. Oregon DEQ (2021)",
    evidence:
      "Northwest Environmental Defense Center v. DEQ (2018) 290 Or App 442 invalidated an identical 'good cause' variance standard as constitutionally inadequate",
    mechanism:
      "Without mandatory contested-case hearing rights and defined evidentiary standards, Section 9.2(d) is vulnerable to identical legal challenge",
    affected_parties:
      "All regulated entities seeking variances; DEQ's ability to defend the rule in court; affected communities",
    policy_area: "administrative_law",
  },
];

// Generate substantive individual arguments
const substantiveArguments: ExtractedArg[] = [
  ...substantiveIndividuals.slice(0, 8).map((c, i) => {
    const areas = [
      "public_health",
      "economics",
      "agriculture",
      "public_health",
      "economics",
      "air_quality",
      "air_quality",
      "public_health",
    ];
    const claims = [
      "Improving air quality near residential areas should be prioritized to address rising childhood asthma rates",
      "The rule should include a small-business impact analysis before finalizing compliance cost requirements",
      "Small family farms should be exempted or given phased compliance timelines to avoid disproportionate burden",
      "Low-income residents on fixed incomes need rate protections if this rule increases utility costs",
      "The timber industry should receive credit for existing water quality practices already adopted voluntarily",
      "Teachers report worsening student respiratory health; air quality standards should be strengthened",
      "Air quality for bicycle commuters and pedestrians has noticeably declined over the past decade",
      "Clinic nurses see daily health impacts of poor air quality; economic arguments ignore existing medical costs",
    ];
    const evidences = [
      "Personal observation of increased asthma rates among neighborhood children; worsening smoke days every summer",
      "The compliance costs in the proposal are unclear for businesses with fewer than 50 employees",
      "Three generations of farming experience; upstream pollution sources are the actual problem",
      "Fixed-income retiree; current utility bills already consume disproportionate share of income",
      "Industry has adopted multiple voluntary water quality practices over the past decade",
      "Direct observation of student respiratory issues in classroom setting",
      "Decade of daily bicycle commuting with observable air quality degradation in Portland",
      "Clinical data from daily patient encounters showing respiratory complaints correlated with air quality index",
    ];
    return {
      comment_id: c.id,
      claim: claims[i],
      evidence: evidences[i],
      mechanism:
        "Personal experience and local observation support the need for regulatory action in this area",
      affected_parties:
        "Local community members, workers, families, and small business owners in Oregon",
      policy_area: areas[i],
    };
  }),
];

const allArguments = [...expertArguments, ...substantiveArguments];

// Build clusters (policy argument families)
interface Cluster {
  cluster_id: string;
  policy_family: string;
  representative_claim: string;
  argument_summary: string;
  comment_ids: string[];
  expert_count: number;
  requires_response: boolean;
  technical_domain: string;
}

const clusters: Cluster[] = [
  {
    cluster_id: "C1",
    policy_family: "Technical / Scientific Methodology",
    representative_claim:
      "The ambient air quality monitoring network is methodologically flawed and must be expanded before enforcement",
    argument_summary:
      "Expert testimony identifies a 34% undersampling of valley-floor inversion zones in the current monitor network. The 24-hour averaging methodology masks peak exposure events that drive hospitalizations. Speciation monitoring is needed to distinguish wildfire from controllable combustion sources.",
    comment_ids: [experts[0]?.id || "OR-DEQ-2026-05123"],
    expert_count: 1,
    requires_response: true,
    technical_domain: "air quality monitoring methodology",
  },
  {
    cluster_id: "C2",
    policy_family: "Environmental Impact",
    representative_claim:
      "The thermal discharge limit of 0.3 deg C is technically infeasible and counterproductive to carbon reduction goals",
    argument_summary:
      "Licensed Professional Engineer testimony demonstrates that compliance requires mechanical cooling towers consuming 4.2 MW additional electrical load per facility. Washington State adopted a workable 0.5 deg C alternative with equivalent salmonid protection at 40% of capital cost.",
    comment_ids: [experts[1]?.id || "OR-DEQ-2026-05124"],
    expert_count: 1,
    requires_response: true,
    technical_domain: "thermal discharge and industrial compliance",
  },
  {
    cluster_id: "C3",
    policy_family: "Equity / Environmental Justice",
    representative_claim:
      "Annual nitrate averaging masks seasonal contamination peaks that disproportionately affect Tribal communities",
    argument_summary:
      "Confederated Tribes of the Umatilla present 6 years of well monitoring data showing nitrate levels exceeding 18 mg/L during irrigation season in 11 of 14 wells. The annual averaging methodology produces false compliance while children drink contaminated water seasonally. Tribal treaty rights and the State-Tribal Government-to-Government Relations Act require formal consultation.",
    comment_ids: [experts[2]?.id || "OR-DEQ-2026-05125"],
    expert_count: 1,
    requires_response: true,
    technical_domain: "groundwater monitoring and tribal consultation",
  },
  {
    cluster_id: "C4",
    policy_family: "Environmental Impact",
    representative_claim:
      "Riparian buffer requirements should use logarithmic effectiveness curves instead of linear width assumptions",
    argument_summary:
      "30 years of paired-watershed research from the H.J. Andrews Experimental Forest demonstrates that buffer effectiveness is logarithmic. The current linear model allocates compliance costs regressively, requiring expensive expansions of already-adequate buffers while permitting inadequate ones elsewhere.",
    comment_ids: [experts[3]?.id || "OR-DEQ-2026-05126"],
    expert_count: 1,
    requires_response: true,
    technical_domain: "forest hydrology and riparian buffers",
  },
  {
    cluster_id: "C5",
    policy_family: "Legal Authority / Process Concerns",
    representative_claim:
      'The variance provision in Section 9.2(d) is procedurally deficient and will not survive judicial review',
    argument_summary:
      'Senior environmental attorney identifies a procedural infirmity identical to one invalidated by the Oregon Court of Appeals in NEDC v. DEQ (2018). The "good cause" variance standard lacks defined evidentiary requirements, public notice obligations, and hearing rights. The recommended fix is the seven-factor framework from Bonneville Power v. Oregon DEQ (2021).',
    comment_ids: [experts[4]?.id || "OR-DEQ-2026-05127"],
    expert_count: 1,
    requires_response: true,
    technical_domain: "administrative procedure and judicial review",
  },
  {
    cluster_id: "C6",
    policy_family: "Public Health",
    representative_claim:
      "Air quality degradation is causing measurable health impacts in Oregon communities, particularly for children and vulnerable populations",
    argument_summary:
      "Multiple community members including healthcare workers, teachers, and parents report direct observation of worsening respiratory health correlated with air quality decline. Clinical evidence from nurses and personal testimony from affected families collectively demonstrate an urgent public health need for stronger standards.",
    comment_ids: substantiveArguments
      .filter((a) => a.policy_area === "public_health")
      .map((a) => a.comment_id),
    expert_count: 0,
    requires_response: true,
    technical_domain: "public health and respiratory outcomes",
  },
  {
    cluster_id: "C7",
    policy_family: "Economic Impact",
    representative_claim:
      "The rule lacks adequate economic analysis for small businesses, family farms, and fixed-income residents",
    argument_summary:
      "Small business owners and agricultural producers argue compliance costs are unclear or disproportionate. Farmers with existing voluntary conservation practices seek credit recognition. Low-income residents express concern about utility cost impacts without rate protections.",
    comment_ids: substantiveArguments
      .filter(
        (a) => a.policy_area === "economics" || a.policy_area === "agriculture"
      )
      .map((a) => a.comment_id),
    expert_count: 0,
    requires_response: false,
    technical_domain: "economic impact and small business compliance",
  },
];

// Pre-generate agency responses for each cluster
interface AgencyResponse {
  cluster_id: string;
  policy_family: string;
  draft_label: string;
  response_text: string;
  citations: {
    comment_id: string;
    submitter: string;
    submitter_org?: string;
    quote: string;
  }[];
}

const responses: Record<string, AgencyResponse> = {};

responses["C1"] = {
  cluster_id: "C1",
  policy_family: "Technical / Scientific Methodology",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Technical / Scientific Methodology

1. The Department acknowledges the detailed technical comments submitted by Dr. Margaret Chen, PhD, of Oregon Health & Science University regarding the adequacy of the ambient air quality monitoring network and the proposed compliance methodology (${experts[0]?.id || "OR-DEQ-2026-05123"}).

2. Staff review indicates that the commenter raises a methodologically significant concern regarding valley-floor inversion zone undersampling. The Department notes the commenter's reference to Chen et al. (2024, Environmental Research Letters), which estimates a 34% coverage gap in the current monitor siting configuration for the Willamette and Rogue valleys. Upon preliminary review, the Department observes that the referenced study was published after the draft rule's technical basis document was prepared, and its findings warrant further evaluation.

3. With respect to the 24-hour averaging methodology, staff review indicates that the commenter's concern about peak exposure masking is supported by OHSU hospital-admissions data (2018-2024). The Department notes that EPA revised the relevant wood-stove emission factor downward by 22% since the 2015 values used in the draft rule's change-out program credit calculations. Staff recommends re-evaluation of these credits.

4. Regarding the recommendation for collocated speciation monitoring, the Department observes that distinguishing wildfire-origin PM2.5 from controllable combustion sources is increasingly important for enforcement practicability. Staff review suggests this recommendation may merit inclusion in the final rule as a phased requirement.

(See comments: ${experts[0]?.id || "OR-DEQ-2026-05123"})`,
  citations: [
    {
      comment_id: experts[0]?.id || "OR-DEQ-2026-05123",
      submitter: experts[0]?.submitter || "Dr. Margaret Chen, PhD",
      submitter_org:
        "Oregon Health & Science University, Department of Environmental Health",
      quote:
        "The proposed rule's reliance on the 2019 ambient air quality monitoring network as the basis for compliance determinations is methodologically flawed. The current monitor placement undersamples valley-floor inversion zones in the Willamette and Rogue valleys by an estimated 34%...",
    },
  ],
};

responses["C2"] = {
  cluster_id: "C2",
  policy_family: "Environmental Impact",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Environmental Impact (Thermal Discharge)

1. The Department acknowledges the engineering analysis submitted by Robert Kallinen, PE (Oregon PE #51234), on behalf of seven pulp and paper facilities operating under Title V permits (${experts[1]?.id || "OR-DEQ-2026-05124"}).

2. Staff review indicates that the commenter's technical feasibility concern regarding the 0.3 deg C temperature-loading limit warrants careful consideration. The Department notes the commenter's calculation that compliance would require mechanical cooling towers consuming approximately 4.2 MW of additional electrical load per facility. The Department observes that such increased energy consumption could create tension with the carbon reduction objectives of OAR 340-200.

3. The commenter's reference to Washington Ecology's alternative compliance pathway under WAC 173-201A-200 (2022) is noted. Staff review indicates that Washington's two-year compliance data, which reportedly shows equivalent thermal-stress reduction in salmonid populations at approximately 40% of capital cost, merits evaluation for potential applicability to Oregon conditions. The Department notes the commenter has provided a peer-reviewed engineering memo and Washington compliance data as exhibits.

4. Staff recommends that the Department evaluate the proposed 0.5 deg C delta with shading-credit offsets as a potential alternative compliance pathway, subject to independent verification of the Washington data and Oregon-specific hydrological modeling.

(See comments: ${experts[1]?.id || "OR-DEQ-2026-05124"})`,
  citations: [
    {
      comment_id: experts[1]?.id || "OR-DEQ-2026-05124",
      submitter: experts[1]?.submitter || "Robert Kallinen, PE",
      submitter_org: "Pacific Northwest Pulp & Paper Coalition",
      quote:
        "Section 4.3(b) of the proposed rule imposes a temperature-loading limit of 0.3 deg C delta at the point of discharge during July-September. This is technically infeasible at three of our member facilities under current treatment train design without the construction of mechanical cooling towers...",
    },
  ],
};

responses["C3"] = {
  cluster_id: "C3",
  policy_family: "Equity / Environmental Justice",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Equity / Environmental Justice

1. The Department acknowledges the comments submitted by Sarah Whitehorse, Water Resources Program Manager for the Confederated Tribes of the Umatilla Indian Reservation, Department of Natural Resources, pursuant to treaty rights under the Treaty of 1855 (${experts[2]?.id || "OR-DEQ-2026-05125"}).

2. Staff review indicates that the commenter presents compelling evidence of seasonal nitrate contamination masked by the proposed annual averaging methodology. The Department notes the CTUIR DNR monitoring data (2019-2025) documenting concentrations exceeding 18 mg/L during May-June irrigation pulses in 11 of 14 monitored wells, against the proposed 10 mg/L standard. The Department observes that annual averaging produces compliance determinations that do not reflect peak seasonal exposure conditions.

3. The Department recognizes the commenter's request for quarterly monitoring during March-October and compliance determinations based on the 90th percentile rather than annual mean. Staff review indicates these recommendations would more accurately capture the seasonal variability documented in the submitted data. The Department further notes the commenter's reference to the State-Tribal Government-to-Government Relations Act (ORS 182.162-168) and acknowledges the statutory obligation for formal consultation with affected Tribes prior to rule adoption.

4. Staff recommends that the Department initiate formal tribal consultation as requested and evaluate the proposed quarterly monitoring and 90th percentile compliance methodology for inclusion in the final rule.

(See comments: ${experts[2]?.id || "OR-DEQ-2026-05125"})`,
  citations: [
    {
      comment_id: experts[2]?.id || "OR-DEQ-2026-05125",
      submitter: experts[2]?.submitter || "Sarah Whitehorse",
      submitter_org:
        "Confederated Tribes of the Umatilla Indian Reservation, Department of Natural Resources",
      quote:
        "The proposed rule's groundwater-protection threshold for nitrate (Section 7.1) is set at 10 mg/L, matching the federal MWQS. However, the rule's monitoring schedule of annual sampling at compliance wells is inadequate to detect the seasonal pulses we have documented in the Umatilla Basin...",
    },
  ],
};

responses["C4"] = {
  cluster_id: "C4",
  policy_family: "Environmental Impact",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Environmental Impact (Riparian Buffers)

1. The Department acknowledges the scientific testimony submitted by Dr. James Liu, PhD, Professor of Forest Hydrology at Oregon State University and lead investigator on the H.J. Andrews Experimental Forest LTER program (${experts[3]?.id || "OR-DEQ-2026-05126"}).

2. Staff review indicates that the commenter presents substantial peer-reviewed evidence challenging the linear buffer-width effectiveness assumption in Appendix C. The Department notes 30 years of paired-watershed data from the Andrews and Alsea Watershed studies demonstrating that buffer effectiveness for sediment trapping follows a logarithmic curve rather than a linear function. The cited marginal benefit figures (8% for 30-to-60-foot expansion vs. 71% for 10-to-30-foot expansion) suggest the current rule allocates compliance costs regressively relative to environmental benefit.

3. The Department notes the commenter's recommendation to adopt a slope-and-soil-class-weighted buffer schedule (the "Andrews Curve" methodology, Liu et al. 2021), which is peer-reviewed and already in use by ODF for state forestlands. Staff review suggests this methodology may provide a more scientifically defensible and cost-effective approach to riparian protection.

4. Staff recommends that the Department evaluate the Andrews Curve methodology for potential incorporation into Appendix C, with particular attention to the supplemental dataset provided by the commenter.

(See comments: ${experts[3]?.id || "OR-DEQ-2026-05126"})`,
  citations: [
    {
      comment_id: experts[3]?.id || "OR-DEQ-2026-05126",
      submitter: experts[3]?.submitter || "Dr. James Liu, PhD",
      submitter_org: "Oregon State University, College of Forestry",
      quote:
        "The Best Management Practices schedule in Appendix C presumes that riparian buffer effectiveness is a linear function of buffer width. This is contradicted by 30 years of paired-watershed data from the Andrews and Alsea Watershed studies...",
    },
  ],
};

responses["C5"] = {
  cluster_id: "C5",
  policy_family: "Legal Authority / Process Concerns",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Legal Authority / Process Concerns

1. The Department acknowledges the legal analysis submitted by Anita Rodriguez-Park, JD, senior staff attorney at the Environmental Law Alliance Worldwide (ELAW) in Eugene, regarding the variance provisions in Section 9 of the proposed rule (${experts[4]?.id || "OR-DEQ-2026-05127"}).

2. Staff review indicates that the commenter identifies a procedural concern with significant litigation risk. The Department notes the commenter's reference to Northwest Environmental Defense Center v. DEQ (2018) 290 Or App 442, in which the Oregon Court of Appeals invalidated a substantively similar variance provision in OAR 340-041-0061 on the grounds that the "good cause" standard was constitutionally inadequate to confine agency discretion. The Department observes that Section 9.2(d) as drafted contains the same structural deficiency.

3. The commenter recommends adoption of the seven-factor variance framework upheld in Bonneville Power Administration v. Oregon DEQ (2021), with mandatory contested-case hearing rights for parties demonstrating standing under ORS 183.450. Staff review indicates this recommendation would substantially reduce the rule's vulnerability to procedural challenge without altering its substantive requirements.

4. Staff recommends that the Department revise Section 9.2(d) to incorporate the recommended framework prior to final adoption. The commenter's observation that "the substance of the rule is sound; the procedural drafting in Section 9 will, if unchanged, prevent DEQ from defending the rule in court" is noted for the record.

(See comments: ${experts[4]?.id || "OR-DEQ-2026-05127"})`,
  citations: [
    {
      comment_id: experts[4]?.id || "OR-DEQ-2026-05127",
      submitter: experts[4]?.submitter || "Anita Rodriguez-Park, JD",
      submitter_org: "Environmental Law Alliance Worldwide (ELAW), Eugene",
      quote:
        'Section 9.2(d) permits the Director to grant a variance "upon a showing of good cause" without further defining the standard, the evidentiary record required, the public-notice obligation, or the right of affected parties to be heard...',
    },
  ],
};

responses["C6"] = {
  cluster_id: "C6",
  policy_family: "Public Health",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Public Health

1. The Department acknowledges the comments submitted by multiple community members including healthcare workers, educators, and parents across Oregon regarding the public health impacts of air quality degradation (${clusters[5].comment_ids.join(", ")}).

2. Staff review indicates that these comments collectively present a consistent pattern of observed respiratory health impacts in communities across Oregon. The Department notes testimony from healthcare professionals reporting increased patient presentations correlated with air quality events, as well as educators documenting student health impacts in classroom settings. The Department observes that these firsthand accounts are consistent with published epidemiological literature on PM2.5 exposure and respiratory outcomes.

3. While these comments do not present new scientific data, the Department notes that the breadth and consistency of community observation supports the public health rationale underlying the proposed rule. Staff review indicates these comments strengthen the record regarding the human health baseline that the rule is designed to address.

4. The Department appreciates the substantive engagement of community members who shared specific experiences and observations.

(See comments: ${clusters[5].comment_ids.join(", ")})`,
  citations: clusters[5].comment_ids.slice(0, 3).map((id) => {
    const c = classified.find((cl: any) => cl.id === id);
    return {
      comment_id: id,
      submitter: c?.submitter || "Community Member",
      quote: c?.text?.slice(0, 250) + "..." || "Comment text",
    };
  }),
};

responses["C7"] = {
  cluster_id: "C7",
  policy_family: "Economic Impact",
  draft_label: "DRAFT STAFF REVIEW RESPONSE",
  response_text: `DRAFT STAFF REVIEW RESPONSE — Economic Impact

1. The Department acknowledges the comments submitted by small business owners, agricultural producers, and residents on fixed incomes regarding the economic impacts of the proposed rule (${clusters[6].comment_ids.join(", ")}).

2. Staff review indicates that commenters raise reasonable concerns about the clarity and distribution of compliance costs. The Department notes specific requests for a small-business impact analysis, phased compliance timelines for family farms, and rate protections for low-income utility customers. The Department observes that the timber industry's request for credit recognition of existing voluntary conservation practices raises a legitimate compliance equity question.

3. The Department notes that a Fiscal Impact Statement was prepared pursuant to ORS 183.335(2)(b)(E) but acknowledges that additional sector-specific analysis may be warranted, particularly for businesses with fewer than 50 employees and agricultural operations. Staff review suggests the Department may wish to consider a phased compliance schedule or alternative compliance pathways for identified hardship categories.

4. Staff recommends further economic analysis of the compliance cost distribution across affected sectors prior to final rule adoption.

(See comments: ${clusters[6].comment_ids.join(", ")})`,
  citations: clusters[6].comment_ids.slice(0, 3).map((id) => {
    const c = classified.find((cl: any) => cl.id === id);
    return {
      comment_id: id,
      submitter: c?.submitter || "Community Member",
      quote: c?.text?.slice(0, 250) + "..." || "Comment text",
    };
  }),
};

// Campaign stats
const antiCount = classified.filter(
  (c) => c.campaign_id === "anti_rule_campaign"
).length;
const proCount = classified.filter(
  (c) => c.campaign_id === "pro_rule_campaign"
).length;

const demoResults = {
  total_comments: comments.length,
  classified,
  arguments: allArguments,
  clusters,
  responses,
  stats: {
    form_letters: formLetters.length,
    individual_opinions:
      individuals.length - substantiveIndividuals.length,
    substantive: substantiveIndividuals.length,
    expert: experts.length,
    unique_arguments: clusters.length,
    campaigns_detected: 2,
  },
  campaigns: {
    anti_rule_campaign: {
      count: antiCount,
      template_count: 5,
      sample_text:
        "I oppose this proposed rule. It will hurt Oregon jobs and raise costs for hardworking families...",
    },
    pro_rule_campaign: {
      count: proCount,
      template_count: 5,
      sample_text:
        "I support this rule. Oregon's air and water deserve protection. We cannot wait any longer...",
    },
  },
};

writeFileSync(
  join(process.cwd(), "data", "demo-results.json"),
  JSON.stringify(demoResults, null, 2)
);

console.log("Generated demo-results.json");
console.log(`  ${classified.length} classified comments`);
console.log(`  ${allArguments.length} extracted arguments`);
console.log(`  ${clusters.length} clusters`);
console.log(`  ${Object.keys(responses).length} pre-generated responses`);
console.log(
  `  Form letters: ${formLetters.length} (anti: ${antiCount}, pro: ${proCount})`
);
console.log(`  Experts: ${experts.length}`);
console.log(
  `  Substantive: ${substantiveIndividuals.length}`
);
