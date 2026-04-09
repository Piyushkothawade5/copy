import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OTHER_REJECTION_REASON_VALUE,
  buildRejectionReasonOptions,
  formatDateInput,
  formatNumber,
  formatPercent,
  getAutoShift,
  getMyEntries,
  getTodayISO,
  saveProductionEntry,
} from "../api";
import { SHIFT_OPTIONS } from "../api";
import { S } from "../styles";
import { getLabel } from "../utils";
import {
<<<<<<< HEAD
=======
  advanceOnEnter,
>>>>>>> 6b061e1 (Latest production app updates)
  InputField,
  ReadOnlyField,
  SearchSelect,
  SelectField,
} from "../ui";

export function EntryScreen({
  masters,
  showToast,
  user,
  editingEntry = null,
  onSaved,
  onCancelEdit,
}) {
  const supervisorOptions = useMemo(() => {
    const list = masters.supervisors || [];
    const exists = list.some((item) => item.id === user.id);
    if (exists) return list;

    if (user.role === "admin") {
      return [{ id: user.id, label: user.full_name, meta: user.employee_id }, ...list];
    }

    return list;
  }, [masters.supervisors, user.employee_id, user.full_name, user.id, user.role]);

  const rejectionReasonOptions = useMemo(
    () => buildRejectionReasonOptions(masters.rejectionReasons || []),
    [masters.rejectionReasons],
  );
  const draftKey = useMemo(
    () => getEntryDraftStorageKey(user.id, editingEntry?.id),
    [editingEntry?.id, user.id],
  );
  const baselineDraft = useMemo(
    () => buildEntryDraft({ editingEntry, rejectionReasonOptions, user }),
    [editingEntry, rejectionReasonOptions, user],
  );

  const [form, setForm] = useState(() =>
    restoreEntryDraft({
      draftKey,
      fallback: baselineDraft,
    }),
  );
  const [lastEntry, setLastEntry] = useState(null);
  const [repeatFeedback, setRepeatFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(null);
  const repeatFeedbackTimeoutRef = useRef(null);

  useEffect(() => {
    setForm(
      restoreEntryDraft({
        draftKey,
        fallback: baselineDraft,
      }),
    );
    setSaved(null);
  }, [baselineDraft, draftKey]);

  const fetchLastEntry = useCallback(async () => {
    try {
      const today = getTodayISO();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const rows = await getMyEntries({
        startDate: formatDateInput(sevenDaysAgo),
        endDate: today,
        limit: 1,
      });

      setLastEntry(rows[0] || null);
    } catch (_error) {
      setLastEntry(null);
    }
  }, []);

  useEffect(() => {
    fetchLastEntry();
  }, [fetchLastEntry]);

  useEffect(() => {
    return () => {
      if (repeatFeedbackTimeoutRef.current) {
        window.clearTimeout(repeatFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const rejectedQty = Number(form.rejectionQty || 0);

    if (rejectedQty <= 0 && form.rejectionBreakdown.length > 0) {
      setForm((current) => ({
        ...current,
        rejectionBreakdown: [],
      }));
      return;
    }

    if (rejectedQty > 0 && form.rejectionBreakdown.length === 0) {
      setForm((current) => ({
        ...current,
        rejectionBreakdown: [createBreakdownRow({ quantity: current.rejectionQty || "1" })],
      }));
    }
  }, [form.rejectionBreakdown.length, form.rejectionQty]);

  const values = {
    plannedRuntimeHours: Number(form.plannedRuntimeHours || 0),
    actualRuntimeHours: Number(form.actualRuntimeHours || 0),
    targetQty: Number(form.targetQty || 0),
    actualQty: Number(form.actualQty || 0),
    rejectionQty: Number(form.rejectionQty || 0),
  };

  const downtimeHours = Math.max(0, values.plannedRuntimeHours - values.actualRuntimeHours);
  const goodQty = Math.max(0, values.actualQty - values.rejectionQty);
  const availability =
    values.plannedRuntimeHours > 0
      ? values.actualRuntimeHours / values.plannedRuntimeHours
      : 0;
  const performance = values.targetQty > 0 ? values.actualQty / values.targetQty : 0;
  const quality = values.actualQty > 0 ? goodQty / values.actualQty : 0;
  const oee = availability * performance * quality * 100;

  const rejectionBreakdownTotal = form.rejectionBreakdown.reduce(
    (sum, row) => sum + Number(row.quantity || 0),
    0,
  );

  const rejectionTotalMatches = values.rejectionQty === rejectionBreakdownTotal;
  const resolvedBreakdown = form.rejectionBreakdown.map((row, index) => ({
    ...row,
    resolvedReason:
      row.reasonId === OTHER_REJECTION_REASON_VALUE
        ? row.customReason.trim()
        : rejectionReasonOptions.find((option) => option.id === row.reasonId)?.label || "",
    sortOrder: index + 1,
  }));

  const breakdownErrors = resolvedBreakdown
    .map((row, index) => {
      if (!row.reasonId) {
        return `Row ${index + 1}: select a rejection reason.`;
      }

      if (row.reasonId === OTHER_REJECTION_REASON_VALUE && !row.customReason.trim()) {
        return `Row ${index + 1}: enter the custom rejection reason.`;
      }

      if (!Number(row.quantity || 0)) {
        return `Row ${index + 1}: enter a rejection quantity.`;
      }

      return null;
    })
    .filter(Boolean);

  const errors = [];
  if (values.plannedRuntimeHours > 0 && values.actualRuntimeHours > values.plannedRuntimeHours) {
    errors.push("Actual runtime cannot exceed planned runtime.");
  }
  if (values.rejectionQty > values.actualQty) {
    errors.push("Rejected quantity cannot exceed actual quantity.");
  }
  if (downtimeHours > 0 && !form.downtimeReasonId) {
    errors.push("Select a downtime reason when downtime exists.");
  }
  if (values.rejectionQty > 0 && form.rejectionBreakdown.length === 0) {
    errors.push("Add at least one rejection breakdown row.");
  }
  errors.push(...breakdownErrors);
  if (values.rejectionQty > 0 && !rejectionTotalMatches) {
    errors.push("Rejected quantity must match the rejection breakdown total.");
  }

  const canSubmit =
    Boolean(
      form.productionDate &&
        form.shift &&
        form.supervisorId &&
        form.machineId &&
        form.partId &&
        form.operatorId &&
        form.plannedRuntimeHours &&
        form.actualRuntimeHours &&
        form.targetQty &&
        form.actualQty,
    ) && errors.length === 0;
  const hasUnsavedDraft = useMemo(
    () => isEntryDraftDirty(form, baselineDraft),
    [baselineDraft, form],
  );

  useEffect(() => {
    if (!draftKey) {
      return;
    }

    if (!hasUnsavedDraft) {
      clearEntryDraft(draftKey);
      return;
    }

    saveEntryDraft(draftKey, form);
  }, [draftKey, form, hasUnsavedDraft]);

  useEffect(() => {
    if (!hasUnsavedDraft) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedDraft]);

  const setField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleRepeat = () => {
    if (!lastEntry || editingEntry) {
      return;
    }

    const machineExists = (masters.machines || []).some((item) => item.id === lastEntry.machine_id);
    const partExists = (masters.parts || []).some((item) => item.id === lastEntry.part_id);
    const operatorExists = (masters.operators || []).some((item) => item.id === lastEntry.operator_id);
    const hasMissingMaster = !machineExists || !partExists || !operatorExists;

    setForm((current) => ({
      ...current,
      machineId: machineExists ? lastEntry.machine_id || "" : current.machineId,
      partId: partExists ? lastEntry.part_id || "" : current.partId,
      operatorId: operatorExists ? lastEntry.operator_id || "" : current.operatorId,
      plannedRuntimeHours: toInputValue(lastEntry.planned_runtime_hours),
      actualRuntimeHours: "",
      downtimeReasonId: "",
      targetQty: toInputValue(lastEntry.target_qty),
      actualQty: "",
      rejectionQty: "0",
      remarks: "",
      rejectionBreakdown: [],
    }));

    setSaved(null);
    setRepeatFeedback(true);
    if (repeatFeedbackTimeoutRef.current) {
      window.clearTimeout(repeatFeedbackTimeoutRef.current);
    }
    repeatFeedbackTimeoutRef.current = window.setTimeout(() => {
      setRepeatFeedback(false);
    }, 320);

    if (hasMissingMaster) {
      showToast(
        "Repeated last entry. Some items from your last entry are no longer available.",
        "info",
      );
      return;
    }

    showToast("Fields pre-filled from your last entry.");
  };

  const updateBreakdownRow = (rowId, key, value) => {
    setForm((current) => ({
      ...current,
      rejectionBreakdown: current.rejectionBreakdown.map((row) => {
        if (row.id !== rowId) return row;

        if (key === "reasonId") {
          return {
            ...row,
            reasonId: value,
            customReason:
              value === OTHER_REJECTION_REASON_VALUE ? row.customReason : "",
          };
        }

        return {
          ...row,
          [key]: value,
        };
      }),
    }));
  };

  const addBreakdownRow = () => {
    setForm((current) => ({
      ...current,
      rejectionBreakdown: [
        ...current.rejectionBreakdown,
        createBreakdownRow({ quantity: "" }),
      ],
    }));
  };

  const removeBreakdownRow = (rowId) => {
    setForm((current) => ({
      ...current,
      rejectionBreakdown: current.rejectionBreakdown.filter((row) => row.id !== rowId),
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const response = await saveProductionEntry(
        {
          id: editingEntry?.id || null,
          production_date: form.productionDate,
          shift: form.shift,
          supervisor_id: form.supervisorId,
          machine_id: form.machineId,
          part_id: form.partId,
          operator_id: form.operatorId,
          planned_runtime_hours: values.plannedRuntimeHours,
          actual_runtime_hours: values.actualRuntimeHours,
          downtime_reason_id: downtimeHours > 0 ? form.downtimeReasonId : null,
          target_qty: values.targetQty,
          actual_qty: values.actualQty,
          rejection_qty: values.rejectionQty,
          remarks: form.remarks.trim() || null,
          created_by: user.id,
        },
        resolvedBreakdown
          .filter((row) => row.resolvedReason && Number(row.quantity || 0) > 0)
          .map((row) => ({
            rejection_reason: row.resolvedReason,
            quantity: Number(row.quantity || 0),
            notes: row.notes.trim() || null,
            sort_order: row.sortOrder,
          })),
      );

      setSaved({
        oee: response.oee,
        goodQty: response.good_qty,
        machine: getLabel(masters.machines, form.machineId),
        part: getLabel(masters.parts, form.partId),
      });
      clearEntryDraft(draftKey);
      await fetchLastEntry();

      if (editingEntry) {
        showToast("Entry updated.");
        onSaved?.();
      } else {
        setForm(buildEntryDraft({ editingEntry: null, rejectionReasonOptions, user }));
        showToast("Entry saved to Supabase.");
      }
    } catch (error) {
      showToast(error.message || "Failed to save entry.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isBreakdownVisible = values.rejectionQty > 0;
  const allocationTone = !isBreakdownVisible
    ? "#60708a"
    : rejectionTotalMatches
      ? "#198754"
      : "#c94b4b";

  return (
    <>
<<<<<<< HEAD
      <div style={{
        ...S.heroPanel,
        padding: "12px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          Production entry
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ color: "#5a7090", fontSize: 11, fontWeight: 600 }}>
              A {formatPercent(availability * 100)}
            </span>
            <span style={{ color: "#4a6080", padding: "0 2px" }}>·</span>
            <span style={{ color: "#5a7090", fontSize: 11, fontWeight: 600 }}>
              P {formatPercent(performance * 100)}
            </span>
            <span style={{ color: "#4a6080", padding: "0 2px" }}>·</span>
            <span style={{ color: "#5a7090", fontSize: 11, fontWeight: 600 }}>
              Q {formatPercent(quality * 100)}
            </span>
          </div>
          <div style={{
            width: 1,
            height: 28,
            background: "rgba(255,255,255,0.12)",
          }} />
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 9,
              color: "#5a7090",
              letterSpacing: "0.04em",
              fontWeight: 600,
            }}>
              OEE
            </div>
            <div style={{
              fontSize: 16,
              color: "#fff",
              fontWeight: 700,
              marginTop: 2,
            }}>
              {formatPercent(oee)}
            </div>
=======
      <div
        style={{
          ...S.heroPanel,
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {editingEntry ? "Edit production entry" : "Production entry"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={miniMetricStyle}>A {formatPercent(availability * 100)}</span>
            <span style={miniMetricDivider}>|</span>
            <span style={miniMetricStyle}>P {formatPercent(performance * 100)}</span>
            <span style={miniMetricDivider}>|</span>
            <span style={miniMetricStyle}>Q {formatPercent(quality * 100)}</span>
          </div>
          <div style={heroDividerStyle} />
          <div style={{ textAlign: "center" }}>
            <div style={oeeLabelStyle}>OEE</div>
            <div style={oeeValueStyle}>{formatPercent(oee)}</div>
>>>>>>> 6b061e1 (Latest production app updates)
          </div>
        </div>
      </div>

      {saved && !editingEntry && (
        <div style={S.sectionCard}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Latest entry saved</div>
          <div style={{ marginTop: 10, color: "#60708a", lineHeight: 1.6 }}>
            {saved.machine} - {saved.part} - OEE {formatPercent(saved.oee)} - Good output{" "}
            {formatNumber(saved.goodQty)}
          </div>
        </div>
      )}

      <div data-focus-scope="entry-form" style={S.sectionCard}>
        <div style={S.sectionHeader}>
          <div>
<<<<<<< HEAD
            <div style={S.sectionTitle}>Production Entry Form</div>
=======
            <div style={S.sectionTitle}>
              {editingEntry ? "Edit Production Entry" : "Production Entry Form"}
            </div>
>>>>>>> 6b061e1 (Latest production app updates)
            <div style={S.subtitle}>
              The database keeps one parent entry for OEE and stores rejection reasons as linked detail rows.
            </div>
          </div>
          {editingEntry && (
            <button
              style={S.ghostBtn}
              onClick={() => {
                clearEntryDraft(draftKey);
                onCancelEdit?.();
              }}
            >
              Cancel Edit
            </button>
          )}
        </div>

        {!editingEntry && lastEntry && (
          <button
            onClick={handleRepeat}
            style={{
              ...S.ghostBtn,
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              padding: "14px 16px",
              fontSize: 14,
              minHeight: 52,
              justifyContent: "flex-start",
              background: repeatFeedback ? "#eef5ff" : "#fff",
              borderColor: repeatFeedback ? "rgba(47,122,217,0.22)" : undefined,
              color: repeatFeedback ? "#17355d" : undefined,
              transition: "background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
              boxShadow: repeatFeedback
                ? "0 10px 22px rgba(47,122,217,0.12)"
                : "0 1px 0 rgba(20,55,96,0.03)",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>
              {repeatFeedback ? "\u2713" : "\u21BB"}
            </span>
            <span style={{ textAlign: "left", lineHeight: 1.5 }}>
              <strong>Repeat:</strong>{" "}
              {lastEntry.machine_name || "Unknown machine"} {"\u00B7"}{" "}
              {lastEntry.part_name || "Unknown part"} {"\u00B7"}{" "}
              {lastEntry.operator_name || "Unknown operator"}
            </span>
          </button>
        )}

        {errors.length > 0 && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 16,
              background: "#fff4e7",
              color: "#9c5f08",
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}

        <div style={S.formGrid}>
          <InputField
            label="Production Date"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            type="date"
            value={form.productionDate}
            onChange={(value) => setField("productionDate", value)}
          />
          <SelectField
            advanceOnChange
            label="Shift"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={SHIFT_OPTIONS}
            value={form.shift}
            onChange={(value) => setField("shift", value)}
          />
          <SearchSelect
<<<<<<< HEAD
            autoComplete="off"
            disabled={user.role === "supervisor"}
            label="Supervisor"
            
=======
            advanceOnSelect
            autoComplete="off"
            disabled={user.role === "supervisor"}
            label="Supervisor"
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={supervisorOptions}
            placeholder="Select supervisor"
            required
            value={form.supervisorId}
            onChange={(value) => setField("supervisorId", value)}
          />
          <SearchSelect
<<<<<<< HEAD
            autoComplete="off"
            label="Machine"
            
=======
            advanceOnSelect
            autoComplete="off"
            label="Machine"
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={masters.machines}
            placeholder="Select machine"
            required
            value={form.machineId}
            onChange={(value) => setField("machineId", value)}
          />
          <SearchSelect
<<<<<<< HEAD
            autoComplete="off"
            label="Part / Item"
            
=======
            advanceOnSelect
            autoComplete="off"
            label="Part / Item"
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={masters.parts}
            placeholder="Select part"
            required
            value={form.partId}
            onChange={(value) => setField("partId", value)}
          />
          <SearchSelect
<<<<<<< HEAD
            autoComplete="off"
            label="Operator"
            
=======
            advanceOnSelect
            autoComplete="off"
            label="Operator"
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={masters.operators}
            placeholder="Select operator"
            required
            value={form.operatorId}
            onChange={(value) => setField("operatorId", value)}
          />
          <InputField
            label="Planned Runtime (hrs)"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            step="0.1"
            type="number"
            value={form.plannedRuntimeHours}
            onChange={(value) => setField("plannedRuntimeHours", value)}
          />
          <InputField
            label="Actual Runtime (hrs)"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            step="0.1"
            type="number"
            value={form.actualRuntimeHours}
            onChange={(value) => setField("actualRuntimeHours", value)}
          />
          <ReadOnlyField
            label="Auto Downtime"
            value={`${formatNumber(downtimeHours, 1)} hours`}
          />
          <SearchSelect
<<<<<<< HEAD
            autoComplete="off"
            disabled={downtimeHours <= 0}
            label="Downtime Reason"
            
=======
            advanceOnSelect
            autoComplete="off"
            disabled={downtimeHours <= 0}
            label="Downtime Reason"
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            options={masters.downtimeReasons}
            placeholder="Select downtime reason"
            value={form.downtimeReasonId}
            onChange={(value) => setField("downtimeReasonId", value)}
          />
          <InputField
            label="Target Qty"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            type="number"
            value={form.targetQty}
            onChange={(value) => setField("targetQty", value)}
          />
          <InputField
            label="Actual Qty"
<<<<<<< HEAD
            
=======
            onKeyDown={advanceOnEnter}
>>>>>>> 6b061e1 (Latest production app updates)
            type="number"
            value={form.actualQty}
            onChange={(value) => setField("actualQty", value)}
          />
          <InputField
            label="Rejected Qty"
<<<<<<< HEAD
            
            type="number"
            value={form.rejectionQty}
            onChange={(value) => setField("rejectionQty", value)}
          />
          <SearchSelect
            autoComplete="off"
            disabled={values.rejectionQty <= 0}
            label="Rejection Reason"
            
            options={masters.rejectionReasons}
            placeholder="Select rejection reason"
            value={form.rejectionReasonId}
            onChange={(value) => setField("rejectionReasonId", value)}
=======
            onKeyDown={advanceOnEnter}
            type="number"
            value={form.rejectionQty}
            onChange={(value) => setField("rejectionQty", value.replace(/[^\d]/g, ""))}
>>>>>>> 6b061e1 (Latest production app updates)
          />
        </div>

        {isBreakdownVisible && (
          <div style={breakdownShellStyle}>
            <div style={S.sectionHeader}>
              <div>
                <div style={S.sectionTitle}>Rejection Breakdown</div>
                <div style={S.subtitle}>
                  Split the rejected quantity across one or more reasons without splitting the production run.
                </div>
              </div>
              <div
                style={{
                  ...S.badge,
                  background: `${allocationTone}18`,
                  color: allocationTone,
                }}
              >
                {formatNumber(rejectionBreakdownTotal)} of {formatNumber(values.rejectionQty)} allocated
              </div>
            </div>

            {!rejectionTotalMatches && form.rejectionBreakdown.length > 0 && (
              <div style={breakdownWarningStyle}>
                Rejected quantity was changed. Adjust the breakdown so the total matches exactly before saving.
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              {form.rejectionBreakdown.map((row, index) => (
                <div key={row.id} style={breakdownRowStyle}>
                  <div style={breakdownRowHeaderStyle}>
                    <strong style={{ fontSize: 14 }}>Reason {index + 1}</strong>
                    {form.rejectionBreakdown.length > 1 && (
                      <button
                        style={S.dangerBtn}
                        onClick={() => removeBreakdownRow(row.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={S.formGrid}>
                    <SearchSelect
                      advanceOnSelect
                      autoComplete="off"
                      label="Rejection Reason"
                      onKeyDown={advanceOnEnter}
                      options={rejectionReasonOptions}
                      placeholder="Select reason"
                      required
                      value={row.reasonId}
                      onChange={(value) => updateBreakdownRow(row.id, "reasonId", value)}
                    />
                    <InputField
                      label="Qty"
                      onKeyDown={advanceOnEnter}
                      type="number"
                      value={row.quantity}
                      onChange={(value) =>
                        updateBreakdownRow(row.id, "quantity", value.replace(/[^\d]/g, ""))
                      }
                    />
                    <InputField
                      label="Notes"
                      onKeyDown={advanceOnEnter}
                      placeholder="Optional detail"
                      value={row.notes}
                      onChange={(value) => updateBreakdownRow(row.id, "notes", value)}
                    />
                    {row.reasonId === OTHER_REJECTION_REASON_VALUE && (
                      <InputField
                        label="Custom Reason"
                        onKeyDown={advanceOnEnter}
                        placeholder="Enter custom rejection reason"
                        value={row.customReason}
                        onChange={(value) => updateBreakdownRow(row.id, "customReason", value)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <button style={S.ghostBtn} onClick={addBreakdownRow}>
                + Add Rejection Reason
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={S.label}>Remarks</label>
          <textarea
            style={S.textarea}
            value={form.remarks}
            onChange={(event) => setField("remarks", event.target.value)}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <div style={{ color: "#60708a", lineHeight: 1.7 }}>
            {hasUnsavedDraft
              ? "Draft saved locally. You can switch tabs and return without losing this form."
              : "Parent entry stays single for OEE. Rejection reasons are saved as linked child rows."}
          </div>
          <button
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
            style={{ ...S.primaryBtn, opacity: !canSubmit || submitting ? 0.72 : 1 }}
          >
            {submitting ? "Saving..." : editingEntry ? "Update Entry" : "Submit Entry"}
          </button>
        </div>
      </div>
    </>
  );
}

function buildEntryDraft({ editingEntry, rejectionReasonOptions, user }) {
  if (!editingEntry) {
    return {
      id: "",
      productionDate: getTodayISO(),
      shift: getAutoShift(),
      supervisorId: user.role === "supervisor" || user.role === "admin" ? user.id : "",
      machineId: "",
      partId: "",
      operatorId: "",
      plannedRuntimeHours: "",
      actualRuntimeHours: "",
      downtimeReasonId: "",
      targetQty: "",
      actualQty: "",
      rejectionQty: "0",
      remarks: "",
      rejectionBreakdown: [],
    };
  }

  const fallbackReason = editingEntry.rejection_reason_name
    ? [
        {
          rejectionReason: editingEntry.rejection_reason_name,
          quantity: editingEntry.rejection_qty,
          notes: "",
          sortOrder: 1,
        },
      ]
    : [];

  const sourceRows =
    Array.isArray(editingEntry.rejection_breakdown) && editingEntry.rejection_breakdown.length > 0
      ? editingEntry.rejection_breakdown
      : fallbackReason;

  return {
    id: editingEntry.id,
    productionDate: editingEntry.production_date || getTodayISO(),
    shift: editingEntry.shift || getAutoShift(),
    supervisorId: editingEntry.supervisor_id || user.id,
    machineId: editingEntry.machine_id || "",
    partId: editingEntry.part_id || "",
    operatorId: editingEntry.operator_id || "",
    plannedRuntimeHours: toInputValue(editingEntry.planned_runtime_hours),
    actualRuntimeHours: toInputValue(editingEntry.actual_runtime_hours),
    downtimeReasonId: editingEntry.downtime_reason_id || "",
    targetQty: toInputValue(editingEntry.target_qty),
    actualQty: toInputValue(editingEntry.actual_qty),
    rejectionQty: toInputValue(editingEntry.rejection_qty || 0),
    remarks: editingEntry.remarks || "",
    rejectionBreakdown: sourceRows.map((row, index) =>
      mapBreakdownRowForEdit(row, index, rejectionReasonOptions),
    ),
  };
}

function getEntryDraftStorageKey(userId, entryId) {
  if (!userId) {
    return "";
  }

  return entryId
    ? `sp-entry-draft:${userId}:edit:${entryId}`
    : `sp-entry-draft:${userId}:new`;
}

function restoreEntryDraft({ draftKey, fallback }) {
  if (!draftKey || typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.form) {
      return fallback;
    }

    return mergeDraftWithFallback(parsed.form, fallback);
  } catch (_error) {
    return fallback;
  }
}

function mergeDraftWithFallback(draft, fallback) {
  return {
    ...fallback,
    ...draft,
    rejectionBreakdown: Array.isArray(draft.rejectionBreakdown)
      ? draft.rejectionBreakdown.map((row) => createBreakdownRow(row))
      : fallback.rejectionBreakdown,
  };
}

function saveEntryDraft(draftKey, form) {
  if (!draftKey || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        form,
      }),
    );
  } catch (_error) {
    // Ignore local draft persistence failures and keep the form usable.
  }
}

function clearEntryDraft(draftKey) {
  if (!draftKey || typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(draftKey);
}

function isEntryDraftDirty(form, baselineDraft) {
  return JSON.stringify(normalizeDraftForCompare(form)) !== JSON.stringify(normalizeDraftForCompare(baselineDraft));
}

function normalizeDraftForCompare(form) {
  return {
    id: form.id || "",
    productionDate: form.productionDate || "",
    shift: form.shift || "",
    supervisorId: form.supervisorId || "",
    machineId: form.machineId || "",
    partId: form.partId || "",
    operatorId: form.operatorId || "",
    plannedRuntimeHours: String(form.plannedRuntimeHours || ""),
    actualRuntimeHours: String(form.actualRuntimeHours || ""),
    downtimeReasonId: form.downtimeReasonId || "",
    targetQty: String(form.targetQty || ""),
    actualQty: String(form.actualQty || ""),
    rejectionQty: String(form.rejectionQty || ""),
    remarks: form.remarks || "",
    rejectionBreakdown: (form.rejectionBreakdown || []).map((row) => ({
      reasonId: row.reasonId || "",
      customReason: row.customReason || "",
      quantity: String(row.quantity || ""),
      notes: row.notes || "",
    })),
  };
}

function mapBreakdownRowForEdit(row, index, rejectionReasonOptions) {
  const reasonText = row.rejectionReason || row.rejection_reason || "";
  const matched = rejectionReasonOptions.find(
    (option) =>
      option.id !== OTHER_REJECTION_REASON_VALUE &&
      option.label.toLowerCase() === reasonText.toLowerCase(),
  );

  return createBreakdownRow({
    id: row.id || `existing-${index + 1}`,
    reasonId: matched ? matched.id : OTHER_REJECTION_REASON_VALUE,
    customReason: matched ? "" : reasonText,
    quantity: toInputValue(row.quantity || 0),
    notes: row.notes || "",
  });
}

function createBreakdownRow(overrides = {}) {
  return {
    id: overrides.id || `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reasonId: overrides.reasonId || "",
    customReason: overrides.customReason || "",
    quantity: overrides.quantity || "",
    notes: overrides.notes || "",
  };
}

function toInputValue(value) {
  if (value == null) return "";
  const text = String(value);
  if (text === "0.00") return "0";
  if (text.endsWith(".0")) return text.slice(0, -2);
  return text;
}

const miniMetricStyle = {
  color: "#93b8d8",
  fontSize: 11,
  fontWeight: 600,
};

const miniMetricDivider = {
  color: "#6889a8",
  padding: "0 2px",
};

const heroDividerStyle = {
  width: 1,
  height: 28,
  background: "rgba(255,255,255,0.12)",
};

const oeeLabelStyle = {
  fontSize: 9,
  color: "#93b8d8",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

const oeeValueStyle = {
  fontSize: 16,
  color: "#fff",
  fontWeight: 700,
  marginTop: 2,
};

const breakdownShellStyle = {
  marginTop: 18,
  borderRadius: 18,
  padding: 16,
  border: "1px solid rgba(20,55,96,0.08)",
  background: "#f8fbff",
};

const breakdownWarningStyle = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#fff1e8",
  color: "#b75e1c",
  fontWeight: 700,
  lineHeight: 1.5,
};

const breakdownRowStyle = {
  borderRadius: 16,
  border: "1px solid rgba(20,55,96,0.08)",
  background: "#fff",
  padding: 14,
};

const breakdownRowHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};
