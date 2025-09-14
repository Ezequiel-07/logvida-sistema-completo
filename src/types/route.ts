

// types/route.ts

export interface Address {
  id: string;
  description: string; // e.g., "123 Main St, Anytown, USA"
  latitude?: number | null;
  longitude?: number | null;
}

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface RouteStop {
  id: string;
  name?: string | null;
  address: Address;
  type: "origin" | "intermediate" | "destination";
  plannedTime?: string | null;
  checkedAt?: string | null;
  status: "pending" | "completed" | "skipped";
  deliveryConfirmed?: boolean | "n/d" | null;
  collectionConfirmed?: boolean | "n/d" | null;
  loadingConfirmed?: boolean | "n/d" | null;
  unloadingConfirmed?: boolean | "n/d" | "postponed" | null;
  notes?: string | null;
  loadingPhotoProofDataUrls?: string[] | null;
  deliveryPhotoProofDataUrls?: string[] | null;
  collectionPhotoProofDataUrls?: string[] | null;
  unloadingPhotoProofDataUrls?: string[] | null;
  signatureDataUrl?: string | null; // Para a assinatura digital
  loadingInstructions?: string | null;
}

// Rota modelo (definição / template)
export interface Route {
  id: string;
  name: string;
  origin: RouteStop;
  intermediateStops: RouteStop[];
  destination: RouteStop;
  status: "draft" | "scheduled" | "in-progress" | "completed" | "cancelled";
  createdAt: string; // ISO date string
  updatedAt?: string | null; // ISO date string
  totalDistanceKm?: number;
  totalDurationMinutes?: number;
  arterisTolls?: number; // Número de pedágios da Arteris
  ccrTolls?: number; // Número de pedágios da CCR
  totalTollCost?: number; // Custo total dos pedágios
}

// Detalhes do checkpoint em execução (para a rota em andamento)
export interface Checkpoint {
  status?: string;
  completionTime?: string; // ISO date string
  notes?: string;
  loadingPhotoProofDataUrls?: string[];
  deliveryPhotoProofDataUrls?: string[];
  collectionPhotoProofDataUrls?: string[];
  unloadingPhotoProofDataUrls?: string[];
  signatureDataUrl?: string[]; // Para a assinatura digital
  deliveryConfirmed?: boolean | "n/d";
  collectionConfirmed?: boolean | "n/d";
  loadingConfirmed?: boolean | "n/d";
  unloadingConfirmed?: boolean | "n/d" | "postponed";
}

// Parada durante a execução da rota, com checkpoint
export interface RouteExecutionStop {
  id: string;
  address: Address;
  status?: "pending" | "completed" | "skipped" | string;
  checkpoint?: Checkpoint;
}

// Rota em execução, usada para tela de execução / acompanhamento
export interface RouteExecution {
  id: string;
  name?: string;
  stops: RouteExecutionStop[];
  startedAt?: string; // ISO date string
  completedAt?: string; // ISO date string
  driverId?: string;
  vehicleId?: string;
  // outros campos que quiser incluir para execução...
}
