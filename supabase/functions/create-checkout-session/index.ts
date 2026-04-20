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

  const apiKey   = Deno.env.get("LEMON_SQUEEZY_API_KEY")!;
  const variantId = Deno.env.get("LEMON_SQUEEZY_VARIANT_ID")!;
  const storeId  = Deno.env.get("LEMON_SQUEEZY_STORE_ID")!;

  // Create a Lemon Squeezy hosted checkout session.
  // We pass the user's email so the checkout form is pre-filled, and embed
  // user_id in custom_data so the webhook knows which DB row to update.
  const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      "Accept": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: user.email,
            custom: {
              // This is passed back in webhook.meta.custom_data
              user_id: user.id,
            },
          },
          product_options: {
            // After payment, send the user back to the dashboard with a success flag
            redirect_url: "https://tablesnap.co.in/dashboard?upgraded=true",
          },
        },
        relationships: {
          store: {
            data: { type: "stores", id: storeId },
          },
          variant: {
            data: { type: "variants", id: variantId },
          },
        },
      },
    }),
  });

  const lsData = await lsRes.json();

  if (!lsRes.ok) {
    console.error("Lemon Squeezy error:", JSON.stringify(lsData));
    return jsonResponse({ error: "Failed to create checkout session" }, 500);
  }

  const checkoutUrl = lsData.data?.attributes?.url;
  if (!checkoutUrl) return jsonResponse({ error: "No checkout URL returned" }, 500);

  return jsonResponse({ url: checkoutUrl });
});
