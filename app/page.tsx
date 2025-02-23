"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { gradient } from "@/components/Gradient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Initialize gradient
    gradient.initGradient("#gradient-canvas");
    
    // Redirect to /demo
    router.push("/demo");
  }, [router]);

  // Optional: You can return null or a loading state
  // since this page will immediately redirect
  return null;
}