/**
 * Utilitas CSV / Excel-compatible Parser & Exporter
 * Mendukung delimiter koma (,), titik koma (;) khas Excel Indonesia, dan Tab (\t).
 */

export function parseCsvText(csvText: string): Record<string, string>[] {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) return [];

  // Deteksi delimiter otomatis dari baris header
  const headerLine = lines[0];
  let delimiter = ',';
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  } else if (semicolonCount > commaCount) {
    delimiter = ';';
  }

  const splitRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitRow(lines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  );

  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    if (values.every((v) => v === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    records.push(obj);
  }

  return records;
}

export function generateCsvContent(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const allLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];

  // Tambahkan UTF-8 BOM agar Microsoft Excel langsung mengenali kolom & karakter UTF-8
  return '\uFEFF' + allLines.join('\r\n');
}

export function downloadCsvFile(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const content = generateCsvContent(headers, rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Mengonversi teks hari keaktifan (misal "Senin,Selasa,Rabu" atau "1,2,3,4,5" atau "Senin-Jumat")
 * menjadi JSON array nomor hari: "[1,2,3,4,5]"
 */
export function parseActiveDaysInput(raw: string | undefined): number[] {
  if (!raw || !raw.trim()) return [1, 2, 3, 4, 5];
  const text = raw.toLowerCase().trim();

  if (text.includes('senin-jumat') || text.includes('senin - jumat')) {
    return [1, 2, 3, 4, 5];
  }
  if (text.includes('senin-sabtu') || text.includes('senin - sabtu') || text === 'semua') {
    return [1, 2, 3, 4, 5, 6];
  }

  const dayMap: Record<string, number> = {
    '1': 1,
    senin: 1,
    sen: 1,
    '2': 2,
    selasa: 2,
    sel: 2,
    '3': 3,
    rabu: 3,
    rab: 3,
    '4': 4,
    kamis: 4,
    kam: 4,
    '5': 5,
    jumat: 5,
    "jum'at": 5,
    jum: 5,
    '6': 6,
    sabtu: 6,
    sab: 6,
  };

  const tokens = text.split(/[,;|/\s]+/).filter(Boolean);
  const result = new Set<number>();
  for (const token of tokens) {
    const clean = token.replace(/[\[\]"]/g, '');
    if (dayMap[clean]) {
      result.add(dayMap[clean]);
    }
  }

  return result.size > 0 ? Array.from(result).sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

export const DAY_NAMES: Record<number, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};
