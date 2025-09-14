
// src/types/user.ts
import type { Vehicle } from './vehicle';

export interface NotificationSettings {
  newRouteAssignedNotification: boolean;
  routeStartNotification: boolean;
  routeCompletionNotification: boolean;
  routeUpdateNotification: boolean; // Added
  checkpointDelayNotification: boolean;
  routeCancellationNotification: boolean;
  chatMessageNotification: boolean;
}

export interface SalaryDetails {
  baseSalary: number;
  hazardPay: number; // percentage
  benefits: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "driver" | "client"; // Ajuste os papéis conforme seu projeto
  phone: string | null;
  profilePictureUrl: string | null;
  createdAt: string; // Ou Timestamp, dependendo de como você o armazena/tipa
  notificationSettings: NotificationSettings;
  isActive: boolean;
  
  // Vehicle info is now a reference ID and a nested object
  vehicleId?: string | null;
  vehicle?: Vehicle | null;

  // Salary details
  salaryDetails?: SalaryDetails | null;

  // For client role
  clientId?: string | null;
}
