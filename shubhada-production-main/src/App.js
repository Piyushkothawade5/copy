import { startTransition, useCallback, useEffect, useState } from "react";
import {
  ROLE_CONFIG,
  getCurrentEmployee,
  getErrorMessage,
  getMasters,
  getSession,
  isSupabaseConfigured,
  signOut,
  supabase,
} from "./api";
import { S } from "./styles";
import { ensureAllowedScreen, roleBadgeStyle } from "./utils";
import { GlobalStyles, FullPageLoader, Toast } from "./ui";
import { SetupScreen, LoginScreen } from "./screens/AuthScreens";
import { EntryScreen } from "./screens/EntryScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { AnalysisScreen } from "./screens/AnalysisScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { QuickAddScreen } from "./screens/QuickAddScreen";

const EMPTY_MASTERS = {
  supervisors: [],
  machines: [],
  parts: [],
  operators: [],
  downtimeReasons: [],
  rejectionReasons: [],
};

export default function App() {
  const [user, setUser] = useState(null);
  const [masters, setMasters] = useState(EMPTY_MASTERS);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("login");
  const [editingEntry, setEditingEntry] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  const hydrateSignedInState = useCallback(async (authUserId) => {
    setBooting(true);
    try {
      const [employee, masterData] = await withTimeout(
        Promise.all([getCurrentEmployee(authUserId), getMasters()]),
        12000,
        "Loading timed out. Please refresh the page.",
      );

      if (!employee?.active) {
        await signOut();
        throw new Error("Your account is inactive. Please contact the admin.");
      }

      startTransition(() => {
        setUser(employee);
        setMasters(masterData || EMPTY_MASTERS);
        setEditingEntry(null);
        setScreen((current) => ensureAllowedScreen(current, employee.role));
      });
    } catch (error) {
      startTransition(() => {
        setUser(null);
        setMasters(EMPTY_MASTERS);
        setEditingEntry(null);
        setScreen("login");
      });

      const message = getErrorMessage(error, "Unable to load your account.");
      if (message !== "Supabase environment variables are missing.") {
        showToast(message, "error");
      }
    } finally {
      setBooting(false);
    }
  }, [showToast]);

  const refreshMasters = useCallback(async () => {
    const masterData = await getMasters();
    setMasters(masterData || EMPTY_MASTERS);
    return masterData;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBooting(false);
      return undefined;
    }

    let active = true;

    const boot = async () => {
      try {
      const session = await getSession();
      if (!active) return;
      if (session) {
          await hydrateSignedInState(session.user.id);
        } else {
          setBooting(false);
        }
      } catch (error) {
        if (!active) return;
        setBooting(false);
        showToast(getErrorMessage(error, "Unable to start the app."), "error");
      }
    };

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        void hydrateSignedInState(session.user.id);
      } else {
        startTransition(() => {
          setUser(null);
          setMasters(EMPTY_MASTERS);
          setEditingEntry(null);
          setScreen("login");
          setBooting(false);
        });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hydrateSignedInState, showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      showToast("Signed out.");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to sign out."), "error");
    }
  }, [showToast]);

  const beginEditEntry = useCallback((entry) => {
    setEditingEntry(entry);
    setScreen("entry");
  }, []);

  const handleEntrySaved = useCallback(() => {
    setEditingEntry(null);
    setScreen("history");
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <>
        <SetupScreen />
        <GlobalStyles />
      </>
    );
  }

  if (booting) {
    return (
      <>
        <FullPageLoader text="Connecting to live production data..." />
        <GlobalStyles />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen showToast={showToast} />
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <GlobalStyles />
      </>
    );
  }

  const nav = [];
  if (user.role === "supervisor" || user.role === "admin") {
    nav.push({ key: "entry", label: "New Entry" }, { key: "history", label: "My Entries" });
  }
  if (user.role === "supervisor") {
    nav.push({ key: "quickAdd", label: "Quick Add" });
  }
  if (user.role === "supervisor" || user.role === "manager" || user.role === "admin") {
    nav.push({ key: "dashboard", label: "Dashboard" }, { key: "analysis", label: "Analysis" });
  }
  if (user.role === "admin") {
    nav.push({ key: "admin", label: "Admin" });
  }

  return (
    <div style={S.app}>
      <TopBar user={user} onLogout={handleLogout} />
      <div style={S.shell}>
        <div style={S.navBar}>
          {nav.map((item) => (
            <button
              key={item.key}
              style={{
                ...S.navBtn,
                ...(screen === item.key ? S.navActive : {}),
              }}
              onClick={() => {
                setScreen(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={S.content}>
          {screen === "entry" && (
            <EntryScreen
              editingEntry={editingEntry}
              masters={masters}
              onCancelEdit={() => {
                setEditingEntry(null);
                setScreen("history");
              }}
              onSaved={handleEntrySaved}
              refreshMasters={refreshMasters}
              showToast={showToast}
              user={user}
            />
          )}
          {screen === "history" && (
            <HistoryScreen onEditEntry={beginEditEntry} showToast={showToast} />
          )}
          {screen === "quickAdd" && (
            <QuickAddScreen
              masters={masters}
              refreshMasters={refreshMasters}
              showToast={showToast}
            />
          )}
          {screen === "dashboard" && (
            <DashboardScreen masters={masters} showToast={showToast} />
          )}
          {screen === "analysis" && (
            <AnalysisScreen masters={masters} showToast={showToast} />
          )}
          {screen === "admin" && (
            <AdminScreen
              masters={masters}
              refreshMasters={refreshMasters}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <GlobalStyles />
    </div>
  );
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function TopBar({ user, onLogout }) {
  return (
    <div style={S.topBar}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={S.brandMark}>SP</div>
        <div>
          <div style={{ color: "#ffffff", fontWeight: 800, letterSpacing: "0.08em" }}>
            SHUBHADA POLYMERS
          </div>
          <div style={{ color: "#aec7e3", fontSize: 12 }}>
            Production tracking, analytics, and reporting
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontWeight: 700 }}>{user.full_name}</div>
          <div style={{ color: "#aec7e3", fontSize: 12 }}>{user.employee_id}</div>
        </div>
        <span
          style={{
            ...S.badge,
            ...roleBadgeStyle(user.role),
          }}
        >
          {ROLE_CONFIG[user.role].label}
        </span>
        <button onClick={onLogout} style={S.subtleBtn}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
