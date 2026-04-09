import { useMemo, useState } from "react";
import { addMasterRecord } from "../api";
import { S } from "../styles";
import { InputField } from "../ui";

const QUICK_ADD_CONFIG = {
  parts: {
    table: "parts",
    label: "Item",
    pluralLabel: "Items",
    description: "Add new production items so the latest SKU is available on the floor.",
  },
  operators: {
    table: "operators",
    label: "Operator",
    pluralLabel: "Operators",
    description: "Add operator names so supervisors can record production without waiting.",
  },
};

export function QuickAddScreen({ masters, refreshMasters, showToast }) {
  const [tab, setTab] = useState("parts");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const config = QUICK_ADD_CONFIG[tab];
  const currentList = useMemo(() => masters[tab] || [], [masters, tab]);

  const handleAdd = async () => {
    if (!draft.trim()) {
      showToast(`Enter a ${config.label.toLowerCase()} name first.`, "error");
      return;
    }

    setSaving(true);
    try {
      await addMasterRecord(config.table, draft);
      setDraft("");
      showToast(`${config.label} added successfully.`);
      await refreshMasters();
    } catch (error) {
      showToast(error.message || `Unable to add ${config.label.toLowerCase()}.`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>Quick Add</div>
          <div style={S.subtitle}>
            Supervisors can add new items and operators. Deletion stays in the admin area.
          </div>
        </div>
        {saving && <span style={{ color: "#60708a", fontWeight: 700 }}>Saving...</span>}
      </div>

      <div style={S.pillRow}>
        {Object.entries(QUICK_ADD_CONFIG).map(([value, item]) => (
          <button
            key={value}
            style={{ ...S.pillBtn, ...(tab === value ? S.pillActive : {}) }}
            onClick={() => setTab(value)}
          >
            {item.pluralLabel}
          </button>
        ))}
      </div>

      <div style={{ ...S.formGrid, marginTop: 18 }}>
        <InputField
          label={`New ${config.label}`}
          placeholder={`Enter ${config.label.toLowerCase()} name`}
          value={draft}
          onChange={setDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <div style={{ display: "flex", alignItems: "end" }}>
          <button style={S.primaryBtn} onClick={handleAdd}>
            Add {config.label}
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
        {config.description}
      </div>

      <div style={{ ...S.listCard, marginTop: 18 }}>
        {currentList.length === 0 ? (
          <div style={S.emptyState}>No {config.pluralLabel.toLowerCase()} added yet.</div>
        ) : (
          currentList.map((item) => (
            <div key={item.id} style={S.listItem}>
              <span style={{ fontWeight: 700 }}>{item.label}</span>
              <span style={{ ...S.badge, color: "#17355d", background: "#e8f0ff" }}>
                Available
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
