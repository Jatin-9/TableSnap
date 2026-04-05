import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Extract structured table-like data from this image.

Return ONLY valid JSON in this exact format:

{
  "columns": ["Column A", "Column B", "Column C"],
  "rows": [
    {
      "Column A": "value",
      "Column B": "value",
      "Column C": "value"
    }
  ]
}

Rules:
- Detect the number of columns automatically.
- Use real visible headers when present.
- If headers are not visible, infer short sensible header names.
- Every row object MUST use exactly the same keys as the strings in "columns".
- Do not use example values as keys.
- Do not translate.
- Preserve original language and script.
- Return JSON only, no markdown, no explanation.
`,
            },
            {
              type: "input_image",
              image_url: imageBase64,
            },
          ],
        },
      ],
    });

    return new Response(
      JSON.stringify({ result: response.output_text }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("OCR function error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "OCR failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});