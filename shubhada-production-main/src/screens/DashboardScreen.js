import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  getDashboardSnapshot,
  getRangeForPreset,
  subscribeToProductionChanges,
} from "../api";
import { S } from "../styles";
import { colorForOee } from "../utils";
import { FilterBar, HeroTile, LeaderboardCard, Loader } from "../ui";

export function DashboardScreen({ masters, showToast }) {
  const defaultRange = useMemo(() => getRangeForPreset("month"), []);
  const [preset, setPreset] = useState("month");
  const [filters, setFilters] = useState({
    ...defaultRange,
    shift: "",
    machineId: "",
    supervisorId: "",
    partId: "",
  });
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDashboardSnapshot(filters);
      setSnapshot(data);
    } catch (error) {
      showToast(error.message || "Unable to load dashboard.", "error");
    } finally {
      setLoading(false);
    }
  }, [filters, showToast]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    return subscribeToProductionChanges(() => {
      loadSnapshot();
    });
  }, [loadSnapshot]);

  const setPresetRange = (value) => {
    setPreset(value);
    if (value !== "custom") {
      setFilters((current) => ({
        ...current,
        ...getRangeForPreset(value),
      }));
    }
  };

  return (
    <>
      <div style={S.heroPanel}>
        <div style={S.sectionHeader}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", fontWeight: 800 }}>
              PRODUCTION DASHBOARD
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>
              Month-to-date KPI summary
            </div>
            <div style={{ marginTop: 10, color: "#d9e6f6", lineHeight: 1.6 }}>
              KPI cards refresh automatically whenever production data changes.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#9fc0eb", fontSize: 12, letterSpacing: "0.08em" }}>
              LAST SYNC
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {snapshot?.kpis?.lastSyncAt
                ? formatDateTime(snapshot.kpis.lastSyncAt)
                : "--"}
            </div>
          </div>
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
          <Loader text="Loading KPI cards..." />
        </div>
      ) : !snapshot ? (
        <div style={S.sectionCard}>No dashboard data available.</div>
      ) : (
        <>
          <div style={S.tileGrid}>
            <HeroTile
              label="Total Production"
              value={formatNumber(snapshot.kpis.totalProduction)}
              meta="Sum of actual quantity in the selected period"
            />
            <HeroTile
              label="Overall OEE"
              value={formatPercent(snapshot.kpis.overallOee)}
              valueColor={colorForOee(snapshot.kpis.overallOee)}
              meta="Weighted A x P x Q across the full filtered dataset"
            />
            <HeroTile
              label="Good Output"
              value={formatNumber(snapshot.kpis.goodOutput)}
              meta="Actual quantity minus rejected quantity"
            />
            <HeroTile
              label="Rejection Rate"
              value={formatPercent(snapshot.kpis.rejectionRate)}
              meta="Rejected quantity divided by actual quantity"
            />
            <HeroTile
              label="Top Supervisor"
              value={snapshot.kpis.topSupervisor?.name || "--"}
              meta={
                snapshot.kpis.topSupervisor
                  ? `${formatPercent(snapshot.kpis.topSupervisor.oee)} OEE - ${formatNumber(snapshot.kpis.topSupervisor.goodOutput)} good units`
                  : "Need at least 3 entries in this period"
              }
            />
            <HeroTile
              label="Top Item Produced"
              value={snapshot.kpis.topItemProduced?.name || "--"}
              meta={
                snapshot.kpis.topItemProduced
                  ? `${formatNumber(snapshot.kpis.topItemProduced.goodQty)} good units`
                  : "No part ranking yet"
              }
            />
            <HeroTile
              label="Most Rejected Item"
              value={snapshot.kpis.mostRejectedItem?.name || "--"}
              meta={
                snapshot.kpis.mostRejectedItem
                  ? `${formatNumber(snapshot.kpis.mostRejectedItem.rejectionQty)} rejected units`
                  : "No rejection data yet"
              }
            />
          </div>

          <div style={S.compactGrid}>
            <LeaderboardCard
              rows={snapshot.machineLeaderboard || []}
              title="Machine Leaders"
              valueFormatter={(row) => formatPercent(row.oee)}
            />
            <LeaderboardCard
              rows={snapshot.recentEntries || []}
              title="Recent Entries"
              valueFormatter={(row) => `${formatNumber(row.actualQty)} units`}
            />
          </div>
        </>
      )}
    </>
  );
}
