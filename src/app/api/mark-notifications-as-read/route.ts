
import { NextResponse, NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/server/lib/firebaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No authentication token provided." },
        { status: 401 },
      );
    }

    const idToken = authHeader.split(" ")[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid authentication token." },
        { status: 401 },
      );
    }

    const userId = decodedToken.uid;

    const notificationsRef = adminDb
      .collection("users")
      .doc(userId)
      .collection("notifications");

    const unreadQuery = notificationsRef.where("read", "==", false);
    const snapshot = await unreadQuery.get();

    if (snapshot.empty) {
      return NextResponse.json(
        { message: "No unread notifications." },
        { status: 200 },
      );
    }

    const batch = adminDb.batch();
    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });

    await batch.commit();

    return NextResponse.json(
      { message: "Notifications marked as read successfully." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[API/mark-read] Internal Server Error:", error);
    return NextResponse.json(
      { error: "An internal server error occurred." },
      { status: 500 },
    );
  }
}
