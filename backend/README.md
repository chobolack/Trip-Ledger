# 後端（尚未實作）

FastAPI ＋ SQLite，角色是**同步目標**，不是真實來源。
本機 IndexedDB 才是真實來源，所以前端先做、後端後做，不是偷工。

預計內容：

```
app/
  main.py        FastAPI 入口
  db.py          SQLite 連線與建表
  models.py      與 frontend/src/domain/types.ts 對應的資料表
  schemas.py     Pydantic 請求／回應
  routers/
    sync.py      推拉同步：帶 updatedAt 比大小，後寫者勝，刪除看 deletedAt 墓碑
```

同步協定要點（與前端 `src/data/repo.ts` 的設計綁在一起）：

- 每筆紀錄各自帶 `updatedAt`，衝突時後寫者勝。
- 推送帶上「上次同步時間」當游標，只送有變動的紀錄。
- ⚠ **刪除怎麼傳遞還沒定案。** 前端原本用墓碑（`deletedAt`），
  但 2026-11-09 使用者指定改成真的刪除，墓碑機制已拆掉。
  真要做同步時得重新決定：加回墓碑，或接受「刪除不同步」。
  見 [../docs/規格.md](../docs/規格.md) §5-2。

`Trip.ownerId` 與 `Expense.payerId` 是為多人共用預留的欄位，
現階段自用固定為 null，建表時要留著，見 [../docs/規格.md](../docs/規格.md) §6。
