
"use client";

import QuoteClient from "./components/QuoteClient";
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function QuotePage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-muted/30 p-4">
      <Link href="/" className="mb-6 flex items-center gap-2 text-center relative w-16 h-16">
        <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="60px" className="object-contain" />
      </Link>
      <Suspense fallback={<div className="flex justify-center p-10"><Icons.loader className="h-8 w-8 animate-spin"/></div>}>
        <QuoteClient />
      </Suspense>
    </div>
  );
}
