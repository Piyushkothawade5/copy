import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const reportFromEmail = Deno.env.get("REPORT_FROM_EMAIL") || "onboarding@resend.dev";
const dashboardUrl = Deno.env.get("APP_DASHBOARD_URL") || "";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatKolkataDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function dateFromIsoInKolkata(iso: string) {
  return new Date(`${iso}T00:00:00+05:30`);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function getDefaultPeriod(kind: string) {
  const todayIso = formatKolkataDate(new Date());
  const today = dateFromIsoInKolkata(todayIso);

  if (kind === "daily") {
    const previousDay = addDays(today, -1);
    const iso = formatKolkataDate(previousDay);
    return { startDate: iso, endDate: iso };
  }

  const firstCurrentMonth = dateFromIsoInKolkata(`${todayIso.slice(0, 8)}01`);
  const lastPreviousMonth = addDays(firstCurrentMonth, -1);
  const lastPreviousIso = formatKolkataDate(lastPreviousMonth);
  const firstPreviousIso = `${lastPreviousIso.slice(0, 8)}01`;
  return { startDate: firstPreviousIso, endDate: lastPreviousIso };
}

async function authorize(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Unauthorized request.");
  }

  if (token === serviceRoleKey) {
    return { actor: "service-role", source: "cron" };
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized request.");
  }

  const { data: employee } = await service
    .from("employees")
    .select("full_name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!employee || employee.role !== "admin") {
    throw new Error("Admin access required.");
  }

  return { actor: employee.full_name, source: "manual" };
}

function buildCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "name,entries,oee\n";

  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? "";
        const text = String(value);
        if (text.includes(",") || text.includes('"')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      })
      .join(","),
  );

  return `${headers.join(",")}\n${lines.join("\n")}`;
}

function buildHtml(kind: string, period: { startDate: string; endDate: string }, dashboard: any, analysis: any) {
  const topSupervisor = dashboard.kpis.topSupervisor?.name || "--";
  const topItem = dashboard.kpis.topItemProduced?.name || "--";
  const mostRejected = dashboard.kpis.mostRejectedItem?.name || "--";
  const rejectionRows = (analysis.rejectionPareto || [])
    .slice(0, 5)
    .map(
      (row: any) =>
        `<tr><td>${row.label}</td><td>${row.value}</td><td>${row.cumulativeShare}%</td></tr>`,
    )
    .join("");
  const machineRows = (analysis.machineLeague || [])
    .slice(0, 5)
    .map(
      (row: any) =>
        `<tr><td>${row.name}</td><td>${row.oee}%</td><td>${row.goodQty}</td><td>${row.rejectionQty}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#102038">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f1c33,#17355d,#2f7ad9);padding:24px;color:#ffffff">
          <div style="font-size:12px;letter-spacing:0.12em;font-weight:700">SHUBHADA POLYMERS</div>
          <h1 style="margin:10px 0 0;font-size:28px">${kind === "daily" ? "Daily" : "Monthly"} Management Report</h1>
          <p style="margin:8px 0 0;color:#d8e5f5">Period: ${period.startDate} to ${period.endDate}</p>
        </div>
        <div style="padding:24px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
            <div style="padding:16px;border:1px solid #e4ebf4;border-radius:16px"><strong>Total Production</strong><div style="font-size:24px;margin-top:8px">${dashboard.kpis.totalProduction}</div></div>
            <div style="padding:16px;border:1px solid #e4ebf4;border-radius:16px"><strong>Overall OEE</strong><div style="font-size:24px;margin-top:8px">${dashboard.kpis.overallOee}%</div></div>
            <div style="padding:16px;border:1px solid #e4ebf4;border-radius:16px"><strong>Good Output</strong><div style="font-size:24px;margin-top:8px">${dashboard.kpis.goodOutput}</div></div>
            <div style="padding:16px;border:1px solid #e4ebf4;border-radius:16px"><strong>Rejection Rate</strong><div style="font-size:24px;margin-top:8px">${dashboard.kpis.rejectionRate}%</div></div>
          </div>
          <div style="margin-top:22px;line-height:1.8">
            <div><strong>Top Supervisor:</strong> ${topSupervisor}</div>
            <div><strong>Top Item Produced:</strong> ${topItem}</div>
            <div><strong>Most Rejected Item:</strong> ${mostRejected}</div>
            <div><strong>Total Downtime Hours:</strong> ${analysis.summary.totalDowntimeHours}</div>
          </div>
          <h2 style="margin:28px 0 12px">Top Rejection Reasons</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr><th align="left">Reason</th><th align="left">Qty</th><th align="left">Cumulative Share</th></tr></thead>
            <tbody>${rejectionRows || "<tr><td colspan='3'>No rejection data</td></tr>"}</tbody>
          </table>
          <h2 style="margin:28px 0 12px">Machine Leaderboard</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr><th align="left">Machine</th><th align="left">OEE</th><th align="left">Good Qty</th><th align="left">Reject Qty</th></tr></thead>
            <tbody>${machineRows || "<tr><td colspan='4'>No machine data</td></tr>"}</tbody>
          </table>
          ${
            dashboardUrl
              ? `<p style="margin-top:24px"><a href="${dashboardUrl}" style="color:#2f7ad9;font-weight:700">Open live dashboard</a></p>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let runId: string | null = null;

  try {
    const auth = await authorize(request);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const kind = body.kind === "monthly" ? "monthly" : "daily";
    const force = Boolean(body.force);
    const period = body.startDate && body.endDate
      ? { startDate: body.startDate, endDate: body.endDate }
      : getDefaultPeriod(kind);

    const { data: run } = await service
      .from("report_runs")
      .insert({
        report_kind: kind,
        period_start: period.startDate,
        period_end: period.endDate,
        trigger_source: body.triggerSource || auth.source,
        status: "started",
        meta: { actor: auth.actor },
      })
      .select("id")
      .single();

    runId = run?.id || null;

    const { data: previousSuccess } = await service
      .from("report_runs")
      .select("id")
      .eq("report_kind", kind)
      .eq("period_start", period.startDate)
      .eq("period_end", period.endDate)
      .eq("status", "sent")
      .neq("id", runId)
      .limit(1)
      .maybeSingle();

    if (previousSuccess && !force) {
      await service
        .from("report_runs")
        .update({
          status: "skipped_duplicate",
          failure_details: "A successful run already exists for this period.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      return response({ success: true, skipped: true });
    }

    const { data: dashboard } = await service.rpc("get_dashboard_snapshot", {
      p_start_date: period.startDate,
      p_end_date: period.endDate,
      p_shift: null,
      p_machine_id: null,
      p_supervisor_id: null,
      p_part_id: null,
    });
    const { data: analysis } = await service.rpc("get_analysis_bundle", {
      p_start_date: period.startDate,
      p_end_date: period.endDate,
      p_shift: null,
      p_machine_id: null,
      p_supervisor_id: null,
      p_part_id: null,
    });

    const recipientColumn = kind === "daily" ? "receives_daily" : "receives_monthly";
    const { data: recipients } = await service
      .from("report_recipients")
      .select("email")
      .eq("active", true)
      .eq(recipientColumn, true);

    if (!recipients?.length) {
      await service
        .from("report_runs")
        .update({
          status: "skipped_no_recipients",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      return response({ success: true, skipped: true, reason: "No recipients configured." });
    }

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is missing.");
    }

    const csv = buildCsv(analysis.machineLeague || []);
    const html = buildHtml(kind, period, dashboard, analysis);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: reportFromEmail,
        to: recipients.map((recipient: { email: string }) => recipient.email),
        subject: `Shubhada ${kind === "daily" ? "Daily" : "Monthly"} Report | ${period.startDate} to ${period.endDate}`,
        html,
        attachments: [
          {
            filename: `${kind}-report-${period.startDate}-to-${period.endDate}.csv`,
            content: btoa(csv),
          },
        ],
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(errorText || "Resend request failed.");
    }

    await service
      .from("report_runs")
      .update({
        status: "sent",
        recipient_count: recipients.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return response({ success: true });
  } catch (error) {
    if (runId) {
      await service
        .from("report_runs")
        .update({
          status: "failed",
          failure_details: error instanceof Error ? error.message : "Unexpected error.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return response(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500,
    );
  }
});
