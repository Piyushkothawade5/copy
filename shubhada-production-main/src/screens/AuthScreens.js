import { useState } from "react";
import { signInWithEmployeeId } from "../api";
import { S } from "../styles";
import { getErrorMessage } from "../api";

export function SetupScreen() {
  return (
    <div style={S.loginShell}>
      <div style={S.loginCard}>
        <div style={S.loginBanner}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", fontWeight: 800 }}>
            SHUBHADA POLYMERS
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
            Phase 3 is coded, but Supabase is not configured yet.
          </div>
          <div style={{ marginTop: 10, color: "#d9e6f6", lineHeight: 1.6 }}>
            Add your project credentials to <code>.env</code>, then restart the dev
            server.
          </div>
        </div>

        <div style={S.sectionTitle}>Required Variables</div>
        <div style={S.listCard}>
          {["REACT_APP_SUPABASE_URL", "REACT_APP_SUPABASE_ANON_KEY"].map((item) => (
            <div key={item} style={S.listItem}>
              <span style={{ fontWeight: 700 }}>{item}</span>
              <span style={{ color: "#60708a", fontSize: 13 }}>Set in `.env`</span>
            </div>
          ))}
        </div>

        <ul style={S.setupList}>
          <li>Run the SQL migration in `supabase/migrations/20260407_phase3.sql`.</li>
          <li>Deploy the `employee-admin` and `management-report` edge functions.</li>
          <li>Seed active users and master lists before going live.</li>
        </ul>
      </div>
    </div>
  );
}

export function LoginScreen({ showToast }) {
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!employeeId || pin.length !== 4) {
      setError("Enter your employee ID and 4-digit PIN.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await signInWithEmployeeId(employeeId, pin);
      showToast("Signed in successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to sign in. Please verify your ID and PIN."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.loginShell}>
      <div style={S.loginCard}>
        <div style={S.loginBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.brandMark}>SP</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em" }}>
                SHUBHADA POLYMERS Pvt.Ltd
              </div>
              <div style={{ marginTop: 4, color: "#caddf1", fontSize: 13 }}>
                Production reporting system
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
            Smart Manufacturing Starts Here.
          </div>
          <div style={{ marginTop: 10, color: "#d9e6f6", lineHeight: 1.65 }}>
            One platform. Every role. Real-time data from the floor to the boardroom.
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 14,
              background: "#fff1f1",
              color: "#b23a3a",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={S.label}>Employee ID</label>
            <input
              autoComplete="username"
              style={S.input}
              placeholder="SP001"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === "Enter" && handleLogin()}
            />
          </div>

          <div>
            <label style={S.label}>PIN</label>
            <input
              autoComplete="current-password"
              inputMode="numeric"
              maxLength={4}
              style={S.input}
              placeholder="1234"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => event.key === "Enter" && handleLogin()}
            />
          </div>

          <button
            disabled={loading}
            onClick={handleLogin}
            style={{ ...S.primaryBtn, opacity: loading ? 0.75 : 1 }}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </div>

        <div style={{ marginTop: 18, color: "#60708a", lineHeight: 1.65, fontSize: 13 }}>
          User accounts are created by admin. Contact the administrator if you need
          a new employee ID or a PIN reset.
        </div>
      </div>
    </div>
  );
}
