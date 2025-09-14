
export interface NamedLocation {
    id: string; // Firestore document ID
    name: string;
    normalizedName?: string; // For case-insensitive search
    address: {
      description: string;
      latitude?: number | null;
      longitude?: number | null;
    };
    instructions?: string | null; // <-- NOVO CAMPO
    createdAt: string; // ISO string
    updatedAt: string | null; // ISO string
  }
  
