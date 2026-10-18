type Segment = {
  label: string;
  value: number;
  /** 0-1, se usa para el color del cian por escala de opacidad. */
  weight: number;
};

/**
 * Donut con la paleta de la referencia: un solo cian, escalado por opacidad
 * en vez de usar tres colores distintos.
 */
export default function Donut({
  total,
  segments,
  centerLabel,
  centerCaption,
}: {
  total: number;
  segments: Segment[];
  centerLabel: string;
  centerCaption?: string;
}) {
  const size = 168;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((acc, s) => acc + s.value, 0);

  let offset = 0;

  return (
    <div className="crm-donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel}: ${total}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EEF0F3"
          strokeWidth={stroke}
        />
        {sum > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((segment) => {
              const fraction = segment.value / sum;
              const dash = fraction * circumference;
              const node = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#00BCD4"
                  strokeOpacity={0.35 + segment.weight * 0.65}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += dash;
              return node;
            })}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="26"
          fontWeight="600"
          fill="#1F2937"
        >
          {centerLabel}
        </text>
        {centerCaption && (
          <text
            x="50%"
            y="66%"
            textAnchor="middle"
            fontSize="11"
            fill="#9CA3AF"
          >
            {centerCaption}
          </text>
        )}
      </svg>

      <ul className="crm-legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span
              className="crm-legend__dot"
              style={{ background: "#00BCD4", opacity: 0.35 + segment.weight * 0.65 }}
            />
            <span className="crm-legend__label">{segment.label}</span>
            <span className="crm-legend__value">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}