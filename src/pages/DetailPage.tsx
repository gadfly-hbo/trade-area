/** 商圈详情页：指标卡 + 森马三大人群 + 12 维度全文（来源/可信度标注） */
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Collapse, Descriptions, Space, Spin, Typography } from 'antd';
import type { CollapseProps } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';
import type { DistrictDetail } from '@/types';
import { DIMENSION_KEYS } from '@/types';
import { loadDetail } from '@/data/loader';
import { useBasket } from '@/compare/BasketContext';
import { ConfidenceTag, DimText, SourceTags } from '@/components/DimText';
import EChart from '@/components/EChart';
import MetricCard from '@/components/MetricCard';
import MetricValue from '@/components/MetricValue';
import Section from '@/components/Section';
import { chartBase, palette } from '@/theme';
import { METRIC_DEFS, fmt } from '@/utils/metrics';

const CROWD_LABELS: Record<'crowdA' | 'crowdB' | 'crowdC', string> = {
  crowdA: 'A类 质感流行派',
  crowdB: 'B类 都市体面家',
  crowdC: 'C类 百搭优选客',
};

function RatingPill({ v }: { v: string | null }) {
  if (!v) return null;
  const cls = v === 'S' ? 'violet' : v === 'B' ? 'warn' : v === 'C' ? 'bad' : 'good';
  return <span className={`pill ${cls}`}>评级 {v}</span>;
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const basket = useBasket();
  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setDetail(null);
    setError(null);
    loadDetail(id)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const crowdOption = useMemo<EChartsCoreOption | null>(() => {
    if (!detail) return null;
    const { crowdA, crowdB, crowdC } = detail.metrics;
    if (crowdA === undefined && crowdB === undefined && crowdC === undefined) return null;
    const keys = ['crowdA', 'crowdB', 'crowdC'] as const;
    const base = chartBase(palette);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...base.tooltip },
      grid: { left: 120, right: 46, top: 10, bottom: 24 },
      xAxis: {
        type: 'value',
        axisLabel: { ...base.axisLabel, formatter: '{value}%' },
        splitLine: base.splitLine,
      },
      yAxis: {
        type: 'category',
        data: keys.map((k) => CROWD_LABELS[k]),
        axisLabel: { ...base.axisLabel, fontSize: 12 },
        axisLine: base.axisLine,
      },
      series: [
        {
          type: 'bar',
          barWidth: 18,
          data: keys.map((k) => detail.metrics[k] ?? 0),
          itemStyle: { color: palette.primary },
          label: { show: true, position: 'right', formatter: '{c}%', color: palette.text },
        },
      ],
    };
  }, [detail]);

  if (error) {
    return <Alert type="error" showIcon message="加载详情失败" description={error} />;
  }
  if (!detail) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const m = detail.metrics;
  const statCards: Array<{ label: string; value: ReactNode }> = [
    {
      label: '工作日客流（万人次/日）',
      value: <MetricValue v={m.trafficWeekday} inferred={detail.inferred?.trafficWeekday} />,
    },
    {
      label: '周末客流（万人次/日）',
      value: <MetricValue v={m.trafficWeekend} inferred={detail.inferred?.trafficWeekend} />,
    },
    {
      label: '节假日峰值（万人次/日）',
      value: <MetricValue v={m.trafficPeak} inferred={detail.inferred?.trafficPeak} />,
    },
    {
      label: '3公里人口（万人）',
      value: <MetricValue v={m.pop3km} inferred={detail.inferred?.pop3km} />,
    },
    {
      label: '品牌数（个）',
      value: <MetricValue v={m.brands} inferred={detail.inferred?.brands} />,
    },
    {
      label: '车位数（个）',
      value: <MetricValue v={m.parking} inferred={detail.inferred?.parking} />,
    },
    { label: '选址评分', value: detail.score === null ? '—' : detail.score.toFixed(1) },
  ];

  const collapseItems: CollapseProps['items'] = [
    {
      key: '项目评级',
      label: (
        <Space size={8}>
          <span>项目评级</span>
          <RatingPill v={detail.rating} />
        </Space>
      ),
      children: detail.rating ? (
        <Typography.Text>
          森马五级评级（S / A+ / A / B / C），来自渠道项目管理清单，按商圈名匹配回填至源报告「项目性质」行。
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary">
          未评级：渠道项目管理清单中无此商圈或未匹配到评级。
        </Typography.Text>
      ),
    },
    ...DIMENSION_KEYS.map((key) => {
      const d = detail.dimensions[key];
      return {
        key,
        label: (
          <Space size={8}>
            <span>{key}</span>
            {d && <ConfidenceTag level={d.confidence} />}
          </Space>
        ),
        children: d ? (
          <div>
            <DimText detail={d} />
            <SourceTags sources={d.sources} />
          </div>
        ) : (
          <Typography.Text type="secondary">该维度数据缺失</Typography.Text>
        ),
      };
    }),
  ];

  const inBasket = basket.isSelected(detail.id);

  /** 导出当前商圈明细为 xlsx：指标（含推断标记）+ 12 维度全文与来源，两个工作表 */
  const exportDetail = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const metricRows: Array<Array<string | number>> = [
      ['字段', '值', '备注'],
      ['商圈', detail.name, ''],
      ['地址', detail.address, ''],
      ['省市', `${detail.province} ${detail.city}`.trim(), ''],
      ['项目评级', detail.rating ? `${detail.rating} 级` : '—', ''],
      ['选址评分', detail.score ?? '—', ''],
      ['开业年份', m.openedYear ?? '—', detail.inferred?.openedYear ? '推断' : ''],
      ...METRIC_DEFS.map((def) => [
        def.label,
        m[def.key] ?? '—',
        `${def.unit}${detail.inferred?.[def.key] ? '（推断）' : ''}`,
      ]),
      ...(['crowdA', 'crowdB', 'crowdC'] as const).map((k) => [
        CROWD_LABELS[k],
        m[k] !== undefined ? `${m[k]}%` : '—',
        detail.inferred?.[k] ? '推断' : '',
      ]),
    ];
    const wsMetrics = XLSX.utils.aoa_to_sheet(metricRows);
    wsMetrics['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsMetrics, '指标');

    const dimRows: string[][] = [['维度', '内容', '来源', '可信度']];
    dimRows.push([
      '项目评级',
      detail.rating ? `${detail.rating} 级` : '未评级（渠道项目管理清单无此商圈）',
      '渠道项目管理清单（按商圈名匹配回填）',
      '—',
    ]);
    for (const key of DIMENSION_KEYS) {
      const d = detail.dimensions[key];
      dimRows.push([key, d?.text ?? '', d?.sources.join('；') ?? '', d?.confidence ?? '']);
    }
    const wsDims = XLSX.utils.aoa_to_sheet(dimRows);
    wsDims['!cols'] = [{ wch: 16 }, { wch: 90 }, { wch: 44 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsDims, '维度明细');

    XLSX.writeFile(wb, `${detail.name}-明细.xlsx`);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
          {detail.name}
        </span>
        <RatingPill v={detail.rating} />
        {detail.score !== null && (
          <span className="pill brand no-dot">评分 {detail.score.toFixed(1)}</span>
        )}
        <Button
          size="small"
          type={inBasket ? 'default' : 'primary'}
          onClick={() => basket.toggle({ id: detail.id, name: detail.name })}
          disabled={!inBasket && basket.isFull}
        >
          {inBasket ? '移出对比篮' : '加入对比篮'}
        </Button>
      </Space>

      <Section style={{ padding: '13px 16px' }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="地址">{detail.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="省市">
            {detail.province} {detail.city}
          </Descriptions.Item>
          <Descriptions.Item label="开业年份">{fmt(m.openedYear)}</Descriptions.Item>
          <Descriptions.Item label="项目评级">
            <RatingPill v={detail.rating} />
          </Descriptions.Item>
        </Descriptions>
      </Section>

      <div className="metrics-grid">
        {statCards.map((s) => (
          <MetricCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {crowdOption && (
        <Section
          title="森马三大人群预测（%）"
          desc={`A/B 类合计为服饰目标客群匹配度：${fmt((m.crowdA ?? 0) + (m.crowdB ?? 0))}%`}
        >
          <EChart option={crowdOption} height={180} />
        </Section>
      )}

      <Section
        title="维度明细"
        desc="点击展开各维度全文与数据来源。"
        extra={
          <Button size="small" onClick={() => void exportDetail()}>
            导出明细 (xlsx)
          </Button>
        }
      >
        <Collapse
          items={collapseItems}
          defaultActiveKey={['项目评级', DIMENSION_KEYS[0], DIMENSION_KEYS[1]]}
        />
      </Section>
    </div>
  );
}
