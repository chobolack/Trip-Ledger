import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import s from './ScreenHeader.module.css';

interface Props {
  title: string;
  sub: string;
  /** 返回目的地。給 -1 代表回上一頁。 */
  backTo?: string;
  /** 右側動作區。 */
  actions?: ReactNode;
}

export function ScreenHeader({ title, sub, backTo, actions }: Props) {
  const nav = useNavigate();

  return (
    <header className={s.bar}>
      <button
        type="button"
        className={s.back}
        onClick={() => (backTo ? nav(backTo) : nav(-1))}
      >
        <span aria-hidden>◀</span> 返回
      </button>
      <span className={s.titles}>
        <span className={s.zh}>{title}</span>
        <span className={s.en}>{sub}</span>
      </span>
      {actions}
    </header>
  );
}
