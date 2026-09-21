import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PACKAGE_ROOT } from "./paths.js";
import { runSpike } from "./run.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const disseminationFixture = path.resolve(here, "../fixtures/dissemination-sample.csv");

function flagsOf(providers: { npi: string; flags: string[] }[], npi: string): string[] {
  const found = providers.find((row) => row.npi === npi);
  assert.ok(found, `missing NPI ${npi}`);
  return found.flags;
}

async function checkFixture(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "nppes-fixture-"));
  const { report, providers } = await runSpike({
    source: "fixture",
    countyId: "forsyth-nc",
    outDir,
    fixturePath: path.join(PACKAGE_ROOT, "fixtures", "api-results.json"),
  });

  assert.equal(report.rawHitCount, 18);
  assert.equal(report.uniqueNpiBeforeTaxonomyFilter, 17);
  assert.equal(report.duplicateNpiCount, 1);
  assert.equal(report.extraDuplicateHits, 1);
  assert.equal(report.droppedNotInAllowList, 4);
  assert.equal(report.excludedSecondaryOnly, 1);
  assert.equal(report.keptCount, 12);
  assert.equal(providers.some((row) => row.npi === "9000000011"), false);
  assert.equal(providers.some((row) => row.npi === "9000000014"), false);
  assert.equal(providers.some((row) => row.npi === "9000000015"), false);
  assert.equal(providers.some((row) => row.npi === "9000000016"), false);
  assert.equal(providers.some((row) => row.npi === "9000000017"), false);
  assert.equal(report.byEnumeration["NPI-1"], 11);
  assert.equal(report.byEnumeration["NPI-2"], 1);
  assert.equal(report.byGroup.pcp_family_medicine, 10);
  assert.equal(report.byGroup.pediatrics, 2);
  assert.equal(report.byGroup.nurse_practitioner ?? 0, 0);
  assert.equal(report.byGroup.orthopaedics ?? 0, 0);
  assert.equal(report.byGroup.physician_assistant ?? 0, 0);
  assert.equal(report.byGroup.neurology ?? 0, 0);
  assert.equal(report.addressQuality.missingAddress, 2);
  assert.equal(report.addressQuality.missingPhone, 2);
  assert.equal(report.addressQuality.unparseableCityStateOrZip, 3);
  assert.equal(report.addressQuality.poBox, 1);
  assert.equal(report.addressQuality.zipOutsideCounty, 1);
  assert.equal(report.addressQuality.boundaryZip, 2);
  assert.equal(report.addressQuality.deactivated, 1);
  assert.equal(report.addressQuality.matchedOnSecondaryOnly, 0);
  assert.equal(report.addressQuality.placesMatchReady, 4);

  assert.deepEqual(flagsOf(providers, "9000000001"), []);
  assert.ok(flagsOf(providers, "9000000002").includes("boundary_zip"));
  assert.ok(flagsOf(providers, "9000000003").includes("missing_address"));
  assert.ok(flagsOf(providers, "9000000004").includes("missing_phone"));
  assert.ok(flagsOf(providers, "9000000005").includes("po_box"));
  assert.ok(flagsOf(providers, "9000000006").includes("invalid_state"));
  assert.ok(flagsOf(providers, "9000000006").includes("invalid_zip"));
  assert.ok(flagsOf(providers, "9000000007").includes("missing_city"));
  assert.ok(flagsOf(providers, "9000000008").includes("zip_outside_county"));
  assert.ok(flagsOf(providers, "9000000009").includes("deactivated"));
  assert.ok(flagsOf(providers, "9000000012").includes("boundary_zip"));
  assert.ok(!flagsOf(providers, "9000000012").includes("po_box"));
  assert.ok(flagsOf(providers, "9000000013").includes("missing_practice_location"));
  assert.equal(providers.find((row) => row.npi === "9000000012")?.address1, "12 CLINIC DR");
  assert.equal(providers.find((row) => row.npi === "9000000002")?.name, "ARDMORE FAMILY PRACTICE");

  const summary = JSON.parse(await readFile(path.join(outDir, "summary.json"), "utf8")) as { keptCount: number };
  assert.equal(summary.keptCount, 12);
  const sample = await readFile(path.join(outDir, "sample.csv"), "utf8");
  assert.ok(sample.startsWith("npi,enumeration_type,"));
  assert.ok(sample.includes("9000000005"));
  assert.ok(!sample.includes("9000000011"));
  const markdown = await readFile(path.join(outDir, "summary.md"), "utf8");
  assert.match(markdown, /did not call Google Places/);
  assert.match(markdown, /did not read or write Prisma/);
}

async function checkDissemination(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "nppes-csv-"));
  const { report, providers } = await runSpike({
    source: "file",
    countyId: "forsyth-nc",
    outDir,
    filePath: disseminationFixture,
  });
  assert.equal(report.rawHitCount, 4);
  assert.equal(report.duplicateNpiCount, 1);
  assert.equal(report.droppedNotInAllowList, 1);
  assert.equal(report.keptCount, 2);
  const org = providers.find((row) => row.npi === "9000000103");
  assert.ok(org);
  assert.equal(org?.name, "HELPING HANDS, EI");
  assert.equal(org?.enumerationType, "NPI-2");
  assert.ok(org?.flags.includes("missing_address"));
  const person = providers.find((row) => row.npi === "9000000101");
  assert.equal(person?.primaryTaxonomyCode, "207Q00000X");
  assert.equal(person?.flags.length, 0);
}

async function main(): Promise<void> {
  await checkFixture();
  await checkDissemination();
  console.log("nppes spike self-check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
