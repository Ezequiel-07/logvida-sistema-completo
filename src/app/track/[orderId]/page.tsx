import { PublicTimeline } from "./components/PublicTimeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// This line tells Next.js to render this page dynamically on the client
// and not attempt to pre-build it, which is necessary for 'output: export'.
export const dynamic = 'force-dynamic';

export default function PublicTrackingPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { orderId } = params;

  return (
    <div className="w-full min-h-screen bg-muted/20">
      <main className="w-full max-w-7xl mx-auto py-8 px-4">
        <PublicTimeline orderId={orderId} />
      </main>
    </div>
  );
}
