import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_EXPORT_OPTIONS,
  MASTER_TABLES,
  REPORT_KIND_OPTIONS,
  ROLE_CONFIG,
  addMasterRecord,
  deleteMasterRecord,
  downloadCsv,
  formatDateTime,
  listEmployees,
  listProductionEntriesForAdminExport,
  listReportRecipients,
  listReportRuns,
  manageEmployee,
  triggerReport,
  upsertReportRecipient,
} from "../api";
import { S } from "../styles";
import { getShiftLabel, roleBadgeStyle } from "../utils";
import {
  InputField,
  Loader,
  SearchSelect,
  SelectField,
  TogglePill,
} from "../ui";

export function AdminScreen({ masters, refreshMasters, showToast }) {
  const [tab, setTab] = useState("masters");
  const [masterKey, setMasterKey] = useState("machines");
  const [exportKey, setExportKey] = useState("employees");
  const [newMasterItem, setNewMasterItem] = useState("");
  const [exportFilters, setExportFilters] = useState({
    startDate: "",
    endDate: "",
    machineId: "",
    supervisorId: "",
    partId: "",
  });
  const [employeeForm, setEmployeeForm] = useState({
    employeeId: "",
    fullName: "",
    role: "supervisor",
    pin: "1234",
  });
  const [recipientForm, setRecipientForm] = useState({
    full_name: "",
    email: "",
    active: true,
    receives_daily: true,
    receives_monthly: true,
  });
  const [pinDrafts, setPinDrafts] = useState({});
  const [employees, setEmployees] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [reportRuns, setReportRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reloadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeRows, recipientRows, reportRunRows] = await Promise.all([
        listEmployees(),
        listReportRecipients(),
        listReportRuns(),
      ]);
      setEmployees(employeeRows);
      setRecipients(recipientRows);
      setReportRuns(reportRunRows);
    } catch (error) {
      showToast(error.message || "Unable to load admin data.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    reloadAdminData();
  }, [reloadAdminData]);

  const createEmployeeRecord = async () => {
    setSaving(true);
    try {
      await manageEmployee({
        action: "create_employee",
        employeeId: employeeForm.employeeId,
        fullName: employeeForm.fullName,
        role: employeeForm.role,
        pin: employeeForm.pin,
      });
      setEmployeeForm({
        employeeId: "",
        fullName: "",
        role: "supervisor",
        pin: "1234",
      });
      showToast("Employee created with Supabase Auth.");
      await Promise.all([reloadAdminData(), refreshMasters()]);
    } catch (error) {
      showToast(error.message || "Unable to create employee.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployeeStatus = async (employee) => {
    const nextActive = !employee.active;
    const draftPin = pinDrafts[employee.employee_id] || "1234";

    setSaving(true);
    try {
      await manageEmployee({
        action: "set_active",
        employeeId: employee.employee_id,
        active: nextActive,
        pin: draftPin,
      });
      showToast(nextActive ? "Employee reactivated." : "Employee deactivated.");
      await Promise.all([reloadAdminData(), refreshMasters()]);
    } catch (error) {
      showToast(error.message || "Unable to change employee status.", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetEmployeePin = async (employee) => {
    const pin = pinDrafts[employee.employee_id] || "1234";
    setSaving(true);
    try {
      await manageEmployee({
        action: "reset_pin",
        employeeId: employee.employee_id,
        pin,
      });
      showToast(`PIN reset for ${employee.employee_id}.`);
      await reloadAdminData();
    } catch (error) {
      showToast(error.message || "Unable to reset PIN.", "error");
    } finally {
      setSaving(false);
    }
  };

  const addMasterItemHandler = async () => {
    if (!newMasterItem.trim()) return;

    setSaving(true);
    try {
      await addMasterRecord(MASTER_TABLES[masterKey].table, newMasterItem);
      setNewMasterItem("");
      showToast(`${MASTER_TABLES[masterKey].label} updated.`);
      await refreshMasters();
    } catch (error) {
      showToast(error.message || "Unable to add master record.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteMasterItemHandler = async (itemId) => {
    setSaving(true);
    try {
      await deleteMasterRecord(MASTER_TABLES[masterKey].table, itemId);
      showToast(`${MASTER_TABLES[masterKey].label} updated.`);
      await refreshMasters();
    } catch (error) {
      showToast(error.message || "Unable to delete master record.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveRecipient = async () => {
    setSaving(true);
    try {
      await upsertReportRecipient(recipientForm);
      setRecipientForm({
        full_name: "",
        email: "",
        active: true,
        receives_daily: true,
        receives_monthly: true,
      });
      showToast("Recipient saved.");
      await reloadAdminData();
    } catch (error) {
      showToast(error.message || "Unable to save recipient.", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateRecipient = async (recipient, patch) => {
    setSaving(true);
    try {
      await upsertReportRecipient({ ...recipient, ...patch });
      showToast("Recipient updated.");
      await reloadAdminData();
    } catch (error) {
      showToast(error.message || "Unable to update recipient.", "error");
    } finally {
      setSaving(false);
    }
  };

  const triggerReportHandler = async (kind) => {
    setSaving(true);
    try {
      await triggerReport(kind, true);
      showToast(`${kind} report trigger sent.`);
      await reloadAdminData();
    } catch (error) {
      showToast(error.message || "Unable to trigger report.", "error");
    } finally {
      setSaving(false);
    }
  };

  const exportDataset = async () => {
    setSaving(true);
    try {
      const dateSuffix = new Date().toISOString().slice(0, 10);

      if (exportKey === "employees") {
        const rows = await listEmployees();
        downloadCsv(`employees-${dateSuffix}.csv`, rows, [
          { label: "Employee ID", value: (row) => row.employee_id },
          { label: "Full Name", value: (row) => row.full_name },
          { label: "Role", value: (row) => row.role },
          { label: "Active", value: (row) => (row.active ? "Yes" : "No") },
          {
            label: "PIN Last Reset",
            value: (row) => formatDateTime(row.pin_last_reset_at),
          },
          { label: "Created At", value: (row) => formatDateTime(row.created_at) },
        ]);
      } else {
        const rows = await listProductionEntriesForAdminExport(exportFilters);
        downloadCsv(`production-entries-${dateSuffix}.csv`, rows, [
          { label: "Production Date", value: (row) => row.production_date },
          { label: "Shift", value: (row) => getShiftLabel(row.shift) },
          { label: "Supervisor", value: (row) => row.supervisor_name },
          { label: "Machine", value: (row) => row.machine_name },
          { label: "Part", value: (row) => row.part_name },
          { label: "Operator", value: (row) => row.operator_name },
          {
            label: "Planned Runtime Hours",
            value: (row) => row.planned_runtime_hours,
          },
          {
            label: "Actual Runtime Hours",
            value: (row) => row.actual_runtime_hours,
          },
          { label: "Downtime Hours", value: (row) => row.downtime_hours },
          {
            label: "Downtime Reason",
            value: (row) => row.downtime_reason_name || "",
          },
          { label: "Target Qty", value: (row) => row.target_qty },
          { label: "Actual Qty", value: (row) => row.actual_qty },
          { label: "Rejected Qty", value: (row) => row.rejection_qty },
          {
            label: "Rejection Reason",
            value: (row) => row.rejection_reason_name || "",
          },
          {
            label: "Rejection Breakdown",
            value: (row) => formatRejectionBreakdown(row.rejection_breakdown),
          },
          { label: "Good Qty", value: (row) => row.good_qty },
          { label: "Availability", value: (row) => row.availability },
          { label: "Performance", value: (row) => row.performance },
          { label: "Quality", value: (row) => row.quality },
          { label: "OEE", value: (row) => row.oee },
          { label: "Remarks", value: (row) => row.remarks || "" },
          { label: "Created At", value: (row) => formatDateTime(row.created_at) },
        ]);
      }

      showToast("CSV download started.");
    } catch (error) {
      showToast(error.message || "Unable to export CSV.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>Administration</div>
          <div style={S.subtitle}>
            Manage users, master lists, exports, report recipients, and report runs
            from the live database.
          </div>
        </div>
        {saving && <span style={{ color: "#60708a", fontWeight: 700 }}>Saving...</span>}
      </div>

      <div style={S.pillRow}>
        {[
          ["masters", "Master Lists"],
          ["employees", "Employees"],
          ["exports", "Exports"],
          ["recipients", "Report Recipients"],
          ["reports", "Report Runs"],
        ].map(([value, label]) => (
          <button
            key={value}
            style={{ ...S.pillBtn, ...(tab === value ? S.pillActive : {}) }}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader text="Loading admin data..." />
      ) : (
        <>
          {tab === "masters" && (
            <div style={{ marginTop: 16 }}>
              <div style={S.pillRow}>
                {Object.entries(MASTER_TABLES).map(([key, config]) => (
                  <button
                    key={key}
                    style={{
                      ...S.pillBtn,
                      ...(masterKey === key ? S.pillActive : {}),
                    }}
                    onClick={() => setMasterKey(key)}
                  >
                    {config.label}
                  </button>
                ))}
              </div>

              <div style={{ ...S.formGrid, marginTop: 16 }}>
                <InputField
                  label={`New ${MASTER_TABLES[masterKey].label.slice(0, -1)}`}
                  value={newMasterItem}
                  onChange={setNewMasterItem}
                />
                <div style={{ display: "flex", alignItems: "end" }}>
                  <button style={S.primaryBtn} onClick={addMasterItemHandler}>
                    Add Item
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "#60708a",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Admin users can add or remove master records. Supervisors use the
                separate Quick Add tab for add-only item and operator updates.
              </div>

              <div style={{ ...S.listCard, marginTop: 16 }}>
                {(masters[masterKey] || []).map((item) => (
                  <div key={item.id} style={S.listItem}>
                    <span style={{ fontWeight: 700 }}>{item.label}</span>
                    <button
                      style={S.dangerBtn}
                      onClick={() => deleteMasterItemHandler(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "employees" && (
            <div style={{ marginTop: 16 }}>
              <div style={S.formGrid}>
                <InputField
                  label="Employee ID"
                  value={employeeForm.employeeId}
                  onChange={(value) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      employeeId: value.toUpperCase(),
                    }))
                  }
                />
                <InputField
                  label="Full Name"
                  value={employeeForm.fullName}
                  onChange={(value) =>
                    setEmployeeForm((current) => ({ ...current, fullName: value }))
                  }
                />
                <SelectField
                  label="Role"
                  options={[
                    { value: "supervisor", label: "Supervisor" },
                    { value: "manager", label: "Manager" },
                    { value: "admin", label: "Admin" },
                  ]}
                  value={employeeForm.role}
                  onChange={(value) =>
                    setEmployeeForm((current) => ({ ...current, role: value }))
                  }
                />
                <InputField
                  label="PIN"
                  value={employeeForm.pin}
                  onChange={(value) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      pin: value.replace(/\D/g, "").slice(0, 4),
                    }))
                  }
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <button style={S.primaryBtn} onClick={createEmployeeRecord}>
                  Create Employee
                </button>
              </div>

              <div style={{ ...S.listCard, marginTop: 18 }}>
                {employees.map((employee) => (
                  <div key={employee.id} style={S.listItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <strong>{employee.full_name}</strong>
                        <span
                          style={{
                            ...S.badge,
                            color: employee.active ? "#198754" : "#b23a3a",
                            background: employee.active ? "#19875418" : "#b23a3a18",
                          }}
                        >
                          {employee.active ? "Active" : "Inactive"}
                        </span>
                        <span
                          style={{
                            ...S.badge,
                            ...roleBadgeStyle(employee.role),
                          }}
                        >
                          {ROLE_CONFIG[employee.role].label}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "#60708a", lineHeight: 1.6 }}>
                        {employee.employee_id} - PIN reset{" "}
                        {employee.pin_last_reset_at || "not recorded"}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <input
                          placeholder="New PIN"
                          style={{ ...S.input, width: 140 }}
                          value={pinDrafts[employee.employee_id] || ""}
                          onChange={(event) =>
                            setPinDrafts((current) => ({
                              ...current,
                              [employee.employee_id]: event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 4),
                            }))
                          }
                        />
                        <button style={S.ghostBtn} onClick={() => resetEmployeePin(employee)}>
                          Reset PIN
                        </button>
                        <button style={S.dangerBtn} onClick={() => toggleEmployeeStatus(employee)}>
                          {employee.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "exports" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...S.formGrid, alignItems: "end" }}>
                <SelectField
                  label="Dataset"
                  options={ADMIN_EXPORT_OPTIONS}
                  value={exportKey}
                  onChange={setExportKey}
                />
                <div style={{ display: "flex", alignItems: "end" }}>
                  <button style={S.primaryBtn} onClick={exportDataset}>
                    Download CSV
                  </button>
                </div>
              </div>

              {exportKey === "production" && (
                <>
                  <div style={{ ...S.formGrid, marginTop: 16 }}>
                    <InputField
                      label="Start Date"
                      type="date"
                      value={exportFilters.startDate}
                      onChange={(value) =>
                        setExportFilters((current) => ({ ...current, startDate: value }))
                      }
                    />
                    <InputField
                      label="End Date"
                      type="date"
                      value={exportFilters.endDate}
                      onChange={(value) =>
                        setExportFilters((current) => ({ ...current, endDate: value }))
                      }
                    />
                    <SearchSelect
                      allowClear
                      label="Machine"
                      options={masters.machines}
                      placeholder="All machines"
                      value={exportFilters.machineId}
                      onChange={(value) =>
                        setExportFilters((current) => ({ ...current, machineId: value }))
                      }
                    />
                    <SearchSelect
                      allowClear
                      label="Supervisor"
                      options={masters.supervisors}
                      placeholder="All supervisors"
                      value={exportFilters.supervisorId}
                      onChange={(value) =>
                        setExportFilters((current) => ({ ...current, supervisorId: value }))
                      }
                    />
                    <SearchSelect
                      allowClear
                      label="Part"
                      options={masters.parts}
                      placeholder="All parts"
                      value={exportFilters.partId}
                      onChange={(value) =>
                        setExportFilters((current) => ({ ...current, partId: value }))
                      }
                    />
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      style={S.ghostBtn}
                      onClick={() =>
                        setExportFilters({
                          startDate: "",
                          endDate: "",
                          machineId: "",
                          supervisorId: "",
                          partId: "",
                        })
                      }
                    >
                      Clear Parameters
                    </button>
                  </div>
                </>
              )}

              <div
                style={{
                  marginTop: 12,
                  color: "#60708a",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Choose a dataset, then optionally filter production exports by date,
                machine, supervisor, or part. Leave parameters blank to download all rows.
              </div>
            </div>
          )}

          {tab === "recipients" && (
            <div style={{ marginTop: 16 }}>
              <div style={S.formGrid}>
                <InputField
                  label="Recipient Name"
                  value={recipientForm.full_name}
                  onChange={(value) =>
                    setRecipientForm((current) => ({ ...current, full_name: value }))
                  }
                />
                <InputField
                  label="Recipient Email"
                  value={recipientForm.email}
                  onChange={(value) =>
                    setRecipientForm((current) => ({ ...current, email: value }))
                  }
                />
              </div>

              <div style={{ ...S.pillRow, marginTop: 12 }}>
                <TogglePill
                  active={recipientForm.receives_daily}
                  label="Daily"
                  onClick={() =>
                    setRecipientForm((current) => ({
                      ...current,
                      receives_daily: !current.receives_daily,
                    }))
                  }
                />
                <TogglePill
                  active={recipientForm.receives_monthly}
                  label="Monthly"
                  onClick={() =>
                    setRecipientForm((current) => ({
                      ...current,
                      receives_monthly: !current.receives_monthly,
                    }))
                  }
                />
                <TogglePill
                  active={recipientForm.active}
                  label="Active"
                  onClick={() =>
                    setRecipientForm((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <button style={S.primaryBtn} onClick={saveRecipient}>
                  Save Recipient
                </button>
              </div>

              <div style={{ ...S.listCard, marginTop: 18 }}>
                {recipients.map((recipient) => (
                  <div key={recipient.id} style={S.listItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{recipient.full_name || recipient.email}</div>
                      <div style={{ marginTop: 6, color: "#60708a" }}>{recipient.email}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "end" }}>
                      <TogglePill
                        active={recipient.receives_daily}
                        label="Daily"
                        onClick={() =>
                          updateRecipient(recipient, {
                            receives_daily: !recipient.receives_daily,
                          })
                        }
                      />
                      <TogglePill
                        active={recipient.receives_monthly}
                        label="Monthly"
                        onClick={() =>
                          updateRecipient(recipient, {
                            receives_monthly: !recipient.receives_monthly,
                          })
                        }
                      />
                      <TogglePill
                        active={recipient.active}
                        label="Active"
                        onClick={() =>
                          updateRecipient(recipient, { active: !recipient.active })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "reports" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {REPORT_KIND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    style={S.primaryBtn}
                    onClick={() => triggerReportHandler(option.value)}
                  >
                    Send {option.label} Report Now
                  </button>
                ))}
              </div>

              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead style={S.tableHead}>
                    <tr>
                      {["Kind", "Period", "Status", "Recipients", "Started", "Details"].map(
                        (header) => (
                          <th key={header} style={S.tableCell}>
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {reportRuns.map((run) => (
                      <tr key={run.id}>
                        <td style={S.tableCell}>{run.report_kind}</td>
                        <td style={S.tableCell}>
                          {run.period_start} - {run.period_end}
                        </td>
                        <td style={S.tableCell}>{run.status}</td>
                        <td style={S.tableCell}>{run.recipient_count || 0}</td>
                        <td style={S.tableCell}>{run.started_at}</td>
                        <td style={S.tableCell}>
                          {run.failure_details || run.trigger_source || "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatRejectionBreakdown(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "";
  }

  return value
    .map((row) => {
      const reason = row.rejectionReason || row.rejection_reason || "Unspecified";
      const quantity = row.quantity ?? 0;
      const notes = row.notes ? ` (${row.notes})` : "";
      return `${reason}: ${quantity}${notes}`;
    })
    .join("; ");
}
