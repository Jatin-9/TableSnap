import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type WordEntry = {
  row: Record<string, string>;
  columns: string[];
  tableTitle: string;
  languageName: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Escapes the 5 characters that have special meaning in HTML so that user
// data (table titles, column names, cell values) can never inject tags or
// break attribute values when embedded directly into the email HTML string.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")   // must be first — otherwise we'd double-escape
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Randomly shuffle an array and return the first n items.
// Used to pick 5 different words each time.
function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// Detects if a column is the "English Meaning" column so we can style it
// differently in the email (larger, green — it's the most important column).
function isEnglishMeaning(col: string): boolean {
  const lower = col.toLowerCase();
  return (
    lower.includes("english") ||
    lower.includes("meaning") ||
    lower.includes("translation") ||
    lower.includes("definition")
  );
}

// ─── Email HTML builder ───────────────────────────────────────────────────────

// Builds one word card for a single vocabulary row.
// Each card shows every column in the row — the first column gets a large font
// (it's usually the foreign script), and the English meaning is styled green.
function buildWordCard(
  index: number,
  entry: WordEntry,
): string {
  // Each card gets a different accent colour so the email looks vibrant.
  // We use separate light-background colours instead of 8-digit hex (hex+opacity)
  // because Outlook does not support 8-digit hex and would render no background.
  const accents = [
    { border: "#7c3aed", bg: "#f5f3ff", text: "#7c3aed", sep: "#e9d5ff" },
    { border: "#2563eb", bg: "#eff6ff", text: "#2563eb", sep: "#bfdbfe" },
    { border: "#dc2626", bg: "#fef2f2", text: "#dc2626", sep: "#fecaca" },
    { border: "#d97706", bg: "#fffbeb", text: "#d97706", sep: "#fde68a" },
    { border: "#059669", bg: "#f0fdf4", text: "#059669", sep: "#a7f3d0" },
  ];
  const accent = accents[index % accents.length];

  // Build the column rows — skip columns where the cell is empty
  const columnRows = entry.columns
    .filter((col) => entry.row[col]?.trim())
    .map((col, colIdx) => {
      const isEng = isEnglishMeaning(col);
      const isFirst = colIdx === 0;

      // Primary script (first column) → big and bold
      // English meaning → medium, green
      // Everything else → normal
      const valueStyle = isEng
        ? "font-size:17px;color:#059669;font-weight:700;line-height:1.4;"
        : isFirst
        ? "font-size:30px;color:#111827;font-weight:800;line-height:1.3;letter-spacing:1px;"
        : "font-size:16px;color:#374151;font-weight:500;line-height:1.5;";

      const isLast = colIdx === entry.columns.filter((c) => entry.row[c]?.trim()).length - 1;
      const borderStyle = isLast ? "" : "border-bottom:1px solid #f3f4f6;";

      return `
        <tr>
          <td style="padding:10px 0;${borderStyle}">
            <span style="display:block;font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(col)}</span>
            <span style="${valueStyle}">${escapeHtml(entry.row[col])}</span>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="margin-bottom:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);border:1px solid #e8eaf6;">
      <!-- Card header bar with accent colour and table source -->
      <tr>
        <td style="background:${accent.bg};padding:11px 20px;border-left:4px solid ${accent.border};border-bottom:1px solid ${accent.sep};">
          <span style="font-size:11px;font-weight:700;color:${accent.text};letter-spacing:1px;text-transform:uppercase;">
            Word ${index + 1}
          </span>
          <span style="font-size:11px;color:#9ca3af;margin-left:8px;">
            · ${escapeHtml(entry.tableTitle)}${entry.languageName ? ` · ${escapeHtml(entry.languageName)}` : ""}
          </span>
        </td>
      </tr>
      <!-- Card body with all column data -->
      <tr>
        <td style="background:#ffffff;padding:20px 20px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${columnRows}
          </table>
        </td>
      </tr>
    </table>`;
}

// Assembles the full email HTML from a list of word entries.
// Uses table-based layout for maximum email client compatibility.
function buildEmailHtml(
  words: WordEntry[],
  frequency: string,
): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const frequencyLabel = frequency === "daily" ? "Daily" : "Weekly";

  // Get unique language names to show in the header subtitle.
  // Each individual name is escaped; the joined string is safe to embed in HTML.
  const languages = [...new Set(words.map((w) => w.languageName).filter(Boolean))];
  const langLabel = languages.length > 0
    ? languages.map(escapeHtml).join(" &amp; ")
    : "Vocabulary";

  const wordCards = words.map((w, i) => buildWordCard(i, w)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your ${frequencyLabel} Vocab — TableSnap</title>
</head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <!-- Outer wrapper — centres everything and adds top/bottom padding -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
    style="background:#eef2ff;padding:48px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:600px;width:100%;">

          <!-- ══════════════ HEADER ══════════════ -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);
                        border-radius:20px 20px 0 0;padding:48px 40px 44px;text-align:center;">

              <!-- App badge -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <span style="display:inline-block;background:rgba(255,255,255,0.18);
                                 border-radius:50px;padding:7px 20px;
                                 font-size:13px;font-weight:700;color:white;letter-spacing:1.5px;">
                      📸 &nbsp;TABLESNAP
                    </span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 12px 0;font-size:38px;font-weight:800;color:white;
                          letter-spacing:-1px;line-height:1.1;">
                Your ${frequencyLabel} Vocab
              </h1>
              <p style="margin:0 0 8px 0;font-size:16px;color:rgba(255,255,255,0.88);font-weight:500;">
                ${langLabel} &nbsp;·&nbsp; 5 words picked just for you
              </p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.55);">${today}</p>

              <!-- Decorative divider -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-top:28px;">
                    <div style="width:48px;height:3px;background:rgba(255,255,255,0.35);border-radius:2px;display:inline-block;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════ INTRO TEXT ══════════════ -->
          <tr>
            <td style="background:#f8faff;padding:28px 36px 8px;border-left:1px solid #e0e7ff;border-right:1px solid #e0e7ff;">
              <p style="margin:0;font-size:14px;color:#6b7280;text-align:center;line-height:1.7;">
                Here are <strong style="color:#4f46e5;">5 words</strong> from your saved tables.
                Try to recall each word before reading the full row — that's how memory sticks.
              </p>
            </td>
          </tr>

          <!-- ══════════════ WORD CARDS ══════════════ -->
          <tr>
            <td style="background:#f8faff;padding:24px 36px 28px;
                        border-left:1px solid #e0e7ff;border-right:1px solid #e0e7ff;">
              ${wordCards}
            </td>
          </tr>

          <!-- ══════════════ STUDY TIP ══════════════ -->
          <tr>
            <td style="background:#fffbeb;padding:20px 36px;
                        border-top:1px solid #fde68a;border-bottom:1px solid #fde68a;
                        border-left:1px solid #e0e7ff;border-right:1px solid #e0e7ff;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width:32px;vertical-align:top;padding-top:2px;">
                    <span style="font-size:20px;">💡</span>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;">
                      <strong>Study tip:</strong> Cover the English meaning with your hand, read the
                      foreign script, and try to recall the meaning before looking.
                      Spaced repetition is most effective when you test yourself first.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════ FOOTER ══════════════ -->
          <tr>
            <td style="background:#1e1b4b;border-radius:0 0 20px 20px;padding:32px 36px;text-align:center;">
              <!-- Footer logo -->
              <p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:white;letter-spacing:0.5px;">
                📸 TableSnap
              </p>
              <p style="margin:0 0 16px 0;font-size:12px;color:#818cf8;">
                Your vocabulary learning companion
              </p>
              <!-- Divider -->
              <div style="height:1px;background:rgba(255,255,255,0.1);margin:0 0 16px;"></div>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
                You're receiving this because you enabled ${frequencyLabel.toLowerCase()} vocab reminders in TableSnap.<br>
                To stop these emails, open the app and turn off reminders in the Reminders page.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Two valid callers:
  //   1. The pg_cron job — sends `x-cron-secret: <secret>` in the header.
  //      This secret must be set via: supabase secrets set CRON_SECRET=<value>
  //   2. A logged-in user clicking "Send test email" — sends a valid user JWT
  //      in the Authorization header. We verify it with getUser().
  //
  // Neither path accepts anonymous requests.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingCronSecret = req.headers.get("x-cron-secret");

  // Path 1: cron job authentication — constant-time comparison prevents
  // timing-attack enumeration of the secret value.
  const isCronCall = cronSecret &&
    incomingCronSecret &&
    incomingCronSecret.length === cronSecret.length &&
    incomingCronSecret.split("").every((c, i) => c === cronSecret[i]);

  if (!isCronCall) {
    // Path 2: user JWT — fall back to verifying the bearer token.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
  }

  // Use service role client so we can read any user's data (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const isMonday = today.getDay() === 1;

  // Fetch all enabled email reminders
  const { data: reminders, error: reminderErr } = await supabase
    .from("reminders")
    .select("user_id, frequency")
    .eq("enabled", true)
    .eq("delivery_method", "email");

  if (reminderErr) {
    console.error("reminders fetch error:", reminderErr.message);
    return new Response(JSON.stringify({ error: reminderErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`Found ${reminders?.length ?? 0} active reminders`);

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ message: "No active reminders" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter: daily every day, weekly only on Mondays
  const toNotify = reminders.filter(
    (r) => r.frequency === "daily" || (r.frequency === "weekly" && isMonday),
  );

  const results = [];

  for (const reminder of toNotify) {
    // Get the user's email address from the public users table
    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("email")
      .eq("id", reminder.user_id)
      .single();

    if (userErr || !userData?.email) {
      console.log(`Skipping ${reminder.user_id}: no email (${userErr?.message})`);
      results.push({ userId: reminder.user_id, status: "skipped", reason: "no email" });
      continue;
    }

    // Fetch ALL snapshots for this user — prefer language tables but fall back
    // to everything so we don't silently skip users whose tables predate the
    // dataset_type column (those rows have NULL there).
    const { data: allSnaps, error: snapsErr } = await supabase
      .from("table_snapshots")
      .select("table_data, column_names, title, language_name, dataset_type")
      .eq("user_id", reminder.user_id);

    if (snapsErr) {
      console.error(`snapshots fetch error for ${reminder.user_id}:`, snapsErr.message);
      results.push({ userId: reminder.user_id, status: "error", reason: snapsErr.message });
      continue;
    }

    console.log(`User ${reminder.user_id}: ${allSnaps?.length ?? 0} total snapshots`);

    // Use language tables if any exist; otherwise fall back to all tables
    const languageSnaps = (allSnaps ?? []).filter(
      (s) => s.dataset_type === "language" || s.language_name,
    );
    const snapshots = languageSnaps.length > 0 ? languageSnaps : (allSnaps ?? []);

    console.log(`Using ${snapshots.length} snapshots (${languageSnaps.length} language)`);

    if (snapshots.length === 0) {
      results.push({ userId: reminder.user_id, status: "skipped", reason: "no tables" });
      continue;
    }

    // Flatten every row from every table into one pool and pick 5
    const allWords: WordEntry[] = snapshots.flatMap((snap) =>
      (snap.table_data as Record<string, string>[]).map((row) => ({
        row,
        columns: snap.column_names as string[],
        tableTitle: (snap.title as string | null) || (snap.column_names as string[]).join(" / "),
        languageName: (snap.language_name as string | null) ?? "",
      }))
    );

    if (allWords.length === 0) {
      results.push({ userId: reminder.user_id, status: "skipped", reason: "tables are empty" });
      continue;
    }

    const picked = pickRandom(allWords, Math.min(5, allWords.length));
    const html = buildEmailHtml(picked, reminder.frequency);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TableSnap <onboarding@resend.dev>",
        // RESEND_TEST_TO overrides the recipient — use this when your Resend
        // account email differs from your Supabase account email. Without a
        // verified domain, Resend only allows sending to the account's own email.
        to: [Deno.env.get("RESEND_TEST_TO") ?? userData.email],
        subject: `📚 Your ${reminder.frequency} vocab words — ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        html,
      }),
    });

    const resendBody = await resendRes.text();
    if (!resendRes.ok) {
      console.error(`Resend error for ${userData.email}:`, resendBody);
      results.push({ userId: reminder.user_id, status: "failed", to: userData.email, resendError: resendBody });
    } else {
      console.log(`Email sent to ${userData.email}`);
      results.push({ userId: reminder.user_id, status: "sent", to: userData.email });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
