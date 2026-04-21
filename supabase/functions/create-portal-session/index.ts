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
    .select("dodo_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.dodo_customer_id) {
    return jsonResponse({ error: "No subscription found" }, 404);
  }

  const apiKey  = Deno.env.get("DODO_PAYMENTS_API_KEY")!;
  const baseUrl = Deno.env.get("DODO_API_BASE_URL") ?? "https://test.dodopayments.com";

  const res = await fetch(`${baseUrl}/customers/${profile.dodo_customer_id}/customer-portal`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ return_url: "https://tablesnap.co.in/dashboard" }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Dodo portal error:", JSON.stringify(data));
    return jsonResponse({ error: "Failed to create portal session" }, 500);
  }

  return jsonResponse({ url: data.link });
});
