import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GridPulses } from './components/GridPulses';
import { AddExpenseScreen } from './screens/AddExpenseScreen';
import { DataScreen } from './screens/DataScreen';
import { NewSaveScreen } from './screens/NewSaveScreen';
import { SaveSlotsScreen } from './screens/SaveSlotsScreen';
import { TitleScreen } from './screens/TitleScreen';
import { TripScreen } from './screens/TripScreen';

/**
 * 用 HashRouter 而不是 BrowserRouter。
 *
 * GitHub Pages 是純靜態託管，沒有 SPA fallback——直接開 /saves 會拿到 404，
 * 因為伺服器上根本沒有那個檔案。hash 路由把路徑放在 # 後面，
 * 伺服器永遠只看到 index.html，不會有這個問題。
 * 裝到手機桌面後是全螢幕開啟，使用者也看不到網址列。
 */
export function App() {
  return (
    <HashRouter>
      <GridPulses />
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/new" element={<NewSaveScreen />} />
        <Route path="/saves" element={<SaveSlotsScreen />} />
        <Route path="/data" element={<DataScreen />} />
        <Route path="/trip/:id" element={<TripScreen />} />
        <Route path="/trip/:id/add" element={<AddExpenseScreen />} />
        {/* 修改跟新增共用同一個畫面：欄位完全一樣，分兩份遲早會改一邊忘一邊。 */}
        <Route path="/trip/:id/edit/:expenseId" element={<AddExpenseScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
