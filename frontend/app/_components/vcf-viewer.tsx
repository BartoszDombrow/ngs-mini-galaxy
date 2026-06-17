"use client";

import React, { useMemo, useState } from "react";

interface VcfViewerProps {
  vcfText: string;
}

export function VcfViewer({ vcfText }: VcfViewerProps) {
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;

  const { headers, dataRows, metaLines } = useMemo(() => {
    const lines = vcfText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const meta: string[] = [];
    let headerLine = "";
    const rows: string[][] = [];

    for (const line of lines) {
      if (line.startsWith("##")) {
        meta.push(line);
      } else if (line.startsWith("#CHROM")) {
        headerLine = line.substring(1); // remove '#'
      } else if (!line.startsWith("#")) {
        rows.push(line.split("\t"));
      }
    }

    const h = headerLine ? headerLine.split("\t") : ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT", "SAMPLE"];
    return { headers: h, dataRows: rows, metaLines: meta };
  }, [vcfText]);

  const pageCount = Math.ceil(dataRows.length / rowsPerPage);
  const displayedRows = dataRows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-line bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-text">Przeglądarka VCF (Zidentyfikowano {dataRows.length} wariantów)</h3>
        <p className="mt-1 text-xs text-muted">Pokazuję stronę {page + 1} z {pageCount || 1}</p>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-gray-100 shadow-sm">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 font-semibold text-muted border-b border-line">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {displayedRows.length > 0 ? (
              displayedRows.map((row, i) => (
                <tr key={i} className="hover:bg-primary/5 transition-colors">
                  {row.map((cell, j) => {
                    // Limit text length for INFO column to prevent massive rows
                    const isInfo = headers[j] === "INFO";
                    const displayCell = isInfo && cell.length > 100 ? cell.substring(0, 100) + "..." : cell;
                    
                    return (
                      <td key={j} className="px-3 py-2 text-text" title={isInfo ? cell : undefined}>
                        {displayCell}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-muted">
                  Brak wariantów do wyświetlenia lub plik jest nieprawidłowy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-line bg-gray-50 px-4 py-2">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded border border-line bg-white px-3 py-1 text-xs font-medium text-text hover:bg-gray-50 disabled:opacity-50"
        >
          Poprzednia
        </button>
        <span className="text-xs font-medium text-muted">
          Strona {page + 1} / {pageCount || 1}
        </span>
        <button
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          className="rounded border border-line bg-white px-3 py-1 text-xs font-medium text-text hover:bg-gray-50 disabled:opacity-50"
        >
          Następna
        </button>
      </div>
    </div>
  );
}
