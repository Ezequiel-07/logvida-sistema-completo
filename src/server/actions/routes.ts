
"use server";

import { getAdminDb } from "@/server/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { Quote } from "@/types/quote";
import type { Route, RouteStop } from "@/types/route";


// Function to call Google Maps Routes API
export async function getRouteDetailsWithTolls(
  originAddress: string,
  destinationAddress: string,
  intermediateAddresses: string[],
  optimize: boolean = false,
) {
  // Use a server-specific API key for security and quota management.
  // This key should NOT have HTTP referrer restrictions.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_GOOGLE_MAPS_API_KEY") || apiKey.trim() === "") {
    console.error("[getRouteDetailsWithTolls] GOOGLE_MAPS_SERVER_API_KEY is not configured in .env.local");
    return { success: false, error: "A chave da API do Google para o servidor (GOOGLE_MAPS_SERVER_API_KEY) não está configurada. Verifique o arquivo .env.local e o README." };
  }

  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body = {
    origin: { address: originAddress },
    destination: { address: destinationAddress },
    intermediates: intermediateAddresses
        .filter(addr => addr && addr.trim() !== "") // Ensure we don't send empty waypoints
        .map(addr => ({ address: addr })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    extraComputations: ['TOLLS'],
    languageCode: 'pt-BR',
    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: true,
    },
    optimizeWaypointOrder: optimize,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    if (!response.ok) {
        const errorMessage = responseData?.error?.message || `Erro ${response.status} ao chamar a Routes API.`;
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('UNAUTHENTICATED')) {
             return { success: false, error: "A chave da Google Routes API é inválida ou não tem permissão. Verifique sua configuração no Google Cloud." };
        }
        if (errorMessage.includes('Billing account not configured') || errorMessage.includes('Billing is not enabled')) {
            return { success: false, error: "Faturamento não habilitado para a Google Routes API. Verifique seu painel do Google Cloud." };
        }
        return { success: false, error: errorMessage };
    }

    if (!responseData.routes || responseData.routes.length === 0) {
      return { success: false, error: "Nenhuma rota encontrada para os endereços fornecidos." };
    }

    const route = responseData.routes[0];
    const distanceKm = route.distanceMeters / 1000;
    
    // Safer duration parsing
    const durationSeconds = route.duration ? parseInt(route.duration.replace('s','')) : 0;
    const durationMinutes = Math.round(durationSeconds / 60);
    
    const polyline = route.polyline?.encodedPolyline;
    
    // Safer toll cost calculation
    const tollCost = route.travelAdvisory?.tollInfo?.estimatedPrice?.reduce((sum: number, price: any) => {
        const units = parseInt(price.units) || 0;
        const nanos = price.nanos || 0;
        return sum + units + nanos / 1_000_000_000;
    }, 0) || 0;

    return {
      success: true,
      data: {
        distance: parseFloat(distanceKm.toFixed(1)),
        duration: durationMinutes,
        polyline: polyline,
        tolls: parseFloat(tollCost.toFixed(2)),
        optimizedWaypointOrder: route.optimizedIntermediateWaypointIndex,
      },
    };
  } catch (error) {
    return { success: false, error: "Falha na comunicação com a API de rotas." };
  }
}
