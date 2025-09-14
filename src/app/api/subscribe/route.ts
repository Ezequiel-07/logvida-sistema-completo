
import { NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/server/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No authentication token provided." },
        { status: 401 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const token = body.token;
    
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: `FCM token must be a valid string, but received ${token}.`},
        { status: 400 },
      );
    }

    const idToken = authHeader.split(" ")[1];
    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error: any) {
        return NextResponse.json({ error: `Invalid authentication token: ${error.code}` }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const fcmTokenRef = adminDb
      .collection("users")
      .doc(userId)
      .collection("fcmTokens")
      .doc(token);

    await fcmTokenRef.set({
      createdAt: FieldValue.serverTimestamp(),
      userAgent: request.headers.get("user-agent") || "unknown",
    });

    return NextResponse.json(
      { message: "Subscription token saved successfully." },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[API/SUBSCRIBE] An unexpected error occurred:", error);
    let errorMessage = "Failed to process subscription token.";
    let statusCode = 500;

    if (error.code === "auth/id-token-expired") {
      errorMessage = "Authentication token has expired. Please log in again.";
      statusCode = 401;
    } else if (error instanceof SyntaxError) {
      errorMessage = "Invalid JSON in request body.";
      statusCode = 400;
    } else if (error.codePrefix === "messaging") {
      errorMessage = `Firebase Messaging error: ${error.message}`;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}
