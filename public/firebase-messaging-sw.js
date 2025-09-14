// This file is the entry point for the Firebase Messaging Service Worker.
// It must be in the public directory to be accessible at the root of the domain.
// The service worker runs in a different context from the main application,
// so we need to initialize Firebase again here.

try {
  // Import the Firebase app and messaging scripts. These are loaded by the browser.
  importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js");

  // Dynamically import the configuration from our API route.
  // This makes the config available in the service worker's global scope.
  importScripts('/api/firebase-config');

  if (self.firebaseConfig) {
    firebase.initializeApp(self.firebaseConfig);
    const messaging = firebase.messaging();
    
    // Optional: handle background messages here if needed in the future.
    // messaging.onBackgroundMessage((payload) => {
    //   console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // });
  } else {
    console.error("[firebase-messaging-sw.js] Firebase config not loaded. Push notifications will not work.");
  }
  
} catch (error) {
  console.error(
    "[firebase-messaging-sw.js] Error during initialization:",
    error,
  );
}
