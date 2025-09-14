// utils.ts

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  parseISO,
  isToday, // Keep isToday as it's used
  format, // Keep format as it's used
  isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para unir e mesclar classes Tailwind + clsx
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Valida e formata uma data ISO para exibição com locale pt-BR
export function formatDateDisplay(
  dateStr?: string | null,
  withTime = false,
): string {
  if (!dateStr) return "N/D";
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return "Data Inválida";

    return format(date, withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", {
      locale: ptBR,
    });
  } catch {
    return "Erro na Data";
  }
}

/**
 * Safely converts a Firestore Timestamp, an ISO string, or a Date object to an ISO string.
 * Returns null if the input is invalid or null/undefined.
 */
export function toISOString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  // If it's a Firestore Timestamp
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    return (value as any).toDate().toISOString();
  }
  // If it's a JS Date object
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString();
    }
    return null;
  }
  // If it's already a string, assume it's an ISO string and validate it
  if (typeof value === "string") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  // Return null for any other invalid type or invalid date string
  return null;
}

// Verifica se a data é hoje
export function isDateToday(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const date = parseISO(dateStr);
  return isToday(date);
}

/**
 * Calculates the distance between two lat/lng coordinates in meters.
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns The distance in meters.
 */
export function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the initial bearing (direction) from one point to another.
 * @param lat1 Latitude of the starting point.
 * @param lon1 Longitude of the starting point.
 * @param lat2 Latitude of the destination point.
 * @param lon2 Longitude of the destination point.
 * @returns The bearing in degrees (0-360).
 */
export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRadians = (deg: number) => deg * Math.PI / 180;
    const toDegrees = (rad: number) => rad * 180 / Math.PI;

    const lat1Rad = toRadians(lat1);
    const lon1Rad = toRadians(lon1);
    const lat2Rad = toRadians(lat2);
    const lon2Rad = toRadians(lon2);

    const dLon = lon2Rad - lon1Rad;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
              
    let brng = toDegrees(Math.atan2(y, x));
    
    // Normalize to 0-360
    return (brng + 360) % 360;
}


// Escape de valores para CSV (ex: colocar aspas se tiver vírgulas, aspas duplas, etc)
export function escapeCsvValue(value: any): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Exporta array de arrays para CSV (com escape e cabeçalho opcional)
export function exportToCsv(rows: (string | number)[][], filename: string) {
  const csvString = rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
