import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeEmployeeId(value: string) {
  return value.trim().toUpperCase();
}

function aliasFromEmployeeId(employeeId: string) {
  return `${normalizeEmployeeId(employeeId).replace(/[^A-Z0-9._-]/g, "").toLowerCase()}@auth.shubhadapolymers.local`;
}

function pinToAuthPassword(pin: string) {
  const normalized = String(pin || "").replace(/\D/g, "").slice(0, 4);
  return `sp-pin-${normalized}-secure`;
}

function randomSecret() {
  return `${crypto.randomUUID()}-${Date.now()}`;
}

function errorResponse(message: string, status = 400) {
  console.error("employee-admin error:", message);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header.");

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized request.");
  }

  const { data: employee, error } = await service
    .from("employees")
    .select("id, role, full_name")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !employee || employee.role !== "admin") {
    throw new Error("Admin access required.");
  }

  return employee;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAdmin(request);
    const body = await request.json();
    const action = body?.action;
    console.log("employee-admin action:", action);

    if (action === "create_employee") {
      const employeeId = normalizeEmployeeId(body.employeeId || "");
      const fullName = (body.fullName || "").trim();
      const role = body.role || "supervisor";
      const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 4);
      console.log("create_employee payload:", { employeeId, fullName, role });

      if (!employeeId || !fullName || !pin) {
        return errorResponse("Employee ID, full name, role, and PIN are required.");
      }

      const aliasEmail = aliasFromEmployeeId(employeeId);
      const { data: authUser, error: authError } = await service.auth.admin.createUser({
        email: aliasEmail,
        password: pinToAuthPassword(pin),
        email_confirm: true,
      });

      if (authError || !authUser.user) {
        return errorResponse(authError?.message || "Unable to create auth user.");
      }

      const { error: insertError } = await service.from("employees").insert({
        employee_id: employeeId,
        full_name: fullName,
        role,
        auth_user_id: authUser.user.id,
        alias_email: aliasEmail,
        pin_last_reset_at: new Date().toISOString(),
      });

      if (insertError) {
        await service.auth.admin.deleteUser(authUser.user.id);
        return errorResponse(insertError.message || "Unable to create employee record.");
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_pin" || action === "set_active") {
      const employeeId = normalizeEmployeeId(body.employeeId || "");
      const { data: employee, error } = await service
        .from("employees")
        .select("id, auth_user_id, active")
        .eq("employee_id", employeeId)
        .single();

      if (error || !employee) {
        return errorResponse("Employee not found.", 404);
      }

      if (action === "reset_pin") {
        const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 4);
        if (!pin) {
          return errorResponse("PIN is required.");
        }

        const { error: resetError } = await service.auth.admin.updateUserById(
          employee.auth_user_id,
          { password: pinToAuthPassword(pin) },
        );

        if (resetError) {
          return errorResponse(resetError.message || "Unable to reset PIN.");
        }

        await service
          .from("employees")
          .update({ pin_last_reset_at: new Date().toISOString() })
          .eq("id", employee.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nextActive = Boolean(body.active);
      const nextPassword = nextActive
        ? pinToAuthPassword(String(body.pin || ""))
        : randomSecret();

      const { error: statusError } = await service.auth.admin.updateUserById(
        employee.auth_user_id,
        { password: nextPassword },
      );

      if (statusError) {
        return errorResponse(statusError.message || "Unable to update employee status.");
      }

      await service
        .from("employees")
        .update({
          active: nextActive,
          pin_last_reset_at: new Date().toISOString(),
        })
        .eq("id", employee.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return errorResponse("Unsupported action.");
  } catch (error) {
    console.error("employee-admin fatal:", error);
    return errorResponse(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
});
