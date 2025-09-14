// src/types/vehicle.ts

export interface VehicleCosts {
  fuelConsumption: number; // km/L
  maintenanceCostPerKm: number; // R$ / km
  tireCostPerKm: number; // R$ / km
  depreciationPerKm: number; // R$ / km
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  costs: VehicleCosts;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  createdAt: string; // ISO string
  updatedAt?: string | null; // ISO string
}

export interface MaintenanceRecord {
    id: string;
    vehicleId: string;
    vehicleName: string;
    date: string; // ISO String
    mileage: number;
    type: string;
    cost: number;
    notes?: string;
}
