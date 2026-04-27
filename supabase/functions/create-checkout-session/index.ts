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

  const { data: { user } } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();

  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const apiKey    = Deno.env.get("DODO_PAYMENTS_API_KEY")!;
  const productId = Deno.env.get("DODO_PRODUCT_ID")!;
  const environment = Deno.env.get("DODO_API_BASE_URL")?.includes("test")
    ? "test_mode"
    : "live_mode";

  const dodo = new DodoPayments({ bearerToken: apiKey, environment });

  const session = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: { email: user.email!, name: user.email! },
    metadata: { user_id: user.id },
    return_url: "https://tablesnap.co.in/dashboard?upgraded=true",
  });

  if (!session.checkout_url) return jsonResponse({ error: "No checkout URL returned" }, 500);

  return jsonResponse({ url: session.checkout_url });
});
