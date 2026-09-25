/** 推断值警示标：黄色徽标 + 悬停说明（该数字为报告标注[推断]的估算口径） */
import { Tooltip } from 'antd';
import Badge from './Badge';

export default function InferredTag() {
  return (
    <Tooltip title="推断值：研究报告标注为「推断」的估算口径，非权威披露，仅供对比参考">
      <span style={{ marginLeft: 4 }}>
        <Badge tone="warn" noDot>
          推断
        </Badge>
      </span>
    </Tooltip>
  );
}
