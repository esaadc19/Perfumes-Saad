import { BarChart3 } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import { getBogotaDate } from "../../lib/format";
import {
  PERIOD_PRESETS,
  resolvePeriod,
  type PeriodPresetId,
} from "../../services/report-periods";
import type { ReportResult } from "./types";

interface ReportsPageProps {
  reportPeriodId: PeriodPresetId | "custom";
  reportCustomFrom: string;
  reportCustomTo: string;
  reportDate: string;
  reportLoading: boolean;
  reportError: string | null;
  reportRangeError: string | null;
  reportResult: ReportResult | null;
  onPeriodPresetChange: (presetId: PeriodPresetId, from: string, to: string) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onReportDateChange: (value: string) => void;
  onGenerateReport: (dailyReportDate?: string | null) => void;
}

export default function ReportsPage({
  reportPeriodId,
  reportCustomFrom,
  reportCustomTo,
  reportDate,
  reportLoading,
  reportError,
  reportRangeError,
  reportResult,
  onPeriodPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onReportDateChange,
  onGenerateReport,
}: ReportsPageProps) {
  return (
    <div className="report-section">
      <div className="report-panel">
        <div className="report-panel-head">
          <h3>Reporte por periodo</h3>
          <p>
            Elige un periodo rapido o escribe el rango. Puedes tomar
            varios dias o varios meses: el rango es desde-hasta.
          </p>
        </div>

        <div className="metrics-period report-period-switch">
          <span className="metrics-period-label">Periodo</span>
          <div className="chart-period-switch" role="group" aria-label="Periodo del reporte">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={reportPeriodId === preset.id ? "selected" : ""}
                aria-pressed={reportPeriodId === preset.id}
                disabled={reportLoading}
                onClick={() => {
                  const period = resolvePeriod(preset.id);
                  onPeriodPresetChange(preset.id, period.from, period.to);
                }}
              >
                {preset.label}
              </button>
            ))}
            {PERIOD_PRESETS.some((p) => {
              const r = resolvePeriod(p.id);
              return r.from === reportCustomFrom && r.to === reportCustomTo;
            }) ? null : (
              <button
                type="button"
                className="selected"
                aria-pressed="true"
                disabled={reportLoading}
                onClick={() => {
                  const back = resolvePeriod("last-week");
                  onPeriodPresetChange("last-week", back.from, back.to);
                }}
                title="Volver a la semana pasada"
              >
                A medida
              </button>
            )}
          </div>
        </div>

        <div className="report-range">
          <label className="report-date-field">
            Desde
            <input
              type="date"
              value={reportCustomFrom}
              max={getBogotaDate()}
              disabled={reportLoading}
              onChange={(event) => onCustomFromChange(event.target.value)}
            />
          </label>
          <label className="report-date-field">
            Hasta
            <input
              type="date"
              value={reportCustomTo}
              max={getBogotaDate()}
              disabled={reportLoading}
              onChange={(event) => onCustomToChange(event.target.value)}
            />
          </label>
          <AdminButton
            tone="primary"
            compact
            type="button"
            onClick={() => onGenerateReport()}
            disabled={reportLoading}
          >
            <BarChart3 size={16} /> {reportLoading ? "Generando..." : "Generar reporte"}
          </AdminButton>
        </div>

        {reportRangeError && <p className="form-error" role="alert">{reportRangeError}</p>}
      </div>

      {reportError && <p className="form-error" role="alert">{reportError}</p>}
      {reportResult && (
        <p className="report-result" role="status">
          Reporte {reportResult.label} generado. {reportResult.emailSent
            ? "Correo enviado. "
            : `${reportResult.emailError ?? "No se pudo enviar el correo."} `}
          <a href={reportResult.whatsappUrl} target="_blank" rel="noreferrer">Abrir reporte en WhatsApp</a>
        </p>
      )}

      <div className="report-actions report-actions-left">
        <AdminButton
          tone="secondary"
          compact
          type="button"
          onClick={() => onGenerateReport()}
          disabled={reportLoading}
        >
          <BarChart3 size={16} /> {reportLoading ? "Generando..." : "Reporte semanal"}
        </AdminButton>
        <label className="report-date-field">
          Fecha del reporte diario
          <input
            type="date"
            value={reportDate}
            max={getBogotaDate()}
            disabled={reportLoading}
            onChange={(event) => onReportDateChange(event.target.value)}
          />
        </label>
        <AdminButton
          tone="secondary"
          compact
          type="button"
          onClick={() => onGenerateReport(reportDate)}
          disabled={reportLoading || !reportDate}
        >
          <BarChart3 size={16} /> {reportLoading ? "Generando..." : "Reporte diario"}
        </AdminButton>
      </div>
    </div>
  );
}
