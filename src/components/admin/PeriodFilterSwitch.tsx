import { Calendar, ChevronDown, ChevronUp, History, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  type PeriodPreset,
  formatShortDate,
  getBogotaDate,
  addDaysIso,
} from "../../services/admin-periods";

export interface PeriodFilterSwitchProps {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  isAllTime?: boolean;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomRangeChange: (from: string, to: string) => void;
  onToggleAllTime?: () => void;
}

export default function PeriodFilterSwitch({
  preset,
  customFrom,
  customTo,
  isAllTime = false,
  onPresetChange,
  onCustomRangeChange,
  onToggleAllTime,
}: PeriodFilterSwitchProps) {
  const [rangeOpen, setRangeOpen] = useState(preset === "rango" || isAllTime);
  const today = getBogotaDate();

  const handlePresetClick = (target: PeriodPreset) => {
    if (target === "rango") {
      setRangeOpen(true);
      onPresetChange("rango");
    } else {
      setRangeOpen(false);
      onPresetChange(target);
    }
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFrom = e.target.value;
    if (!newFrom) return;
    if (newFrom > customTo) {
      onCustomRangeChange(newFrom, newFrom);
    } else {
      onCustomRangeChange(newFrom, customTo);
    }
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTo = e.target.value;
    if (!newTo) return;
    if (newTo < customFrom) {
      onCustomRangeChange(newTo, newTo);
    } else {
      onCustomRangeChange(customFrom, newTo);
    }
  };

  // Accesos rápidos dentro del rango personalizado
  const setThisMonth = () => {
    const start = `${today.slice(0, 7)}-01`;
    onCustomRangeChange(start, today);
  };

  const setLastMonth = () => {
    const curYear = parseInt(today.slice(0, 4), 10);
    const curMonth = parseInt(today.slice(5, 7), 10);
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const start = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    // Último día del mes pasado
    const lastDayNum = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const end = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;
    onCustomRangeChange(start, end);
  };

  const isRangoActive = preset === "rango" || isAllTime;

  return (
    <div className="period-filter-root">
      {/* Barra segmentada idéntica a la imagen del usuario: Semana | Mes | Año | Rango */}
      <div className="period-segmented-bar" role="tablist" aria-label="Filtro de período">
        <button
          type="button"
          role="tab"
          aria-selected={preset === "semana" && !isAllTime}
          className={`period-tab-btn ${preset === "semana" && !isAllTime ? "selected" : ""}`}
          onClick={() => handlePresetClick("semana")}
        >
          Semana
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={preset === "mes" && !isAllTime}
          className={`period-tab-btn ${preset === "mes" && !isAllTime ? "selected" : ""}`}
          onClick={() => handlePresetClick("mes")}
        >
          Mes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={preset === "ano" && !isAllTime}
          className={`period-tab-btn ${preset === "ano" && !isAllTime ? "selected" : ""}`}
          onClick={() => handlePresetClick("ano")}
        >
          Año
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRangoActive}
          className={`period-tab-btn ${isRangoActive ? "selected" : ""}`}
          onClick={() => handlePresetClick("rango")}
        >
          Rango
          {isRangoActive && (
            <span className="period-tab-chevron" aria-hidden="true">
              {rangeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          )}
        </button>
      </div>

      {/* Panel desplegable de selector de fechas para Rango */}
      {isRangoActive && rangeOpen && (
        <div className="period-custom-panel">
          <div className="period-custom-header">
            <span className="period-custom-title">
              <Calendar size={14} /> Seleccionar rango de fechas
            </span>
            {onToggleAllTime && (
              <button
                type="button"
                className={`period-pill-btn ${isAllTime ? "active" : ""}`}
                onClick={onToggleAllTime}
                title="Ver todo el historial de pedidos y gastos"
              >
                <History size={12} /> {isAllTime ? "Viendo todo el historial" : "Ver todo el historial"}
              </button>
            )}
          </div>

          {!isAllTime ? (
            <div className="period-custom-controls">
              <div className="period-date-field">
                <label htmlFor="period-from-input">Desde</label>
                <input
                  id="period-from-input"
                  type="date"
                  className="period-date-input"
                  value={customFrom}
                  max={customTo || today}
                  onChange={handleFromChange}
                />
              </div>

              <div className="period-date-field">
                <label htmlFor="period-to-input">Hasta</label>
                <input
                  id="period-to-input"
                  type="date"
                  className="period-date-input"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={handleToChange}
                />
              </div>

              <div className="period-quick-presets">
                <button
                  type="button"
                  className="period-quick-btn"
                  onClick={setThisMonth}
                >
                  Este mes
                </button>
                <button
                  type="button"
                  className="period-quick-btn"
                  onClick={setLastMonth}
                >
                  Mes pasado
                </button>
              </div>
            </div>
          ) : (
            <div className="period-all-time-hint">
              <span>Se están calculando todos los pedidos y gastos desde el inicio del negocio.</span>
              <button
                type="button"
                className="period-quick-btn"
                onClick={() => {
                  onPresetChange("mes");
                  setRangeOpen(false);
                }}
              >
                <RotateCcw size={12} /> Volver a los últimos 30 días
              </button>
            </div>
          )}

          {!isAllTime && customFrom && customTo && (
            <div className="period-range-summary">
              Rango activo: <strong>{formatShortDate(customFrom, true)}</strong> al{" "}
              <strong>{formatShortDate(customTo, true)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
