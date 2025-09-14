
'use server';

import { getAdminDb, getAdminAuth, Timestamp } from "@/server/lib/firebaseAdmin";
import type { Order, RouteStop } from "@/types/order";
import { sendNotification } from "./notifications";
import { getRouteDetailsWithTolls } from "./routes";
import { calculateTotalValue } from "@/lib/route-utils";
import type { User } from "@/types/user";

// Interface para os dados recebidos pelo cliente, incluindo o idToken
interface StartOrderExecutionData {
    orderId: string;
    driverId: string;
    driverName: string;
    clientName: string;
    idToken: string; // Adicionado para verificação
}

export async function startOrderExecution(data: StartOrderExecutionData) {
    const { orderId, driverId, driverName, clientName, idToken } = data;
    console.log("[Server Action] startOrderExecution called with:", { orderId, driverId, driverName, clientName });

    if (!orderId || !driverId || !driverName || !clientName || !idToken) {
        console.error("[Server Action] Dados insuficientes ou token faltando.");
        return { success: false, error: "Dados insuficientes para iniciar a rota." };
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const orderRef = adminDb.collection("orders").doc(orderId);

    try {
        // Verifica o idToken para garantir que o chamador é quem ele diz ser
        const decodedToken = await adminAuth.verifyIdToken(idToken, true);
        console.log("[Server Action] Token verificado. UID:", decodedToken.uid);

        if (decodedToken.uid !== driverId) {
            console.error(`[Server Action] Discrepância de UID. Token UID: ${decodedToken.uid}, Driver ID: ${driverId}`);
            return { success: false, error: "Ação não autorizada para este usuário." };
        }

        console.log("[Server Action] Atualizando status da ordem de serviço para 'in-progress'.");
        await orderRef.update({
            executionStatus: 'in-progress',
            startedAt: Timestamp.now()
        });
        console.log("[Server Action] Status da ordem de serviço atualizado com sucesso.");

        const adminsQuery = adminDb.collection('users').where('role', '==', 'admin');
        const adminSnapshot = await adminsQuery.get();

        const notificationPromises = adminSnapshot.docs.map(adminDoc => {
            return sendNotification(
                adminDoc.id,
                `Rota Iniciada por ${driverName}`,
                `A rota para ${clientName} começou.`,
                'info',
                { routeId: orderId, eventType: "routeStart" }
            );
        });
        
        await Promise.all(notificationPromises);
        console.log("[Server Action] Notificações para admins enviadas.");
        
        return { success: true };
    } catch (e: any) {
        console.error("[Server Action] Erro no bloco try/catch:", e);
        if (e.code === 'auth/id-token-expired' || e.code === 'auth/argument-error' || e.code === 'auth/invalid-id-token') {
            return { success: false, error: "Sessão expirada. Por favor, tente novamente." };
        }
        return { success: false, error: e.message || "Não foi possível atualizar o status da rota no servidor." };
    }
}


export async function addStopToOrder(
  orderId: string,
  newStopData: Pick<RouteStop, "name" | "address" | "loadingInstructions">
) {
  if (!orderId || !newStopData?.address?.description) {
    return { success: false, error: "Dados da parada inválidos." };
  }

  try {
    const adminDb = getAdminDb();
    const orderRef = adminDb.collection("orders").doc(orderId);
    
    const result = await adminDb.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new Error("Ordem de Serviço não encontrada.");
      }

      const orderData = orderSnap.data() as Order;

      if (orderData.executionStatus !== 'in-progress') {
        throw new Error("Só é possível adicionar paradas a Ordens de Serviço em andamento.");
      }

      // FIX: Create a deep copy of the old destination to avoid reference issues.
      const oldDestinationCopy: RouteStop = JSON.parse(JSON.stringify(orderData.destinationStop));

      // Demote the current destination to an intermediate stop
      const oldDestinationAsIntermediate: RouteStop = {
          ...oldDestinationCopy,
          type: 'intermediate',
          status: 'pending', // Reset status as it's now an intermediate step
      };

      // Create the new destination stop
      const newDestinationStopId = `stop_added_${Date.now()}`;
      const newDestination: RouteStop = {
        id: newDestinationStopId,
        name: newStopData.name || null,
        address: {
          id: `addr_${newDestinationStopId}`,
          description: newStopData.address.description,
          latitude: (newStopData.address as any).latitude ?? null,
          longitude: (newStopData.address as any).longitude ?? null
        },
        type: 'destination',
        status: 'pending',
        loadingInstructions: newStopData.loadingInstructions || null,
        checkedAt: null,
        deliveryConfirmed: null,
        collectionConfirmed: null,
        loadingConfirmed: null,
        unloadingConfirmed: null,
        notes: null,
        loadingPhotoProofDataUrls: null,
        deliveryPhotoProofDataUrls: null,
        collectionPhotoProofDataUrls: null,
        unloadingPhotoProofDataUrls: null,
        signatureDataUrl: null,
        plannedTime: null,
      };
      
      const updatedIntermediateStops = [
          ...(orderData.intermediateStopsOrder || []),
          oldDestinationAsIntermediate
      ];
      
      const routeDetails = await getRouteDetailsWithTolls(
        orderData.originStop.address.description,
        newDestination.address.description, // New destination
        updatedIntermediateStops.map(s => s.address.description)
      );
      
      if (!routeDetails.success || !routeDetails.data) {
        throw new Error(routeDetails.error || "Falha ao recalcular a rota.");
      }
      
      const { distance, duration, tolls } = routeDetails.data;
      
      const companySettingsSnap = await transaction.get(adminDb.collection("companySettings").doc("main"));
      const driverSnap = await transaction.get(adminDb.collection("users").doc(orderData.assignedDriverId!));
      const companySettings = companySettingsSnap.data();
      const driver = driverSnap.data() as User;
      
      const recalculatedValues = calculateTotalValue(
        {
          pricingMethod: orderData.pricingMethod,
          distanceKm: distance,
          pricePerKm: orderData.pricePerKm,
          boxCount: orderData.numberOfBoxes,
          pricePerBox: orderData.pricePerBox,
        },
        {
          arteris: companySettings?.arterisTollPrice || 0,
          ccr: companySettings?.ccrTollPrice || 0,
          fuelPrice: companySettings?.fuelPrice || 0,
          averageFuelConsumption: driver.vehicle?.costs.fuelConsumption || 10
        }
      );
      
      const updateData = {
          intermediateStopsOrder: updatedIntermediateStops,
          destinationStop: newDestination, // Set the new destination
          routeDistanceKm: distance,
          totalDurationMinutes: duration,
          routeTollCost: tolls,
          totalValue: recalculatedValues.totalValue,
          fuelCost: recalculatedValues.fuelCost,
          transportServiceCost: recalculatedValues.transportServiceCost,
          updatedAt: Timestamp.now(),
          updatedBy: { id: orderData.clientId, name: orderData.clientCompanyName }
      };

      transaction.update(orderRef, updateData);
      
      return {
          driverId: orderData.assignedDriverId,
          clientName: orderData.clientCompanyName
      };
    });

    if (result.driverId) {
        await sendNotification(
            result.driverId,
            "Atenção! Rota Alterada!",
            `O cliente ${result.clientName} adicionou uma nova parada ao pedido ${orderId}. Verifique os detalhes.`,
            "warning",
            { routeId: orderId, eventType: "routeUpdate" }
        );
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Erro ao adicionar parada no pedido:", error);
    return { success: false, error: error.message || "Ocorreu um erro no servidor." };
  }
}

export async function optimizeAndGroupOrders(orderIds: string[], serviceDate: Date, adminUserId: string, adminName: string) {
    if (!orderIds || orderIds.length < 2) {
      return { success: false, error: "Selecione ao menos dois pedidos para otimizar." };
    }
  
    const adminDb = getAdminDb();
    const ordersRef = adminDb.collection("orders");
    const batch = adminDb.batch();
    
    try {
      // 1. Fetch all selected orders
      const orderDocs = await Promise.all(orderIds.map(id => ordersRef.doc(id).get()));
      const ordersData = orderDocs.map(doc => {
        if (!doc.exists) throw new Error(`Pedido ${doc.id} não encontrado.`);
        return { id: doc.id, ...doc.data() } as Order;
      });
  
      // Use the first order as a template for client, driver, etc.
      const templateOrder = ordersData[0];
  
      // 2. Collect all stops and handle uniqueness
      const allStops: RouteStop[] = [];
      ordersData.forEach(order => {
        if (order.originStop) allStops.push(order.originStop);
        if (order.intermediateStopsOrder) allStops.push(...order.intermediateStopsOrder);
        if (order.destinationStop) allStops.push(order.destinationStop);
      });
  
      const uniqueAddresses = [...new Map(allStops.map(item => [item.address.description, item])).values()];
  
      if (uniqueAddresses.length < 2) {
          return { success: false, error: "Não há endereços suficientes para criar uma rota."};
      }
      
      const origin = uniqueAddresses.shift()!;
      const destination = uniqueAddresses.pop()!;
      const intermediates = uniqueAddresses;
  
      // 3. Call Google Maps API to optimize
      const routeDetails = await getRouteDetailsWithTolls(
        origin.address.description,
        destination.address.description,
        intermediates.map(s => s.address.description),
        true
      );
  
      if (!routeDetails.success || !routeDetails.data) {
        throw new Error(routeDetails.error || "Falha ao otimizar a rota.");
      }
  
      // 4. Reorder stops based on optimization
      const optimizedStops: RouteStop[] = [origin];
      if (routeDetails.data.optimizedWaypointOrder) {
        routeDetails.data.optimizedWaypointOrder.forEach((originalIndex: number) => {
          optimizedStops.push(intermediates[originalIndex]);
        });
      }
      optimizedStops.push(destination);
  
      // 5. Create the new optimized order
      const newOrderId = `OPT-${Date.now()}`;
      const now = Timestamp.now();
      const newOrderData: Partial<Order> = {
        ...templateOrder, // Inherit client, driver etc.
        id: newOrderId,
        selectedRouteName: `Rota Otimizada - ${ordersData.length} Pedidos`,
        originStop: { ...optimizedStops[0], type: 'origin', status: 'pending'},
        destinationStop: { ...optimizedStops[optimizedStops.length - 1], type: 'destination', status: 'pending'},
        intermediateStopsOrder: optimizedStops.slice(1, -1).map(s => ({ ...s, type: 'intermediate', status: 'pending' })),
        routeDistanceKm: routeDetails.data.distance,
        totalDurationMinutes: routeDetails.data.duration,
        routeTollCost: routeDetails.data.tolls,
        totalValue: ordersData.reduce((sum, order) => sum + order.totalValue, 0), // Simple sum for now
        executionStatus: 'pending',
        serviceDate: serviceDate.toISOString(),
        createdAt: now.toDate().toISOString(),
        updatedAt: now.toDate().toISOString(),
        updatedBy: { id: adminUserId, name: adminName },
      };
      
      const newOrderRef = ordersRef.doc(newOrderId);
      batch.set(newOrderRef, newOrderData);
  
      // 6. Cancel original orders
      for (const order of ordersData) {
        const orderRef = ordersRef.doc(order.id);
        batch.update(orderRef, {
          executionStatus: 'cancelled',
          notes: `Agrupado no pedido otimizado: ${newOrderId}`
        });
      }
  
      await batch.commit();
  
      return { success: true, newOrderId };
    } catch (error: any) {
      console.error("Error optimizing orders:", error);
      return { success: false, error: error.message };
    }
}

    