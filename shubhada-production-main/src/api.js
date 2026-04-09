import { createClient } from "@supabase/supabase-js";

export const SHIFT_OPTIONS = [
  { value: "day", label: "Day Shift (6 AM - 6 PM)" },
  { value: "night", label: "Night Shift (6 PM - 6 AM)" },
];

export const ROLE_CONFIG = {
  supervisor: { label: "Supervisor", color: "#2f7ad9", icon: "S" },
  manager: { label: "Manager", color: "#198754", icon: "M" },
  admin: { label: "Admin", color: "#dd8a13", icon: "A" },
};

export const PERIOD_PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" },
];

export const MASTER_TABLES = {
  machines: { table: "machines", label: "Machines" },
  parts: { table: "parts", label: "Parts" },
  operators: { table: "operators", label: "Operators" },
  downtimeReasons: { table: "downtime_reasons", label: "Downtime Reasons" },
  rejectionReasons: { table: "rejection_reasons", label: "Rejection Reasons" },
};

export const REPORT_KIND_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
];

export const OTHER_REJECTION_REASON_VALUE = "__other__";

export const ADMIN_EXPORT_OPTIONS = [
  { value: "employees", label: "Employees" },
  { value: "production", label: "Production Entries" },
];

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

clearLegacyAuthStorage();

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase environment variables are missing.");
  }
  return supabase;
}

export function normalizeEmployeeId(value) {
  return (value || "").trim().toUpperCase();
}

export function employeeIdToAlias(employeeId) {
  const normalized = normalizeEmployeeId(employeeId).replace(/[^A-Z0-9._-]/g, "").toLowerCase();
  return `${normalized}@auth.shubhadapolymers.local`;
}

export function pinToAuthPassword(pin) {
  const normalized = String(pin || "").replace(/\D/g, "").slice(0, 4);
  return `sp-pin-${normalized}-secure`;
}

export function getTodayISO() {
  return formatDateInput(new Date());
}

export function getAutoShift(date = new Date()) {
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

export function formatDateInput(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRangeForPreset(preset, now = new Date()) {
  const endDate = formatDateInput(now);

  if (preset === "today") {
    return { startDate: endDate, endDate };
  }

  if (preset === "week") {
    const copy = new Date(now);
    const day = copy.getDay();
    const diff = day === 0 ? 6 : day - 1;
    copy.setDate(copy.getDate() - diff);
    return { startDate: formatDateInput(copy), endDate };
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: formatDateInput(monthStart), endDate };
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value || 0));
}

export function formatPercent(value, digits = 1) {
  return `${formatNumber(value || 0, digits)}%`;
}

export function formatDateLabel(value, withYear = false) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function buildRejectionReasonOptions(masterOptions = []) {
  const byLabel = new Map();

  masterOptions.forEach((option) => {
    if (!option?.label) return;
    byLabel.set(option.label.toLowerCase(), {
      id: option.id,
      label: option.label,
      });
  });

  const options = Array.from(byLabel.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );

  options.push({
    id: OTHER_REJECTION_REASON_VALUE,
    label: "Other",
  });

  return options;
}

export function downloadCsv(filename, rows, columns) {
  const lines = [
    columns.map((column) => escapeCsvCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvCell(column.value(row))).join(","),
    ),
  ];

  const blob = new Blob([`\ufeff${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function readSingle(data, fallbackMessage) {
  if (!data) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export function getErrorMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error_description) return error.error_description;
  return fallback;
}

export async function signInWithEmployeeId(employeeId, pin) {
  const client = requireClient();
  const email = employeeIdToAlias(employeeId);
  const rawPin = String(pin || "").replace(/\D/g, "").slice(0, 4);

  const { data: legacyData, error: legacyError } = await client.auth.signInWithPassword({
    email,
    password: rawPin,
  });

  if (!legacyError) {
    return legacyData;
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pinToAuthPassword(rawPin),
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentEmployee(userId) {
  const client = requireClient();
  const authUserId = userId || (await getSession())?.user?.id;

  if (!authUserId) {
    return null;
  }

  const { data, error } = await client
    .from("employees")
    .select("id, employee_id, full_name, role, active")
    .eq("auth_user_id", authUserId)
    .single();

  if (error) throw error;
  return readSingle(data, "Employee profile not found.");
}

export async function getMasters() {
  const client = requireClient();
  const { data, error } = await client.rpc("get_master_data");
  if (error) throw error;
  return data;
}

export async function saveProductionEntry(payload, rejectionDetails = []) {
  const client = requireClient();
  const { data, error } = await client.rpc("save_production_entry", {
    p_entry: payload,
    p_rejection_details: rejectionDetails,
  });

  if (error) throw error;
  return data;
}

export async function getMyEntries({ startDate, endDate, limit } = {}) {
  const client = requireClient();
  let query = client
    .from("production_entry_feed")
    .select("*")
    .order("production_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (startDate) query = query.gte("production_date", startDate);
  if (endDate) query = query.lte("production_date", endDate);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function deleteMyEntry(entryId) {
  const client = requireClient();
  const { data, error } = await client.rpc("delete_my_entry", {
    p_entry_id: entryId,
  });

  if (error) throw error;
  return data;
}

export async function getDashboardSnapshot(filters) {
  const client = requireClient();
  const { data, error } = await client.rpc("get_dashboard_snapshot", {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_shift: filters.shift || null,
    p_machine_id: filters.machineId || null,
    p_supervisor_id: filters.supervisorId || null,
    p_part_id: filters.partId || null,
  });

  if (error) throw error;
  return data;
}

export async function getAnalysisBundle(filters) {
  const client = requireClient();
  const { data, error } = await client.rpc("get_analysis_bundle", {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_shift: filters.shift || null,
    p_machine_id: filters.machineId || null,
    p_supervisor_id: filters.supervisorId || null,
    p_part_id: filters.partId || null,
  });

  if (error) throw error;
  return data;
}

export function subscribeToProductionChanges(callback) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`production-live-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "production_entries" },
      callback,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function addMasterRecord(tableName, name) {
  const client = requireClient();
  const { data, error } = await client
    .from(tableName)
    .insert({ name: name.trim() })
    .select("id, name")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMasterRecord(tableName, id) {
  const client = requireClient();
  const { error } = await client.from(tableName).delete().eq("id", id);
  if (error) throw error;
}

export async function listEmployees() {
  const client = requireClient();
  const { data, error } = await client.rpc("list_employees_admin");
  if (error) throw error;
  return data || [];
}

export async function listProductionEntriesForAdminExport(filters = {}) {
  const client = requireClient();
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    let query = client
      .from("production_entry_feed")
      .select("*")
      .order("production_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters.startDate) {
      query = query.gte("production_date", filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte("production_date", filters.endDate);
    }
    if (filters.machineId) {
      query = query.eq("machine_id", filters.machineId);
    }
    if (filters.supervisorId) {
      query = query.eq("supervisor_id", filters.supervisorId);
    }
    if (filters.partId) {
      query = query.eq("part_id", filters.partId);
    }

    const { data, error } = await query.range(start, start + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return rows;
}

export async function manageEmployee(payload) {
  const { data, error } = await invokeFunction("employee-admin", {
    body: payload,
  });

  if (error) {
    const message = await extractFunctionError(error);
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listReportRecipients() {
  const client = requireClient();
  const { data, error } = await client
    .from("report_recipients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertReportRecipient(payload) {
  const client = requireClient();
  const { data, error } = await client
    .from("report_recipients")
    .upsert(payload, { onConflict: "email" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteReportRecipient(id) {
  const client = requireClient();
  const { error } = await client.from("report_recipients").delete().eq("id", id);
  if (error) throw error;
}

export async function listReportRuns() {
  const client = requireClient();
  const { data, error } = await client
    .from("report_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(12);

  if (error) throw error;
  return data || [];
}

export async function triggerReport(kind, force = true) {
  const { data, error } = await invokeFunction("management-report", {
    body: {
      kind,
      force,
      triggerSource: "manual",
    },
  });

  if (error) {
    const message = await extractFunctionError(error);
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeFunction(name, options = {}) {
  const client = requireClient();
  const session = await getSession();
  const headers = {
    ...(options.headers || {}),
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return client.functions.invoke(name, {
    ...options,
    headers,
  });
}

async function extractFunctionError(error) {
  if (!error) {
    return "Edge Function request failed.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && !error.context) {
    return error.message;
  }

  if (error.context) {
    try {
      const payload = await error.context.json();
      if (payload?.error) {
        return payload.error;
      }
    } catch (_unused) {
      try {
        const text = await error.context.text();
        if (text) {
          return text;
        }
      } catch (_ignored) {
        // Ignore parsing failures and fall through to the generic message.
      }
    }
  }

  return error.message || "Edge Function request failed.";
}

function clearLegacyAuthStorage() {
  if (typeof window === "undefined" || !supabaseUrl) {
    return;
  }

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const keys = [
      `sb-${projectRef}-auth-token`,
      `sb-${projectRef}-auth-token-code-verifier`,
    ];

    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch (_error) {
    // Ignore invalid URLs and keep the app boot path simple.
  }
}
