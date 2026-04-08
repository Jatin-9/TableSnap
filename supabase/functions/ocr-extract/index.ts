import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ExtractedTable = {
  columns: string[];
  rows: Record<string, string>[];
  raw_text?: string;
};

type ClassificationResult = {
  datasetType: "language" | "general";
  languageName?: string;
  languageCode?: string;
  reasoning?: string;
};

type EnrichedTable = {
  columns: string[];
  rows: Record<string, string>[];
  addedColumns?: string[];
};

type ValidationResult = {
  isValid: boolean;
  warnings: string[];
  correctedRows?: Record<string, string>[];
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanJsonText(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function parseJson<T>(text: string): T {
  const cleaned = cleanJsonText(text);
  return JSON.parse(cleaned) as T;
}

/**
 * STEP 1
 * Extract only what is visibly present in the image.
 * No enrichment here.
 */
async function extractVisibleData(imageBase64: string): Promise<ExtractedTable> {
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
  "rows": [],
  "raw_text": ""
}

Rules:
- Extract only what is visibly present in the image.
- Do NOT enrich.
- Do NOT add inferred translations.
- Do NOT add inferred language columns.
- If headers are visible, use them exactly as written.
- If headers are missing, infer short sensible headers.
- Every row must use exactly the same keys as the "columns" array.
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

  const parsed = parseJson<ExtractedTable>(response.output_text);

  return {
    columns: Array.isArray(parsed.columns) ? parsed.columns : [],
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    raw_text: parsed.raw_text ?? "",
  };
}

/**
 * STEP 2
 * Classify the extracted table.
 * Decide whether it is language data or general data.
 */
async function classifyTable(
  extracted: ExtractedTable,
): Promise<ClassificationResult> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: `
You are classifying extracted table data.

Return ONLY valid JSON in this exact format:
{
  "datasetType": "language" | "general",
  "languageName": "",
  "languageCode": "",
  "reasoning": ""
}

Instructions:
- If this looks like vocabulary, translation, transliteration, pronunciation, glossary, or language-learning content, return "language".
- Otherwise return "general".
- If datasetType is "language", identify the likely language if possible.
- languageCode should be things like "ja", "zh", "hi", "ko", "es", etc, when known.
- Keep reasoning short.
- Return JSON only.

Here is the extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  const parsed = parseJson<ClassificationResult>(response.output_text);

  return {
    datasetType: parsed.datasetType === "language" ? "language" : "general",
    languageName: parsed.languageName ?? "",
    languageCode: parsed.languageCode ?? "",
    reasoning: parsed.reasoning ?? "",
  };
}

/**
 * STEP 3
 * Enrich only when the table is language-related.
 * Preserve original extracted columns first.
 */
async function enrichLanguageTable(
  extracted: ExtractedTable,
  classification: ClassificationResult,
): Promise<EnrichedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: `
You are enriching a language-learning table.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "addedColumns": []
}

Instructions:
- Preserve all original extracted columns.
- Never overwrite original extracted values.
- Only add helpful missing columns when confidence is reasonably high.
- Do not duplicate a concept already present.
- All values must be strings.
- Keep row alignment correct.

Examples of possible enrichments:
- Japanese: Hiragana, Katakana, Kanji, Romanized, English Meaning
- Chinese: Hanzi, Pinyin, English Meaning
- Hindi: Devanagari, Transliteration, English Meaning
- Korean: Hangul, Romanization, English Meaning
- Spanish and others: only add truly useful missing language-learning fields

Do not force extra columns if they are not appropriate.

Classification:
${JSON.stringify(classification)}

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  const parsed = parseJson<EnrichedTable>(response.output_text);

  return {
    columns: Array.isArray(parsed.columns) ? parsed.columns : extracted.columns,
    rows: Array.isArray(parsed.rows) ? parsed.rows : extracted.rows,
    addedColumns: Array.isArray(parsed.addedColumns) ? parsed.addedColumns : [],
  };
}

/**
 * STEP 4
 * Validate enriched rows.
 * Check that row values still match and make sense together.
 */
async function validateLanguageTable(
  enriched: EnrichedTable,
  classification: ClassificationResult,
): Promise<ValidationResult> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: `
You are validating an enriched language-learning table.

Return ONLY valid JSON in this exact format:
{
  "isValid": true,
  "warnings": [],
  "correctedRows": []
}

Instructions:
- Check whether each row is internally consistent.
- Example for Japanese:
  - Hiragana, Katakana, Kanji, Romanized, and English Meaning should correspond to the same vocabulary item.
- If everything is acceptable, set isValid to true.
- If there are issues, set isValid to false and explain them in warnings.
- correctedRows may be returned if minor fixes are obvious and safe.
- All values in correctedRows must be strings.
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Enriched table:
${JSON.stringify(enriched)}
`,
      },
    ],
  });

  const parsed = parseJson<ValidationResult>(response.output_text);

  return {
    isValid: Boolean(parsed.isValid),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    correctedRows: Array.isArray(parsed.correctedRows)
      ? parsed.correctedRows
      : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    // -----------------------------
    // STEP 1: Extract visible data
    // -----------------------------
    const extracted = await extractVisibleData(imageBase64);

    // -----------------------------
    // STEP 2: Classify table
    // -----------------------------
    const classification = await classifyTable(extracted);

    // -----------------------------
    // STEP 3 + 4 only for language
    // -----------------------------
    let finalTable: EnrichedTable = {
      columns: extracted.columns,
      rows: extracted.rows,
      addedColumns: [],
    };

    let validation: ValidationResult | null = null;

    if (classification.datasetType === "language") {
      const enriched = await enrichLanguageTable(extracted, classification);
      const validated = await validateLanguageTable(enriched, classification);

      finalTable = {
        columns: enriched.columns,
        rows: validated.correctedRows ?? enriched.rows,
        addedColumns: enriched.addedColumns ?? [],
      };

      validation = validated;
    }

    return jsonResponse({
      extracted,
      classification,
      final: finalTable,
      validation,
    });
  } catch (error) {
    console.error("OCR pipeline error:", error);

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "OCR pipeline failed",
      },
      500,
    );
  }
});