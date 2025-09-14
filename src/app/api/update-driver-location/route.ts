
import type { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/server/lib/firebaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    const body = await request.json();
    const { latitude, longitude, userId, routeId, idToken } = body;

    if (!latitude || !longitude || !userId || !routeId || !idToken) {
      return new Response(
        JSON.stringify({ message: "Parâmetros insuficientes" }),
        { status: 400 },
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.uid !== userId) {
      return new Response(
        JSON.stringify({ message: "Token inválido para usuário" }),
        { status: 401 },
      );
    }

    // This route is deprecated, location is stored in driverLocations collection.
    // However, keeping it functional for now to avoid breaking old clients.
    const routeRef = adminDb.collection("routes").doc(routeId);
    await routeRef.set(
      {
        driverLocation: {
          latitude,
          longitude,
          timestamp: new Date(),
        },
      },
      { merge: true },
    );

    return new Response(
      JSON.stringify({ message: "Localização atualizada com sucesso" }),
      { status: 200 },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ message: "Erro interno do servidor" }),
      { status: 500 },
    );
  }
}
