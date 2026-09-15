/** 对比页：2-4 个商圈并排 —— 雷达图（六因子）+ 关键指标条形图 + 最优值高亮 + 12 维度对照表 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Space, Spin, Table, Typography } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';
import type { DistrictDetail, DimensionDetail } from '@/types';
import { DIMENSION_KEYS } from '@/types';
import { loadDetails } from '@/data/loader';
import { useBasket } from '@/compare/BasketContext';
import { computeFactors, FACTOR_LABELS } from '@/scoring/model';
import type { FactorKey } from '@/scoring/model';
import { ConfidenceTag, DimText, SourceTags } from '@/components/DimText';
import EChart from '@/components/EChart';
import Section from '@/components/Section';
import { CHART_SERIES, chartBase, useTheme } from '@/theme';
import { METRIC_DEFS, fmt } from '@/utils/metrics';

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const basket = useBasket();
  const { palette } = useTheme();
  const [details, setDetails] = useState<DistrictDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => {
    const fromUrl = (searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (fromUrl.length) return fromUrl.slice(0, 4);
    return basket.items.map((x) => x.id);
  }, [searchParams, basket.items]);

  useEffect(() => {
    if (!ids.length) {
      setDetails([]);
      return;
    }
    setDetails(null);
    setError(null);
    loadDetails(ids)
      .then(setDetails)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ids]);

  const removeDistrict = (id: string) => {
    basket.remove(id);
    const rest = ids.filter((x) => x !== id);
    setSearchParams(rest.length ? { ids: rest.join(',') } : {});
  };

  const radarOption = useMemo<EChartsCoreOption | null>(() => {
    if (!details?.length) return null;
    const factorKeys = Object.keys(FACTOR_LABELS) as FactorKey[];
    const base = chartBase(palette);
    return {
      tooltip: base.tooltip,
      legend: { ...base.legend, data: details.map((d) => d.name) },
      radar: {
        indicator: factorKeys.map((k) => ({ name: FACTOR_LABELS[k], max: 100 })),
        radius: '65%',
        axisName: { color: palette.muted, fontSize: 11 },
        axisLine: base.axisLine,
        splitLine: base.splitLine,
      },
      series: [
        {
          type: 'radar',
          data: details.map((d, i) => ({
            name: d.name,
            value: factorKeys.map((k) => computeFactors(d.percentiles)[k] ?? 0),
            lineStyle: { color: CHART_SERIES[i % CHART_SERIES.length], width: 2 },
            itemStyle: { color: CHART_SERIES[i % CHART_SERIES.length] },
            areaStyle: { opacity: 0.13 },
          })),
        },
      ],
    };
  }, [details, palette]);

  const trafficOption = useMemo<EChartsCoreOption | null>(() => {
    if (!details?.length) return null;
    const defs = METRIC_DEFS.filter(
      (d) => d.chart && d.key !== 'rent' && d.key !== 'competitors',
    );
    const base = chartBase(palette);
    return {
      tooltip: { trigger: 'axis', ...base.tooltip },
      legend: { ...base.legend, data: details.map((d) => d.name) },
      grid: { left: 50, right: 20, top: 30, bottom: 60 },
      xAxis: {
        type: 'category',
        data: defs.map((d) => d.label),
        axisLabel: base.axisLabel,
        axisLine: base.axisLine,
      },
      yAxis: {
        type: 'value',
        name: '万人',
        nameTextStyle: { color: palette.faint },
        axisLabel: base.axisLabel,
        splitLine: base.splitLine,
      },
      series: details.map((d, i) => ({
        name: d.name,
        type: 'bar',
        data: defs.map((def) => d.metrics[def.key] ?? null),
        itemStyle: { color: CHART_SERIES[i % CHART_SERIES.length] },
      })),
    };
  }, [details, palette]);

  const rentOption = useMemo<EChartsCoreOption | null>(() => {
    if (!details?.length) return null;
    const hasRent = details.some((d) => d.metrics.rent !== undefined);
    if (!hasRent) return null;
    const base = chartBase(palette);
    return {
      tooltip: { trigger: 'axis', ...base.tooltip },
      legend: { ...base.legend, data: details.map((d) => d.name) },
      grid: { left: 60, right: 20, top: 30, bottom: 60 },
      xAxis: {
        type: 'category',
        data: ['街铺租金'],
        axisLabel: base.axisLabel,
        axisLine: base.axisLine,
      },
      yAxis: {
        type: 'value',
        name: '元/㎡/天',
        nameTextStyle: { color: palette.faint },
        axisLabel: base.axisLabel,
        splitLine: base.splitLine,
      },
      series: details.map((d, i) => ({
        name: d.name,
        type: 'bar',
        barWidth: 40,
        data: [d.metrics.rent ?? null],
        itemStyle: { color: CHART_SERIES[i % CHART_SERIES.length] },
        label: {
          show: true,
          position: 'top',
          formatter: (p: { value?: number }) => fmt(p.value),
          color: palette.text,
        },
      })),
    };
  }, [details, palette]);

  const metricTableRows = useMemo(() => {
    if (!details?.length) return [];
    return METRIC_DEFS.map((def) => {
      const values = details.map((d) => d.metrics[def.key]);
      const present = values.filter((v): v is number => v !== undefined);
      let best: number | undefined;
      if (present.length > 1) {
        best = def.better === 'high' ? Math.max(...present) : Math.min(...present);
      }
      return { def, values, best };
    });
  }, [details]);

  const dimTableColumns = useMemo(() => {
    if (!details?.length) return [];
    return [
      {
        title: '维度',
        dataIndex: 'dim',
        width: 130,
        fixed: 'left' as const,
        render: (dim: string) => <Typography.Text strong>{dim}</Typography.Text>,
      },
      ...details.map((d, i) => ({
        title: (
          <Space size={6}>
            <Link to={`/district/${d.id}`}>
              <span style={{ color: CHART_SERIES[i % CHART_SERIES.length], fontWeight: 600 }}>
                {d.name}
              </span>
            </Link>
            <Button size="small" type="text" danger onClick={() => removeDistrict(d.id)}>
              移除
            </Button>
          </Space>
        ),
        key: d.id,
        render: (_: unknown, row: Record<string, unknown>) => {
          const det = row[d.id] as DimensionDetail | undefined;
          return det ? (
            <DimText detail={det} compact />
          ) : (
            <Typography.Text type="secondary">缺数据</Typography.Text>
          );
        },
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  const dimTableData = useMemo(() => {
    if (!details?.length) return [];
    return DIMENSION_KEYS.map((key) => ({
      key,
      dim: key,
      ...Object.fromEntries(details.map((d) => [d.id, d.dimensions[key]])),
    }));
  }, [details]);

  if (error) {
    return <Alert type="error" showIcon message="加载对比数据失败" description={error} />;
  }
  if (!details) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (details.length < 2) {
    return (
      <Section>
        <Empty description="请在列表页勾选 2-4 个商圈加入对比篮" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate('/')}>
            去选择商圈
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <div>
      <div className="two-col">
        <Section eyebrow="SITE FACTORS" title="选址六因子雷达">
          <EChart option={radarOption!} height={340} />
        </Section>
        <Section eyebrow="TRAFFIC & POPULATION" title="客流与人口（万人次）">
          <EChart option={trafficOption!} height={340} />
        </Section>
      </div>

      {rentOption && (
        <Section eyebrow="RENT" title="租金水平（元/㎡/天，越低越好）">
          <EChart option={rentOption} height={220} />
        </Section>
      )}

      <Section
        eyebrow="KEY METRICS"
        title="关键指标对照"
        desc="绿色加粗为对比中最优；租金与竞品为「越低越好」。"
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>指标</th>
                {details.map((d, i) => (
                  <th key={d.id} style={{ textAlign: 'right' }}>
                    <span style={{ color: CHART_SERIES[i % CHART_SERIES.length] }}>{d.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricTableRows.map(({ def, values, best }) => (
                <tr key={def.key}>
                  <td>
                    {def.label}
                    {def.unit && (
                      <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                        {def.unit}
                      </Typography.Text>
                    )}
                  </td>
                  {values.map((v, i) => (
                    <td
                      key={i}
                      className={`mono${v !== undefined && v === best ? ' best-value' : ''}`}
                    >
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td>选址评分</td>
                {details.map((d) => (
                  <td key={d.id} style={{ textAlign: 'right' }}>
                    {d.score === null ? (
                      <span className="pill muted">—</span>
                    ) : (
                      <span className="pill accent">{d.score.toFixed(1)}</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="12 DIMENSIONS"
        title="维度对照"
        desc="点击行首箭头展开各商圈该维度的全文与数据来源。"
      >
        <Table
          size="middle"
          columns={dimTableColumns as never}
          dataSource={dimTableData as never}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowRender: (row: Record<string, unknown>) => (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${details.length}, minmax(0, 1fr))`,
                  gap: 16,
                }}
              >
                {details.map((d) => {
                  const det = row[d.id] as DimensionDetail | undefined;
                  return (
                    <div key={d.id}>
                      <Typography.Text
                        strong
                        style={{ color: CHART_SERIES[details.indexOf(d) % CHART_SERIES.length] }}
                      >
                        {d.name}
                      </Typography.Text>
                      {det && <ConfidenceTag level={det.confidence} />}
                      <div style={{ marginTop: 8 }}>
                        {det ? (
                          <>
                            <DimText detail={det} />
                            <SourceTags sources={det.sources} />
                          </>
                        ) : (
                          <Typography.Text type="secondary">缺数据</Typography.Text>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
            rowExpandable: (row: Record<string, unknown>) =>
              details.some((d) => row[d.id] !== undefined),
          }}
        />
      </Section>
    </div>
  );
}
