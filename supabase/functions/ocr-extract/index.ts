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

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineMode = "fast" | "full";

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

// A single column the planner decides to add
type PlannedColumn = {
  name: string;        // e.g. "Katakana"
  description: string; // e.g. "The word written in katakana script"
};

// The full plan — what new columns to add to this language table
type EnrichmentPlan = {
  columnsToAdd: PlannedColumn[];
};

// What the fill step returns — ONLY the new column values, nothing else.
// This is key: the AI never touches existing data.
type FilledColumns = {
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// OpenAI sometimes wraps its JSON output in markdown fences like ```json ... ```
// This strips those so JSON.parse doesn't crash
function cleanJsonText(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

// A safe wrapper around JSON.parse — returns null instead of throwing if the
// AI returned something malformed
function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(cleanJsonText(text)) as T;
  } catch (_error) {
    console.error("JSON parse failed. Raw model output:\n", text);
    return null;
  }
}

// Makes sure columns is always a non-empty string array.
// Falls back to ["Text"] if the AI returned something unusable.
function normalizeColumns(columns: unknown): string[] {
  if (!Array.isArray(columns)) return ["Text"];
  const cleaned = columns
    .map((col) => (col === null || col === undefined ? "" : String(col).trim()))
    .filter((col) => col !== "");
  return cleaned.length > 0 ? cleaned : ["Text"];
}

// Ensures every row has a string value for every column.
// Handles cases where the AI returned keys in a slightly different order or
// used positional values instead of named keys.
function normalizeRows(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, string>[] {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    const rowEntries = Object.entries(row);

    columns.forEach((col, index) => {
      const safeCol = String(col).trim();

      // Try exact key match first
      if (row[safeCol] !== undefined && row[safeCol] !== null) {
        normalized[safeCol] = String(row[safeCol]);
        return;
      }

      // Try case-insensitive key match
      const matchedEntry = rowEntries.find(
        ([key]) => String(key).trim().toLowerCase() === safeCol.toLowerCase(),
      );
      if (matchedEntry) {
        normalized[safeCol] = String(matchedEntry[1]);
        return;
      }

      // Fall back to positional value
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

// Returns true if the table has enough filled cells to be worth using.
// Prevents us from keeping an enrichment result that's mostly empty.
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
      if (typeof row[col] === "string" && row[col].trim() !== "") filledCells++;
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

// ─── Code-side merge (no AI involved) ────────────────────────────────────────

// This is the key safety function. It takes the original rows (which are never
// modified) and bolts on only the new column values returned by the fill step.
// Because merging happens here in code — not inside an AI prompt — it is
// impossible for existing data to be overwritten, even accidentally.
function mergeNewColumnsIntoBase(
  base: RefinedTable,
  filledRows: Record<string, string>[],
  newColumnNames: string[],
): EnrichedTable {
  // Final column order: original columns first, then new ones at the end
  const finalColumns = [...base.columns, ...newColumnNames];

  const finalRows = base.rows.map((baseRow, index) => {
    // Start with a full copy of the original row — this data is sacred
    const mergedRow: Record<string, string> = { ...baseRow };

    // Now add ONLY the new columns from the fill step
    const filled = filledRows[index] ?? {};
    newColumnNames.forEach((col) => {
      // Only accept string values — discard anything else the AI might return
      mergedRow[col] = typeof filled[col] === "string" ? filled[col] : "";
    });

    return mergedRow;
  });

  return {
    columns: finalColumns,
    rows: finalRows,
    addedColumns: newColumnNames,
  };
}

// ─── Step 0: Route image to language vs general pipeline ──────────────────────
// This is a fast cheap call — it just looks at the image and decides which
// extraction path to use. gpt-4o gives us better accuracy on non-Latin scripts.

async function detectExtractionMode(
  imageBase64: string,
): Promise<"language" | "general"> {
  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Decide whether this image is more likely:
- "language" = vocabulary / translation / transliteration / language-learning notes
- "general"  = receipt / inventory / shopping list / invoice / printed table / non-language data

Return ONLY valid JSON:
{ "mode": "language" }

Rules:
- Use "language" only if it clearly looks like language-learning content.
- Otherwise use "general".
- Return JSON only. No explanation.
`,
          },
          { type: "input_image", image_url: imageBase64 },
        ],
      },
    ],
  });

  const parsed = safeParseJson<{ mode?: string }>(response.output_text);
  return parsed?.mode === "language" ? "language" : "general";
}

// ─── Step 1a: Extract from a general (non-language) image ─────────────────────
// Upgraded to gpt-4o for better accuracy reading receipts, tables, mixed content.

async function extractGeneralVisibleData(
  imageBase64: string,
): Promise<ExtractedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
You are extracting visible structured data from a general table-like image.

Return ONLY valid JSON:
{
  "columns": [],
  "rows": [],
  "raw_text": ""
}

RULES:
- First capture all visible readable text into "raw_text".
- Then structure the content into columns and rows.
- Extract only what is visibly present — do NOT enrich, translate, or infer.
- Preserve printed table headers exactly when visible.
- If headers are not visible but the structure is clearly tabular, infer short sensible headers.
- Keep one logical record per row.
- All values must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- No markdown. No explanation.
`,
          },
          { type: "input_image", image_url: imageBase64 },
        ],
      },
    ],
  });

  console.log("STEP 1 GENERAL RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ExtractedTable>(response.output_text);
  if (!parsed) throw new Error("Step 1 general: invalid JSON from extraction");

  let columns = normalizeColumns(parsed.columns);
  let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : "";

  // If no rows but there is raw text, treat each line as a single-column row
  if (rows.length === 0 && raw_text.trim()) {
    const lines = raw_text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      columns = ["Text"];
      rows = lines.map((line) => ({ Text: line }));
    }
  }

  return { columns, rows: normalizeRows(rows as Record<string, unknown>[], columns), raw_text };
}

// ─── Step 1b: Extract from a language-learning image ─────────────────────────
// Upgraded to gpt-4o — it is significantly better at reading handwritten
// non-Latin scripts like Japanese, Arabic, Korean, Devanagari, Chinese.

async function extractLanguageVisibleData(
  imageBase64: string,
): Promise<ExtractedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
You are extracting visible structured data from a language-learning image.
This may contain handwritten or printed vocabulary notes in any language or script.

Return ONLY valid JSON:
{
  "columns": [],
  "rows": [],
  "raw_text": ""
}

RULES:
- First capture ALL visible readable text into "raw_text", preserving every character exactly.
- Pay careful attention to non-Latin scripts: Japanese (hiragana, katakana, kanji),
  Chinese (hanzi), Korean (hangul), Arabic, Devanagari, Cyrillic, etc.
- Then structure the content into columns and rows.
- Extract only what is visibly present — do NOT add, translate, or enrich yet.
- If column headers are visible, use them exactly as written.
- If column headers are NOT visible, use simple placeholder names: Column1, Column2, Column3.
  Do not try to guess the meaning yet — that happens in a later step.
- Prioritise keeping row alignment correct over having perfect header names.
- All values must be strings.
- Return strictly valid JSON parseable by JSON.parse().
- No markdown. No explanation.
`,
          },
          { type: "input_image", image_url: imageBase64 },
        ],
      },
    ],
  });

  console.log("STEP 1 LANGUAGE RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ExtractedTable>(response.output_text);
  if (!parsed) throw new Error("Step 1 language: invalid JSON from extraction");

  let columns = normalizeColumns(parsed.columns);
  let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : "";

  if (rows.length === 0 && raw_text.trim()) {
    const lines = raw_text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      columns = ["Text"];
      rows = lines.map((line) => ({ Text: line }));
    }
  }

  return { columns, rows: normalizeRows(rows as Record<string, unknown>[], columns), raw_text };
}

// ─── Step 2: Classify the extracted data ─────────────────────────────────────
// Identifies the language and whether this is a language-learning table.
// Kept on gpt-4o-mini — it only reads text, and this is a simple task.

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

Return ONLY valid JSON:
{
  "datasetType": "language",
  "languageName": "",
  "languageCode": "",
  "reasoning": ""
}

RULES:
- datasetType is "language" if this looks like vocabulary, translation, transliteration,
  pronunciation, glossary, or any language-learning content.
- Otherwise datasetType is "general".
- If datasetType is "language", identify the language as specifically as possible.
- languageCode: use ISO 639-1 codes — "ja" for Japanese, "zh" for Chinese,
  "ko" for Korean, "hi" for Hindi, "ar" for Arabic, "es" for Spanish, etc.
- Keep reasoning short (one sentence).
- Return JSON only. No explanation.

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  console.log("STEP 2 CLASSIFY RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ClassificationResult>(response.output_text);
  if (!parsed) throw new Error("Step 2: invalid JSON from classification");

  return {
    datasetType: parsed.datasetType === "language" ? "language" : "general",
    languageName: parsed.languageName ?? "",
    languageCode: parsed.languageCode ?? "",
    reasoning: parsed.reasoning ?? "",
  };
}

// ─── Step 3: Refine the column schema ────────────────────────────────────────
// Renames generic placeholder columns (Column1, Column2...) into proper names
// based on what the content actually is. Does NOT add new columns yet.
// This step runs before planning so the planner always sees meaningful names.
// Upgraded to gpt-4o for better language awareness.

async function refineLanguageSchema(
  extracted: ExtractedTable,
  classification: ClassificationResult,
): Promise<RefinedTable> {
  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: `
You are refining the column schema of a language-learning table.

Return ONLY valid JSON:
{
  "columns": [],
  "rows": []
}

RULES:
- Rename generic or unclear column names (like Column1, Column2, Text) into the most
  accurate learner-friendly labels based on what the content actually contains.
- Use specific script labels when appropriate:
  Japanese: Hiragana, Katakana, Kanji, Romaji, English Meaning
  Chinese: Hanzi (Simplified), Hanzi (Traditional), Pinyin, English Meaning
  Korean: Hangul, Romanization, English Meaning
  Arabic: Arabic Script, Transliteration, English Meaning
  Other languages: use the most accurate labels for that language's writing system.
- Keep ALL existing row values exactly as they are — only rename the column headers.
- Do NOT add new columns. Do NOT remove rows.
- Return strictly valid JSON parseable by JSON.parse().
- Return JSON only. No explanation.

Language context:
${JSON.stringify(classification)}

Extracted table:
${JSON.stringify(extracted)}
`,
      },
    ],
  });

  console.log("STEP 3 REFINE RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<RefinedTable>(response.output_text);
  if (!parsed) throw new Error("Step 3: invalid JSON from schema refinement");

  const columns = normalizeColumns(
    Array.isArray(parsed.columns) && parsed.columns.length > 0
      ? parsed.columns
      : extracted.columns,
  );

  const rows = Array.isArray(parsed.rows) && parsed.rows.length > 0
    ? normalizeRows(parsed.rows as Record<string, unknown>[], columns)
    : extracted.rows;

  return { columns, rows };
}

// ─── Step 4a: Plan what new columns to add ───────────────────────────────────
// This step replaces the old hardcoded isJapanese logic.
// The AI decides — based purely on the detected language — what columns a
// learner would benefit from. It works for ANY language, not just Japanese.
//
// Key rule enforced here in the prompt AND in code:
// "English Meaning" is always required unless already present.

async function planEnrichmentSchema(
  refined: RefinedTable,
  classification: ClassificationResult,
): Promise<EnrichmentPlan> {
  // Check in code whether English meaning is already covered.
  // We check for common synonyms so we don't add it twice.
  const englishMeaningAlreadyPresent = refined.columns.some((col) => {
    const lower = col.toLowerCase();
    return (
      lower.includes("english") ||
      lower.includes("meaning") ||
      lower.includes("translation") ||
      lower.includes("definition")
    );
  });

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: `
You are a language learning expert planning what new columns to add to a vocabulary table.

The table has been identified as: ${classification.languageName ?? "Unknown"} (${classification.languageCode ?? "unknown"})

Current columns already in the table: ${JSON.stringify(refined.columns)}

${
  englishMeaningAlreadyPresent
    ? "NOTE: An English meaning column already exists in the table. Do NOT add it again."
    : "NOTE: No English meaning column exists yet. You MUST include it — English Meaning is always required."
}

Your job: decide what NEW columns would be most useful for a learner of this language.

Think about:
- Does this language use multiple scripts? (e.g. Japanese has hiragana, katakana, kanji AND romaji)
- Does it have a romanization or transliteration system? (Pinyin for Chinese, Romaji for Japanese,
  Romanization for Korean, Transliteration for Arabic/Russian/Hindi etc)
- Are there grammatical properties useful for learners? (e.g. gender in Spanish/French/German,
  verb class in Japanese, tone in Chinese/Vietnamese)
- What would genuinely help someone studying this language?

STRICT RULES:
- Only include columns that are NOT already in the current column list.
- English Meaning is required unless already present (see note above).
- Do not add more than 4 new columns — keep it focused on what matters most.
- Do not invent columns that don't apply to this language.
- If the table already has everything a learner needs, return an empty columnsToAdd array.

Return ONLY valid JSON:
{
  "columnsToAdd": [
    { "name": "English Meaning", "description": "The English translation of the word" },
    { "name": "Katakana", "description": "The word written in katakana script" }
  ]
}

Return JSON only. No explanation.
`,
      },
    ],
  });

  console.log("STEP 4 PLAN RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<EnrichmentPlan>(response.output_text);
  if (!parsed) throw new Error("Step 4: invalid JSON from enrichment planning");

  const columnsToAdd = Array.isArray(parsed.columnsToAdd)
    ? parsed.columnsToAdd.filter(
        (col) =>
          typeof col.name === "string" &&
          col.name.trim() !== "" &&
          // Extra safety: filter out any columns the AI tried to add that already exist
          !refined.columns.some(
            (existing) =>
              existing.toLowerCase() === col.name.trim().toLowerCase(),
          ),
      )
    : [];

  return { columnsToAdd };
}

// ─── Step 4b: Fill in the planned columns ────────────────────────────────────
// This step ONLY fills in the new columns decided by the planner.
// It receives the existing table as READ-ONLY reference.
// It returns ONLY the new column values — nothing else.
//
// Because it returns only new columns, it is structurally impossible for
// this step to overwrite any existing data. The merge happens in code.

async function fillEnrichmentColumns(
  refined: RefinedTable,
  plan: EnrichmentPlan,
  classification: ClassificationResult,
): Promise<FilledColumns> {
  const columnDescriptions = plan.columnsToAdd
    .map((col) => `- "${col.name}": ${col.description}`)
    .join("\n");

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: `
You are filling in specific new columns for a ${classification.languageName ?? "language"} vocabulary table.

The existing table data is provided below FOR REFERENCE ONLY.
Do NOT include existing column values in your output.

New columns to fill in for each row:
${columnDescriptions}

STRICT RULES:
- Return ONLY the new column values. Do not include existing columns in your output.
- For each row in the input, generate one row of output with exactly the new columns listed above.
- Be accurate — use your knowledge of ${classification.languageName ?? "this language"} to fill in correct values.
- If you are not confident about a specific value, return an empty string "" for that cell.
  Never guess or invent a value you are not sure about.
- All values must be strings.
- Return exactly as many rows as there are in the input table.

Return ONLY valid JSON:
{
  "rows": [
    { "English Meaning": "cat", "Katakana": "ネコ" },
    { "English Meaning": "dog", "Katakana": "イヌ" }
  ]
}

Return JSON only. No explanation.

Existing table (read-only reference):
${JSON.stringify(refined)}
`,
      },
    ],
  });

  console.log("STEP 5 FILL RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<FilledColumns>(response.output_text);
  if (!parsed) throw new Error("Step 5: invalid JSON from column fill");

  const newColNames = plan.columnsToAdd.map((c) => c.name);
  const rows = Array.isArray(parsed.rows)
    ? normalizeRows(parsed.rows as Record<string, unknown>[], newColNames)
    : refined.rows.map(() => {
        // If the AI returned nothing usable, produce empty values for each new column
        const empty: Record<string, string> = {};
        newColNames.forEach((col) => (empty[col] = ""));
        return empty;
      });

  return { rows };
}

// ─── Step 6: Validate the final merged table ──────────────────────────────────
// Checks that the new column values are consistent with the existing ones.
// Kept on gpt-4o-mini — it's a consistency check, not a generation task.

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

Return ONLY valid JSON:
{
  "isValid": true,
  "warnings": [],
  "correctedRows": []
}

RULES:
- Check whether each row is internally consistent across all columns.
- Focus on meaningful mismatches — e.g. the romaji doesn't match the hiragana.
- Ignore minor capitalisation or punctuation differences.
- If there are imperfections, prefer adding a warning over marking isValid as false.
- Only set isValid to false for genuine semantic errors.
- correctedRows may be returned only when a fix is obvious and safe.
  If returning correctedRows, return the FULL row including all columns, not just the changed ones.
- All values in correctedRows must be strings.
- Return JSON only. No explanation.

Language: ${classification.languageName ?? "Unknown"}

Table to validate:
${JSON.stringify(table)}
`,
      },
    ],
  });

  console.log("STEP 6 VALIDATE RAW OUTPUT:\n", response.output_text);

  const parsed = safeParseJson<ValidationResult>(response.output_text);
  if (!parsed) throw new Error("Step 6: invalid JSON from validation");

  return {
    isValid: typeof parsed.isValid === "boolean" ? parsed.isValid : true,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    correctedRows: Array.isArray(parsed.correctedRows)
      ? normalizeRows(
          parsed.correctedRows as Record<string, unknown>[],
          table.columns ?? [],
        )
      : undefined,
  };
}

// ─── Main request handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, mode = "fast" } = (await req.json()) as {
      imageBase64?: string;
      mode?: PipelineMode;
    };

    if (!imageBase64) {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    // ── Step 0: Route to the right extraction path ────────────────────────
    const extractionMode = await detectExtractionMode(imageBase64);

    // ── Step 1: Extract raw data from the image ───────────────────────────
    const extracted =
      extractionMode === "language"
        ? await extractLanguageVisibleData(imageBase64)
        : await extractGeneralVisibleData(imageBase64);

    // ── Step 2: Classify the content ──────────────────────────────────────
    const classification = await classifyTable(extracted);

    // Initialise these so we can include them in the response for debugging
    let refined: RefinedTable | null = null;
    let enriched: EnrichedTable | null = null;
    let validation: ValidationResult | null = null;

    // Default final table — used for general content or if language pipeline fails
    let finalTable: EnrichedTable = {
      columns: extracted.columns,
      rows: extracted.rows,
      addedColumns: [],
    };

    if (classification.datasetType === "language") {

      // ── Step 3: Refine the column schema ─────────────────────────────────
      // Renames Column1/Column2/etc to proper names based on content.
      // This MUST happen before planning so the planner sees meaningful names.
      const refinedResult = await refineLanguageSchema(extracted, classification);
      refined = refinedResult;

      // Fall back to the raw extraction if refining made things worse
      const baseForLanguage: RefinedTable = shouldUseTable(
        extracted.rows.length,
        refinedResult,
      )
        ? refinedResult
        : { columns: extracted.columns, rows: extracted.rows };

      // ── Fast mode: return after refine, no enrichment ─────────────────────
      // This gives the user a quick first result while the full pipeline runs
      if (mode === "fast") {
        finalTable = {
          columns: baseForLanguage.columns,
          rows: baseForLanguage.rows,
          addedColumns: [],
        };
      } else {
        // ── Full mode: plan → fill → merge → validate ─────────────────────

        // Step 4a: Decide what new columns to add
        const plan = await planEnrichmentSchema(baseForLanguage, classification);

        if (plan.columnsToAdd.length === 0) {
          // The planner decided the table already has everything it needs —
          // skip enrichment and use the refined result directly
          finalTable = {
            columns: baseForLanguage.columns,
            rows: baseForLanguage.rows,
            addedColumns: [],
          };
          enriched = finalTable;
        } else {
          // Step 4b: Fill in only the new columns (existing data is untouched)
          const filled = await fillEnrichmentColumns(
            baseForLanguage,
            plan,
            classification,
          );

          // Step 4c: Merge in code — original rows + new column values
          // This is where safety is guaranteed: spread original row first,
          // then add new values on top. No AI involved in the merge.
          const newColumnNames = plan.columnsToAdd.map((c) => c.name);
          const merged = mergeNewColumnsIntoBase(
            baseForLanguage,
            filled.rows,
            newColumnNames,
          );
          enriched = merged;

          // Step 6: Validate consistency across all columns
          const validated = await validateLanguageTable(merged, classification);
          validation = validated;

          // If the validator found and fixed rows, use those. Otherwise keep merged.
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
      { error: error instanceof Error ? error.message : "OCR pipeline failed" },
      500,
    );
  }
});
