import s from './MenuButton.module.css';

interface Props {
  /** 中文主標。 */
  label: string;
  /** 英數副標，科技風的調味。 */
  sub: string;
  /** 右側附註，例如存檔數量。 */
  note?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function MenuButton({ label, sub, note, disabled, onClick }: Props) {
  return (
    <button type="button" className={s.btn} onClick={onClick} disabled={disabled}>
      <span className={s.frame} aria-hidden />
      <span className={s.cursor} aria-hidden>
        ▶
      </span>
      <span className={s.zh}>{label}</span>
      <span className={s.en}>{sub}</span>
      {note && <span className={s.note}>{note}</span>}
    </button>
  );
}
