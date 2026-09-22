/**
 * Minimal CSV line parsing for the NPI dissemination file: every field is
 * double-quoted, quotes inside a field are doubled, and no field contains a
 * newline. Handles unquoted fields too.
 */
export function parseCsvLine(line: string): string[] {
  // Fast path: the NPI file quotes every field and almost never doubles a quote.
  const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') && !trimmed.includes('""')) {
    const inner = trimmed.slice(1, -1);
    if (!inner.includes('"')) return inner.split('","');
  }
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Column index by header name, so the loader never depends on column order. */
export function headerIndex(header: string[]): (name: string) => number {
  const map = new Map(header.map((name, index) => [name.trim(), index]));
  return (name: string) => {
    const index = map.get(name);
    if (index === undefined) throw new Error(`NPI file has no column named "${name}"`);
    return index;
  };
}
