/** 商圈详情页：指标卡 + 森马三大人群 + 12 维度全文（来源/可信度标注） */
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
import Section from '@/components/Section';
import { chartBase, useTheme } from '@/theme';
import { fmt } from '@/utils/metrics';

const CROWD_LABELS: Record<'crowdA' | 'crowdB' | 'crowdC', string> = {
  crowdA: 'A类 质感流行派',
  crowdB: 'B类 都市体面家',
  crowdC: 'C类 百搭优选客',
};

function RatingPill({ v }: { v: string | null }) {
  if (!v) return null;
  const cls = v === 'A' ? 'good' : v === 'B' ? 'warn' : 'bad';
  return <span className={`pill ${cls}`}>评级 {v}</span>;
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const basket = useBasket();
  const { palette } = useTheme();
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
          itemStyle: { color: palette.accent },
          label: { show: true, position: 'right', formatter: '{c}%', color: palette.text },
        },
      ],
    };
  }, [detail, palette]);

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
  const statCards: Array<{ eyebrow: string; value: string }> = [
    { eyebrow: '工作日客流 万人次/日', value: fmt(m.trafficWeekday) },
    { eyebrow: '周末客流 万人次/日', value: fmt(m.trafficWeekend) },
    { eyebrow: '节假日峰值 万人次/日', value: fmt(m.trafficPeak) },
    { eyebrow: '3公里人口 万人', value: fmt(m.pop3km) },
    { eyebrow: '街铺租金 元/㎡/天', value: fmt(m.rent) },
    { eyebrow: '竞品商业体 个', value: fmt(m.competitors) },
    { eyebrow: '车位数 个', value: fmt(m.parking) },
    { eyebrow: '选址评分', value: detail.score === null ? '—' : detail.score.toFixed(1) },
  ];

  const collapseItems: CollapseProps['items'] = DIMENSION_KEYS.map((key) => {
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
  });

  const inBasket = basket.isSelected(detail.id);

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
          {detail.name}
        </span>
        <RatingPill v={detail.rating} />
        {detail.score !== null && <span className="pill accent">评分 {detail.score.toFixed(1)}</span>}
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
        </Descriptions>
      </Section>

      <div className="metrics-grid">
        {statCards.map((s) => (
          <MetricCard key={s.eyebrow} eyebrow={s.eyebrow} value={s.value} />
        ))}
      </div>

      {crowdOption && (
        <Section
          eyebrow="CROWD MIX"
          title="森马三大人群预测（%）"
          desc={`A/B 类合计为服饰目标客群匹配度：${fmt((m.crowdA ?? 0) + (m.crowdB ?? 0))}%`}
        >
          <EChart option={crowdOption} height={180} />
        </Section>
      )}

      <Section eyebrow="12 DIMENSIONS" title="维度明细" desc="点击展开各维度全文与数据来源。">
        <Collapse items={collapseItems} defaultActiveKey={DIMENSION_KEYS.slice(0, 2)} />
      </Section>
    </div>
  );
}
