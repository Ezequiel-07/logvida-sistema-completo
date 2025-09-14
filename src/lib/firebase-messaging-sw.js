// This file is the entry point for the Firebase Messaging Service Worker.
// It must be in the public directory to be accessible at the root of the domain.
// The service worker runs in a different context from the main application,
// so we need to initialize Firebase again here.

try {
  // We cannot use process.env here as it's a browser environment.
  // Instead, we pass the config via a custom script injected by Next.js.
  // This approach avoids the need for a separate API route.
  
  // NOTE: This file is intentionally left empty. 
  // The actual Firebase config and initialization logic will be handled
  // by a script that gets dynamically loaded, ensuring the service worker
  // has the necessary configuration without breaking the static export build.
  
} catch (error) {
  console.error(
    "[firebase-messaging-sw.js] Error during initialization:",
    error,
  );
}
