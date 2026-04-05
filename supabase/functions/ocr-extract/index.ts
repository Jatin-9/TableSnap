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
Extract structured data from this image.

Return ONLY valid JSON in this exact format:

{
  "columns": [],
  "rows": []
}

Instructions:
- Extract the content faithfully from the image.
- This image may contain:
  - a table
  - a list
  - vocabulary entries
  - study notes
  - handwritten rows
- If the image is a simple list rather than a full table, still return structured rows.

Structure rules:
- Detect the real number of columns automatically.
- If headers are visible, use them exactly as written.
- If headers are not visible, infer short sensible header names based on the role of the content.
- Every row object MUST use exactly the same keys as the strings in "columns".
- Keep one logical entry per row.
- If the content is a vertical list with one item per line, return one row per line.
- Do not return empty rows unless the image truly contains no readable content.

Transcription rules (STRICT):
- You are performing transcription, NOT interpretation.
- Copy text exactly as it appears in the image.
- Do NOT correct spelling.
- Do NOT normalize words.
- Do NOT replace text with a more common or meaningful word.
- Do NOT guess intended meaning.
- If uncertain, return the closest literal reading, not a corrected version.
- Treat handwritten text as ground truth, even if it looks unusual.
- NEVER replace one word with a different valid word.

Language-aware enrichment:
- First decide whether this appears to be language-learning, vocabulary, translation, transliteration, pronunciation, or glossary-style content.
- If it is not clearly language-learning content, return only the extracted structured data.
- If it is clearly language-learning content, preserve all existing extracted columns first.
- Only add missing helpful columns when they can be inferred with reasonable confidence.
- Never overwrite original extracted text.
- Never duplicate a concept already present.

Possible helpful added columns when relevant:
- Transliteration
- Romanization
- Pronunciation
- English Meaning
- Native Script
- Notes

Language/script-specific guidance:
- Detect the language and script when possible.
- Choose appropriate column names for the detected language.
- Japanese examples: Hiragana, Katakana, Kanji, Romanized, English Meaning
- Chinese examples: Hanzi, Pinyin, English Meaning
- Hindi examples: Devanagari, Transliteration, English Meaning
- Korean examples: Hangul, Romanization, English Meaning
- Do not force Japanese-specific columns for non-Japanese content.

Output rules:
- The "columns" array must contain the final column names.
- Each row object must use exactly those column names as keys.
- All cell values must be strings.
- Return JSON only.
- No markdown.
- No explanation.
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