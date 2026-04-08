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

function safeParseJson<T>(text: string): T | null {
  try {
    const cleaned = cleanJsonText(text);
    return JSON.parse(cleaned) as T;
  } catch (_error) {
    console.error("JSON parse failed. Raw model output:\n", text);
    return null;
  }
}

function normalizeColumns(columns: unknown): string[] {
  if (!Array.isArray(columns)) return ["Text"];

  const cleaned = columns
    .map((col) => String(col).trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : ["Text"];
}

function normalizeRows(rows: Record<string, unknown>[], columns: string[]) {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    const rowEntries = Object.entries(row);

    columns.forEach((col, index) => {
      const safeCol = String(col).trim();

      // Try exact match
      if (row[safeCol] !== undefined && row[safeCol] !== null) {
        normalized[safeCol] = String(row[safeCol]);
        return;
      }

      // Try matching keys safely
      const matchEntry = rowEntries.find(([key]) => {
        return String(key).trim().toLowerCase() === safeCol.toLowerCase();
      });

      if (matchEntry) {
        normalized[safeCol] = String(matchEntry[1]);
        return;
      }

      // Fallback by index
      const rowValues = rowEntries.map(([, value]) => value);
      if (rowValues[index] !== undefined && rowValues[index] !== null) {
        normalized[safeCol] = String(rowValues[index]);
        return;
      }

      normalized[safeCol] = "";
    });

    return normalized;
  });
}

// This checks if enriched rows are actually usable.
// If enrichment comes back mostly empty, we should not trust it.
function hasEnoughFilledCells(
  rows: Record<string, string>[],
  columns: string[],
  minFilledRatio = 0.4,
) {
  if (!rows.length || !columns.length) return false;

  const totalCells = rows.length * columns.length;
  let filledCells = 0;

  rows.forEach((row) => {
    columns.forEach((col) => {
      const value = row[col];
      if (typeof value === "string" && value.trim() !== "") {
        filledCells += 1;
      }
    });
  });

  return filledCells / totalCells >= minFilledRatio;
}

// We only want to use enriched rows if they still look healthy.
function shouldUseEnrichedRows(
  extracted: ExtractedTable,
  enriched: EnrichedTable,
) {
  if (!enriched.rows || enriched.rows.length === 0) return false;
  if (enriched.rows.length < extracted.rows.length * 0.7) return false;
  if (!hasEnoughFilledCells(enriched.rows, enriched.columns)) return false;
  return true;
}

/**
 * Merge enrichment into extracted rows instead of replacing them.
 *
 * This is the key fix.
 * Step 1 remains the base table.
 * Step 3 only adds extra columns on top.
 */
function mergeEnrichmentIntoExtracted(
  extracted: ExtractedTable,
  enriched: EnrichedTable,
): EnrichedTable {
  const baseColumns = [...extracted.columns];
  const addedColumns = (enriched.addedColumns ?? []).filter(
    (col) => !baseColumns.includes(col),
  );

  // If model forgot to list addedColumns properly, infer them from enriched.columns
  const inferredAddedColumns = enriched.columns.filter(
    (col) => !baseColumns.includes(col),
  );

  const finalAddedColumns = Array.from(
    new Set([...addedColumns, ...inferredAddedColumns]),
  );

  const finalColumns = [...baseColumns, ...finalAddedColumns];

  const finalRows = extracted.rows.map((baseRow, index) => {
    const enrichedRow = enriched.rows[index] ?? {};
    const mergedRow: Record<string, string> = { ...baseRow };

    // Only add genuinely new columns here.
    // We do NOT overwrite extracted columns.
    finalAddedColumns.forEach((col) => {
      const value = enrichedRow[col];
      mergedRow[col] =
        value !== undefined && value !== null ? String(value) : "";
    });

    return mergedRow;
  });

  return {
    columns: finalColumns,
    rows: finalRows,
    addedColumns: finalAddedColumns,
  };
}

/**
 * STEP 1
 * Extract only visible data from image.
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
You are extracting visible structured data from an image.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "raw_text": ""
}

CRITICAL RULES:
- First capture all visible readable text into "raw_text".
- Then structure the content into columns and rows if possible.
- Extract only what is visibly present.
- Do NOT enrich.
- Do NOT add inferred translations.
- Do NOT add extra language-learning columns.
- This may be a handwritten vocabulary list rather than a perfect table.
- If there are 2 or 3 visible vertical fields per row, preserve them as columns.
- If headers are visible, use them exactly as written.
- If headers are not visible, infer short sensible headers only when visually obvious.
- If not obvious, use simple names like "Column1", "Column2", "Column3".
- Prioritize preserving row alignment over fancy labeling.
- Do not leave values empty when readable text is present.
- All values must be strings.
- Return strictly valid JSON parseable by JSON.parse().
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

  console.log("STEP 1 RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ExtractedTable>(response.output_text);

  if (!parsed) {
    throw new Error("Step 1 failed: invalid JSON during extraction");
  }

  let columns = normalizeColumns(parsed.columns);
  let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : "";

  console.log("STEP 1 BEFORE NORMALIZE ROWS:", JSON.stringify(rows, null, 2));
  console.log("STEP 1 COLUMNS:", JSON.stringify(columns, null, 2));

  // Fallback only if rows are totally missing
  if (rows.length === 0 && raw_text.trim()) {
    const lines = raw_text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      columns = ["Text"];
      rows = lines.map((line) => ({ Text: line }));
    }
  }

  const safeRows = normalizeRows(rows as Record<string, unknown>[], columns);

  console.log("STEP 1 AFTER NORMALIZE ROWS:", JSON.stringify(safeRows, null, 2));

  return {
    columns,
    rows: safeRows,
    raw_text,
  };
}

/**
 * STEP 2
 * Decide if data is language-related.
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
  "datasetType": "language",
  "languageName": "",
  "languageCode": "",
  "reasoning": ""
}

RULES:
- If this looks like vocabulary, translation, transliteration, pronunciation, glossary, or language-learning content, return datasetType as "language".
- Otherwise return datasetType as "general".
- If datasetType is "language", identify the likely language if possible.
- languageCode should be values like "ja", "zh", "hi", "ko", "es", etc when known.
- Keep reasoning short.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  console.log("STEP 2 RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ClassificationResult>(response.output_text);

  if (!parsed) {
    throw new Error("Step 2 failed: invalid JSON during classification");
  }

  return {
    datasetType: parsed.datasetType === "language" ? "language" : "general",
    languageName: parsed.languageName ?? "",
    languageCode: parsed.languageCode ?? "",
    reasoning: parsed.reasoning ?? "",
  };
}

/**
 * STEP 3
 * Enrich language data.
 * This step may add columns, but it should not rewrite the extracted base.
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

RULES:
- Preserve all original extracted columns first.
- Never overwrite original extracted values.
- Only add missing helpful columns when confidence is reasonably high.
- Do not duplicate a concept already present.
- If extracted rows are incomplete, you may infer missing values only when reasonably confident.
- If not confident, leave the value empty rather than inventing something.
- All values must be strings.
- Keep row alignment correct.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

SCRIPT RULES:
- Use the most specific script labels possible.
- For Japanese:
  - Use "Hiragana" when text is clearly Hiragana.
  - Use "Katakana" when text is clearly Katakana.
  - Use "Kanji" when text is clearly Kanji.
  - Use "Kana" only if Hiragana and Katakana are mixed together in one column and cannot be separated cleanly.

Possible examples:
- Japanese: Hiragana, Katakana, Kanji, Romaji, English Meaning
- Chinese: Hanzi, Pinyin, English Meaning
- Hindi: Devanagari, Transliteration, English Meaning
- Korean: Hangul, Romanization, English Meaning

Classification:
${JSON.stringify(classification)}

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  console.log("STEP 3 RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<EnrichedTable>(response.output_text);

  if (!parsed) {
    throw new Error("Step 3 failed: invalid JSON during enrichment");
  }

  const columns = normalizeColumns(
    Array.isArray(parsed.columns) && parsed.columns.length > 0
      ? parsed.columns
      : extracted.columns,
  );

  console.log(
    "STEP 3 BEFORE NORMALIZE ROWS:",
    JSON.stringify(parsed.rows, null, 2),
  );
  console.log("STEP 3 COLUMNS:", JSON.stringify(columns, null, 2));

  const rows = Array.isArray(parsed.rows)
    ? normalizeRows(parsed.rows as Record<string, unknown>[], columns)
    : [];

  console.log("STEP 3 AFTER NORMALIZE ROWS:", JSON.stringify(rows, null, 2));

  return {
    columns,
    rows,
    addedColumns: Array.isArray(parsed.addedColumns) ? parsed.addedColumns : [],
  };
}

/**
 * STEP 4
 * Validation should help, not destroy the pipeline.
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

VALIDATION RULES:
- Check whether each row is internally consistent.
- Focus on meaningful mismatches, not formatting preferences.
- Ignore minor capitalization differences.
- Ignore small wording style differences unless the meaning changes.
- If extraction was imperfect, prefer warnings instead of marking the whole table invalid.
- Only set isValid to false for genuine semantic problems, strong mismatches, or clearly wrong row alignment.
- correctedRows may be returned only if minor fixes are obvious and safe.
- All values in correctedRows must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Enriched table:
${JSON.stringify(enriched)}
`,
      },
    ],
  });

  console.log("STEP 4 RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ValidationResult>(response.output_text);

  if (!parsed) {
    throw new Error("Step 4 failed: invalid JSON during validation");
  }

  return {
    isValid: typeof parsed.isValid === "boolean" ? parsed.isValid : true,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    correctedRows: Array.isArray(parsed.correctedRows)
      ? normalizeRows(
          parsed.correctedRows as Record<string, unknown>[],
          enriched.columns,
        )
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

    // Step 1: extract the base table
    const extracted = await extractVisibleData(imageBase64);

    // Step 2: classify it
    const classification = await classifyTable(extracted);

    // Default final result is just extraction
    let finalTable: EnrichedTable = {
      columns: extracted.columns,
      rows: extracted.rows,
      addedColumns: [],
    };

    let validation: ValidationResult | null = null;

    // Only enrich if it is language content
    if (classification.datasetType === "language") {
      const enriched = await enrichLanguageTable(extracted, classification);

      // Important:
      // merge enrichment INTO extraction instead of replacing extraction
      const merged = mergeEnrichmentIntoExtracted(extracted, enriched);

      const validated = await validateLanguageTable(merged, classification);

      const candidateTable: EnrichedTable = {
        columns: merged.columns,
        rows: validated.correctedRows ?? merged.rows,
        addedColumns: merged.addedColumns ?? [],
      };

      // If merged/enriched result looks weak, keep extracted base table
      if (shouldUseEnrichedRows(extracted, candidateTable)) {
        finalTable = candidateTable;
      } else {
        console.warn(
          "Merged enrichment looked weak, so keeping extracted base rows.",
        );

        finalTable = {
          columns: extracted.columns,
          rows: extracted.rows,
          addedColumns: merged.addedColumns ?? [],
        };
      }

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