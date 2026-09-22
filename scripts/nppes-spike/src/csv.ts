import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

/**
 * Streaming RFC 4180 reader. NPPES dissemination rows are wide and quoted.
 * Records are yielded one at a time so a multi-gigabyte monthly file is not loaded whole.
 */
export async function* iterateCsvRecords(stream: Readable): AsyncGenerator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let pendingQuote: string | null = null;
  let leftover = "";

  const pushChar = function* (char: string): Generator<string[]> {
    if (pendingQuote !== null) {
      if (char === '"') {
        field += '"';
        pendingQuote = null;
        return;
      }
      inQuotes = false;
      pendingQuote = null;
    }

    if (inQuotes) {
      if (char === '"') {
        pendingQuote = '"';
        return;
      }
      field += char;
      return;
    }

    if (char === '"') {
      inQuotes = true;
      return;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      return;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      const finished = row;
      row = [];
      yield finished;
      return;
    }
    if (char === "\r") {
      return;
    }
    field += char;
  };

  for await (const chunk of stream) {
    const text = leftover + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    leftover = "";
    for (let i = 0; i < text.length; i += 1) {
      yield* pushChar(text[i]);
    }
  }

  if (pendingQuote !== null) {
    inQuotes = false;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

export async function* iterateCsvObjects(filePath: string): AsyncGenerator<Record<string, string>> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let headers: string[] | null = null;
  for await (const record of iterateCsvRecords(stream)) {
    if (headers === null) {
      headers = record.map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, "") : cell));
      continue;
    }
    if (record.length === 1 && record[0] === "") {
      continue;
    }
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = record[index] ?? "";
    });
    yield obj;
  }
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
