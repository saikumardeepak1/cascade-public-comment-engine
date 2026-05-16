import { NextRequest } from "next/server";
import { draftAgencyResponse } from "@/lib/agents/synthesizer";
import type { ArgumentCluster, ExtractedArgument, ClassifiedComment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    cluster: ArgumentCluster;
    arguments: ExtractedArgument[];
    classified: ClassifiedComment[];
  };

  try {
    const response = await draftAgencyResponse(
      body.cluster,
      body.arguments,
      body.classified
    );
    return Response.json(response);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
