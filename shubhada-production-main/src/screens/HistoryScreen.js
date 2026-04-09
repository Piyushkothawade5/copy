import { useCallback, useEffect, useState } from "react";
import {
  deleteMyEntry,
  formatDateLabel,
  formatNumber,
  getTodayISO,
  getMyEntries,
  getRangeForPreset,
} from "../api";
import { S } from "../styles";
import { colorForOee, getShiftLabel } from "../utils";
import { DateRangeControls, EmptyState, Loader } from "../ui";

export function HistoryScreen({ onEditEntry, showToast }) {
  const [range, setRange] = useState(getRangeForPreset("month"));
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getMyEntries(range);
      setEntries(rows);
    } catch (error) {
      showToast(error.message || "Unable to load entries.", "error");
    } finally {
      setLoading(false);
    }
  }, [range, showToast]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleDelete = async (entry) => {
    const confirmed = window.confirm(
      `Delete the entry for ${entry.machine_name} on ${formatDateLabel(entry.production_date, true)}?`,
    );
    if (!confirmed) return;

    try {
      await deleteMyEntry(entry.id);
      showToast("Entry deleted.");
      await loadEntries();
    } catch (error) {
      showToast(error.message || "Unable to delete this entry.", "error");
    }
  };

  const toggleExpanded = (entryId) => {
    setExpanded((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  };

  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>My Entries</div>
          <div style={S.subtitle}>
            Same-day edit and delete are available. Rejection quantity can expand into detailed reasons.
          </div>
        </div>
        <button style={S.ghostBtn} onClick={loadEntries}>
          Refresh
        </button>
      </div>

      <DateRangeControls range={range} setRange={setRange} />

      {loading ? (
        <Loader text="Loading your entries..." />
      ) : entries.length === 0 ? (
        <EmptyState text="No entries found for the selected period." />
      ) : (
        <div style={{ ...S.listCard, marginTop: 14 }}>
          {entries.map((entry) => {
            const canModify = entry.production_date === getTodayISO();
            const breakdown = Array.isArray(entry.rejection_breakdown)
              ? entry.rejection_breakdown
              : [];
            const hasAnyRejection = Number(entry.rejection_qty || 0) > 0;
            const hasBreakdown = breakdown.length > 0;

            return (
              <div key={entry.id} style={S.listItem}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {entry.machine_name} - {entry.part_name}
                  </div>
                  <div style={{ color: "#60708a", marginTop: 6, lineHeight: 1.6 }}>
                    {formatDateLabel(entry.production_date, true)} - {getShiftLabel(entry.shift)} -
                    Operator {entry.operator_name}
                  </div>
                  <div style={{ color: "#60708a", marginTop: 6, lineHeight: 1.6 }}>
                    Actual {formatNumber(entry.actual_qty)} / Target {formatNumber(entry.target_qty)} -
                    Good {formatNumber(entry.good_qty)}
                  </div>

                  {hasAnyRejection ? (
                    <div style={{ marginTop: 8 }}>
                      <button
                        style={{
                          ...S.ghostBtn,
                          padding: "8px 12px",
                        }}
                        onClick={() => toggleExpanded(entry.id)}
                      >
                        {expanded[entry.id] ? "Hide" : "Show"} rejection reasons (
                        {formatNumber(entry.rejection_qty)})
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, color: "#60708a", fontSize: 14 }}>
                      No rejected quantity recorded for this entry.
                    </div>
                  )}

                  {hasAnyRejection && expanded[entry.id] && (
                    <div style={breakdownPanelStyle}>
                      {hasBreakdown ? (
                        breakdown.map((row, index) => (
                          <div key={row.id || `${entry.id}-${index}`} style={breakdownItemStyle}>
                            <div style={{ fontWeight: 700 }}>{row.rejectionReason}</div>
                            <div style={{ color: "#60708a", marginTop: 4 }}>
                              Qty {formatNumber(row.quantity)}
                              {row.notes ? ` - ${row.notes}` : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#60708a", lineHeight: 1.6 }}>
                          {entry.rejection_reason_name || "Unspecified"}:{" "}
                          {formatNumber(entry.rejection_qty)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: colorForOee(entry.oee) }}>
                    {entry.oee}%
                  </div>
                  {canModify && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 8,
                        justifyContent: "end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button style={S.ghostBtn} onClick={() => onEditEntry?.(entry)}>
                        Edit
                      </button>
                      <button style={S.dangerBtn} onClick={() => handleDelete(entry)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const breakdownPanelStyle = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(20,55,96,0.08)",
  background: "#f8fbff",
  display: "grid",
  gap: 10,
};

const breakdownItemStyle = {
  paddingBottom: 10,
  borderBottom: "1px solid #e5edf6",
};
