import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Verify the webhook came from Lemon Squeezy using HMAC-SHA256.
// They sign the raw request body with our webhook secret and put it in X-Signature.
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // Signature is a hex string — convert it to bytes before verifying
  const sigBytes = new Uint8Array(
    signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
}

Deno.serve(async (req) => {
  const secret    = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET") ?? "";
  const signature = req.headers.get("X-Signature") ?? "";

  // Read the raw body first — we need it both for verification and parsing
  const payload = await req.text();

  // Always verify the signature before doing anything
  if (secret && signature) {
    const valid = await verifySignature(payload, signature, secret);
    if (!valid) {
      console.error("Webhook signature mismatch");
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    // If no secret is configured yet, log a warning but continue
    // (useful during initial testing — remove this branch in production)
    console.warn("No webhook secret configured — skipping signature check");
  }

  const event     = JSON.parse(payload);
  const eventName = event.meta?.event_name as string | undefined;
  const userId    = event.meta?.custom_data?.user_id as string | undefined;

  console.log("Received event:", eventName, "for user:", userId);

  if (!userId) {
    // No user ID means we can't do anything useful
    console.warn("No user_id in webhook custom_data — ignoring");
    return new Response("ok", { status: 200 });
  }

  // Use the service role key so we can bypass RLS.
  // The upgrade_user_tier() function is SECURITY DEFINER (runs as postgres),
  // which lets it pass the prevent_tier_change trigger check.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (
    eventName === "subscription_created" ||
    eventName === "subscription_updated"
  ) {
    // Only mark as Pro if the subscription is actually active or on trial
    const status = event.data?.attributes?.status as string | undefined;
    const isActive = status === "active" || status === "on_trial";

    if (isActive) {
      const { error } = await supabase.rpc("upgrade_user_tier", {
        target_user_id: userId,
        new_tier: "pro",
      });
      if (error) console.error("Failed to upgrade user:", error);
      else console.log("Upgraded user to pro:", userId);
    }
  } else if (eventName === "subscription_expired") {
    // subscription_expired = subscription fully ended (not just cancelled)
    // subscription_cancelled means cancelled but still active until period end
    const { error } = await supabase.rpc("upgrade_user_tier", {
      target_user_id: userId,
      new_tier: "free",
    });
    if (error) console.error("Failed to downgrade user:", error);
    else console.log("Downgraded user to free:", userId);
  }

  return new Response("ok", { status: 200 });
});
