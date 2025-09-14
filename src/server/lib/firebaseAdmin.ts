
import admin from "firebase-admin";
import type { App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  getFirestore,
  type Firestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let adminApp: App | null = null;

function initializeAdminApp(): App {
  // Se o app já foi inicializado, retorne a instância existente.
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  // Para ambientes locais ou de nuvem, carrega as credenciais do .env.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // A chave privada precisa ter as quebras de linha substituídas.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "As variáveis de ambiente do Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) não estão configuradas.",
    );
  }

  console.log("[FirebaseAdmin] Inicializando com credenciais do .env.");
  const credential = admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  });

  return admin.initializeApp({ credential });
}


function getAdminApp(): App {
  if (!adminApp) {
    adminApp = initializeAdminApp();
  }
  return adminApp;
}

// Singleton instances for services
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;
let adminMessaging: Messaging | null = null;

export function getAdminDb(): Firestore {
  if (!adminDb) {
    // Conectando ao banco de dados nomeado 'logvida'.
    adminDb = getFirestore(getAdminApp(), 'logvida');
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

export function getAdminMessaging(): Messaging | null {
  if (!adminMessaging) {
    try {
      adminMessaging = getMessaging(getAdminApp());
    } catch (error) {
      console.warn(
        "O Firebase Messaging não pôde ser inicializado no servidor. As notificações push podem não funcionar.",
      );
      adminMessaging = null;
    }
  }
  return adminMessaging;
}

export { FieldValue, Timestamp };
