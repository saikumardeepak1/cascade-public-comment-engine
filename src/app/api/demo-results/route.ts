import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const path = join(process.cwd(), "data", "demo-results.json");
    const data = readFileSync(path, "utf-8");
    return new Response(data, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "demo-results.json not found",
      },
      { status: 500 }
    );
  }
}
