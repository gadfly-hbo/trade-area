/** 推断值警示标：警示符号 + 悬停说明（该数字为报告标注[推断]/推算的估算口径） */
import { Tooltip } from 'antd';
import Badge from './Badge';

export default function InferredTag() {
  return (
    <Tooltip title="推断值：由研究报告标注或语义推算得出，非权威披露，仅供对比参考">
      <span style={{ marginLeft: 3 }}>
        <Badge tone="warn" noDot>
          <span aria-label="推断值" style={{ fontSize: 11, lineHeight: 1 }}>
            ⚠
          </span>
        </Badge>
      </span>
    </Tooltip>
  );
}
