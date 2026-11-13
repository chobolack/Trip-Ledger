# Trip-Ledger

旅費記帳。React ＋ TypeScript ＋ Vite 前端（離線優先 PWA），FastAPI ＋ SQLite 後端。

接手前先讀規格，尤其是「待確認」與「預留但不做」兩節——
不要把預留欄位當成廢欄位刪掉，也不要替使用者決定還沒定案的事。

@docs/規格.md

@docs/問題清單.md

## 架構紀律

- **離線優先**：本機 IndexedDB 是真實來源，後端只是同步目標。
  畫面永遠不等網路，記帳在離線時必須照常運作。
- **刪除就是真的刪除**：直接從 IndexedDB 移除，不寫墓碑（使用者 2026-11-09 指定，
  理由與代價見 `docs/規格.md` §5-2）。`deletedAt` 欄位要留著——舊備份檔還帶著它，
  匯入時要讀得懂才能忽略——但本機寫入時永遠是 `null`。
- **資料只走 `src/data/repo.ts`**：畫面不直接開 IndexedDB。
- **樣式分層**：`src/styles/` 放設計變數與全域基本元件（`.input`、`.btnPri` 等），
  元件專屬樣式一律放各自的 `*.module.css`，不要往全域加。
- **匯率集中**：外幣換台幣的邏輯只能有一個出口。方案未定案前不要散落在各畫面。

## 執行

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
cd frontend && npm run build                 # tsc -b + vite build
cd frontend && npm test                      # 驗算 src/domain/ 的計算規則，改 money.ts 後要跑
```

`npm run lint`（oxlint）在這台機器被 Windows Application Control 擋住原生執行檔，
目前靠 `tsc -b` 把關型別。
