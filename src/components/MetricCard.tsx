/** 指标卡：eyebrow + 等宽大数字 + 标签（设计规范的 metric 形态） */

export default function MetricCard({
  eyebrow,
  value,
  label,
}: {
  eyebrow: string;
  value: string | number;
  label?: string;
}) {
  return (
    <article className="metric">
      <span className="eyebrow" style={{ marginBottom: 0 }}>
        {eyebrow}
      </span>
      <span className="value">{value}</span>
      {label && <span className="label">{label}</span>}
    </article>
  );
}
