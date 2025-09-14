
"use server";

import { getAdminDb, Timestamp } from "@/server/lib/firebaseAdmin";
import type { NamedLocation } from "@/types/namedLocation";
import { toISOString } from "@/lib/utils";

// Fetches all named locations for autocomplete suggestions
export async function getNamedLocations(): Promise<{ locations?: NamedLocation[], error?: string }> {
  try {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection("namedLocations").orderBy("name", "asc").get();
    
    if (snapshot.empty) {
      return { locations: [] };
    }

    const locations = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            address: data.address,
            instructions: data.instructions ?? null, // <-- ADICIONADO
            createdAt: toISOString(data.createdAt)!,
            updatedAt: toISOString(data.updatedAt),
        } as NamedLocation
    });

    return { locations };
  } catch (error) {
    console.error("[Server Action] Error in getNamedLocations:", error);
    return { error: "Não foi possível buscar os locais salvos." };
  }
}

// Saves a list of named locations, creating new ones if they don't exist
export async function saveNamedLocations(
    locations: Array<{ 
        name: string; 
        address: { 
            description: string; 
            latitude?: number | null; 
            longitude?: number | null 
        };
        instructions?: string | null; // <-- ADICIONADO
    }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminDb = getAdminDb();
    const batch = adminDb.batch();
    const locationsCollection = adminDb.collection("namedLocations");

    for (const loc of locations) {
      if (!loc.name || !loc.address.description) continue;

      // Use a case-insensitive query by storing an all-lowercase version of the name
      const normalizedName = loc.name.trim().toLowerCase();
      const querySnapshot = await locationsCollection.where("normalizedName", "==", normalizedName).limit(1).get();

      if (querySnapshot.empty) {
        // Location with this name does not exist, create it
        const newLocRef = locationsCollection.doc(); // Auto-generate ID
        batch.set(newLocRef, {
          name: loc.name.trim(),
          normalizedName: normalizedName,
          address: {
            description: loc.address.description,
            latitude: loc.address.latitude ?? null,
            longitude: loc.address.longitude ?? null,
          },
          instructions: loc.instructions ?? null, // <-- ADICIONADO
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } else {
        // If location exists, update it with new info
        const existingDocRef = querySnapshot.docs[0].ref;
        batch.update(existingDocRef, {
            address: {
                description: loc.address.description,
                latitude: loc.address.latitude ?? null,
                longitude: loc.address.longitude ?? null,
            },
            instructions: loc.instructions ?? null, // <-- ADICIONADO
            updatedAt: Timestamp.now()
        });
      }
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("[Server Action] Error in saveNamedLocations:", error);
    return { success: false, error: "Não foi possível salvar os locais nomeados." };
  }
}
