# 钱迹原始数据（2026-11-06 批次）

2026-11-06 从钱迹 App 导出的「初始账本」，是重建本账本的原始输入，按批次分子目录保存。

**不入库**：`apps/api/prisma/dev.db` 本身被 `.gitignore` 忽略（账本不入库），因此本目录的 CSV/JSON 同样只保留本机；需要时按下文「重新获取」导出。

## qianji-import-2026-11-06/

| 文件 | 内容 |
| --- | --- |
| `qianji-converted.zip` | 转换后的导入包（`config.json` + `manifest.json` + `transactions.csv`），与同目录解开后的三个文件一致 |
| `transactions.csv` | 3291 行交易（含表头共 3292 行），UTF-8 BOM，18 列；重建脚本的唯一交易输入 |
| `mapping.json` | CSV 列 → MoneyBrain 字段的映射与类型规则（金额/日期/账户/分类等） |
| `config.json` | 钱迹账户分类配置：12 个账户、4 个分类（现金/资产/投资等） |
| `manifest.json` | 导出清单：`transactions=3291`、`accounts=12`、`categories=4`，导出于 2026-11-06T10:49:35Z |

## qianji-opening-2026-11-06/

| 文件 | 内容 |
| --- | --- |
| `transactions.csv` | 期初导入批次使用的 CSV，与 `qianji-import-2026-11-06/transactions.csv` 同源（SHA256 完全一致） |

## 重放

```powershell
node --import tsx scripts/rebuild-from-qianji.mts --csv data/qianji/qianji-import-2026-11-06/transactions.csv
```

脚本默认写 `apps/api/prisma/dev-rebuild.db`，并拒绝写 `dev.db` / `test.db`。**89 条历史平帐的权威数据源是 `scripts/data/qianji-rebuild-adjustments.json`（已入库）**，重建口径以脚本注释与该 JSON 为准；逐月对账锚点与推导过程见 git 历史（`efba1b7` 附近）。

## 校验值（SHA256）

```text
08F312977F7ABA3D1D67B620C86069465A41F80B906B2EBE3F43FEF8B03B2BC5  transactions.csv（两个批次相同）
2D65CAC4FE8F73BFF60EB2608F56F688CBD0A0B90A4AADB2549820A4AB5115A4  mapping.json
094A7393CD9BE7C0C059067BCE6580F9FF0A7FDA15D81CF35D72B787795FAE78  config.json
9F925F973BEF71AC905282C7F1D5BC62F877352BDE0ED60ADF19681CB3EA2D4F  manifest.json
F53F8B2BE57EE327A53353C940B0E182A70D2D20E20E7216E2CB24DBBB71FAD3  qianji-converted.zip
```

## 重新获取

钱迹 App → 设置 → 导出/备份 → 导出「初始账本」CSV，得到 `..._QianJi_初始账本_2026-11-06_184058.csv`（18 列、UTF-8 BOM、3291 行）；导入包的 `config.json` / `manifest.json` / `mapping.json` 由转换流程生成，字段规则见 `mapping.json`。
