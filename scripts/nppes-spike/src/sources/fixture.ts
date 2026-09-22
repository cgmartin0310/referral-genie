import { readFile } from "node:fs/promises";
import { hitFromApiResult, type ApiResult } from "../api-shape.js";
import type { RawHit } from "../types.js";

export async function loadFixtureHits(filePath: string): Promise<RawHit[]> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as ApiResult[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Fixture ${filePath} must be a JSON array of NPPES API result objects`);
  }
  return parsed.map((result) => hitFromApiResult(result)).filter((hit) => hit.npi);
}
