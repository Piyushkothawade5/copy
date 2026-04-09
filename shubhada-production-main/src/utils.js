import { ROLE_CONFIG, SHIFT_OPTIONS } from "./api";

export function getShiftLabel(value) {
  if (value === "evening") {
    return "Night Shift";
  }
  return SHIFT_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function getLabel(options, id) {
  return options.find((option) => option.id === id)?.label || "";
}

export function colorForOee(value) {
  if (Number(value || 0) >= 85) return "#198754";
  if (Number(value || 0) >= 60) return "#dd8a13";
  return "#c94b4b";
}

export function ensureAllowedScreen(current, role) {
  const allowed = new Set();

  if (role === "supervisor" || role === "admin") {
    allowed.add("entry");
    allowed.add("history");
  }

  if (role === "supervisor") {
    allowed.add("quickAdd");
  }

  if (role === "supervisor" || role === "manager" || role === "admin") {
    allowed.add("dashboard");
    allowed.add("analysis");
  }

  if (role === "admin") {
    allowed.add("admin");
  }

  if (allowed.has(current)) return current;
  if (role === "manager") return "dashboard";
  if (role === "admin") return "dashboard";
  if (role === "supervisor") return "entry";
  return "entry";
}

export function roleBadgeStyle(role) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.supervisor;
  return {
    color: config.color,
    background: `${config.color}18`,
  };
}
