import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { RawComment } from "../src/lib/types";

const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Nancy", "Matthew", "Lisa",
  "Anthony", "Margaret", "Mark", "Betty", "Donald", "Sandra", "Steven", "Ashley",
  "Paul", "Dorothy", "Andrew", "Kimberly", "Joshua", "Emily", "Kenneth", "Donna",
  "Kevin", "Michelle", "Brian", "Carol", "George", "Amanda", "Edward", "Melissa",
  "Ronald", "Deborah", "Timothy", "Stephanie", "Jason", "Rebecca", "Jeffrey", "Sharon",
  "Ryan", "Laura", "Jacob", "Cynthia", "Gary", "Kathleen", "Nicholas", "Amy",
  "Eric", "Angela", "Jonathan", "Shirley", "Stephen", "Anna", "Larry", "Ruth",
  "Justin", "Brenda", "Scott", "Pamela", "Brandon", "Nicole", "Benjamin", "Katherine",
  "Samuel", "Samantha", "Gregory", "Christine", "Frank", "Helen", "Alexander", "Debra",
  "Raymond", "Rachel", "Patrick", "Carolyn", "Jack", "Janet", "Dennis", "Maria",
  "Jerry", "Catherine", "Tyler", "Heather", "Aaron", "Diane", "Henry", "Olivia",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
  "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
  "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
  "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy",
  "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey",
];

const OREGON_CITIES = [
  "Portland", "Eugene", "Salem", "Gresham", "Hillsboro", "Bend", "Beaverton",
  "Medford", "Springfield", "Corvallis", "Albany", "Tigard", "Lake Oswego",
  "Keizer", "Grants Pass", "McMinnville", "Oregon City", "Redmond", "Roseburg",
  "Pendleton", "Coquille", "Yachats", "Astoria", "Ashland", "Klamath Falls",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function randomDate(): string {
  const start = new Date("2026-03-01");
  const end = new Date("2026-04-30");
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t).toISOString();
}

// Campaign 1: Anti-rule form letter (industry-backed)
const CAMPAIGN_1_TEMPLATES = [
  "I oppose this proposed rule. It will hurt Oregon jobs and raise costs for hardworking families. The DEQ should focus on real environmental problems, not burdensome new regulations. Please withdraw this proposal.",
  "As a concerned Oregonian, I strongly oppose this rule. It will kill jobs and make life more expensive for working families across our state. DEQ should reject this overreach.",
  "Please do NOT adopt this rule. It will devastate Oregon's economy and hurt working families. The DEQ is overstepping its authority. Withdraw this proposal immediately.",
  "This rule is a job-killer. It will hurt Oregon families and small businesses. The DEQ should focus on actual problems. I urge you to reject this proposal.",
  "I am writing to oppose the proposed rule. It will raise costs, hurt jobs, and harm working families. DEQ should withdraw this misguided regulation.",
];

// Campaign 2: Pro-rule form letter (advocacy org)
const CAMPAIGN_2_TEMPLATES = [
  "I support this rule. Oregon's air and water deserve protection. We cannot wait any longer to act on pollution. Please adopt the strongest possible version of this rule.",
  "Please adopt this rule. Our children and grandchildren deserve clean air and water. Oregon must lead on environmental protection. Stronger is better.",
  "I urge DEQ to adopt this rule and make it even stronger. Oregon families deserve protection from polluters. This is long overdue.",
  "Strongly support! Oregon needs this rule and more like it. Polluters have had a free ride for too long. Please adopt without weakening it.",
  "Yes to this rule. Clean air and water are basic rights. Please adopt the strongest version and don't let industry water it down.",
];

const INDIVIDUAL_OPINIONS = [
  (city: string) => `I live in ${city} and I'm worried about the air quality near my home. My kids have asthma and the smoke days are getting worse every summer. I don't know all the technical details but something needs to change. I support efforts to clean up the air.`,
  (city: string) => `My family has farmed in the ${city} area for three generations. We care about clean water more than anyone, because our livelihood depends on it. But this rule seems to add costs without addressing the actual sources of pollution upstream. Please consider how this affects small family farms.`,
  (city: string) => `I'm a small business owner in ${city}. I understand the need for environmental rules, but the compliance costs in the proposal are unclear. Can DEQ publish a small-business impact analysis before finalizing?`,
  (city: string) => `As a retiree on a fixed income in ${city}, I'm concerned about how this will affect my utility bills. I support clean air but I can't afford much more. Please consider low-income residents.`,
  (city: string) => `I work in the timber industry near ${city}. We've already adopted many practices to protect water quality. I'm worried this rule will be applied to us without recognizing what we already do. Please consult with industry before finalizing.`,
  (city: string) => `I'm a teacher in ${city} and several of my students have respiratory issues. Anything that improves air quality is good in my book. Thanks for working on this.`,
  (city: string) => `I bike to work in ${city} and the air is noticeably worse than it was ten years ago. I support this rule and hope DEQ doesn't back down under industry pressure.`,
  (city: string) => `I'm a nurse at a clinic in ${city}. I see the health impacts of poor air quality every day. The economic argument against this rule ignores the medical costs we already pay. Please move forward.`,
];

// Hand-crafted EXPERT comments — these are the demo payoff. The synthesizer must surface these.
const EXPERT_COMMENTS: Array<Omit<RawComment, "id" | "submitted_at">> = [
  {
    submitter: "Dr. Margaret Chen, PhD",
    submitter_org: "Oregon Health & Science University, Department of Environmental Health",
    text: `I submit this comment as a researcher in environmental epidemiology with 18 years of experience studying PM2.5 exposure outcomes in the Pacific Northwest.

The proposed rule's reliance on the 2019 ambient air quality monitoring network as the basis for compliance determinations is methodologically flawed. The current monitor placement undersamples valley-floor inversion zones in the Willamette and Rogue valleys by an estimated 34%, based on our 2024 study (Chen et al., Environmental Research Letters, doi:10.1088/example). Wintertime PM2.5 exposures in these zones routinely exceed the proposed standard by 40-60% during stagnation events, but are not captured by the existing monitor siting.

Specifically, DEQ's draft fails to address three issues:
(1) The 24-hour averaging methodology smooths over peak exposure events that drive the bulk of cardiopulmonary admissions, per OHSU hospital-admissions data 2018-2024.
(2) The wood-stove change-out program credits are calculated using a 2015 emission factor that EPA has since revised downward by 22%.
(3) The rule does not require collocated speciation monitoring, which is necessary to distinguish wildfire-origin PM2.5 (transient) from wood-combustion-origin PM2.5 (chronic, controllable).

I urge DEQ to (a) expand the monitoring network to include at least 12 additional valley-floor sites prior to enforcement, (b) adopt a 1-hour peak metric in addition to the 24-hour average, and (c) require speciation at all primary sites. Without these changes the rule will systematically under-protect the populations most exposed.

I am happy to provide the underlying dataset under a research data use agreement.`,
  },
  {
    submitter: "Robert Kallinen, PE",
    submitter_org: "Pacific Northwest Pulp & Paper Coalition",
    text: `I am a licensed Professional Engineer (Oregon PE #51234) submitting on behalf of seven pulp and paper facilities operating in Oregon under Title V permits. I have 22 years of experience designing wastewater treatment systems for kraft and mechanical pulping operations.

Section 4.3(b) of the proposed rule imposes a temperature-loading limit of 0.3 deg C delta at the point of discharge during July-September. This is technically infeasible at three of our member facilities under current treatment train design without the construction of mechanical cooling towers, which would (a) consume approximately 4.2 MW of additional electrical load per facility, increasing the carbon footprint of the regulated activity in direct contradiction of OAR 340-200, and (b) generate cooling-tower drift containing entrained dissolved solids that would itself constitute a new pollution source requiring a separate permit pathway under Section 5.2.

A workable alternative supported by the engineering record is a 0.5 deg C delta combined with shading-credit offsets for riparian restoration upstream of the discharge point, as adopted by Washington Ecology in WAC 173-201A-200 in 2022. Washington's two-year compliance data shows equivalent thermal-stress reduction in salmonid populations at approximately 40% of the capital cost.

I have attached a peer-reviewed engineering memo and Washington's compliance data as Exhibits A and B. I respectfully request that DEQ adopt the alternative compliance pathway.`,
  },
  {
    submitter: "Sarah Whitehorse",
    submitter_org: "Confederated Tribes of the Umatilla Indian Reservation, Department of Natural Resources",
    text: `I am the Water Resources Program Manager for the CTUIR DNR. I submit these comments on behalf of the Tribes pursuant to our reserved treaty rights to fish in the usual and accustomed places under the Treaty of 1855.

The proposed rule's groundwater-protection threshold for nitrate (Section 7.1) is set at 10 mg/L, matching the federal MWQS. However, the rule's monitoring schedule of annual sampling at compliance wells is inadequate to detect the seasonal pulses we have documented in the Umatilla Basin. Our DNR data (2019-2025, attached) shows nitrate concentrations exceeding 18 mg/L during May-June irrigation pulses in 11 of the 14 monitored wells, with annual averages remaining below 10 mg/L due to dilution in fall and winter.

The federal threshold and an annual averaging methodology together produce a rule that is, in practical effect, unenforceable in the precise hydrogeologic conditions where Tribal members and rural residents are most exposed. Children in the Mission and Cayuse communities are drinking water that exceeds the federal MCL for nitrate during peak agricultural seasons, but the rule as drafted would record these wells as compliant.

I respectfully request: (1) quarterly monitoring during March-October, (2) compliance determinations based on the 90th percentile rather than annual mean, and (3) formal consultation with affected Tribes prior to rule adoption, consistent with the State-Tribal Government-to-Government Relations Act (ORS 182.162-168).`,
  },
  {
    submitter: "Dr. James Liu, PhD",
    submitter_org: "Oregon State University, College of Forestry",
    text: `I am Professor of Forest Hydrology at OSU and lead investigator on the H.J. Andrews Experimental Forest LTER program. I have conducted continuous-record water-quality research in Oregon forested watersheds since 2003.

The Best Management Practices schedule in Appendix C presumes that riparian buffer effectiveness is a linear function of buffer width. This is contradicted by 30 years of paired-watershed data from the Andrews and Alsea Watershed studies. Buffer effectiveness for sediment trapping is approximately logarithmic; the marginal benefit of expanding a 30-foot buffer to 60 feet on a Cascade Range slope is roughly 8%, whereas the marginal benefit of expanding from 10 to 30 feet is approximately 71%.

The rule as drafted will require landowners to expand existing 60-foot buffers to 100 feet at considerable cost while permitting 10-foot buffers to remain unimproved elsewhere. This is a regressive allocation of the cost of compliance relative to environmental benefit.

I recommend DEQ adopt a slope-and-soil-class-weighted buffer schedule (the "Andrews Curve" methodology, Liu et al. 2021) that has been peer-reviewed and is already used by ODF for state forestlands. I have provided the methodology and the underlying dataset in the supplemental materials.`,
  },
  {
    submitter: "Anita Rodriguez-Park, JD",
    submitter_org: "Environmental Law Alliance Worldwide (ELAW), Eugene",
    text: `I submit this comment as senior staff attorney with 14 years of practice in Clean Water Act and Oregon environmental regulatory law.

The proposed rule's variance provisions in Section 9 contain a procedural infirmity that, in my professional opinion, exposes the rule to successful challenge under Oregon's Administrative Procedures Act (ORS 183.335).

Specifically, Section 9.2(d) permits the Director to grant a variance "upon a showing of good cause" without further defining the standard, the evidentiary record required, the public-notice obligation, or the right of affected parties to be heard. The Oregon Court of Appeals in Northwest Environmental Defense Center v. DEQ (2018) 290 Or App 442 invalidated a substantively identical variance provision in OAR 340-041-0061 on these exact grounds, finding the standard "constitutionally inadequate to confine agency discretion."

Without revision, Section 9.2(d) will produce the same outcome on challenge. I recommend DEQ adopt the seven-factor variance framework upheld in Bonneville Power Administration v. Oregon DEQ (2021), incorporated by reference into the rule, with mandatory contested-case hearing rights for any party demonstrating standing under ORS 183.450.

The substance of the rule is sound; the procedural drafting in Section 9 will, if unchanged, prevent DEQ from defending the rule in court when (not if) it is challenged.`,
  },
];

function generateComment(id: number, campaign: "none" | "anti" | "pro"): RawComment {
  const submitted_at = randomDate();
  const submitter = randomName();
  const city = pick(OREGON_CITIES);

  if (campaign === "anti") {
    return {
      id: `OR-DEQ-2026-${String(id).padStart(5, "0")}`,
      submitter,
      submitted_at,
      text: pick(CAMPAIGN_1_TEMPLATES),
    };
  }
  if (campaign === "pro") {
    return {
      id: `OR-DEQ-2026-${String(id).padStart(5, "0")}`,
      submitter,
      submitted_at,
      text: pick(CAMPAIGN_2_TEMPLATES),
    };
  }
  return {
    id: `OR-DEQ-2026-${String(id).padStart(5, "0")}`,
    submitter,
    submitted_at,
    text: pick(INDIVIDUAL_OPINIONS)(city),
  };
}

function main() {
  const comments: RawComment[] = [];
  let id = 1;

  // Campaign 1: 2,400 anti-rule form letters
  for (let i = 0; i < 2400; i++) comments.push(generateComment(id++, "anti"));
  // Campaign 2: 2,200 pro-rule form letters
  for (let i = 0; i < 2200; i++) comments.push(generateComment(id++, "pro"));
  // Individual opinions: 522 organic-looking
  for (let i = 0; i < 522; i++) comments.push(generateComment(id++, "none"));

  // Expert comments — hand-crafted
  for (const expert of EXPERT_COMMENTS) {
    comments.push({
      id: `OR-DEQ-2026-${String(id++).padStart(5, "0")}`,
      submitter: expert.submitter,
      submitter_org: expert.submitter_org,
      submitted_at: randomDate(),
      text: expert.text,
    });
  }

  // Shuffle so experts aren't all at the end
  for (let i = comments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [comments[i], comments[j]] = [comments[j], comments[i]];
  }

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "comments.json");
  writeFileSync(outPath, JSON.stringify(comments, null, 2));
  console.log(`Wrote ${comments.length} comments to ${outPath}`);
  console.log(`  ${2400} campaign-anti form letters`);
  console.log(`  ${2200} campaign-pro form letters`);
  console.log(`  ${522} individual opinions`);
  console.log(`  ${EXPERT_COMMENTS.length} expert testimonies (hand-crafted)`);
}

main();
