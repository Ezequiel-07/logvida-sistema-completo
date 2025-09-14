
"use client";

// src/lib/export-utils.ts
import * as XLSX from "xlsx";

/**
 * Exporta dados para um arquivo .xlsx.
 * @param data Uma matriz de matrizes com os dados a serem exportados. A primeira matriz deve ser o cabeçalho.
 * @param filename O nome do arquivo a ser criado (ex: "pedidos.xlsx").
 */
export function exportToXlsx(data: any[][], filename: string) {
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths for better readability
  const columnWidths = data[0].map((header, colIndex) => {
    let maxLength = String(header).length;
    for (let i = 1; i < data.length; i++) {
        const cellValue = data[i][colIndex];
        if (cellValue != null) {
            maxLength = Math.max(maxLength, String(cellValue).length);
        }
    }
    return { wch: maxLength + 2 }; // +2 for a little padding
  });
  worksheet['!cols'] = columnWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dados"); // O nome da aba será "Dados"
  XLSX.writeFile(workbook, filename, { bookType: "xlsx", type: "binary" });
}
