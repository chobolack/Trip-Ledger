import { useCountUp } from '../hooks/useCountUp';

interface Props {
  value: number;
  /** 把數字排成字串，例如 `fmtTwd`。滾動途中的每一格也用它排，所以千分位一直都在。 */
  format: (n: number) => string;
  duration?: number;
  delay?: number;
}

/**
 * 會滾動的金額。只是 `useCountUp` 的元件版——同一個畫面要滾好幾個數字時，
 * hook 不能放在條件式裡，包成元件才能自由擺。
 *
 * 讀螢幕的人拿到的是最終值（`aria-label`），不會聽到一串跳動的中間數字。
 */
export function CountUp({ value, format, duration, delay }: Props) {
  const shown = useCountUp(value, { duration, delay });
  return (
    <span aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}
