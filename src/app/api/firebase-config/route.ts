
import { NextResponse } from 'next/server';

export const dynamic = "force-static";

// This route handler generates a dynamic JavaScript file
// containing the client-side Firebase configuration.
// This is used by the service worker to initialize Firebase Messaging.
export async function GET() {
  try {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    // We are creating a script that sets a global variable `self.firebaseConfig`
    // This makes the config available in the service worker's global scope.
    const scriptContent = `self.firebaseConfig = ${JSON.stringify(firebaseConfig)};`;

    return new NextResponse(scriptContent, {
      headers: {
        'Content-Type': 'application/javascript',
        // Cache this config file for a long time as it's immutable
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (error) {
    console.error("[API/firebase-config.js] Error generating config:", error);
    return new NextResponse("Error generating Firebase config.", {
      status: 500
    });
  }
}
