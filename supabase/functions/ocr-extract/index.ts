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

type PipelineMode = "fast" | "full";
type ExtractionMode = "language" | "general";

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

type RefinedTable = {
  columns: string[];
  rows: Record<string, string>[];
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
    return JSON.parse(cleanJsonText(text)) as T;
  } catch (_error) {
    console.error("JSON parse failed. Raw model output:\n", text);
    return null;
  }
}

function normalizeColumns(columns: unknown): string[] {
  if (!Array.isArray(columns)) return ["Text"];

  const cleaned = columns
    .map((col) => {
      if (col === null || col === undefined) return "";
      return String(col).trim();
    })
    .filter((col) => col !== "");

  return cleaned.length > 0 ? cleaned : ["Text"];
}

function normalizeRows(rows: Record<string, unknown>[], columns: string[]) {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    const rowEntries = Object.entries(row);

    columns.forEach((col, index) => {
      const safeCol = String(col).trim();

      if (row[safeCol] !== undefined && row[safeCol] !== null) {
        normalized[safeCol] = String(row[safeCol]);
        return;
      }

      const matchedEntry = rowEntries.find(([key]) => {
        return String(key).trim().toLowerCase() === safeCol.toLowerCase();
      });

      if (matchedEntry) {
        normalized[safeCol] = String(matchedEntry[1]);
        return;
      }

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

function mergeExtraColumnsIntoBase(
  base: RefinedTable | ExtractedTable,
  extra: EnrichedTable,
): EnrichedTable {
  const baseColumns = [...base.columns];

  const addedColumnsFromExplicitList = (extra.addedColumns ?? []).filter(
    (col) => !baseColumns.includes(col),
  );

  const addedColumnsFromDiff = extra.columns.filter(
    (col) => !baseColumns.includes(col),
  );

  const finalAddedColumns = Array.from(
    new Set([...addedColumnsFromExplicitList, ...addedColumnsFromDiff]),
  );

  const finalColumns = [...baseColumns, ...finalAddedColumns];

  const finalRows = base.rows.map((baseRow, index) => {
    const extraRow = extra.rows[index] ?? {};
    const mergedRow: Record<string, string> = { ...baseRow };

    // Keep base values safe. Only add new columns.
    finalAddedColumns.forEach((col) => {
      const value = extraRow[col];
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
 * Step 0
 * Cheap routing so language notes and general tables do not use the same extraction prompt.
 */
async function detectExtractionMode(imageBase64: string): Promise<ExtractionMode> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Decide whether this image is more likely:
- "language" = vocabulary / translation / transliteration / language-learning notes
- "general" = receipt / inventory / shopping list / invoice / printed table / non-language data

Return ONLY valid JSON in this format:
{
  "mode": "language"
}

Rules:
- Use "language" only if it clearly looks like language-learning content.
- Otherwise use "general".
- Return JSON only.
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

  const parsed = safeParseJson<{ mode?: string }>(response.output_text);
  return parsed?.mode === "language" ? "language" : "general";
}

async function extractGeneralVisibleData(
  imageBase64: string,
): Promise<ExtractedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
You are extracting visible structured data from a general table-like image.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "raw_text": ""
}

RULES:
- First capture all visible readable text into "raw_text".
- Then structure the content into columns and rows if possible.
- Extract only what is visibly present.
- Do NOT enrich.
- Do NOT translate.
- Do NOT add inferred columns.
- Preserve printed table headers exactly when visible.
- If this is a receipt/product/price/invoice table, preserve useful headers such as item, description, UPC, quantity, amount, price, total when visible.
- If headers are not visible but the structure is clearly tabular, infer short sensible headers.
- Keep one logical record per row.
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

  console.log("STEP 1 GENERAL RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ExtractedTable>(response.output_text);
  if (!parsed) {
    throw new Error("Step 1 general failed: invalid JSON during extraction");
  }

  let columns = normalizeColumns(parsed.columns);
  let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : "";

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

  return {
    columns,
    rows: safeRows,
    raw_text,
  };
}

async function extractLanguageVisibleData(
  imageBase64: string,
): Promise<ExtractedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
You are extracting visible structured data from a language-learning image.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "raw_text": ""
}

RULES:
- First capture all visible readable text into "raw_text".
- Then structure the content into columns and rows if possible.
- Extract only what is visibly present.
- Do NOT enrich.
- Do NOT translate.
- Do NOT add inferred language-learning columns yet.
- This may be handwritten vocabulary notes.
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

  console.log("STEP 1 LANGUAGE RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ExtractedTable>(response.output_text);
  if (!parsed) {
    throw new Error("Step 1 language failed: invalid JSON during extraction");
  }

  let columns = normalizeColumns(parsed.columns);
  let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : "";

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

  return {
    columns,
    rows: safeRows,
    raw_text,
  };
}

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

async function refineLanguageSchema(
  extracted: ExtractedTable,
  classification: ClassificationResult,
): Promise<RefinedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: `
You are refining the schema of a language-learning table.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": []
}

RULES:
- Rename generic or unclear columns into the most likely learner-friendly names.
- Keep the same row values.
- Do NOT add new columns yet.
- Do NOT remove rows.
- Do NOT overwrite values with different meanings.
- Only rename the existing schema more clearly.
- For Japanese, likely column names may include Romaji, Hiragana, Katakana, Kanji, English Meaning.
- Use the most specific script label possible.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  console.log("STEP 3 RAW OUTPUT (SCHEMA REFINE):\n", response.output_text);

  const parsed = safeParseJson<RefinedTable>(response.output_text);
  if (!parsed) {
    throw new Error("Step 3 failed: invalid JSON during schema refinement");
  }

  const columns = normalizeColumns(
    Array.isArray(parsed.columns) && parsed.columns.length > 0
      ? parsed.columns
      : extracted.columns,
  );

  const rows = Array.isArray(parsed.rows)
    ? normalizeRows(parsed.rows as Record<string, unknown>[], columns)
    : extracted.rows;

  return {
    columns,
    rows,
  };
}

async function enrichLanguageTable(
  refined: RefinedTable,
  classification: ClassificationResult,
): Promise<EnrichedTable> {
  const isJapanese =
    (classification.languageCode ?? "").toLowerCase() === "ja" ||
    (classification.languageName ?? "").toLowerCase().includes("japanese");

  const prompt = isJapanese
    ? `
You are enriching a Japanese language-learning table.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "addedColumns": []
}

STRICT RULES FOR JAPANESE:
- Start from the already refined table.
- Preserve all existing columns and values.
- Never overwrite the existing refined values.
- Only consider these optional added columns:
  1. Kanji
  2. Part of Speech
  3. Katakana
- Do NOT invent any other extra columns.
- Try Kanji when appropriate and reasonably confident.
- Try Part of Speech when appropriate and reasonably confident.
- Add Katakana only when a natural useful katakana form exists.
- If not confident, leave the added value empty rather than inventing something.
- Keep row alignment correct.
- All values must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Refined table:
${JSON.stringify(refined)}
`
    : `
You are enriching a language-learning table.

Return ONLY valid JSON in this exact format:
{
  "columns": [],
  "rows": [],
  "addedColumns": []
}

RULES:
- Start from the already refined table.
- Preserve all existing columns and values.
- Add only genuinely useful missing columns.
- Never overwrite the existing refined values.
- If not confident, leave the added value empty rather than inventing something.
- Keep row alignment correct.
- All values must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Refined table:
${JSON.stringify(refined)}
`;

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  console.log("STEP 4 RAW OUTPUT (ENRICH):\n", response.output_text);

  const parsed = safeParseJson<EnrichedTable>(response.output_text);
  if (!parsed) {
    throw new Error("Step 4 failed: invalid JSON during enrichment");
  }

  const columns = normalizeColumns(
    Array.isArray(parsed.columns) && parsed.columns.length > 0
      ? parsed.columns
      : refined.columns,
  );

  const rows = Array.isArray(parsed.rows)
    ? normalizeRows(parsed.rows as Record<string, unknown>[], columns)
    : [];

  return {
    columns,
    rows,
    addedColumns: Array.isArray(parsed.addedColumns) ? parsed.addedColumns : [],
  };
}

async function validateLanguageTable(
  table: EnrichedTable,
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

RULES:
- Check whether each row is internally consistent.
- Focus on meaningful mismatches, not formatting preferences.
- Ignore minor capitalization differences.
- Ignore small wording style differences unless the meaning changes.
- If extraction was imperfect, prefer warnings instead of marking the whole table invalid.
- Only set isValid to false for genuine semantic problems.
- correctedRows may be returned only if minor fixes are obvious and safe.
- All values in correctedRows must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only.

Classification:
${JSON.stringify(classification)}

Table:
${JSON.stringify(table)}
`,
      },
    ],
  });

  console.log("STEP 5 RAW OUTPUT (VALIDATE):\n", response.output_text);

  const parsed = safeParseJson<ValidationResult>(response.output_text);
  if (!parsed) {
    throw new Error("Step 5 failed: invalid JSON during validation");
  }

  return {
    isValid: typeof parsed.isValid === "boolean" ? parsed.isValid : true,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    correctedRows: Array.isArray(parsed.correctedRows)
      ? normalizeRows(
          parsed.correctedRows as Record<string, unknown>[],
          table.columns,
        )
      : undefined,
  };
}

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

function shouldUseTable(
  baseRowsCount: number,
  table: { rows: Record<string, string>[]; columns: string[] },
) {
  if (!table.rows || table.rows.length === 0) return false;
  if (table.rows.length < baseRowsCount * 0.7) return false;
  if (!hasEnoughFilledCells(table.rows, table.columns)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, mode = "fast" } = await req.json() as {
      imageBase64?: string;
      mode?: PipelineMode;
    };

    if (!imageBase64) {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    const extractionMode = await detectExtractionMode(imageBase64);

    const extracted =
      extractionMode === "language"
        ? await extractLanguageVisibleData(imageBase64)
        : await extractGeneralVisibleData(imageBase64);

    const classification = await classifyTable(extracted);

    let refined: RefinedTable | null = null;
    let enriched: EnrichedTable | null = null;
    let validation: ValidationResult | null = null;

    // Default result for non-language or fast fallback
    let finalTable: EnrichedTable = {
      columns: extracted.columns,
      rows: extracted.rows,
      addedColumns: [],
    };

    if (classification.datasetType === "language") {
      const refinedResult = await refineLanguageSchema(extracted, classification);
      refined = refinedResult;

      const baseForLanguage: RefinedTable = shouldUseTable(
        extracted.rows.length,
        refinedResult,
      )
        ? refinedResult
        : {
            columns: extracted.columns,
            rows: extracted.rows,
          };

      // Fast mode stops here and returns quickly
      if (mode === "fast") {
        finalTable = {
          columns: baseForLanguage.columns,
          rows: baseForLanguage.rows,
          addedColumns: [],
        };
      } else {
        // Full mode does enrichment + validation
        const enrichedResult = await enrichLanguageTable(
          baseForLanguage,
          classification,
        );

        const merged = mergeExtraColumnsIntoBase(baseForLanguage, enrichedResult);
        enriched = merged;

        const validated = await validateLanguageTable(merged, classification);
        validation = validated;

        const finalRows =
          validated.correctedRows && validated.correctedRows.length > 0
            ? validated.correctedRows
            : merged.rows;

        finalTable = {
          columns: merged.columns,
          rows: finalRows,
          addedColumns: merged.addedColumns ?? [],
        };
      }
    }

    return jsonResponse({
      mode,
      extractionMode,
      extracted,
      classification,
      refined,
      enriched,
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