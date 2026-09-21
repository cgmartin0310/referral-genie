import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { csvEscape } from "./csv.js";
import type { NormalizedProvider, SpikeReport } from "./types.js";

const SAMPLE_LIMIT = 25;

function line(label: string, value: string | number): string {
  return `- ${label}: ${value}`;
}

export function renderMarkdown(report: SpikeReport): string {
  const quality = report.addressQuality;
  const pct = report.addressQualityPercent;
  const taxonomyRows = report.byPrimaryTaxonomy
    .map((row) => `| ${row.code} | ${row.description || ""} | ${row.count} |`)
    .join("\n");
  const groupRows = Object.entries(report.byGroup)
    .sort((a, b) => b[1] - a[1])
    .map(([group, count]) => `| ${group} | ${count} |`)
    .join("\n");
  const enumerationRows = Object.entries(report.byEnumeration)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `| ${kind} | ${count} |`)
    .join("\n");
  const qualityRow = (label: string, key: keyof typeof quality) =>
    `| ${label} | ${quality[key]} | ${pct[key]}% |`;

  return `# NPPES spike results

${line("Generated", report.generatedAt)}
${line("Source", report.source)}
${line("Source detail", report.sourceDetail)}
${line("County", `${report.county.name}, ${report.county.state} (${report.county.id}, FIPS ${report.county.fips})`)}
${line("Taxonomy allow-list size", report.taxonomyAllowListCount)}

## Counts

${line("Raw hits (including duplicate NPIs)", report.rawHitCount)}
${line("Unique NPIs before taxonomy filter", report.uniqueNpiBeforeTaxonomyFilter)}
${line("NPIs seen more than once", report.duplicateNpiCount)}
${line("Extra duplicate hits", report.extraDuplicateHits)}
${line("Unique NPIs dropped (no allow-listed taxonomy)", report.droppedNotInAllowList)}
${line("Unique NPIs kept", report.keptCount)}
${line("Truncated API queries", report.truncatedQueryCount)}

### Enumeration type

| Type | Count |
|------|------:|
${enumerationRows || "| (none) | 0 |"}

### Primary taxonomy

| Code | Description | Count |
|------|-------------|------:|
${taxonomyRows || "| (none) |  | 0 |"}

### Allow-list group

| Group | Count |
|-------|------:|
${groupRows || "| (none) | 0 |"}

## Address quality

Percents use unique kept NPIs as the denominator.

| Metric | Count | Percent |
|--------|------:|--------:|
${qualityRow("Missing address (no practice location, or blank street)", "missingAddress")}
${qualityRow("Missing practice location", "missingPracticeLocation")}
${qualityRow("Missing street", "missingStreet")}
${qualityRow("Missing phone", "missingPhone")}
${qualityRow("Missing city", "missingCity")}
${qualityRow("Invalid state", "invalidState")}
${qualityRow("Invalid ZIP", "invalidZip")}
${qualityRow("Unparseable city, state, or ZIP", "unparseableCityStateOrZip")}
${qualityRow("PO Box practice address", "poBox")}
${qualityRow("ZIP outside target county list", "zipOutsideCounty")}
${qualityRow("Boundary ZIP (crosses a county line)", "boundaryZip")}
${qualityRow("Deactivated NPI", "deactivated")}
${qualityRow("Matched on a secondary taxonomy only", "matchedOnSecondaryOnly")}
${qualityRow("Places-match ready (street, phone, parseable city/state/ZIP in county, not a PO Box, not deactivated)", "placesMatchReady")}

Boundary ZIPs are still counted as places-match ready. They are a geography caveat, not a broken address.

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

export function renderSampleCsv(providers: NormalizedProvider[]): string {
  const header = [
    "npi",
    "enumeration_type",
    "name",
    "primary_taxonomy_code",
    "primary_taxonomy_desc",
    "matched_group",
    "city",
    "state",
    "zip5",
    "has_phone",
    "flags",
    "address_1",
  ];
  const lines = [header.join(",")];
  for (const provider of providers.slice(0, SAMPLE_LIMIT)) {
    lines.push(
      [
        provider.npi,
        provider.enumerationType,
        provider.name,
        provider.primaryTaxonomyCode ?? "",
        provider.primaryTaxonomyDesc ?? "",
        provider.matchedGroup ?? "",
        provider.city,
        provider.state,
        provider.zip5,
        provider.hasPhone ? "yes" : "no",
        provider.flags.join("|"),
        provider.address1,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function writeReport(outDir: string, report: SpikeReport, providers: NormalizedProvider[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outDir, "summary.md"), renderMarkdown(report), "utf8");
  await writeFile(path.join(outDir, "sample.csv"), renderSampleCsv(providers), "utf8");
}
