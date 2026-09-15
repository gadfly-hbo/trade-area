/** 面板区块：eyebrow 小标 + 标题 + 说明 + 右侧附加内容（设计规范的标准段落形态） */
import type { CSSProperties, ReactNode } from 'react';

export default function Section({
  eyebrow,
  title,
  desc,
  extra,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  desc?: string;
  extra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const hasHead = eyebrow || title || desc || extra;
  return (
    <section className="panel" style={style}>
      {hasHead && (
        <header className="sec-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
            {desc && <p className="sec-desc">{desc}</p>}
          </div>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}
