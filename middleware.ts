import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent
): Promise<Response | undefined> {
  // Get IP from X-Forwarded-For header or fallback
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

  // Check if we want to enable rate limiting
  const RATELIMIT_ENABLED = process.env.RATELIMIT_ENABLED === "true";

  if (
    RATELIMIT_ENABLED &&
    process.env.NODE_ENV === "production" &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        // Rate limit to 12 requests per 24 hours
        limiter: Ratelimit.cachedFixedWindow(12, "24 h"),
        ephemeralCache: new Map(),
        analytics: true,
      });

      const { success, pending, limit, reset, remaining } = await ratelimit.limit(
        `ratelimit_middleware_${ip}`
      );

      event.waitUntil(pending);

      const res = success
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/api/blocked", request.url));

      // Add rate limit info to headers
      res.headers.set("X-RateLimit-Limit", limit.toString());
      res.headers.set("X-RateLimit-Remaining", remaining.toString());
      res.headers.set("X-RateLimit-Reset", reset.toString());

      return res;
    } catch (error) {
      console.error("Rate limiting error:", error);
      // If rate limiting fails, allow the request to proceed
      return NextResponse.next();
    }
  }

  // If rate limiting is not enabled or configuration is missing, just proceed
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/transcribe", "/api/generate"],
};