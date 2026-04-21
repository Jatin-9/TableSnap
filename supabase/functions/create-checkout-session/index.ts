import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

  // Verify the caller is a logged-in user
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
  // test.dodopayments.com for test mode — change to api.dodopayments.com when going live
  const baseUrl   = Deno.env.get("DODO_API_BASE_URL") ?? "https://test.dodopayments.com";

  // Create a Dodo Payments hosted checkout session.
  // We pass the user's email so the checkout form is pre-filled, and embed
  // user_id in metadata so the webhook knows which DB row to upgrade.
  const dodoRes = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email,
        name: user.email,
      },
      metadata: {
        // Echoed back in the webhook payload so we know which user to upgrade
        user_id: user.id,
      },
      return_url: "https://tablesnap.co.in/dashboard?upgraded=true",
    }),
  });

  const dodoData = await dodoRes.json();

  if (!dodoRes.ok) {
    console.error("Dodo Payments error:", JSON.stringify(dodoData));
    return jsonResponse({ error: "Failed to create checkout session" }, 500);
  }

  const checkoutUrl = dodoData.checkout_url;
  if (!checkoutUrl) return jsonResponse({ error: "No checkout URL returned" }, 500);

  return jsonResponse({ url: checkoutUrl });
});
