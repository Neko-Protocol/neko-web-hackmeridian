"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { backendClient } from "@/lib/services/backend-client";

type Status = "loading" | "success" | "error";

function UnsubscribeCard({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0F0F] px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold text-white/90">{heading}</h1>
        <p className="mt-2 text-sm text-white/50">{message}</p>
      </div>
    </div>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const ran = useRef(false);
  const [status, setStatus] = useState<Status>(() =>
    token ? "loading" : "error"
  );

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        await backendClient.post("/v1/mailing/unsubscribe", { token });
        setStatus("success");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <UnsubscribeCard
        heading="Processing your request…"
        message="Hang tight, this only takes a moment."
      />
    );
  }

  if (status === "success") {
    return (
      <UnsubscribeCard
        heading="You've been unsubscribed"
        message="You won't receive any more automated emails from Neko."
      />
    );
  }

  return (
    <UnsubscribeCard
      heading="Something went wrong"
      message="We couldn't process this unsubscribe link. It may be invalid or expired."
    />
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <UnsubscribeCard
          heading="Processing your request…"
          message="Hang tight, this only takes a moment."
        />
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
