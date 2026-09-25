/** 指标卡：meta 标签 + 21px/600 tabular-nums 数值 + 可选备注 */
import type { ReactNode } from 'react';

export default function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <article className="metric">
      <span className="metric-label">{label}</span>
      <span className="value">{value}</span>
      {note && <span className="metric-note">{note}</span>}
    </article>
  );
}
