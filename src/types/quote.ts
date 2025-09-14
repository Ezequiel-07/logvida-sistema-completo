
export interface Quote {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  message: string;
  status: 'pending' | 'contacted' | 'converted';
  createdAt: string; // ISO string
  adminNotes?: string | null; 
  read: boolean;
  
  // Fields for quotes from logged-in clients
  clientId?: string;
  quoteType?: 'perBox' | 'perKm';
  boxCount?: number;
  calculatedPrice?: number;
  origin?: { name?: string; address: string; instructions?: string };
  destination?: { name?: string; address: string; instructions?: string };
  intermediateStops?: { name?: string; address: string; instructions?: string }[];
  distanceKm?: number;
}
