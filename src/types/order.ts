

import type { DayOfWeek } from "@/types/route";

export interface RouteStop {
  id: string;
  name?: string | null;
  address: {
    id: string;
    description: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  type: "origin" | "intermediate" | "destination";
  plannedTime?: string | null; // Adicionado para horário
  checkedAt?: string | null;
  status: "pending" | "completed" | "skipped";
  deliveryConfirmed?: boolean | "n/d" | "postponed" | null;
  collectionConfirmed?: boolean | "n/d" | "postponed" | null;
  loadingConfirmed?: boolean | "n/d" | "postponed" | null;
  unloadingConfirmed?: boolean | "n/d" | "postponed" | null;
  notes?: string | null;
  loadingPhotoProofDataUrls?: string[] | null;
  deliveryPhotoProofDataUrls?: string[] | null;
  collectionPhotoProofDataUrls?: string[] | null;
  unloadingPhotoProofDataUrls?: string[] | null;
  signatureDataUrl?: string | null; // Para a assinatura digital
  loadingInstructions?: string | null;
}

export interface BoxDetails {
    type: string;
    quantity: number;
    weight: number;
    price?: number; // Added price per unit for manual override
}

// Interface for checkpoint confirmation details, moved here
export interface CheckpointConfirmationDetails {
  notes?: string | null;
  loadingPhotoProofDataUrls?: string[] | null;
  deliveryPhotoProofDataUrls?: string[] | null;
  collectionPhotoProofDataUrls?: string[] | null;
  unloadingPhotoProofDataUrls?: string[] | null;
  signatureDataUrl?: string | null;
  loadingConfirmed?: boolean | "n/d" | "postponed" | null;
  deliveryConfirmed?: boolean | "n/d" | "postponed" | null;
  collectionConfirmed?: boolean | "n/d" | "postponed" | null;
  unloadingConfirmed?: boolean | "n/d" | "postponed" | null;
}

export interface Order {
  id: string;
  clientId: string;
  clientCompanyName: string;
  clientCnpj: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  createdAt: string; // ISO string
  vidaLogInfo: {
    name: string;
    cnpj: string;
    address: string;
    cep: string;
  };

  serviceDate?: string | null; // Pode conter data e hora
  repeatDaysOrder?: DayOfWeek[];

  pricingMethod: "perBox" | "perRoute";

  numberOfBoxes?: number | null;
  pricePerBox?: number | null; // Manter para compatibilidade, mas a lógica agora usa boxDetails
  boxDetails?: BoxDetails[]; // Novo campo para precificação detalhada

  routeDistanceKm?: number | null;
  totalDurationMinutes?: number | null;
  pricePerKm?: number | null;
  fuelCost?: number | null;
  routeTollCost?: number | null;
  tdeValue?: number | null; // Tempo de Espera
  arterisTolls?: number | null; // Keep for data consistency
  ccrTolls?: number | null; // Keep for data consistency
  transportServiceCost?: number | null;

  originStop: RouteStop;
  intermediateStopsOrder?: RouteStop[];
  destinationStop: RouteStop;

  totalValue: number;

  paymentStatus: "pending" | "paid" | "overdue";
  paidAt?: string | null;
  paymentMethod?: "pix" | "bank_transfer" | "cash" | "credit_card" | null;
  invoiced?: boolean; // Novo campo para controle de faturamento
  invoicedAt?: string | null; // ISO string

  executionStatus: "pending" | "in-progress" | "completed" | "cancelled";

  // Adicionados para controle da execução
  startedAt?: string | null;
  completedAt?: string | null;

  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  
  // Vehicle info can be null if driver has no vehicle assigned
  assignedVehicleId?: string | null;
  assignedVehicleName?: string | null;
  assignedVehiclePlate?: string | null;
  
  updatedAt?: string | null;
  updatedBy?: { id: string; name: string; } | null;

  // Adicionado para consistência
  selectedRouteName?: string | null;
  selectedRouteId?: string | null;
  notes?: string | null;
  totalTollCost?: number | null; // Adicionado para consistência
}
