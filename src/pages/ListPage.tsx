/** 商圈列表页：全量摘要索引 + 客户端筛选/排序/分页 + 对比篮勾选；指标列可勾选显隐（localStorage 记忆） */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, Input, Select, Space, Spin, Table, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DistrictSummary } from '@/types';
import { loadIndex } from '@/data/loader';
import { useBasket, MAX_COMPARE } from '@/compare/BasketContext';
import { METRIC_DEFS, numSorter } from '@/utils/metrics';
import MetricCard from '@/components/MetricCard';
import MetricValue from '@/components/MetricValue';
import Section from '@/components/Section';

const FIELD_STORE_KEY = 'ta-list-fields';
/** 默认勾选的核心字段（一屏可容纳；选址评分默认不勾） */
const DEFAULT_FIELDS = ['trafficWeekday', 'trafficWeekend', 'trafficPeak', 'pop3km', 'brands'];
const isFieldKey = (k: string) => k === 'score' || METRIC_DEFS.some((d) => d.key === k);
const FIELD_OPTIONS = [
  ...METRIC_DEFS.map((d) => ({ label: d.label, value: d.key })),
  { label: '选址评分', value: 'score' },
];
/** 选址评分计算公式说明（列头问号悬停展示） */
const SCORE_FORMULA =
  '四因子加权百分位分（0-100）：客流 30%（内部按工作日 40%/周末 40%/节假日峰值 20% 合成）+ 3公里人口 20% + 客群匹配（A+B 类占比）15% + 停车便利（车位/万周末客流）10%。各因子先换算为在全体商圈中的百分位再加权；数据缺失的因子其权重按比例分摊给其余因子，全部缺失则无分。权重可在「选址排名」页调整。';

function RatingPill({ v }: { v: string | null }) {
  if (!v) return <span className="pill neutral">—</span>;
  const cls = v === 'S' ? 'violet' : v === 'B' ? 'warn' : v === 'C' ? 'bad' : 'good';
  return <span className={`pill ${cls}`}>{v} 级</span>;
}

/** 列头问号：悬停显示计算公式 */
function HelpMark({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <span
        style={{
          cursor: 'help',
          color: 'var(--faint)',
          fontSize: 11,
          border: '1px solid var(--border-strong)',
          borderRadius: '50%',
          width: 15,
          height: 15,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 4,
        }}
      >
        ？
      </span>
    </Tooltip>
  );
}

/** 数值列单元格：数字 + 可选推断警示标 */
function MetricCell({ v, inferred }: { v: number | undefined; inferred?: boolean }) {
  return (
    <span className="num">
      <MetricValue v={v} inferred={inferred} />
    </span>
  );
}

/** 读取本地存储的显隐字段，异常时回退默认 */
function loadVisibleFields(): string[] {
  try {
    const raw = localStorage.getItem(FIELD_STORE_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) {
      const valid = arr.filter((k): k is string => typeof k === 'string' && isFieldKey(k));
      if (valid.length) return valid;
    }
  } catch {
    // localStorage 不可用或内容损坏 → 默认
  }
  return DEFAULT_FIELDS;
}

export default function ListPage() {
  const [districts, setDistricts] = useState<DistrictSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState<string>();
  const [city, setCity] = useState<string>();
  const [rating, setRating] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [visibleFields, setVisibleFields] = useState<string[]>(loadVisibleFields);

  const basket = useBasket();

  useEffect(() => {
    loadIndex()
      .then((idx) => setDistricts(idx.districts))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FIELD_STORE_KEY, JSON.stringify(visibleFields));
    } catch {
      // 忽略持久化失败
    }
  }, [visibleFields]);

  const provinces = useMemo(() => {
    const set = new Map<string, number>();
    districts?.forEach((d) => {
      if (d.province) set.set(d.province, (set.get(d.province) ?? 0) + 1);
    });
    return [...set.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, c]) => ({ value: p, label: `${p}（${c}）` }));
  }, [districts]);

  const cities = useMemo(() => {
    if (!districts || !province) return [];
    const set = new Map<string, number>();
    districts
      .filter((d) => d.province === province && d.city)
      .forEach((d) => set.set(d.city, (set.get(d.city) ?? 0) + 1));
    return [...set.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => ({ value: c, label: `${c}（${n}）` }));
  }, [districts, province]);

  const filtered = useMemo(() => {
    if (!districts) return [];
    const kw = keyword.trim().toLowerCase();
    return districts.filter((d) => {
      if (province && d.province !== province) return false;
      if (city && d.city !== city) return false;
      if (rating && d.rating !== rating) return false;
      if (kw && !`${d.name} ${d.address} ${d.city}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [districts, province, city, rating, keyword]);

  const columns: ColumnsType<DistrictSummary> = [
    {
      title: '商圈',
      dataIndex: 'name',
      render: (name: string, r) => (
        <Link to={`/district/${r.id}`}>
          <Typography.Text strong>{name}</Typography.Text>
        </Link>
      ),
    },
    {
      title: '省市',
      key: 'region',
      width: 140,
      render: (_, r) => (
        <Typography.Text type="secondary">{r.city || r.province || '—'}</Typography.Text>
      ),
    },
    {
      title: '项目评级',
      dataIndex: 'rating',
      width: 90,
      align: 'center',
      filters: [
        { text: 'S', value: 'S' },
        { text: 'A+', value: 'A+' },
        { text: 'A', value: 'A' },
        { text: 'B', value: 'B' },
        { text: 'C', value: 'C' },
      ],
      onFilter: (v, r) => r.rating === v,
      render: (v: string | null) => <RatingPill v={v} />,
    },
    ...METRIC_DEFS.filter((d) => visibleFields.includes(d.key)).map((def) => ({
      title: def.label,
      key: def.key,
      width: def.unit ? 120 : 100,
      align: 'right' as const,
      sorter: (a: DistrictSummary, b: DistrictSummary) =>
        numSorter(a.metrics[def.key], b.metrics[def.key]),
      render: (_: unknown, r: DistrictSummary) => (
        <MetricCell v={r.metrics[def.key]} inferred={r.inferred?.[def.key]} />
      ),
    })),
    ...(visibleFields.includes('score')
      ? [
          {
            title: (
              <Space size={2}>
                <span>选址评分</span>
                <HelpMark text={SCORE_FORMULA} />
              </Space>
            ),
            dataIndex: 'score',
            key: 'score',
            width: 112,
            align: 'right' as const,
            defaultSortOrder: 'descend' as const,
            sorter: (a: DistrictSummary, b: DistrictSummary) => numSorter(a.score, b.score),
            render: (v: number | null) =>
              v === null ? (
                <span className="pill neutral">—</span>
              ) : (
                <span className="pill brand no-dot">{v.toFixed(1)} 分</span>
              ),
          },
        ]
      : []),
  ];

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="数据加载失败"
        description={`${error}。若尚未生成数据，请先运行 npm run etl。`}
      />
    );
  }
  if (!districts) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!districts.length) {
    return (
      <Alert
        type="warning"
        showIcon
        message="暂无数据"
        description="public/data/index.json 为空：请把商圈 xlsx 放入 data/raw/ 后运行 npm run etl。"
      />
    );
  }

  return (
    <div>
      <div className="metrics-grid">
        <MetricCard label="商圈总数" value={districts.length} />
        <MetricCard label="筛选结果" value={filtered.length} />
        <MetricCard
          label="覆盖省份"
          value={new Set(districts.map((d) => d.province).filter(Boolean)).size}
        />
        <MetricCard
          label="可评分商圈"
          value={`${districts.filter((d) => d.score !== null).length}/${districts.length}`}
        />
      </div>

      <Section style={{ padding: '13px 16px' }}>
        <Space wrap size={12}>
          <Select
            style={{ width: 190 }}
            placeholder="省份"
            allowClear
            showSearch
            options={provinces}
            value={province}
            onChange={(v) => {
              setProvince(v);
              setCity(undefined);
            }}
          />
          <Select
            style={{ width: 160 }}
            placeholder="城市"
            allowClear
            showSearch
            options={cities}
            value={city}
            onChange={setCity}
            disabled={!province}
          />
          <Select
            style={{ width: 100 }}
            placeholder="评级"
            allowClear
            options={['A', 'B', 'C'].map((r) => ({ value: r, label: r }))}
            value={rating}
            onChange={setRating}
          />
          <Input.Search
            style={{ width: 240 }}
            placeholder="搜索商圈名称 / 地址"
            allowClear
            onSearch={setKeyword}
            onChange={(e) => !e.target.value && setKeyword('')}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            勾选商圈加入对比篮（最多 {MAX_COMPARE} 个）
          </Typography.Text>
        </Space>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            显示字段
          </Typography.Text>
          <Checkbox.Group options={FIELD_OPTIONS} value={visibleFields} onChange={(vals) => setVisibleFields(vals as string[])} />
          <Button size="small" type="text" onClick={() => setVisibleFields(DEFAULT_FIELDS)}>
            恢复默认
          </Button>
        </div>
      </Section>

      <div className="panel" style={{ padding: '6px 6px 0' }}>
        <Table<DistrictSummary>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 620 + visibleFields.length * 118 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条 / 共 ${t} 条`,
          }}
          rowSelection={{
            selectedRowKeys: basket.items.map((x) => x.id),
            getCheckboxProps: (r) => ({
              disabled: basket.isFull && !basket.isSelected(r.id),
            }),
            onChange: (_, rows) => {
              if (rows.length > MAX_COMPARE) {
                message.warning(`最多选择 ${MAX_COMPARE} 个商圈`);
                return;
              }
              basket.items
                .filter((x) => !rows.some((r) => r.id === x.id))
                .forEach((x) => basket.remove(x.id));
              rows
                .filter((r) => !basket.isSelected(r.id))
                .forEach((r) => basket.toggle({ id: r.id, name: r.name }));
            },
          }}
        />
      </div>
    </div>
  );
}
