import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import type { RawComment, ClassifiedComment } from "@/lib/types";
import { classifyStream } from "@/lib/agents/classifier";
import { extractArgumentsConcurrent } from "@/lib/agents/extractor";
import { clusterArguments } from "@/lib/agents/synthesizer";

export const runtime = "nodejs";
export const maxDuration = 300;

function loadComments(limit?: number): RawComment[] {
  const path = join(process.cwd(), "data", "comments.json");
  const all = JSON.parse(readFileSync(path, "utf-8")) as RawComment[];
  return limit ? all.slice(0, limit) : all;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit")
    ? parseInt(url.searchParams.get("limit")!)
    : undefined;

  const comments = loadComments(limit);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("start", { total: comments.length });

        // Phase 1: classify with Haiku
        const classified: ClassifiedComment[] = [];
        for await (const update of classifyStream(comments, 3)) {
          classified.push(...update.batch);
          send("classification", {
            batch: update.batch,
            processed: update.processed,
            total: update.total,
          });
        }

        const stats = {
          form_letters: classified.filter((c) => c.category === "form_letter").length,
          individual_opinions: classified.filter(
            (c) => c.category === "individual_opinion"
          ).length,
          substantive: classified.filter((c) => c.category === "substantive_argument")
            .length,
          expert: classified.filter((c) => c.category === "expert_testimony").length,
        };
        send("classification_done", { stats, classified_count: classified.length });

        // Phase 2: extract arguments from substantive + expert with Sonnet
        const targets = classified.filter(
          (c) =>
            c.category === "substantive_argument" || c.category === "expert_testimony"
        );
        send("extraction_start", { count: targets.length });

        const args = await extractArgumentsConcurrent(targets, 6, (arg, processed, total) => {
          send("extraction_progress", { argument: arg, processed, total });
        });

        send("extraction_done", { count: args.length });

        // Phase 3: cluster into policy families with Opus
        send("clustering_start", { count: args.length });
        const clusters = await clusterArguments(args, classified);
        send("clustering_done", {
          clusters,
          classified,
          arguments: args,
          stats: {
            ...stats,
            unique_arguments: clusters.length,
            campaigns_detected: new Set(
              classified.filter((c) => c.campaign_id).map((c) => c.campaign_id)
            ).size,
          },
        });

        send("complete", { ok: true });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
