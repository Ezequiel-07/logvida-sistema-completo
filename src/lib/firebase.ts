
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// Centraliza a leitura das variáveis de ambiente em uma função
function getFirebaseConfig() {
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    // Valida se as chaves essenciais estão presentes
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error("Firebase apiKey ou projectId está faltando. Verifique suas variáveis de ambiente NEXT_PUBLIC_*.");
    }
    return firebaseConfig;
}


// Singleton pattern to initialize Firebase app only once
function initializeFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  const config = getFirebaseConfig();
  return initializeApp(config);
}

const app = initializeFirebaseApp();
const auth: Auth = getAuth(app);
// Conectando ao banco de dados padrão.
const db: Firestore = getFirestore(app,'logvida');

// Lazily get messaging instance only on client-side
let messaging: Messaging | null = null;
function getClientMessaging(): Messaging | null {
    if (typeof window === 'undefined') {
        return null;
    }
    if (messaging) {
        return messaging;
    }
    isSupported().then(supported => {
        if(supported) {
            messaging = getMessaging(app);
        }
    }).catch(err => {
        console.warn("Firebase Messaging not supported:", err);
    });
    return messaging;
}

// Export a function to get the app instance, consistent with singleton pattern
export function getFirebaseApp(): FirebaseApp {
  return app;
}

export { db, auth, app, getClientMessaging };
