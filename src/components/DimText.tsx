/** 维度文本与标记渲染：可信度徽标、来源行、按 ｜ 分段的长文本 */
import { Typography } from 'antd';
import type { Confidence, DimensionDetail } from '@/types';
import Badge from '@/components/Badge';

export function ConfidenceTag({ level }: { level: Confidence | null }) {
  if (!level) return null;
  return level === 'A' ? <Badge tone="good">可信 A</Badge> : <Badge tone="warn">参考 B</Badge>;
}

export function SourceTags({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <div className="sources">
      <span className="src-label">来源</span>
      {sources.join(' · ')}
    </div>
  );
}

/** 把「【标签】内容」中的标签部分渲染成品牌徽标 */
function Segment({ text }: { text: string }) {
  const m = text.match(/^【([^】]+)】(.*)$/s);
  if (!m) return <>{text}</>;
  return (
    <>
      <Badge tone="brand" noDot>
        {m[1]}
      </Badge>{' '}
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
