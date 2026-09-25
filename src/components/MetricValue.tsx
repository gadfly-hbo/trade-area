/** 数值单元格：fmt + 可选推断警示标（列表/对比/详情共用） */
import { fmt } from '@/utils/metrics';
import InferredTag from './InferredTag';

export default function MetricValue({
  v,
  inferred,
}: {
  v: number | undefined | null;
  inferred?: boolean;
}) {
  return (
    <>
      {fmt(v)}
      {v !== undefined && v !== null && inferred && <InferredTag />}
    </>
  );
}
