import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadCsv,
  formatNumber,
  formatPercent,
  getAnalysisBundle,
  getRangeForPreset,
  subscribeToProductionChanges,
} from "../api";
import { S } from "../styles";
import { colorForOee } from "../utils";
import {
  FilterBar,
  HeroTile,
  LeagueTable,
  Loader,
  ParetoChart,
  TrendChart,
} from "../ui";

const LEAGUE_CONFIG = {
  machineLeague: {
    label: "Machines",
    placeholder: "Search machines...",
    type: "machine",
    masterKey: "machines",
  },
  supervisorLeague: {
    label: "Supervisors",
    placeholder: "Search supervisors...",
    type: "supervisor",
    masterKey: "supervisors",
  },
  partLeague: {
    label: "Parts",
    placeholder: "Search parts...",
    type: "part",
    masterKey: "parts",
  },
};

export function AnalysisScreen({ masters, showToast }) {
  const defaultRange = useMemo(() => getRangeForPreset("month"), []);
  const [preset, setPreset] = useState("month");
  const [filters, setFilters] = useState({
    ...defaultRange,
    shift: "",
    machineId: "",
    supervisorId: "",
    partId: "",
  });
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leagueKey, setLeagueKey] = useState("machineLeague");
  const [searchQuery, setSearchQuery] = useState("");
  const [crossFilter, setCrossFilter] = useState(null);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      machineId: crossFilter?.type === "machine" ? crossFilter.id : filters.machineId,
      supervisorId:
        crossFilter?.type === "supervisor" ? crossFilter.id : filters.supervisorId,
      partId: crossFilter?.type === "part" ? crossFilter.id : filters.partId,
    }),
    [crossFilter, filters],
  );

  const loadBundle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAnalysisBundle(effectiveFilters);
      setBundle(data);
    } catch (error) {
      showToast(error.message || "Unable to load analysis.", "error");
    } finally {
      setLoading(false);
    }
  }, [effectiveFilters, showToast]);

  useEffect(() => {
    loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    return subscribeToProductionChanges(() => {
      loadBundle();
    });
  }, [loadBundle]);

  useEffect(() => {
    setSearchQuery("");
  }, [leagueKey]);

  const filteredLeagueRows = useMemo(() => {
    const rows = bundle?.[leagueKey] || [];
    const search = searchQuery.trim().toLowerCase();

    if (!search) {
      return rows;
    }

    return rows.filter((row) => row.name.toLowerCase().includes(search));
  }, [bundle, leagueKey, searchQuery]);

  const exportLeague = () => {
    if (!bundle) return;
    const columns = [
      { label: "Name", value: (row) => row.name },
      { label: "Entries", value: (row) => row.entryCount },
      { label: "OEE", value: (row) => row.oee },
      { label: "Availability", value: (row) => row.availability },
      { label: "Performance", value: (row) => row.performance },
      { label: "Quality", value: (row) => row.quality },
      { label: "Actual Qty", value: (row) => row.actualQty },
      { label: "Good Qty", value: (row) => row.goodQty },
      { label: "Rejected Qty", value: (row) => row.rejectionQty },
      { label: "Downtime Hours", value: (row) => row.downtimeHours },
    ];
    downloadCsv(
      `analysis-${leagueKey}-${effectiveFilters.startDate}-to-${effectiveFilters.endDate}.csv`,
      filteredLeagueRows,
      columns,
    );
  };

  const setPresetRange = (value) => {
    setPreset(value);
    if (value !== "custom") {
      setFilters((current) => ({
        ...current,
        ...getRangeForPreset(value),
      }));
    }
  };

  const handleLeagueRowClick = (row) => {
    const config = LEAGUE_CONFIG[leagueKey];
    const masterList = masters[config.masterKey] || [];
    const matched = masterList.find(
      (item) => item.label.trim().toLowerCase() === row.name.trim().toLowerCase(),
    );

    if (!matched) {
      return;
    }

    setCrossFilter((current) => {
      if (current?.type === config.type && current?.id === matched.id) {
        return null;
      }

      return {
        type: config.type,
        id: matched.id,
        name: matched.label,
      };
    });
  };

  const activeRowName =
    crossFilter?.type === LEAGUE_CONFIG[leagueKey].type ? crossFilter.name : "";

  return (
    <>
      <div style={S.heroPanel}>
        <div style={S.sectionHeader}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", fontWeight: 800 }}>
              ANALYSIS
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>
              Production trends and comparisons
            </div>
            <div style={{ marginTop: 10, color: "#d9e6f6", lineHeight: 1.6 }}>
              Filter by date, shift, machine, supervisor, or part to review
              performance patterns across the plant.
            </div>
          </div>
          <button style={S.subtleBtn} onClick={exportLeague}>
            Export CSV
          </button>
        </div>

        <FilterBar
          filters={filters}
          masters={masters}
          preset={preset}
          setFilters={setFilters}
          setPreset={setPresetRange}
          showDateInputs
        />
      </div>

      {loading ? (
        <div style={S.sectionCard}>
          <Loader text="Preparing analysis..." />
        </div>
      ) : !bundle ? (
        <div style={S.sectionCard}>No analysis data available.</div>
      ) : (
        <>
          {crossFilter && (
            <div style={S.sectionCard}>
              <div style={S.activeFilterChip}>
                <span>Filtered: {crossFilter.name}</span>
                <button style={S.clearBtn} onClick={() => setCrossFilter(null)}>
                  {"\u00D7"}
                </button>
              </div>
            </div>
          )}

          <div style={S.tileGrid}>
            <HeroTile
              label="Entry Count"
              value={formatNumber(bundle.summary.entryCount)}
              meta="Filtered production records"
            />
            <HeroTile
              label="Average OEE"
              value={formatPercent(bundle.summary.avgOee)}
              meta="Weighted across the selected period"
            />
            <HeroTile
              label="Total Downtime"
              value={`${formatNumber(bundle.summary.totalDowntimeHours, 1)} h`}
              meta="Cumulative downtime hours"
            />
            <HeroTile
              label="Total Good Output"
              value={formatNumber(bundle.summary.totalGoodQty)}
              meta="Actual minus rejected quantity"
            />
          </div>

          <div style={S.compactGrid}>
            <TrendChart
              axisMode="percent"
              color="#2f7ad9"
              items={bundle.trends || []}
              title="Daily OEE Trend"
              valueKey="oee"
              valueLabel={(value) => formatPercent(value)}
            />
            <TrendChart
              color="#198754"
              items={bundle.trends || []}
              title="Daily Production Trend"
              valueKey="production"
              valueLabel={(value) => formatNumber(value)}
            />
            <TrendChart
              color="#dd8a13"
              items={bundle.trends || []}
              title="Rejection Rate Trend"
              valueKey="rejectionRate"
              valueLabel={(value) => formatPercent(value)}
            />
          </div>

          <div style={S.compactGrid}>
            <ParetoChart
              items={bundle.downtimePareto || []}
              title="Downtime Pareto"
              valueFormatter={(value) => `${formatNumber(value, 1)} h`}
            />
            <ParetoChart
              items={bundle.rejectionPareto || []}
              title="Rejection Pareto"
              valueFormatter={(value) => formatNumber(value)}
            />
          </div>

          <div style={S.sectionCard}>
            <div style={S.sectionHeader}>
              <div>
                <div style={S.sectionTitle}>League Tables</div>
                <div style={S.subtitle}>
                  Compare machines, supervisors, and parts on the same weighted KPI logic.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <div style={S.pillRow}>
                  {Object.entries(LEAGUE_CONFIG).map(([value, config]) => (
                    <button
                      key={value}
                      style={{
                        ...S.pillBtn,
                        ...(leagueKey === value ? S.pillActive : {}),
                      }}
                      onClick={() => setLeagueKey(value)}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    placeholder={LEAGUE_CONFIG[leagueKey].placeholder}
                    style={S.compactInput}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchQuery && (
                    <button
                      style={{
                        ...S.clearBtn,
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                      onClick={() => setSearchQuery("")}
                    >
                      {"\u00D7"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <LeagueTable
              activeRowName={activeRowName}
              colorForOee={colorForOee}
              formatNumber={formatNumber}
              formatPercent={formatPercent}
              onRowClick={handleLeagueRowClick}
              rows={filteredLeagueRows}
            />
          </div>
        </>
      )}
    </>
  );
}
