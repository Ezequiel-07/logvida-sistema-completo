
"use client";

import { openDB, type DBSchema } from 'idb';
import type { Order, CheckpointConfirmationDetails } from '@/types/order';


const DB_NAME = 'LogVidaOfflineDB';
const DB_VERSION = 2; 
const PENDING_CHECKPOINTS_STORE = 'pendingCheckpoints';
const SAVED_ORDERS_STORE = 'savedOrders'; 

export interface PendingCheckpoint {
  id: string; 
  orderId: string;
  stopId: string;
  status: 'completed' | 'skipped';
  reason?: string; 
  timestamp: string; 
  details: CheckpointConfirmationDetails;
}

interface LogVidaDB extends DBSchema {
  [PENDING_CHECKPOINTS_STORE]: {
    key: string;
    value: PendingCheckpoint;
  };
  [SAVED_ORDERS_STORE]: { 
    key: string; 
    value: Order;
  };
}

// A single promise to prevent multiple DB open attempts
let dbPromise: Promise<import('idb').IDBPDatabase<LogVidaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LogVidaDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(PENDING_CHECKPOINTS_STORE)) {
          db.createObjectStore(PENDING_CHECKPOINTS_STORE, { keyPath: 'id' });
        }
        if (oldVersion < 2) {
            if (!db.objectStoreNames.contains(SAVED_ORDERS_STORE)) {
                db.createObjectStore(SAVED_ORDERS_STORE, { keyPath: 'id' });
            }
        }
      },
      // *** CORREÇÃO PARA O HOT RELOAD ***
      // Limpa a promessa se a conexão for terminada inesperadamente.
      terminated() {
        console.warn("A conexão com o IndexedDB foi terminada. Isso é esperado em ambientes de desenvolvimento com HMR (Hot Module Replacement).");
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// --- Checkpoint Functions ---
export async function addPendingCheckpoint(checkpoint: PendingCheckpoint): Promise<void> {
  const db = await getDb();
  await db.put(PENDING_CHECKPOINTS_STORE, checkpoint);
}

export async function getPendingCheckpoints(): Promise<PendingCheckpoint[]> {
  const db = await getDb();
  return db.getAll(PENDING_CHECKPOINTS_STORE);
}

export async function removePendingCheckpoint(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(PENDING_CHECKPOINTS_STORE, id);
}

export async function clearAllPendingCheckpoints(): Promise<void> {
    const db = await getDb();
    await db.clear(PENDING_CHECKPOINTS_STORE);
}

// --- Saved Order Functions ---
export async function saveOrderLocally(order: Order): Promise<void> {
    const db = await getDb();
    await db.put(SAVED_ORDERS_STORE, order);
}

export async function getOrderLocally(orderId: string): Promise<Order | undefined> {
    const db = await getDb();
    return db.get(SAVED_ORDERS_STORE, orderId);
}

export async function clearAllSavedOrders(): Promise<void> {
    const db = await getDb();
    await db.clear(SAVED_ORDERS_STORE);
}
