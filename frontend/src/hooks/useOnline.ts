import { useEffect, useState } from 'react';

/**
 * 是否連得上網路。
 *
 * 只用來顯示狀態與決定要不要嘗試同步——記帳本身永遠走本機，離線也能記。
 * `navigator.onLine` 只知道「有沒有連到網路」，不保證後端活著，
 * 真正的同步成敗由同步層回報。
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
