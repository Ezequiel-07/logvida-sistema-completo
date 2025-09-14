
"use client";

import { useParams, useRouter } from "next/navigation";
import { TimelineClient } from "./components/TimelineClient";

// This line tells Next.js to render this page dynamically on the client
// and not attempt to pre-build it, which is necessary for 'output: export'.
export const dynamic = 'force-dynamic';

export default function TimelinePage() {
  const params = useParams();
  const router = useRouter();

  // The type of params.orderId from useParams can be string | string[]
  const orderId = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;

  if (!orderId || typeof orderId !== "string") {
    // This case should ideally not be hit if the route is correct
    // but it's good practice to handle it.
    // Redirect or show an error message.
    router.push("/orders"); // Example redirect
    return <div>ID do pedido inválido. Redirecionando...</div>;
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-8">
      <TimelineClient orderId={orderId} />
    </div>
  );
}
