import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Dodo Payments uses the Standard Webhooks spec for signature verification.
// Signed content = "${webhook-id}.${webhook-timestamp}.${raw_body}"
// The secret from the Dodo dashboard is base64-encoded — we decode it first.
// The computed HMAC-SHA256 is base64-encoded and compared against the header.
async function verifySignature(
  webhookId: string,
  webhookTimestamp: string,
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  // Strip the "whsec_" prefix if present, then base64-decode the secret
  const base64Secret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Header may contain multiple signatures: "v1,sig1 v1,sig2"
  const signatures = signatureHeader.split(" ").map((s) => s.replace("v1,", ""));
  return signatures.some((s) => s === computed);
}

Deno.serve(async (req) => {
  const secret           = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";
  const webhookId        = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = req.headers.get("webhook-signature") ?? "";

  // Read raw body first — required for signature verification
  const payload = await req.text();

  if (secret && webhookId && webhookSignature) {
    const valid = await verifySignature(
      webhookId,
      webhookTimestamp,
      payload,
      webhookSignature,
      secret,
    );
    if (!valid) {
      console.error("Webhook signature mismatch");
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    console.warn("Missing webhook secret or headers — skipping signature check");
  }

  const event     = JSON.parse(payload);
  const eventType = event.type as string | undefined;

  // user_id is passed via metadata when the checkout session is created
  const userId         = event.data?.metadata?.user_id as string | undefined;
  const customerId     = event.data?.customer?.customer_id as string | undefined;
  const subscriptionId = event.data?.subscription_id as string | undefined;
  // ISO timestamp for when the current paid period ends (Dodo field: next_billing_date)
  const periodEnd      = event.data?.next_billing_date as string | undefined;

  console.log("Received event:", eventType, "user:", userId, "customer:", customerId);

  if (!userId) {
    console.warn("No user_id in metadata — ignoring event");
    return new Response("ok", { status: 200 });
  }

  // Use service role key to bypass RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (
    eventType === "subscription.active" ||
    // payment.succeeded fires when the card is charged — upgrade immediately
    (eventType === "payment.succeeded" && event.data?.subscription_id)
  ) {
    const { error } = await supabase.rpc("upgrade_user_tier", {
      target_user_id: userId,
      new_tier: "pro",
    });
    if (error) {
      console.error("Failed to upgrade user:", error);
    } else {
      console.log("Upgraded user to pro:", userId);
      // Save customer ID and mark subscription as active
      await supabase
        .from("users")
        .update({
          dodo_customer_id:      customerId ?? null,
          dodo_subscription_id:  subscriptionId ?? null,
          subscription_status:   "active",
          subscription_ends_at:  periodEnd ?? null,
        })
        .eq("id", userId);
    }

  } else if (eventType === "subscription.cancelled") {
    // User cancelled but their paid period hasn't ended yet — keep Pro access.
    // We only downgrade when subscription.expired fires at period end.
    console.log("Subscription cancelled (still active until period end):", userId);
    await supabase
      .from("users")
      .update({
        subscription_status:  "cancelling",
        subscription_ends_at: periodEnd ?? null,
      })
      .eq("id", userId);

  } else if (
    eventType === "subscription.expired" ||
    eventType === "subscription.failed"
  ) {
    // Period has ended or payment failed — downgrade to free now
    const { error } = await supabase.rpc("upgrade_user_tier", {
      target_user_id: userId,
      new_tier: "free",
    });
    if (error) {
      console.error("Failed to downgrade user:", error);
    } else {
      console.log("Downgraded user to free:", userId);
      await supabase
        .from("users")
        .update({
          subscription_status:   null,
          subscription_ends_at:  null,
          subscription_portal_url: null,
        })
        .eq("id", userId);
    }
  }

  // Always return 200 — anything else causes Dodo to retry the webhook
  return new Response("ok", { status: 200 });
});
