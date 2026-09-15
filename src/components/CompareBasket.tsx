/** 浮动对比篮：全局常驻，选中商圈后出现在底部（设计规范面板形态） */
import { useNavigate } from 'react-router-dom';
import { Button, Space, message } from 'antd';
import { MAX_COMPARE, useBasket } from '@/compare/BasketContext';

export default function CompareBasket() {
  const { items, remove, clear, isFull } = useBasket();
  const navigate = useNavigate();

  if (!items.length) return null;

  const goCompare = () => {
    if (items.length < 2) {
      message.warning('请至少选择 2 个商圈进行对比');
      return;
    }
    navigate(`/compare?ids=${items.map((x) => x.id).join(',')}`);
  };

  return (
    <div className="panel compare-basket" role="region" aria-label="对比篮">
      <span className="eyebrow" style={{ margin: 0 }}>
        COMPARE {items.length}/{MAX_COMPARE}
      </span>
      {items.map((x) => (
        <button key={x.id} type="button" className="pill accent" onClick={() => remove(x.id)} title="点击移除">
          {x.name} ×
        </button>
      ))}
      {isFull && <span className="pill muted">已达上限</span>}
      <Space size={8}>
        <Button size="small" type="primary" onClick={goCompare} disabled={items.length < 2}>
          开始对比
        </Button>
        <Button size="small" type="text" onClick={clear}>
          清空
        </Button>
      </Space>
    </div>
  );
}
