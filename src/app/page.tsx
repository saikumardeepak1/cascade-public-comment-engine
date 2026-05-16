"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Shield,
  FileText,
  Brain,
  Zap,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  X,
  RotateCcw,
  Activity,
  Scale,
  Eye,
  Loader2,
} from "lucide-react";
import type {
  ClassifiedComment,
  ExtractedArgument,
  ArgumentCluster,
  AgencyResponse,
  DemoResults,
} from "@/lib/types";

/* ====================================================================
   Types
   ==================================================================== */

type Phase =
  | "idle"
  | "classifying"
  | "extracting"
  | "clustering"
  | "complete"
  | "error";

type Stats = {
  form_letters: number;
  individual_opinions: number;
  substantive: number;
  expert: number;
  unique_arguments?: number;
  campaigns_detected?: number;
};

type CampaignTracker = {
  id: string;
  count: number;
  templateCount: number;
  sampleText: string;
};

/* ====================================================================
   Utility
   ==================================================================== */

function computeCohesion(
  cluster: ArgumentCluster,
  args: ExtractedArgument[]
): { score: number; dominant: string; total: number } {
  const memberArgs = args.filter((a) =>
    cluster.comment_ids.includes(a.comment_id)
  );
  if (memberArgs.length === 0) return { score: 1, dominant: "n/a", total: 0 };
  const freq: Record<string, number> = {};
  for (const a of memberArgs) {
    freq[a.policy_area] = (freq[a.policy_area] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const score = sorted[0][1] / memberArgs.length;
  return { score, dominant, total: memberArgs.length };
}

const mono = { fontFamily: "var(--font-mono-stack)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

/* ====================================================================
   Main Component
   ==================================================================== */

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failedAgent, setFailedAgent] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [stats, setStats] = useState<Stats>({
    form_letters: 0,
    individual_opinions: 0,
    substantive: 0,
    expert: 0,
  });
  const [recentClassifications, setRecentClassifications] = useState<
    ClassifiedComment[]
  >([]);
  const [extractionCount, setExtractionCount] = useState({ done: 0, total: 0 });
  const [recentExtractions, setRecentExtractions] = useState<
    ExtractedArgument[]
  >([]);
  const [clusters, setClusters] = useState<ArgumentCluster[]>([]);
  const [allClassified, setAllClassified] = useState<ClassifiedComment[]>([]);
  const [allArguments, setAllArguments] = useState<ExtractedArgument[]>([]);
  const [selectedCluster, setSelectedCluster] =
    useState<ArgumentCluster | null>(null);
  const [agencyResponse, setAgencyResponse] = useState<AgencyResponse | null>(
    null
  );
  const [responding, setResponding] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [campaigns, setCampaigns] = useState<Record<string, CampaignTracker>>(
    {}
  );
  const [traceDrawer, setTraceDrawer] = useState<{
    commentId: string;
    comment: ClassifiedComment | null;
    argument: ExtractedArgument | null;
  } | null>(null);
  const [demoResponses, setDemoResponses] = useState<Record<
    string,
    AgencyResponse
  > | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(
    new Set()
  );
  const streamRef = useRef<HTMLDivElement>(null);

  // Timer
  useEffect(() => {
    if (
      !startTime ||
      phase === "complete" ||
      phase === "idle" ||
      phase === "error"
    )
      return;
    const interval = setInterval(
      () => setElapsed((Date.now() - startTime) / 1000),
      100
    );
    return () => clearInterval(interval);
  }, [startTime, phase]);

  const openTraceDrawer = useCallback(
    (commentId: string) => {
      const comment = allClassified.find((c) => c.id === commentId) || null;
      const argument =
        allArguments.find((a) => a.comment_id === commentId) || null;
      setTraceDrawer({ commentId, comment, argument });
    },
    [allClassified, allArguments]
  );

  /* ---- SSE pipeline ---- */
  const handleRun = useCallback((limit?: number) => {
    setPhase("classifying");
    setError(null);
    setFailedAgent(null);
    setProcessed(0);
    setStats({ form_letters: 0, individual_opinions: 0, substantive: 0, expert: 0 });
    setRecentClassifications([]);
    setRecentExtractions([]);
    setClusters([]);
    setAllClassified([]);
    setAllArguments([]);
    setSelectedCluster(null);
    setAgencyResponse(null);
    setCampaigns({});
    setDemoResponses(null);
    setExpandedClusters(new Set());
    setStartTime(Date.now());
    setElapsed(0);

    const url = limit ? `/api/analyze?limit=${limit}` : "/api/analyze";
    const es = new EventSource(url);

    es.addEventListener("start", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setTotal(d.total);
    });

    es.addEventListener("classification", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        batch: ClassifiedComment[];
        processed: number;
        total: number;
      };
      setProcessed(d.processed);
      const nonForm = d.batch.filter((c) => c.category !== "form_letter");
      const formBatch = d.batch.filter((c) => c.category === "form_letter");
      setRecentClassifications((prev) => [...nonForm, ...prev].slice(0, 40));
      setCampaigns((prev) => {
        const next = { ...prev };
        for (const c of formBatch) {
          const cid = c.campaign_id || "unknown_campaign";
          if (!next[cid]) {
            next[cid] = { id: cid, count: 0, templateCount: 0, sampleText: c.text.slice(0, 100) + "..." };
          }
          next[cid].count++;
        }
        for (const cid of Object.keys(next)) {
          const templateSet = new Set(
            formBatch.filter((c) => (c.campaign_id || "unknown_campaign") === cid).map((c) => c.text.slice(0, 60))
          );
          next[cid].templateCount = Math.max(next[cid].templateCount, templateSet.size);
        }
        return next;
      });
      setStats((s) => {
        const n = { ...s };
        for (const c of d.batch) {
          if (c.category === "form_letter") n.form_letters++;
          else if (c.category === "individual_opinion") n.individual_opinions++;
          else if (c.category === "substantive_argument") n.substantive++;
          else if (c.category === "expert_testimony") n.expert++;
        }
        return n;
      });
    });

    es.addEventListener("classification_done", () => setPhase("extracting"));
    es.addEventListener("extraction_start", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setExtractionCount({ done: 0, total: d.count });
    });
    es.addEventListener("extraction_progress", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setExtractionCount({ done: d.processed, total: d.total });
      setRecentExtractions((prev) => [d.argument, ...prev].slice(0, 12));
    });
    es.addEventListener("extraction_done", () => setPhase("clustering"));
    es.addEventListener("clustering_done", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        clusters: ArgumentCluster[];
        classified: ClassifiedComment[];
        arguments: ExtractedArgument[];
        stats: Stats;
      };
      setClusters(d.clusters);
      setAllClassified(d.classified);
      setAllArguments(d.arguments);
      setStats((s) => ({ ...s, ...d.stats }));
    });
    es.addEventListener("complete", () => {
      setPhase("complete");
      es.close();
    });
    es.addEventListener("error", (e) => {
      try {
        const me = e as MessageEvent;
        if (me.data) {
          const parsed = JSON.parse(me.data);
          setError(parsed.message || "Unknown API error");
          const msg = (parsed.message || "").toLowerCase();
          if (msg.includes("classifier") || msg.includes("haiku")) setFailedAgent("Classifier (Haiku 4.5)");
          else if (msg.includes("extract") || msg.includes("sonnet")) setFailedAgent("Extractor (Sonnet 4.6)");
          else if (msg.includes("cluster") || msg.includes("synth") || msg.includes("opus")) setFailedAgent("Synthesizer (Opus 4.7)");
          else setFailedAgent(null);
        } else {
          setError("Connection lost or API error");
        }
      } catch {
        setError("Connection lost or API error");
      }
      setPhase("error");
      es.close();
    });
  }, []);

  /* ---- Demo results ---- */
  const loadDemoResults = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-results");
      const data = (await res.json()) as DemoResults;
      setTotal(data.total_comments);
      setProcessed(data.total_comments);
      setStats(data.stats);
      setAllClassified(data.classified);
      setAllArguments(data.arguments);
      setClusters(data.clusters);
      setDemoResponses(data.responses);
      const cmap: Record<string, CampaignTracker> = {};
      for (const [cid, info] of Object.entries(data.campaigns)) {
        cmap[cid] = { id: cid, count: info.count, templateCount: info.template_count, sampleText: info.sample_text };
      }
      setCampaigns(cmap);
      setRecentClassifications(data.classified.filter((c) => c.category !== "form_letter").slice(0, 40));
      setRecentExtractions(data.arguments.slice(0, 12));
      setPhase("complete");
      setStartTime(null);
      setElapsed(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo results");
      setPhase("error");
    }
  }, []);

  /* ---- Response gen ---- */
  const generateResponse = async (cluster: ArgumentCluster) => {
    setSelectedCluster(cluster);
    setAgencyResponse(null);
    if (demoResponses && demoResponses[cluster.cluster_id]) {
      setAgencyResponse(demoResponses[cluster.cluster_id]);
      return;
    }
    setResponding(true);
    try {
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster, arguments: allArguments, classified: allClassified }),
      });
      const data = (await res.json()) as AgencyResponse;
      if (!res.ok) {
        setError((data as unknown as { error: string }).error || "Response generation failed");
        return;
      }
      setAgencyResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Response generation failed");
    } finally {
      setResponding(false);
    }
  };

  const cohesionMap = useMemo(() => {
    const map: Record<string, { score: number; dominant: string; total: number }> = {};
    for (const c of clusters) map[c.cluster_id] = computeCohesion(c, allArguments);
    return map;
  }, [clusters, allArguments]);

  const totalFormLetters = Object.values(campaigns).reduce((s, c) => s + c.count, 0);

  const toggleClusterExpand = (id: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ===================================================================
     LANDING PAGE
     =================================================================== */
  if (phase === "idle") {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#0d1117]">
        {/* Dot grid background */}
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117]/0 via-[#0d1117]/50 to-[#0d1117]" />

        <div className="relative z-10">
          {/* Header */}
          <header className="border-b border-[#21262d]">
            <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-gradient-to-br from-[#f0a500] to-[#b37800] flex items-center justify-center">
                  <Shield className="h-5 w-5 text-[#0d1117]" strokeWidth={2.5} />
                </div>
                <span className="text-sm font-semibold tracking-[0.2em] uppercase text-[#e6edf3]" style={mono}>
                  Cascade
                </span>
              </div>
              <span className="text-xs text-[#484f58] tracking-wider uppercase" style={mono}>
                Oregon DEQ Intelligence Terminal
              </span>
            </div>
          </header>

          {/* Hero */}
          <div className="mx-auto max-w-6xl px-6 pt-24 pb-16">
            <div className="text-center">
              <div className="inline-block">
                <h1 className="text-[128px] leading-none font-bold tracking-tight gold-underline text-[#e6edf3]" style={display}>
                  5,127
                </h1>
              </div>
              <p className="mt-6 text-lg text-[#8b949e] tracking-wide" style={mono}>
                public comments received
              </p>

              <p className="mt-10 text-xl text-[#e6edf3] max-w-2xl mx-auto leading-relaxed">
                Not a summarizer. Not a chatbot.{" "}
                <span className="text-[#f0a500] font-semibold">A regulatory workflow replacement.</span>
              </p>

              <p className="mt-4 text-sm text-[#8b949e] max-w-xl mx-auto leading-relaxed">
                An AI copilot that converts public comments into structured legal
                intelligence for human policy analysts. Every claim traced to its
                source. Every response auditable under judicial review.
              </p>

              {/* Buttons */}
              <div className="mt-12 flex items-center justify-center gap-4">
                <button
                  onClick={() => handleRun()}
                  className="px-8 py-3.5 rounded-md bg-[#f0a500] text-[#0d1117] font-bold text-sm tracking-wide hover:bg-[#ffb519] transition-colors shadow-lg shadow-[#f0a500]/10"
                >
                  Analyze All 5,127
                </button>
                <button
                  onClick={() => handleRun(200)}
                  className="px-8 py-3.5 rounded-md border border-[#e6edf3]/30 text-[#e6edf3] font-medium text-sm tracking-wide hover:bg-[#e6edf3]/5 transition-colors"
                >
                  Quick Demo (200)
                </button>
                <button
                  onClick={loadDemoResults}
                  className="px-8 py-3.5 rounded-md border border-[#f0a500]/30 text-[#f0a500] font-medium text-sm tracking-wide hover:bg-[#f0a500]/5 transition-colors"
                >
                  Load Pre-Run Results
                </button>
              </div>
              <p className="mt-3 text-[11px] text-[#484f58]" style={mono}>
                Pre-run results load instantly, zero API calls
              </p>
            </div>

            {/* Agent pipeline */}
            <div className="mt-24 grid grid-cols-3 gap-5 max-w-4xl mx-auto">
              <LandingAgentCard
                step="01"
                model="Haiku 4.5"
                title="Classifier"
                desc="Labels every comment. Detects form-letter campaigns vs. genuine submissions. Strips the noise."
                icon={<Eye className="h-4 w-4" />}
                color="#58a6ff"
              />
              <LandingAgentCard
                step="02"
                model="Sonnet 4.6"
                title="Argument Extractor"
                desc="Decomposes substantive comments into structured claim / evidence / mechanism objects."
                icon={<Brain className="h-4 w-4" />}
                color="#f0a500"
              />
              <LandingAgentCard
                step="03"
                model="Opus 4.7"
                title="Synthesizer"
                desc="Clusters into policy families. Drafts the Response-to-Comments scaffold for human review."
                icon={<Scale className="h-4 w-4" />}
                color="#bc8cff"
              />
            </div>

            {/* Legal framing footer */}
            <div className="mt-20 max-w-3xl mx-auto border-t border-[#21262d] pt-8">
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#f0a500] font-bold mb-2" style={mono}>
                    Bidirectional Traceability
                  </div>
                  <p className="text-xs text-[#8b949e] leading-relaxed">
                    Every sentence links back to the exact public comment it addresses. Fully auditable.
                  </p>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#f0a500] font-bold mb-2" style={mono}>
                    Human-in-the-Loop
                  </div>
                  <p className="text-xs text-[#8b949e] leading-relaxed">
                    Draft intelligence for policy analysts to refine, not an autonomous replacement.
                  </p>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#f0a500] font-bold mb-2" style={mono}>
                    APA Compliant
                  </div>
                  <p className="text-xs text-[#8b949e] leading-relaxed">
                    Structured to survive &quot;arbitrary and capricious&quot; judicial review under ORS 183.335.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ===================================================================
     DASHBOARD
     =================================================================== */
  return (
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">
      {/* Header bar */}
      <header className="border-b border-[#21262d] bg-[#161b22] shrink-0">
        <div className="px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[#f0a500] to-[#b37800] flex items-center justify-center">
              <Shield className="h-4 w-4 text-[#0d1117]" strokeWidth={2.5} />
            </div>
            <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#e6edf3]" style={mono}>
              Cascade
            </span>
            <div className="h-4 w-px bg-[#30363d]" />
            <span className="text-[10px] text-[#484f58] tracking-wider uppercase" style={mono}>
              OR-DEQ-2026-AQ-014
            </span>
          </div>

          <div className="flex items-center gap-5">
            {startTime && phase !== "complete" && phase !== "error" && (
              <span className="text-xs text-[#8b949e] tabular-nums" style={mono}>
                {elapsed.toFixed(1)}s
              </span>
            )}
            <PhaseChip phase={phase} />
          </div>
        </div>
      </header>

      {/* Error banner */}
      {phase === "error" && error && (
        <div className="border-b border-[#f85149]/30 bg-[#f85149]/8 px-5 py-3 shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-[#f85149] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#f85149]">Pipeline Error</span>
                {failedAgent && (
                  <span className="text-[10px] tracking-wider uppercase text-[#f85149]/70 border border-[#f85149]/30 rounded px-1.5 py-0.5" style={mono}>
                    {failedAgent}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#e6edf3]/70">{error}</p>
            </div>
            <button
              onClick={() => { setPhase("idle"); setError(null); setFailedAgent(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#f85149]/40 text-[#f85149] text-xs font-medium hover:bg-[#f85149]/10 transition-colors shrink-0"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Metrics bar */}
      <div className="border-b border-[#21262d] bg-[#0d1117] px-5 py-2 shrink-0">
        <div className="flex items-center gap-2.5 overflow-x-auto">
          <Metric label="Total" value={`${processed.toLocaleString()}/${total.toLocaleString()}`} color="#8b949e" active={phase === "classifying"} />
          <Metric label="Form Letters" value={stats.form_letters.toLocaleString()} color="#f85149" sub={stats.form_letters > 0 ? `${Math.round((stats.form_letters / Math.max(processed, 1)) * 100)}%` : undefined} />
          <Metric label="Individual" value={stats.individual_opinions.toLocaleString()} color="#8b949e" />
          <Metric label="Substantive" value={stats.substantive.toLocaleString()} color="#f0a500" />
          <Metric label="Expert" value={stats.expert.toLocaleString()} color="#f0a500" highlight />
          <Metric
            label="Families"
            value={clusters.length > 0 ? clusters.length.toString() : phase === "extracting" ? `${extractionCount.done}/${extractionCount.total}` : phase === "clustering" ? "..." : "0"}
            color="#bc8cff"
          />
          <div className="flex-1" />
          {totalFormLetters > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg border border-[#f85149]/25 bg-[#f85149]/5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-[#f85149] animate-pulse-glow" />
              <span className="text-xs tracking-wider uppercase text-[#f85149] font-bold whitespace-nowrap" style={mono}>
                {totalFormLetters.toLocaleString()} campaign duplicates
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3-panel body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* PANEL 1: Live Stream */}
        <div className="w-[340px] shrink-0 border-r border-[#21262d] flex flex-col">
          <PanelHead title="Live Stream" sub="Agent 1 / Haiku 4.5" badge={`${processed}/${total}`} icon={<Activity className="h-4 w-4 text-[#58a6ff]" />} />
          <div ref={streamRef} className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {/* Campaign banners */}
            {Object.values(campaigns).map((camp) => (
              <div key={camp.id} className="rounded-lg border border-[#f85149]/25 bg-[#f85149]/5 px-3.5 py-2.5 animate-card-enter">
                <div className="flex items-center justify-between">
                  <span className="text-xs tracking-wider uppercase font-bold text-[#f85149]" style={mono}>{camp.id.replace(/_/g, " ")}</span>
                  <span className="text-sm font-bold text-[#f85149] tabular-nums" style={mono}>{camp.count.toLocaleString()}x</span>
                </div>
                <div className="mt-1.5 text-xs text-[#8b949e] truncate italic">&quot;{camp.sampleText}&quot;</div>
              </div>
            ))}

            {recentClassifications.length === 0 && phase === "classifying" && (
              <p className="text-xs text-[#484f58] italic p-3 text-center">Waiting for first batch...</p>
            )}

            {recentClassifications.map((c) => (
              <StreamCard key={c.id} comment={c} />
            ))}
          </div>
        </div>

        {/* PANEL 2: Argument Clusters */}
        <div className="flex-1 border-r border-[#21262d] flex flex-col min-w-0">
          <PanelHead
            title={clusters.length > 0 ? "Policy Argument Families" : "Argument Extraction"}
            sub={clusters.length > 0 ? "Agent 3 / Opus 4.7" : "Agent 2 / Sonnet 4.6"}
            badge={clusters.length > 0 ? `${clusters.length} families` : `${extractionCount.done}/${extractionCount.total}`}
            icon={<FileText className="h-3.5 w-3.5 text-[#f0a500]" />}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {clusters.length > 0 ? (
              <div className="space-y-2">
                {clusters
                  .sort((a, b) => {
                    if (a.requires_response !== b.requires_response) return a.requires_response ? -1 : 1;
                    return b.expert_count - a.expert_count;
                  })
                  .map((cluster) => {
                    const coh = cohesionMap[cluster.cluster_id];
                    const lowCohesion = coh && coh.total > 1 && coh.score < 0.8;
                    const isExpanded = expandedClusters.has(cluster.cluster_id);
                    const isSelected = selectedCluster?.cluster_id === cluster.cluster_id;

                    return (
                      <div
                        key={cluster.cluster_id}
                        className={`rounded-md border transition-colors animate-card-enter ${
                          isSelected
                            ? "border-[#f0a500]/50 bg-[#f0a500]/5"
                            : "border-[#30363d] bg-[#161b22] hover:border-[#484f58]"
                        }`}
                      >
                        <button className="w-full text-left px-4 py-3.5" onClick={() => toggleClusterExpand(cluster.cluster_id)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] tracking-wider uppercase font-bold text-[#0d1117] bg-[#8b949e] px-2 py-0.5 rounded" style={mono}>
                                {cluster.policy_family}
                              </span>
                              {cluster.requires_response && (
                                <span className="text-[11px] tracking-wider uppercase font-bold text-[#3fb950] bg-[#3fb950]/10 border border-[#3fb950]/30 px-2 py-0.5 rounded">
                                  must respond
                                </span>
                              )}
                              {cluster.expert_count > 0 && (
                                <span className="text-[11px] tracking-wider uppercase font-bold text-[#f0a500] bg-[#f0a500]/10 border border-[#f0a500]/30 px-2 py-0.5 rounded">
                                  {cluster.expert_count} expert{cluster.expert_count > 1 ? "s" : ""}
                                </span>
                              )}
                              {lowCohesion && (
                                <span className="text-[11px] tracking-wider uppercase font-bold text-[#f0a500] bg-[#f0a500]/10 border border-[#f0a500]/30 px-2 py-0.5 rounded">
                                  cohesion {(coh.score * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-[#8b949e] tabular-nums font-medium" style={mono}>{cluster.comment_ids.length}</span>
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-[#8b949e]" /> : <ChevronRight className="h-4 w-4 text-[#8b949e]" />}
                            </div>
                          </div>
                          <div className="mt-3 text-[15px] font-semibold text-[#e6edf3] leading-snug">
                            {cluster.representative_claim}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-[#21262d]">
                            <p className="mt-3 text-sm text-[#b1bac4] leading-relaxed">{cluster.argument_summary}</p>
                            {lowCohesion && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-[#f0a500]">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>Low cohesion: {(coh.score * 100).toFixed(0)}% share dominant area ({coh.dominant}). Review recommended.</span>
                              </div>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); generateResponse(cluster); }}
                              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f0a500] text-[#0d1117] text-sm font-bold hover:bg-[#ffb519] transition-colors"
                            >
                              <Zap className="h-4 w-4" />
                              Generate Draft Response
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="space-y-2">
                {phase === "clustering" && (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 text-[#bc8cff] animate-spin mx-auto" />
                    <p className="mt-4 text-sm text-[#bc8cff] font-medium" style={mono}>Opus 4.7 clustering arguments...</p>
                  </div>
                )}
                {recentExtractions.length === 0 && phase === "extracting" && (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 text-[#f0a500] animate-spin mx-auto" />
                    <p className="mt-4 text-sm text-[#f0a500] font-medium" style={mono}>Decomposing {extractionCount.total} comments...</p>
                  </div>
                )}
                {recentExtractions.map((a, i) => (
                  <div key={`${a.comment_id}-${i}`} className="rounded-md border border-[#f0a500]/20 bg-[#f0a500]/5 px-3 py-2.5 animate-card-enter">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#8b949e]" style={mono}>{a.comment_id}</span>
                      <span className="text-[9px] tracking-wider uppercase text-[#f0a500] font-semibold" style={mono}>{a.policy_area}</span>
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-[#e6edf3]">{a.claim}</div>
                    <div className="mt-1 text-[11px] text-[#8b949e] line-clamp-2">
                      <span className="font-semibold text-[#f0a500]/70">Evidence: </span>{a.evidence}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL 3: Response Document */}
        <div className="w-[440px] shrink-0 flex flex-col">
          <PanelHead title="Response Document" sub="Draft Staff Review / ORS 183.335" icon={<FileText className="h-4 w-4 text-[#bc8cff]" />} />
          <div className="flex-1 overflow-y-auto">
            {!selectedCluster && !responding && (
              <div className="h-full flex items-center justify-center px-10">
                <div className="text-center">
                  <Scale className="h-12 w-12 text-[#30363d] mx-auto" />
                  <p className="mt-5 text-sm text-[#8b949e] leading-relaxed">
                    Select a policy argument family, expand it, and click &quot;Generate Draft Response&quot; to produce the staff review scaffold.
                  </p>
                  <p className="mt-3 text-xs text-[#8b949e]" style={mono}>
                    Output is structured intelligence for human review, not a final determination.
                  </p>
                </div>
              </div>
            )}

            {selectedCluster && responding && (
              <div className="p-5 space-y-4">
                <div className="text-[9px] tracking-[0.2em] uppercase text-[#f85149] font-bold" style={mono}>Draft Staff Review Response</div>
                <div className="text-base font-semibold text-[#e6edf3]" style={display}>{selectedCluster.representative_claim}</div>
                <div className="space-y-2.5 mt-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-3 bg-[#21262d] rounded animate-pulse" style={{ width: `${90 - i * 8}%` }} />
                  ))}
                </div>
                <p className="mt-6 text-[11px] text-[#484f58] italic" style={mono}>
                  Opus 4.7 reasoning across {selectedCluster.comment_ids.length} comments
                  {selectedCluster.expert_count > 0 ? ` including ${selectedCluster.expert_count} expert testimonies` : ""}...
                </p>
              </div>
            )}

            {selectedCluster && agencyResponse && !responding && (
              <GovDocPanel cluster={selectedCluster} response={agencyResponse} onCitationClick={openTraceDrawer} />
            )}
          </div>
        </div>
      </div>

      {/* Trace drawer */}
      {traceDrawer && (
        <TraceDrawer commentId={traceDrawer.commentId} comment={traceDrawer.comment} argument={traceDrawer.argument} onClose={() => setTraceDrawer(null)} />
      )}
    </div>
  );
}

/* ====================================================================
   Government Document Panel (off-white inside dark shell)
   ==================================================================== */

function GovDocPanel({
  cluster,
  response,
  onCitationClick,
}: {
  cluster: ArgumentCluster;
  response: AgencyResponse;
  onCitationClick: (commentId: string) => void;
}) {
  const paragraphs = response.response_text.split("\n").filter((p) => p.trim().length > 0);

  return (
    <div className="m-3 rounded-md overflow-hidden">
      <div className="bg-[#faf8f5] p-6 gov-doc">
        {/* Header */}
        <div className="border-b-2 border-[#1a1a1a] pb-3 mb-5">
          <div className="text-xs tracking-[0.2em] uppercase text-[#8b0000] font-bold" style={mono}>
            Draft Staff Review Response
          </div>
          <div className="text-[11px] tracking-[0.12em] uppercase text-[#666] mt-1" style={mono}>
            OR-DEQ-2026-AQ-014 / Proposed Amendments to OAR 340-200
          </div>
          <div className="text-[11px] tracking-[0.12em] uppercase text-[#8b0000] mt-1 font-semibold" style={mono}>
            Not for official use
          </div>
        </div>

        {/* Policy family */}
        <div className="mb-5">
          <div className="text-xs tracking-[0.12em] uppercase text-[#666] font-semibold" style={mono}>
            Policy Family: {response.policy_family}
          </div>
          <h3 className="text-lg font-bold text-[#1a1a1a] mt-2 leading-snug" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {cluster.representative_claim}
          </h3>
        </div>

        {/* Body text */}
        <div className="space-y-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-sm leading-[1.8] text-[#2a2a2a]">
              <ClickableIds text={para} onClick={onCitationClick} />
            </p>
          ))}
        </div>

        {/* Citations */}
        <div className="mt-8 border-t border-[#ccc] pt-5">
          <div className="text-xs tracking-[0.12em] uppercase text-[#666] font-bold mb-3" style={mono}>
            Source Comments
          </div>
          <div className="space-y-2">
            {response.citations.map((cite) => (
              <button
                key={cite.comment_id}
                onClick={() => onCitationClick(cite.comment_id)}
                className="w-full text-left rounded-lg border border-[#ddd] bg-white px-3.5 py-2.5 hover:bg-[#fff8e7] hover:border-[#f0a500] transition text-sm"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#b37800] font-bold underline" style={mono}>{cite.comment_id}</span>
                  <span className="text-[#333] font-medium text-sm">{cite.submitter}</span>
                  {cite.submitter_org && <span className="text-xs text-[#666]">({cite.submitter_org})</span>}
                </div>
                <div className="mt-1.5 text-xs text-[#555] italic line-clamp-2">&quot;{cite.quote}&quot;</div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t-2 border-[#1a1a1a] pt-4">
          <p className="text-xs text-[#888] italic leading-relaxed" style={{ fontFamily: "system-ui, sans-serif" }}>
            This document was generated by Cascade as structured intelligence for staff review. It does not constitute an
            official agency determination and requires human analyst review before any official action. Bidirectional
            traceability maintained for judicial review compliance under APA Section 553.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
   Clickable comment IDs in response text
   ==================================================================== */

function ClickableIds({ text, onClick }: { text: string; onClick: (id: string) => void }) {
  const pattern = /OR-DEQ-2026-\d{5}/g;
  const parts: Array<{ type: "text" | "id"; value: string }> = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    parts.push({ type: "id", value: match[0] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.type === "id" ? (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); onClick(p.value); }}
            className="inline text-[#b37800] font-bold underline decoration-[#b37800]/40 hover:decoration-[#b37800] hover:text-[#8b0000] cursor-pointer transition"
            style={{ fontSize: "inherit", fontFamily: "var(--font-mono-stack)" }}
          >
            {p.value}
          </button>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  );
}

/* ====================================================================
   Trace Drawer (slide-in from right)
   ==================================================================== */

function TraceDrawer({
  commentId,
  comment,
  argument,
  onClose,
}: {
  commentId: string;
  comment: ClassifiedComment | null;
  argument: ExtractedArgument | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[460px] bg-[#161b22] border-l border-[#30363d] shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-[#161b22] border-b border-[#21262d] px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-[#8b949e] font-bold" style={mono}>Comment Traceability</div>
            <div className="text-sm text-[#f0a500] font-bold mt-1" style={mono}>{commentId}</div>
          </div>
          <button onClick={onClose} className="text-[#484f58] hover:text-[#e6edf3] transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {comment ? (
            <>
              <div>
                <Label>Submitter</Label>
                <div className="text-sm font-semibold text-[#e6edf3]">{comment.submitter}</div>
                {comment.submitter_org && <div className="text-xs text-[#8b949e] mt-0.5">{comment.submitter_org}</div>}
              </div>

              <div>
                <Label>Classification (Agent 1)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <CatBadge category={comment.category} />
                  <span className="text-xs text-[#8b949e]" style={mono}>{(comment.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="text-xs text-[#8b949e] mt-2">{comment.reasoning}</div>
              </div>

              <div>
                <Label>Original Comment</Label>
                <div className="mt-1.5 text-sm text-[#e6edf3] bg-[#0d1117] border border-[#30363d] rounded-md p-3.5 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                  {comment.text}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-[#484f58] italic py-4">Comment {commentId} not found in classified dataset.</div>
          )}

          {argument && (
            <div>
              <Label>Extracted Argument (Agent 2)</Label>
              <div className="mt-1.5 bg-[#f0a500]/5 border border-[#f0a500]/20 rounded-md p-3.5 space-y-2.5">
                <ArgField label="Claim" value={argument.claim} />
                <ArgField label="Evidence" value={argument.evidence} />
                <ArgField label="Mechanism" value={argument.mechanism} />
                <ArgField label="Affected Parties" value={argument.affected_parties} />
                <ArgField label="Policy Area" value={argument.policy_area} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ====================================================================
   Small shared pieces
   ==================================================================== */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs tracking-[0.15em] uppercase text-[#8b949e] font-bold mb-1" style={mono}>{children}</div>;
}

function ArgField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs tracking-wider uppercase text-[#f0a500] font-bold" style={mono}>{label}: </span>
      <span className="text-sm text-[#e6edf3]">{value}</span>
    </div>
  );
}

const CAT_BORDERS: Record<string, string> = {
  form_letter: "border-l-[#484f58]",
  individual_opinion: "border-l-[#58a6ff]",
  substantive_argument: "border-l-[#f0a500]",
  expert_testimony: "border-l-[#f0a500]",
};

const CAT_LABELS: Record<string, string> = {
  form_letter: "FORM",
  individual_opinion: "INDIVIDUAL",
  substantive_argument: "SUBSTANTIVE",
  expert_testimony: "EXPERT",
};

const CAT_COLORS: Record<string, string> = {
  form_letter: "text-[#484f58]",
  individual_opinion: "text-[#58a6ff]",
  substantive_argument: "text-[#f0a500]",
  expert_testimony: "text-[#f0a500]",
};

function CatBadge({ category }: { category: string }) {
  const c: Record<string, string> = {
    form_letter: "text-[#484f58] border-[#484f58]/40 bg-[#484f58]/10",
    individual_opinion: "text-[#58a6ff] border-[#58a6ff]/30 bg-[#58a6ff]/10",
    substantive_argument: "text-[#f0a500] border-[#f0a500]/30 bg-[#f0a500]/10",
    expert_testimony: "text-[#f0a500] border-[#f0a500]/30 bg-[#f0a500]/10",
  };
  return (
    <span className={`text-[11px] tracking-wider uppercase font-bold border rounded px-2 py-0.5 ${c[category] || ""}`} style={mono}>
      {CAT_LABELS[category] || category}
    </span>
  );
}

function StreamCard({ comment }: { comment: ClassifiedComment }) {
  const isExpert = comment.category === "expert_testimony";
  return (
    <div className={`rounded-lg border-l-[3px] ${CAT_BORDERS[comment.category] || "border-l-[#30363d]"} border border-[#30363d] bg-[#161b22] px-3.5 py-3 animate-card-enter ${isExpert ? "ring-1 ring-[#f0a500]/20" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#8b949e]" style={mono}>{comment.id}</span>
        <span className={`text-[11px] tracking-wider uppercase font-bold ${CAT_COLORS[comment.category] || "text-[#8b949e]"}`} style={mono}>
          {CAT_LABELS[comment.category]}
        </span>
      </div>
      <div className="mt-1.5 text-sm font-semibold text-[#e6edf3]">
        {comment.submitter}
        {comment.submitter_org && <span className="text-[#8b949e] font-normal text-xs"> ({comment.submitter_org})</span>}
      </div>
      <div className="mt-1.5 text-[13px] text-[#b1bac4] leading-relaxed line-clamp-2">{comment.text.slice(0, 160)}</div>
      <div className="mt-2 text-xs text-[#8b949e]">{(comment.confidence * 100).toFixed(0)}% &middot; {comment.reasoning}</div>
    </div>
  );
}

function PhaseChip({ phase }: { phase: Phase }) {
  const m: Record<Phase, [string, string]> = {
    idle: ["ready", "text-[#8b949e] border-[#30363d]"],
    classifying: ["classifying / Haiku", "text-[#58a6ff] border-[#58a6ff]/40 bg-[#58a6ff]/5"],
    extracting: ["extracting / Sonnet", "text-[#f0a500] border-[#f0a500]/40 bg-[#f0a500]/5"],
    clustering: ["clustering / Opus", "text-[#bc8cff] border-[#bc8cff]/40 bg-[#bc8cff]/5"],
    complete: ["complete", "text-[#3fb950] border-[#3fb950]/40 bg-[#3fb950]/5"],
    error: ["error", "text-[#f85149] border-[#f85149]/40 bg-[#f85149]/5"],
  };
  const [label, cls] = m[phase];
  const active = phase === "classifying" || phase === "extracting" || phase === "clustering";
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase border ${cls}`} style={mono}>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-glow" />}
      {label}
    </span>
  );
}

function Metric({ label, value, color, sub, highlight, active }: { label: string; value: string; color: string; sub?: string; highlight?: boolean; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${highlight ? "border-[#f0a500]/40 bg-[#f0a500]/5" : "border-[#30363d] bg-[#161b22]"}`}>
      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div>
        <div className="text-[11px] tracking-wider uppercase text-[#8b949e] font-semibold leading-none" style={mono}>{label}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-base font-bold tabular-nums leading-none" style={{ color, ...mono }}>{value}</span>
          {sub && <span className="text-xs text-[#8b949e]">{sub}</span>}
          {active && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color }} />}
        </div>
      </div>
    </div>
  );
}

function PanelHead({ title, sub, badge, icon }: { title: string; sub: string; badge?: string; icon: React.ReactNode }) {
  return (
    <div className="border-b border-[#21262d] px-4 py-3 flex items-center justify-between bg-[#161b22] shrink-0">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <div className="text-sm font-semibold text-[#e6edf3]">{title}</div>
          <div className="text-xs text-[#8b949e] tracking-wider uppercase" style={mono}>{sub}</div>
        </div>
      </div>
      {badge && <span className="text-xs text-[#8b949e] tabular-nums font-medium" style={mono}>{badge}</span>}
    </div>
  );
}

function LandingAgentCard({ step, model, title, desc, icon, color }: { step: string; model: string; title: string; desc: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#161b22] p-5 hover:border-[#484f58] transition-colors" style={{ borderLeftColor: color, borderLeftWidth: "3px" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-7 w-7 rounded-md flex items-center justify-center" style={{ backgroundColor: color + "15", color }}>
          {icon}
        </div>
        <span className="text-[10px] text-[#8b949e] tracking-wider" style={mono}>Agent {step} / {model}</span>
      </div>
      <div className="text-sm font-semibold text-[#e6edf3]">{title}</div>
      <div className="mt-1.5 text-xs text-[#8b949e] leading-relaxed">{desc}</div>
    </div>
  );
}
