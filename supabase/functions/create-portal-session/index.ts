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
    .select("dodo_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.dodo_customer_id) {
    return jsonResponse({ error: "No subscription found" }, 404);
  }

  const apiKey      = Deno.env.get("DODO_PAYMENTS_API_KEY")!;
  // "test_mode" uses test.dodopayments.com, "live_mode" uses api.dodopayments.com
  const environment = Deno.env.get("DODO_API_BASE_URL")?.includes("test")
    ? "test_mode" as const
    : "live_mode" as const;

  const dodo   = new DodoPayments({ bearerToken: apiKey, environment });
  const portal = await dodo.customers.customerPortal.create(profile.dodo_customer_id, {
    return_url: "https://tablesnap.co.in/dashboard",
  });

  return jsonResponse({ url: portal.link });
});
