import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PERIOD_PRESETS, SHIFT_OPTIONS, formatPercent } from "./api";
import { S } from "./styles";

export function FilterBar({
  filters,
  setFilters,
  preset,
  setPreset,
  masters,
  showDateInputs,
}) {
  return (
    <div style={{ ...S.tile, marginTop: 18 }}>
      <div style={S.pillRow}>
        {PERIOD_PRESETS.map((option) => (
          <button
            key={option.value}
            style={{ ...S.pillBtn, ...(preset === option.value ? S.pillActive : {}) }}
            onClick={() => setPreset(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div style={{ ...S.formGrid, marginTop: 16 }}>
        {showDateInputs && (
          <>
            <InputField
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(value) =>
                setFilters((current) => ({ ...current, startDate: value }))
              }
            />
            <InputField
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(value) =>
                setFilters((current) => ({ ...current, endDate: value }))
              }
            />
          </>
        )}
        <SelectField
          allowBlank
          label="Shift"
          options={SHIFT_OPTIONS}
          value={filters.shift}
          onChange={(value) => setFilters((current) => ({ ...current, shift: value }))}
        />
        <SearchSelect
          allowClear
          label="Machine"
          options={masters.machines}
          placeholder="All machines"
          value={filters.machineId}
          onChange={(value) =>
            setFilters((current) => ({ ...current, machineId: value }))
          }
        />
        <SearchSelect
          allowClear
          label="Supervisor"
          options={masters.supervisors}
          placeholder="All supervisors"
          value={filters.supervisorId}
          onChange={(value) =>
            setFilters((current) => ({ ...current, supervisorId: value }))
          }
        />
        <SearchSelect
          allowClear
          label="Part"
          options={masters.parts}
          placeholder="All parts"
          value={filters.partId}
          onChange={(value) => setFilters((current) => ({ ...current, partId: value }))}
        />
      </div>
    </div>
  );
}

export function advanceOnEnter(e, nextRef) {
  if (e.key === "Enter") {
    e.preventDefault();
    nextRef?.current?.focus();
  }
}

export function DateRangeControls({ range, setRange }) {
  return (
    <div style={{ ...S.formGrid, marginTop: 10 }}>
      <InputField
        label="Start Date"
        type="date"
        value={range.startDate}
        onChange={(value) => setRange((current) => ({ ...current, startDate: value }))}
      />
      <InputField
        label="End Date"
        type="date"
        value={range.endDate}
        onChange={(value) => setRange((current) => ({ ...current, endDate: value }))}
      />
    </div>
  );
}

export function InputField({
  label,
  value,
  onChange,
  type = "text",
  step = undefined,
  placeholder = "",
  onKeyDown,
  ...rest
}) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input
        {...rest}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        step={step}
        style={S.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  options,
  value,
  onChange,
  allowBlank = false,
  advanceOnChange = false,
  onKeyDown,
  ...rest
}) {
  const selectRef = useRef(null);

  return (
    <div>
      <label style={S.label}>{label}</label>
      <select
        {...rest}
        ref={selectRef}
        onKeyDown={onKeyDown}
        style={S.input}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);

          if (advanceOnChange) {
            window.requestAnimationFrame(() => {
              focusNextControl(selectRef.current);
            });
          }
        }}
      >
        {allowBlank && <option value="">All</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReadOnlyField({ label, value }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div
        style={{
          ...S.input,
          background: "#f4f7fb",
          fontWeight: 700,
          color: "#51627d",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  allowClear = false,
  advanceOnSelect = false,
  onKeyDown,
  autoComplete = "off",
}) {
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const selectedOption = options.find((option) => option.id === value) || null;
  const [query, setQuery] = useState(selectedOption?.label || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label || "");
  }, [selectedOption]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        unlockSearchSelectInput(inputRef.current);
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return options;
    return options.filter((option) => option.label.toLowerCase().includes(search));
  }, [options, query]);

  const selectOption = (option, shouldAdvance = advanceOnSelect) => {
    if (!option) return;

    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
    unlockSearchSelectInput(inputRef.current);

    if (shouldAdvance) {
      window.requestAnimationFrame(() => {
        focusNextControl(inputRef.current);
      });
    }
  };

  const unlockForManualTyping = () => {
    const input = inputRef.current;

    if (!input || input.dataset.searchSelectAutoLock !== "true") {
      return;
    }

    unlockSearchSelectInput(input);

    if (document.activeElement === input && isCoarsePointerDevice()) {
      input.blur();
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        if (typeof input.select === "function") {
          input.select();
        }
      });
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <label style={S.label}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        ref={inputRef}
        data-search-select-input="true"
        style={{
          ...S.input,
          background: disabled ? "#f4f7fb" : "#fff",
          color: disabled ? "#63748c" : "#102038",
        }}
        value={query}
        onChange={(event) => {
          unlockSearchSelectInput(event.currentTarget);
          const nextValue = event.target.value;
          setQuery(nextValue);
          setOpen(true);
          if (selectedOption && nextValue !== selectedOption.label) {
            onChange("");
          }
        }}
        onFocus={() => setOpen(true)}
        onPointerDown={(event) => {
          if (disabled) return;

          if (event.currentTarget.dataset.searchSelectAutoLock === "true") {
            event.preventDefault();
            unlockForManualTyping();
          } else {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !disabled) {
            const normalizedQuery = query.trim().toLowerCase();
            const exactMatch = options.find(
              (option) => option.label.toLowerCase() === normalizedQuery,
            );
            const nextSelection =
              exactMatch || (filtered.length === 1 ? filtered[0] : selectedOption);

            if (!nextSelection) {
              event.preventDefault();
              setOpen(true);
              return;
            }

            event.preventDefault();
            selectOption(nextSelection);
            return;
          }

          onKeyDown?.(event);
        }}
      />
      {allowClear && value && !disabled && (
        <button
          onClick={() => {
            setQuery("");
            onChange("");
          }}
          style={{
            position: "absolute",
            top: 36,
            right: 10,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "#60708a",
            fontSize: 18,
          }}
        >
          x
        </button>
      )}
      {!disabled && open && filtered.length > 0 && (
        <div style={S.dropdown}>
          {filtered.map((option) => (
            <div
              key={option.id}
              onPointerDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              style={S.dropdownItem}
            >
              <div style={{ fontWeight: 700 }}>{option.label}</div>
              {option.meta && (
                <div style={{ color: "#60708a", fontSize: 12, marginTop: 4 }}>{option.meta}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetricBadge({ label, value, accent = false }) {
  return (
    <div
      style={{
        ...S.badge,
        padding: "10px 12px",
        background: accent ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
        color: "#fff",
        borderRadius: 16,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function StatTile({ label, value, meta }) {
  return (
    <div style={S.tile}>
      <div style={S.tileLabel}>{label}</div>
      <div style={S.tileValue}>{value}</div>
      <div style={S.tileMeta}>{meta}</div>
    </div>
  );
}

export function HeroTile({
  label,
  value,
  meta,
  accent = false,
  valueColor,
  metaColor,
  labelColor,
}) {
  return (
    <div style={accent ? S.heroTile : S.tile}>
      <div
        style={{
          ...(accent ? S.heroTileLabel : S.tileLabel),
          ...(labelColor ? { color: labelColor } : {}),
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...(accent ? S.heroTileValue : S.tileValue),
          ...(valueColor ? { color: valueColor } : {}),
        }}
      >
        {value}
      </div>
      <div
        style={{
          ...(accent ? S.heroTileMeta : S.tileMeta),
          ...(metaColor ? { color: metaColor } : {}),
        }}
      >
        {meta}
      </div>
    </div>
  );
}

export function LeaderboardCard({ title, rows, valueFormatter }) {
  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>{title}</div>
          <div style={S.subtitle}>Live ranking from the filtered dataset</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="No rows available." />
      ) : (
        <div style={S.listCard}>
          {rows.map((row, index) => (
            <div key={`${row.name || row.machine}-${index}`} style={S.listItem}>
              <div>
                <div style={{ fontWeight: 800 }}>
                  {row.name || `${row.machine} - ${row.part}`}
                </div>
                <div style={{ color: "#60708a", marginTop: 6, lineHeight: 1.5 }}>
                  {row.meta || row.detail || "--"}
                </div>
              </div>
              <div style={{ fontWeight: 800, color: "#17355d" }}>{valueFormatter(row)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrendChart({
  title,
  items,
  valueKey,
  color,
  valueLabel,
  axisMode = "auto",
}) {
  const wrapperRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);
  const values = useMemo(
    () => items.map((item) => Number(item[valueKey] || 0)),
    [items, valueKey],
  );
  const width = 520;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 32, left: 45 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const { min, max, ticks: yTicks } = useMemo(
    () => getChartDomain(values, axisMode),
    [axisMode, values],
  );

  const points = values.map((value, index) => {
    const x = padding.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
    const y =
      padding.top +
      plotHeight -
      ((clamp(value, min, max) - min) / Math.max(max - min, 1)) * plotHeight;
    return { x, y, value, index };
  });

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = getXAxisLabelIndexes(items.length);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const renderedWidth = svgRef.current?.getBoundingClientRect().width || width;
  const renderedHeight = svgRef.current?.getBoundingClientRect().height || height;
  const tooltipWidth = tooltipRef.current?.offsetWidth || 136;
  const tooltipHeight = tooltipRef.current?.offsetHeight || 44;
  const tooltipPosition = activePoint
    ? getTooltipPosition({
        pointX: (activePoint.x / width) * renderedWidth,
        pointY: (activePoint.y / height) * renderedHeight,
        tooltipWidth,
        tooltipHeight,
        containerWidth: renderedWidth,
        containerHeight: renderedHeight,
      })
    : null;

  const setNearestPointByClientX = useCallback(
    (clientX) => {
      if (!svgRef.current || points.length === 0) {
        return;
      }

      const rect = svgRef.current.getBoundingClientRect();
      const chartX = ((clientX - rect.left) / Math.max(rect.width, 1)) * width;

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      points.forEach((point) => {
        const distance = Math.abs(point.x - chartX);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = point.index;
        }
      });

      setActiveIndex(nearestIndex);
    },
    [points],
  );

  useEffect(() => {
    setActiveIndex(null);
  }, [items, valueKey]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setActiveIndex(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>{title}</div>
          <div style={S.subtitle}>
            Latest value {valueLabel(values[values.length - 1] || 0)}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState text="No trend points for this filter." />
      ) : (
        <div ref={wrapperRef} style={S.chartWrap}>
          <svg
            height={height}
            ref={svgRef}
            preserveAspectRatio="none"
            style={{ display: "block", width: "100%", maxWidth: "100%" }}
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
          >
            {yTicks.map((tick) => {
              const y =
                padding.top +
                plotHeight -
                ((tick - min) / Math.max(max - min, 1)) * plotHeight;

              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    stroke="#edf2f7"
                    strokeDasharray="4 4"
                  />
                  <text
                    fill="#8a95a8"
                    fontSize="10"
                    textAnchor="end"
                    x={padding.left - 8}
                    y={y + 4}
                  >
                    {valueLabel(tick)}
                  </text>
                </g>
              );
            })}
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + plotHeight}
              y2={padding.top + plotHeight}
              stroke="#dce4ef"
            />
            <line
              x1={padding.left}
              x2={padding.left}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="#dce4ef"
            />
            {labelIndexes.map((index) => {
              const point = points[index];

              return (
                <text
                  key={`${items[index]?.date}-${index}`}
                  fill="#8a95a8"
                  fontSize="10"
                  textAnchor={
                    index === 0 ? "start" : index === items.length - 1 ? "end" : "middle"
                  }
                  x={point.x}
                  y={height - 10}
                >
                  {formatChartDate(items[index]?.date)}
                </text>
              );
            })}
            {activePoint && (
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={padding.top}
                y2={padding.top + plotHeight}
                stroke={color}
                strokeDasharray="4 4"
                strokeOpacity="0.35"
              />
            )}
            <polyline
              fill="none"
              points={polylinePoints}
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.14"
              strokeWidth="11"
            />
            <polyline
              fill="none"
              points={polylinePoints}
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
            />
            <rect
              fill="transparent"
              height={plotHeight}
              onClick={(event) => {
                event.stopPropagation();
                setNearestPointByClientX(event.clientX);
              }}
              onMouseLeave={() => setActiveIndex(null)}
              onMouseMove={(event) => setNearestPointByClientX(event.clientX)}
              width={plotWidth}
              x={padding.left}
              y={padding.top}
            />
            {activePoint && (
              <>
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  fill={color}
                  opacity="0.14"
                  r="13"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  fill="#fff"
                  r="6.5"
                  stroke={color}
                  strokeWidth="3"
                />
              </>
            )}
            {points.map((point) => (
              <circle
                key={`${point.value}-${point.index}`}
                cx={point.x}
                cy={point.y}
                fill={color}
                onBlur={() => {
                  if (!isCoarsePointerDevice()) {
                    setActiveIndex(null);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex(point.index);
                }}
                onFocus={() => setActiveIndex(point.index)}
                onMouseEnter={() => setActiveIndex(point.index)}
                onMouseLeave={() => {
                  if (!isCoarsePointerDevice()) {
                    setActiveIndex(null);
                  }
                }}
                r={activeIndex === point.index ? "5.5" : "4.5"}
                stroke={activeIndex === point.index ? "#ffffff" : color}
                strokeWidth={activeIndex === point.index ? "2.5" : "1"}
                tabIndex={0}
              />
            ))}
          </svg>
          {activePoint && (
            <div
              ref={tooltipRef}
              style={{
                ...S.chartTooltip,
                left: tooltipPosition.left,
                top: tooltipPosition.top,
                transform: tooltipPosition.transform,
              }}
            >
              {formatChartDate(items[activePoint.index]?.date)}: {valueLabel(activePoint.value)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ParetoChart({ title, items, valueFormatter }) {
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);

  return (
    <div style={S.sectionCard}>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>{title}</div>
          <div style={S.subtitle}>Sorted descending with cumulative share</div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState text="No Pareto data in this filter." />
      ) : (
        <div style={S.listCard}>
          {items.map((item) => (
            <div key={item.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 12,
                }}
              >
                <strong>{item.label}</strong>
                <span style={{ color: "#60708a" }}>
                  {valueFormatter(item.value)} - cumulative {formatPercent(item.cumulativeShare)}
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 12,
                  borderRadius: 999,
                  background: "#edf2f7",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(Number(item.value || 0) / max) * 100}%`,
                    height: "100%",
                    background: "linear-gradient(135deg, #2f7ad9, #4ba0ff)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeagueTable({
  rows,
  colorForOee,
  formatNumber,
  formatPercent,
  onRowClick,
  activeRowName,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState(null);

  const columns = [
    { key: "name", label: "Name" },
    { key: "entryCount", label: "Entries" },
    { key: "oee", label: "OEE" },
    { key: "availability", label: "A" },
    { key: "performance", label: "P" },
    { key: "quality", label: "Q" },
    { key: "actualQty", label: "Actual" },
    { key: "goodQty", label: "Good" },
    { key: "rejectionQty", label: "Rejected" },
    { key: "downtimeHours", label: "Downtime" },
  ];

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDirection) {
      return rows;
    }

    const sorted = [...rows];
    sorted.sort((leftRow, rightRow) => {
      if (sortKey === "name") {
        const comparison = String(leftRow.name || "").localeCompare(String(rightRow.name || ""));
        return sortDirection === "desc" ? comparison * -1 : comparison;
      }

      const leftValue = Number(leftRow[sortKey] || 0);
      const rightValue = Number(rightRow[sortKey] || 0);

      if (leftValue === rightValue) {
        return String(leftRow.name || "").localeCompare(String(rightRow.name || ""));
      }

      return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
    });

    return sorted;
  }, [rows, sortDirection, sortKey]);

  if (rows.length === 0) {
    return <EmptyState text="No league rows for this filter." />;
  }

  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead style={S.tableHead}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                onClick={() => {
                  if (sortKey !== column.key) {
                    setSortKey(column.key);
                    setSortDirection("desc");
                    return;
                  }

                  if (sortDirection === "desc") {
                    setSortDirection("asc");
                    return;
                  }

                  if (sortDirection === "asc") {
                    setSortKey(null);
                    setSortDirection(null);
                    return;
                  }

                  setSortDirection("desc");
                }}
                style={{
                  ...S.tableCell,
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {column.label}
                <span
                  style={{
                    marginLeft: 6,
                    color: sortKey === column.key ? "#2f7ad9" : "#9cabc0",
                    fontSize: 11,
                  }}
                >
                  {sortKey === column.key
                    ? sortDirection === "asc"
                      ? "\u25B2"
                      : "\u25BC"
                    : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const active = activeRowName === row.name;

            return (
              <tr
                key={row.name}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  background: active ? "#f0f6ff" : "#fff",
                  cursor: onRowClick ? "pointer" : "default",
                }}
              >
                <td
                  style={{
                    ...S.tableCell,
                    borderLeft: active ? "4px solid #2f7ad9" : "4px solid transparent",
                    fontWeight: active ? 800 : 700,
                  }}
                >
                  {row.name}
                </td>
                <td style={S.tableCell}>{formatNumber(row.entryCount)}</td>
                <td style={{ ...S.tableCell, color: colorForOee(row.oee), fontWeight: 800 }}>
                  {formatPercent(row.oee)}
                </td>
                <td style={S.tableCell}>{formatPercent(row.availability)}</td>
                <td style={S.tableCell}>{formatPercent(row.performance)}</td>
                <td style={S.tableCell}>{formatPercent(row.quality)}</td>
                <td style={S.tableCell}>{formatNumber(row.actualQty)}</td>
                <td style={S.tableCell}>{formatNumber(row.goodQty)}</td>
                <td style={S.tableCell}>{formatNumber(row.rejectionQty)}</td>
                <td style={S.tableCell}>{formatNumber(row.downtimeHours, 1)} h</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TogglePill({ active, label, onClick }) {
  return (
    <button
      style={{ ...S.pillBtn, ...(active ? S.pillActive : {}) }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Loader({ text }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center", color: "#60708a" }}>
      <div
        style={{
          width: 38,
          height: 38,
          border: "3px solid #d8e0ec",
          borderTopColor: "#2f7ad9",
          borderRadius: "50%",
          margin: "0 auto 14px",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <div>{text}</div>
    </div>
  );
}

export function FullPageLoader({ text }) {
  return (
    <div style={S.loginShell}>
      <div style={S.loginCard}>
        <Loader text={text} />
      </div>
    </div>
  );
}

export function EmptyState({ text }) {
  return <div style={S.emptyState}>{text}</div>;
}

export function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timeout);
  }, [onClose]);

  const background =
    type === "error"
      ? "#ffe8e8"
      : type === "success"
        ? "#e7f7ee"
        : "#e8f0ff";
  const color = type === "error" ? "#b23a3a" : type === "success" ? "#198754" : "#17355d";

  return (
    <div style={{ ...S.toast, background, color }}>{message}</div>
  );
}

export function advanceOnEnter(event) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.tagName === "TEXTAREA"
  ) {
    return;
  }

  event.preventDefault();
  focusNextControl(event.target);
}

function focusNextControl(currentElement) {
  if (!currentElement) {
    return;
  }

  const scope = currentElement.closest("[data-focus-scope]") || document;
  const controls = Array.from(
    scope.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    ),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  const currentIndex = controls.indexOf(currentElement);
  const nextControl = controls[currentIndex + 1];

  if (!nextControl) {
    return;
  }

  if (nextControl.dataset.searchSelectInput === "true") {
    lockSearchSelectInput(nextControl);
  }

  nextControl.focus({ preventScroll: false });
  scrollControlIntoView(nextControl);

  if (
    nextControl.tagName === "INPUT" &&
    nextControl.dataset.searchSelectInput !== "true" &&
    typeof nextControl.select === "function"
  ) {
    nextControl.select();
  }
}

function scrollControlIntoView(element) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return;
  }

  window.requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: isCoarsePointerDevice() ? "smooth" : "auto",
      block: isCoarsePointerDevice() ? "center" : "nearest",
      inline: "nearest",
    });
  });
}

function isCoarsePointerDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(
    window.matchMedia?.("(pointer: coarse)").matches ||
      window.navigator?.maxTouchPoints > 0,
  );
}

function getXAxisLabelIndexes(count) {
  if (count <= 0) {
    return [];
  }

  if (count <= 7) {
    return Array.from({ length: count }, (_, index) => index);
  }

  const step = Math.ceil(count / 6);
  const indexes = new Set([0, count - 1]);

  for (let index = 0; index < count; index += step) {
    indexes.add(index);
  }

  return Array.from(indexes).sort((left, right) => left - right);
}

function getChartDomain(values, axisMode) {
  const safeValues = values.length ? values : [0];
  const rawMin = Math.min(...safeValues);
  const rawMax = Math.max(...safeValues, 1);

  if (axisMode === "percent") {
    const range = rawMax - rawMin;
    const padding = range === 0 ? 4 : Math.max(2, range * 0.18);
    let min = Math.max(0, rawMin - padding);
    let max = Math.min(100, rawMax + padding);

    if (max - min < 6) {
      const midpoint = (rawMin + rawMax) / 2;
      min = Math.max(0, midpoint - 3);
      max = Math.min(100, midpoint + 3);
    }

    if (max <= min) {
      max = Math.min(100, min + 6);
    }

    return {
      min,
      max,
      ticks: getTickValues(min, max, 4),
    };
  }

  return {
    min: 0,
    max: rawMax,
    ticks: getTickValues(0, rawMax, 4),
  };
}

function getTickValues(min, max, count) {
  if (count <= 1 || max <= min) {
    return [min, max];
  }

  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function getTooltipPosition({
  pointX,
  pointY,
  tooltipWidth,
  tooltipHeight,
  containerWidth,
  containerHeight,
}) {
  const horizontalPadding = 10;
  const verticalGap = 12;
  const left = clamp(
    pointX,
    tooltipWidth / 2 + horizontalPadding,
    containerWidth - tooltipWidth / 2 - horizontalPadding,
  );

  const canPlaceAbove = pointY - tooltipHeight - verticalGap >= 8;
  const canPlaceBelow = pointY + tooltipHeight + verticalGap <= containerHeight - 8;
  const placeBelow = !canPlaceAbove && canPlaceBelow;

  if (placeBelow) {
    return {
      left,
      top: clamp(
        pointY + verticalGap,
        8,
        containerHeight - tooltipHeight - 8,
      ),
      transform: "translate(-50%, 0)",
    };
  }

  return {
    left,
    top: clamp(
      pointY - verticalGap,
      tooltipHeight + 8,
      containerHeight - 8,
    ),
    transform: "translate(-50%, -100%)",
  };
}

function formatChartDate(value) {
  if (!value) {
    return "--";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
      month: "short",
      day: "2-digit",
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString("en-IN", {
    month: "short",
    day: "2-digit",
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lockSearchSelectInput(input) {
  if (!input) {
    return;
  }

  input.dataset.searchSelectAutoLock = "true";

  if (isCoarsePointerDevice()) {
    input.readOnly = true;
  }
}

function unlockSearchSelectInput(input) {
  if (!input) {
    return;
  }

  delete input.dataset.searchSelectAutoLock;
  input.readOnly = false;
}

export function GlobalStyles() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        :root {
          --font: "DM Sans", sans-serif;
          --mono: "JetBrains Mono", monospace;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: var(--font);
          color: #102038;
          background: #eef3f8;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          appearance: none;
          -webkit-appearance: none;
        }

        button::-moz-focus-inner {
          border: 0;
        }

        button:focus {
          outline: none;
        }

        button:focus-visible {
          box-shadow: 0 0 0 3px rgba(47, 122, 217, 0.18);
        }

        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #2f7ad9 !important;
          box-shadow: 0 0 0 4px rgba(47, 122, 217, 0.12);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
