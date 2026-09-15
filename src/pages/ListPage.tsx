/** 商圈列表页：全量摘要索引 + 客户端筛选/排序/分页 + 对比篮勾选 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Input, Select, Space, Spin, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DistrictSummary } from '@/types';
import { loadIndex } from '@/data/loader';
import { useBasket, MAX_COMPARE } from '@/compare/BasketContext';
import { fmt, numSorter } from '@/utils/metrics';
import MetricCard from '@/components/MetricCard';
import Section from '@/components/Section';

function RatingPill({ v }: { v: string | null }) {
  if (!v) return <span className="pill muted">—</span>;
  const cls = v === 'A' ? 'good' : v === 'B' ? 'warn' : 'bad';
  return <span className={`pill ${cls}`}>{v}</span>;
}

export default function ListPage() {
  const [districts, setDistricts] = useState<DistrictSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState<string>();
  const [city, setCity] = useState<string>();
  const [rating, setRating] = useState<string>();
  const [keyword, setKeyword] = useState('');

  const basket = useBasket();

  useEffect(() => {
    loadIndex()
      .then((idx) => setDistricts(idx.districts))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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
      title: '评级',
      dataIndex: 'rating',
      width: 80,
      align: 'center',
      filters: [
        { text: 'A', value: 'A' },
        { text: 'B', value: 'B' },
        { text: 'C', value: 'C' },
      ],
      onFilter: (v, r) => r.rating === v,
      render: (v: string | null) => <RatingPill v={v} />,
    },
    {
      title: '周末客流',
      key: 'trafficWeekend',
      width: 110,
      align: 'right',
      sorter: (a, b) => numSorter(a.metrics.trafficWeekend, b.metrics.trafficWeekend),
      render: (_, r) => <span className="mono">{fmt(r.metrics.trafficWeekend)}</span>,
    },
    {
      title: '节假日峰值',
      key: 'trafficPeak',
      width: 110,
      align: 'right',
      sorter: (a, b) => numSorter(a.metrics.trafficPeak, b.metrics.trafficPeak),
      render: (_, r) => <span className="mono">{fmt(r.metrics.trafficPeak)}</span>,
    },
    {
      title: '3公里人口',
      key: 'pop3km',
      width: 110,
      align: 'right',
      sorter: (a, b) => numSorter(a.metrics.pop3km, b.metrics.pop3km),
      render: (_, r) => <span className="mono">{fmt(r.metrics.pop3km)}</span>,
    },
    {
      title: '租金',
      key: 'rent',
      width: 100,
      align: 'right',
      sorter: (a, b) => numSorter(a.metrics.rent, b.metrics.rent),
      render: (_, r) => <span className="mono">{fmt(r.metrics.rent)}</span>,
    },
    {
      title: '选址评分',
      dataIndex: 'score',
      width: 100,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => numSorter(a.score, b.score),
      render: (v: number | null) =>
        v === null ? (
          <span className="pill muted">—</span>
        ) : (
          <span className="pill accent">{v.toFixed(1)}</span>
        ),
    },
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
        <MetricCard eyebrow="TOTAL" value={districts.length} label="商圈总数" />
        <MetricCard eyebrow="FILTERED" value={filtered.length} label="筛选结果" />
        <MetricCard
          eyebrow="PROVINCES"
          value={new Set(districts.map((d) => d.province).filter(Boolean)).size}
          label="覆盖省份"
        />
        <MetricCard
          eyebrow="SCORABLE"
          value={`${districts.filter((d) => d.score !== null).length}/${districts.length}`}
          label="可评分商圈"
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
      </Section>

      <div className="panel" style={{ padding: '6px 6px 0' }}>
        <Table<DistrictSummary>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
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
