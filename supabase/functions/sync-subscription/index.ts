import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import DodoPayments from "npm:dodopayments";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile } = await supabase
    .from("users")
    .select("dodo_subscription_id, dodo_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.dodo_subscription_id && !profile?.dodo_customer_id) {
    return jsonResponse({ status: null, ends_at: null });
  }

  const apiKey      = Deno.env.get("DODO_PAYMENTS_API_KEY")!;
  const environment = Deno.env.get("DODO_API_BASE_URL")?.includes("test")
    ? "test_mode" as const
    : "live_mode" as const;

  const dodo = new DodoPayments({ bearerToken: apiKey, environment });

  let subscriptionId = profile.dodo_subscription_id as string | null;

  // If we don't have the subscription ID yet (e.g. subscribed before this column existed),
  // look it up from Dodo using the customer ID and save it for future calls.
  if (!subscriptionId && profile.dodo_customer_id) {
    const list = await dodo.subscriptions.list({ customer_id: profile.dodo_customer_id, page_size: 1 });
    const found = list.items?.[0];
    if (!found) return jsonResponse({ status: null, ends_at: null });
    subscriptionId = found.subscription_id;
    await supabase
      .from("users")
      .update({ dodo_subscription_id: subscriptionId })
      .eq("id", user.id);
  }

  const sub = await dodo.subscriptions.retrieve(subscriptionId!);

  // Dodo keeps status "active" even after cancellation — the real signal is this flag
  const isCancelling = (sub as any).cancel_at_next_billing_date === true;
  const endsAt       = (sub as any).next_billing_date as string | null ?? null;

  const newStatus = isCancelling ? "cancelling" : "active";

  // Always ensure tier = pro when subscription is active or cancelling.
  // This repairs the tier if it was accidentally set to free (e.g. by a manual test).
  await supabase.rpc("upgrade_user_tier", {
    target_user_id: user.id,
    new_tier: "pro",
  });

  await supabase
    .from("users")
    .update({
      subscription_status:  newStatus,
      subscription_ends_at: endsAt,
    })
    .eq("id", user.id);

  return jsonResponse({ status: newStatus, ends_at: endsAt });
});
