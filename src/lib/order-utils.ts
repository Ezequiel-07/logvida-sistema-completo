
// src/lib/order-utils.ts
import type { DocumentSnapshot } from "firebase/firestore";
import type { Order, RouteStop } from "@/types/order";
import { toISOString } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";

const sanitizeStop = (stopData: any, index: number, orderId: string): RouteStop | null => {
  if (typeof stopData !== "object" || stopData === null) {
    return null;
  }
  
  if (typeof stopData.address !== 'object' || stopData.address === null) {
      stopData.address = { description: "" };
  }
  
  if (
    typeof stopData.address.description !== "string" ||
    !stopData.address.description.trim()
  ) {
    return null;
  }
  
  if (
    typeof stopData.type !== "string" ||
    typeof stopData.status !== "string"
  ) {
    return null;
  }

  // Use a more robust unique key generation
  const stopId = stopData.id ?? `stop_${orderId}_${index}`;

  return {
    id: stopId,
    name: stopData.name ?? null,
    address: {
      id: stopData.address.id ?? `addr_fallback_${stopId}`,
      description: stopData.address.description,
      latitude: stopData.address.latitude ?? null,
      longitude: stopData.address.longitude ?? null,
    },
    type: stopData.type as RouteStop['type'],
    status: stopData.status as RouteStop['status'],
    plannedTime: stopData.plannedTime ?? null,
    checkedAt: toISOString(stopData.checkedAt) ?? null,
    deliveryConfirmed: stopData.deliveryConfirmed ?? null,
    collectionConfirmed: stopData.collectionConfirmed ?? null,
    loadingConfirmed: stopData.loadingConfirmed ?? null,
    unloadingConfirmed: stopData.unloadingConfirmed ?? null,
    notes: stopData.notes ?? null,
    loadingPhotoProofDataUrls: stopData.loadingPhotoProofDataUrls ?? null,
    deliveryPhotoProofDataUrls: stopData.deliveryPhotoProofDataUrls ?? null,
    collectionPhotoProofDataUrls: stopData.collectionPhotoProofDataUrls ?? null,
    unloadingPhotoProofDataUrls: stopData.unloadingPhotoProofDataUrls ?? null,
    signatureDataUrl: stopData.signatureDataUrl ?? null,
    loadingInstructions: stopData.loadingInstructions ?? null,
  };
};

/**
 * Takes a Firestore DocumentSnapshot and sanitizes it into a consistent Order object.
 * This function is crucial for preventing crashes due to malformed data in the database.
 * It ensures that essential fields exist and optional fields default to `null`.
 *
 * @param doc The Firestore DocumentSnapshot of an order.
 * @param _componentName The name of the calling component, for logging purposes.
 * @param vehicles A pre-fetched list of all vehicles to find the assigned one.
 * @returns A sanitized Order object, or null if the data is critically malformed.
 */
export const sanitizeOrderFromFirestore = (
  doc: DocumentSnapshot,
  _componentName?: string,
  vehicles?: Vehicle[],
): Order | null => {
  const rawData = doc.data();
  if (!rawData) {
    return null;
  }

  const id = doc.id;
  const createdAt = toISOString(rawData.createdAt);
  if (!createdAt) {
    return null;
  }

  const originStop = sanitizeStop(rawData.originStop, 0, id);
  const destinationStop = sanitizeStop(rawData.destinationStop, 999, id);

  if (!originStop || !destinationStop) {
    return null;
  }
  
  const assignedVehicle = vehicles?.find(v => v.id === rawData.assignedVehicleId) ?? null;

  return {
    id: id,
    clientId: rawData.clientId ?? "",
    clientCompanyName: rawData.clientCompanyName ?? "N/A",
    clientCnpj: rawData.clientCnpj ?? "",
    clientAddress: rawData.clientAddress ?? "",
    clientEmail: rawData.clientEmail ?? "",
    clientPhone: rawData.clientPhone ?? "",
    createdAt: createdAt,
    updatedAt: toISOString(rawData.updatedAt) ?? null,
    updatedBy: rawData.updatedBy ?? null,
    vidaLogInfo:
      rawData.vidaLogInfo ?? { name: "", cnpj: "", address: "", cep: "" },
    serviceDate: toISOString(rawData.serviceDate) ?? null,
    repeatDaysOrder: rawData.repeatDaysOrder ?? [],
    pricingMethod: rawData.pricingMethod ?? "perRoute",

    numberOfBoxes:
      typeof rawData.numberOfBoxes === "number" ? rawData.numberOfBoxes : null,
    pricePerBox:
      typeof rawData.pricePerBox === "number" ? rawData.pricePerBox : null,
    boxDetails: rawData.boxDetails ?? null,

    routeDistanceKm:
      typeof rawData.routeDistanceKm === "number"
        ? rawData.routeDistanceKm
        : null,
    totalDurationMinutes:
        typeof rawData.totalDurationMinutes === 'number'
            ? rawData.totalDurationMinutes
            : null,
    pricePerKm:
      typeof rawData.pricePerKm === "number" ? rawData.pricePerKm : null,
    fuelCost: typeof rawData.fuelCost === "number" ? rawData.fuelCost : null,
    routeTollCost:
      typeof rawData.routeTollCost === "number" ? rawData.routeTollCost : null,
    arterisTolls: rawData.arterisTolls ?? null,
    ccrTolls: rawData.ccrTolls ?? null,
    transportServiceCost:
      typeof rawData.transportServiceCost === "number"
        ? rawData.transportServiceCost
        : null,
    totalValue: typeof rawData.totalValue === "number" ? rawData.totalValue : 0,

    selectedRouteId: rawData.selectedRouteId ?? null,
    selectedRouteName: rawData.selectedRouteName ?? null,

    originStop: originStop,
    destinationStop: destinationStop,
    intermediateStopsOrder: Array.isArray(rawData.intermediateStopsOrder)
      ? rawData.intermediateStopsOrder
          .map((stop: any, index: number) => sanitizeStop(stop, index + 1, id))
          .filter((s): s is RouteStop => s !== null)
      : [],

    paymentStatus: rawData.paymentStatus ?? "pending",
    paidAt: toISOString(rawData.paidAt) ?? null,
    paymentMethod: rawData.paymentMethod ?? null,
    invoiced: rawData.invoiced ?? false,
    invoicedAt: toISOString(rawData.invoicedAt) ?? null,
    executionStatus: rawData.executionStatus ?? "pending",
    startedAt: toISOString(rawData.startedAt) ?? null,
    completedAt: toISOString(rawData.completedAt) ?? toISOString(rawData.destinationStop?.checkedAt) ?? null,
    assignedDriverId: rawData.assignedDriverId ?? null,
    assignedDriverName: rawData.assignedDriverName ?? null,
    assignedVehicleId: rawData.assignedVehicleId ?? null,
    assignedVehicleName: rawData.assignedVehicleName ?? assignedVehicle?.name ?? null,
    assignedVehiclePlate: rawData.assignedVehiclePlate ?? assignedVehicle?.plate ?? null,
  };
};
