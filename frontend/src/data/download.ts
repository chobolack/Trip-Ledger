/**
 * 把文字存成檔案給使用者下載。
 *
 * 手機也通：Android Chrome 與 iOS Safari 都支援 <a download>，
 * 檔案會落在「下載」或「檔案」App 裡，再用那邊分享出去。
 */
export function downloadText(filename: string, text: string, mime: string): void {
  // CSV 前面補 BOM，否則 Excel 用 ANSI 開會把中文變亂碼。
  const payload = mime.startsWith('text/csv') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([payload], { type: `${mime};charset=utf-8` }));

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();

  // 立刻 revoke 在部分瀏覽器會讓下載中斷，隔一拍再放。
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
