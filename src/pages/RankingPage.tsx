/** 选址排名页：六因子权重可调（URL 分享），全量商圈实时重算排名 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Slider, Space, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DistrictSummary } from '@/types';
import { loadIndex } from '@/data/loader';
import {
  computeFactors,
  computeScore,
  DEFAULT_WEIGHTS,
  FACTOR_LABELS,
} from '@/scoring/model';
import type { FactorKey, ScoreWeights } from '@/scoring/model';
import Section from '@/components/Section';

const FACTOR_KEYS = Object.keys(FACTOR_LABELS) as FactorKey[];

/** 权重 ↔ URL：w=30,20,15,15,10,10 */
function parseWeights(raw: string | null): ScoreWeights {
  if (!raw) return { ...DEFAULT_WEIGHTS };
  const nums = raw.split(',').map(Number);
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n) || n < 0)) {
    return { ...DEFAULT_WEIGHTS };
  }
  const [traffic, pop, crowd, rent, competitor, parking] = nums;
  return { traffic, pop, crowd, rent, competitor, parking };
}

function RankPill({ rank }: { rank: number }) {
  const cls = rank === 1 ? 'good' : rank <= 3 ? 'brand' : 'neutral';
  return <span className={`pill ${cls} no-dot`}>#{rank}</span>;
}

export default function RankingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [districts, setDistricts] = useState<DistrictSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<ScoreWeights>(() => parseWeights(searchParams.get('w')));

  useEffect(() => {
    loadIndex()
      .then((idx) => setDistricts(idx.districts))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // 权重变化同步 URL（replace 避免污染历史）
  useEffect(() => {
    setSearchParams({ w: FACTOR_KEYS.map((k) => weights[k]).join(',') }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  const ranked = useMemo(() => {
    if (!districts) return [];
    return districts
      .map((d) => ({
        district: d,
        score: computeScore(d.metrics, d.percentiles, weights).score,
        factors: computeFactors(d.percentiles),
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [districts, weights]);

  const weightSum = FACTOR_KEYS.reduce((s, k) => s + weights[k], 0);

  const columns: ColumnsType<(typeof ranked)[number]> = [
    {
      title: '排名',
      width: 80,
      align: 'center',
      render: (_, __, i) => <RankPill rank={i + 1} />,
    },
    {
      title: '商圈',
      dataIndex: ['district', 'name'],
      render: (name: string, r) => (
        <Link to={`/district/${r.district.id}`}>
          <Typography.Text strong>{name}</Typography.Text>
        </Link>
      ),
    },
    {
      title: '省市',
      width: 120,
      render: (_, r) => (
        <Typography.Text type="secondary">
          {r.district.city || r.district.province || '—'}
        </Typography.Text>
      ),
    },
    {
      title: '综合评分',
      dataIndex: 'score',
      width: 110,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.score ?? -1) - (b.score ?? -1),
      render: (v: number | null) =>
        v === null ? <span className="pill neutral">—</span> : <span className="pill brand no-dot">{v.toFixed(1)} 分</span>,
    },
    ...FACTOR_KEYS.map((k) => ({
      title: FACTOR_LABELS[k],
      key: k,
      width: 100,
      align: 'right' as const,
      render: (_: unknown, r: (typeof ranked)[number]) => (
        <span className="num">
          {r.factors[k] === null ? '—' : (r.factors[k] as number).toFixed(0)}
        </span>
      ),
    })),
  ];

  if (error) {
    return <Alert type="error" showIcon message="数据加载失败" description={error} />;
  }
  if (!districts) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Section
        title="选址评分权重（服饰：成人装 + 童装）"
        desc="因子取值为该商圈在全体样本中的百分位分（0-100，逆向指标已翻转）。权重无需合计 100，自动归一；某因子数据缺失时其权重按比例分摊给其余因子。调整后的权重已写入网址，可直接分享。"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '18px 26px',
          }}
        >
          {FACTOR_KEYS.map((k) => (
            <div key={k}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {FACTOR_LABELS[k]}
                </Typography.Text>
                <span className="num" style={{ color: 'var(--faint)', fontSize: 12 }}>
                  {weights[k]}
                </span>
              </div>
              <Slider
                min={0}
                max={50}
                step={5}
                value={weights[k]}
                onChange={(v) => setWeights((w) => ({ ...w, [k]: v }))}
              />
            </div>
          ))}
        </div>
        <Space>
          <span className="num" style={{ color: 'var(--faint)', fontSize: 11 }}>
            当前权重合计 {weightSum}（自动归一为 100%）
          </span>
          <Button size="small" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>
            恢复默认
          </Button>
        </Space>
      </Section>

      <div className="panel" style={{ padding: '6px 6px 0' }}>
        <Table
          rowKey={(r) => r.district.id}
          size="middle"
          columns={columns}
          dataSource={ranked}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条 / 共 ${t} 条`,
          }}
        />
      </div>
    </div>
  );
}
