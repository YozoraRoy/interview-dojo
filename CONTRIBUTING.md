# 開發與變更流程規範（Contributing）

1. **Issue 先行：** 之後本專案任何流程修正、功能新增或 Bug 修復，**都必須先在 GitHub 建立對應的 Issue**（使用 `gh issue create` 或網頁介面），再開始修改程式碼。
2. **關聯提交：** Commit 訊息或結案留言應標註對應的 Issue 編號（例如 `Refs #1` 或 `Closes #1`），確認測試通過並推送後再關閉 Issue。
3. **資安紅線：**
   - 嚴禁將 `.env`、個人履歷、錄影、逐字稿或評分報告提交進本倉庫。
   - 提交前須確保本地 `gitleaks` pre-commit hook 掃描通過。
4. **測試驗證：** 提交前須通過 `node --test server/*.test.ts`。
