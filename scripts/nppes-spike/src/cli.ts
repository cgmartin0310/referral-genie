import { DEFAULT_FIXTURE, DEFAULT_OUT_DIR } from "./paths.js";
import { runSpike } from "./run.js";
import type { SpikeSource } from "./types.js";

const FORBIDDEN = ["--google", "--places", "--upsert", "--write-db", "--prisma"];

function usage(): string {
  return `NPPES county spike — count therapy-relevant NPIs and measure address dirtiness.

This command does not call Google Places and does not write to Prisma or ReferralSource.

Usage:
  npm run spike:fixture
  npm run spike:live
  npm run spike -- --file /path/to/npidata_pfile.csv

Options:
  --fixture              Read fixtures/api-results.json (no network)
  --live                 Query the NPPES Read API 2.1 for the county ZIP list
  --file <csv>           Stream an official NPPES dissemination CSV (unzipped)
  --county <id>          County id (default: forsyth-nc, or NPPES_COUNTY)
  --out <dir>            Output directory (default: scripts/nppes-spike/out, or NPPES_OUT_DIR)
  --delay-ms <n>         Pause between API requests (default: 250, or NPPES_DELAY_MS)
  --help                 Show this help

Writes out/summary.json, out/summary.md, and out/sample.csv (25 rows).
`;
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const banned = argv.filter((arg) => FORBIDDEN.includes(arg));
  if (banned.length > 0) {
    console.error(
      `Refusing ${banned.join(", ")}. This spike does not call Google Places and does not upsert ReferralSource.`,
    );
    process.exit(1);
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const wantsFixture = argv.includes("--fixture");
  const wantsLive = argv.includes("--live");
  const filePath = readOption(argv, "--file");
  const selected = [wantsFixture, wantsLive, Boolean(filePath)].filter(Boolean).length;
  if (selected !== 1) {
    console.error(usage());
    process.exit(selected === 0 ? 0 : 1);
  }

  if (process.env.DATABASE_URL) {
    console.error("DATABASE_URL is set. This spike does not read or write it.");
  }

  const source: SpikeSource = wantsLive ? "api" : filePath ? "file" : "fixture";
  const countyId = readOption(argv, "--county") ?? process.env.NPPES_COUNTY ?? "forsyth-nc";
  const outDir = readOption(argv, "--out") ?? process.env.NPPES_OUT_DIR ?? DEFAULT_OUT_DIR;
  const delayMs = Number(readOption(argv, "--delay-ms") ?? process.env.NPPES_DELAY_MS ?? "250");
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative number");
  }

  const { report } = await runSpike({
    source,
    countyId,
    outDir,
    fixturePath: DEFAULT_FIXTURE,
    filePath,
    delayMs,
    onProgress: (message) => console.error(message),
  });

  console.log(`Kept ${report.keptCount} unique NPIs in ${report.county.name}, ${report.county.state}.`);
  console.log(`Places-match ready: ${report.addressQuality.placesMatchReady} (${report.addressQualityPercent.placesMatchReady}%).`);
  console.log(`Wrote ${outDir}/summary.json, summary.md, and sample.csv.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
