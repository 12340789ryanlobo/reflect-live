export interface CsvRow {
  name: string;
  phone_e164: string;
  group: string;
}

export function parseSwimCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const [header, ...rows] = lines;
  const cols = header.split(',').map((c) => c.trim().toLowerCase());
  const nameIdx = cols.findIndex((c) => c === 'name');
  const numIdx = cols.findIndex((c) => c === 'number');
  const grpIdx = cols.findIndex((c) => c === 'group1' || c === 'group');
  return rows.map((row, i) => {
    const parts = row.split(',').map((c) => c.trim());
    if (parts.length < 3) throw new Error(`malformed row ${i + 2}: ${row}`);
    return {
      name: parts[nameIdx],
      phone_e164: parts[numIdx],
      group: parts[grpIdx],
    };
  });
}
