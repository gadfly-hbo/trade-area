/** 维度文本与标记渲染：可信度胶囊、等宽来源行、按 ｜ 分段的长文本 */
import { Typography } from 'antd';
import type { Confidence, DimensionDetail } from '@/types';

export function ConfidenceTag({ level }: { level: Confidence | null }) {
  if (!level) return null;
  return level === 'A' ? (
    <span className="pill good">可信 A</span>
  ) : (
    <span className="pill warn">参考 B</span>
  );
}

export function SourceTags({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <div className="sources">
      <span className="eyebrow" style={{ display: 'inline', marginRight: 8 }}>
        SOURCES
      </span>
      <span className="src-list">{sources.join(' · ')}</span>
    </div>
  );
}

/** 把「【标签】内容」中的标签部分渲染成胶囊 */
function Segment({ text }: { text: string }) {
  const m = text.match(/^【([^】]+)】(.*)$/s);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="pill accent" style={{ marginRight: 6 }}>
        {m[1]}
      </span>
      {m[2]}
    </>
  );
}

/** 维度长文本：按 ｜ 分段成段落，段首【标签】样式化 */
export function DimText({ detail, compact = false }: { detail: DimensionDetail; compact?: boolean }) {
  if (compact) {
    return (
      <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 3, expandable: true }}>
        {detail.text}
      </Typography.Paragraph>
    );
  }
  const segments = detail.text
    .split(/[｜|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="dim-text">
      {segments.map((s, i) => (
        <p key={i}>
          <Segment text={s} />
        </p>
      ))}
    </div>
  );
}
