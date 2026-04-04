import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
      });
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
Extract table data from this image.

Return ONLY valid JSON in this format:

{
  "columns": ["col1", "col2"],
  "rows": [
    {"col1": "value", "col2": "value"}
  ]
}

Do NOT include explanation.
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
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({ error: "OCR failed" }),
      { status: 500 }
    );
  }
});