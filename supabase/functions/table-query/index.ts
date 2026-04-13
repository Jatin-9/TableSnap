import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";


const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Allow the frontend to call this function from the browser
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A compact shape of a table that the frontend sends us.
// We don't send the full TableSnapshot type — just what the AI needs.
type CompactTable = {
  title: string;
  columns: string[];
  // Only the first N rows to keep token usage reasonable
  rows: Record<string, string>[];
  tags: string[];
  language: string | null;
};

Deno.serve(async (req) => {
  // Handle the CORS preflight request that browsers send before a real POST
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, tables } = await req.json() as {
      question?: string;
      tables?: CompactTable[];
    };

    if (!question || typeof question !== "string") {
      return jsonResponse({ error: "No question provided" }, 400);
    }

    if (!tables || !Array.isArray(tables)) {
      return jsonResponse({ error: "No table data provided" }, 400);
    }

    // Build a readable text summary of all the tables.
    // We format each table as a mini markdown table so OpenAI can parse it easily.
    const tableContext = tables
      .map((table, index) => {
        // Show at most 50 rows per table — more than that and we risk hitting token limits
        const rowsToShow = table.rows.slice(0, 50);

        // Format rows as: | value1 | value2 | value3 |
        const rowLines = rowsToShow.map((row) =>
          "| " + table.columns.map((col) => row[col] ?? "").join(" | ") + " |"
        );

        const headerLine = "| " + table.columns.join(" | ") + " |";
        // The separator line that markdown tables require between header and body
        const separatorLine = "| " + table.columns.map(() => "---").join(" | ") + " |";

        const tableBlock = [headerLine, separatorLine, ...rowLines].join("\n");

        const languageNote = table.language ? ` (${table.language})` : "";
        const tagsNote = table.tags.length > 0 ? ` — tags: ${table.tags.join(", ")}` : "";

        return `### Table ${index + 1}: ${table.title}${languageNote}${tagsNote}\n\n${tableBlock}`;
      })
      .join("\n\n");

    // This is the instruction we give OpenAI about how to behave.
    // Being specific here prevents vague or unhelpful answers.
    const systemPrompt = `You are a helpful assistant that answers questions about the user's saved data tables.

You have access to the following tables extracted from the user's images:

${tableContext}

Rules for answering:
- Search through the table data carefully to find relevant information.
- If you find matching data, quote the exact value from the table and mention which table it came from.
- If the user is looking for a translation or meaning, check language tables first.
- If you can't find the answer in the tables, say so clearly — don't make things up.
- Keep answers concise and direct.
- If multiple tables are relevant, mention all of them.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      // A lower temperature makes the AI more precise and less likely to hallucinate
      temperature: 0.3,
      max_tokens: 800,
    });

    const answer = response.choices[0]?.message?.content ?? "I could not generate an answer.";

    return jsonResponse({ answer });
  } catch (error) {
    console.error("Table query error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Query failed" },
      500
    );
  }
});
