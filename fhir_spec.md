# 資料規格文件 (FHIR Data Specification)

## 1. 使用之 Resource 種類
* **Patient**: 記錄使用者基本識別（姓名、性別、生日）及管理組織。
* **Observation**: 核心運動生理指標（血壓多組件、心率、氣溫）。

## 2. 詳細欄位定義 (Observation)
| 欄位名稱 (Element) | 子欄位 | 說明 | 標準代碼 / 範例值 |
| :--- | :--- | :--- | :--- |
| **status** | - | 資料狀態 | `final` |
| **subject** | reference | 指向使用者 | `Patient/{ID}` |
| **effectiveDateTime** | - | 臨床有效時間 | 不可選未來日期 |
| **component** | coding | 血壓/心率/氣溫 | LOINC 相關代碼 |

### 臨床警告評估標準 (CDSS Logic)
系統對 `Observation` 的診斷邏輯參考國際標準：

| 等級 | 診斷狀態 | 顏色識別 | 處置建議範例 |
| :--- | :--- | :--- | :--- |
| **Level 4** | 🚨 緊急危急值 | `#9e1b32` | 血壓極高！請停止活動並立即就醫。 |
| **Level 3** | 🔴 二級高血壓 | `#d32f2f` | 應絕對停止訓練，靜坐休息。 |
| **Level 2** | 🟠 一級高血壓 | `#e67e22` | 建議調降訓練強度，休息後再確認。 |
| **Level 1** | 🟡 偏高 | `#f1c40f` | 生理負荷稍重，注意訓練壓力。 |
| **Heat Risk**| 🌡️ 熱衰竭預兆 | `red` | 高溫環境且心率過快，立即補水。 |

## 3. 數據交互規範 (RESTful)
* **Create (POST)**: `.../Patient` 或 `.../Observation`
* **Read (GET)**: `.../Patient/{id}` 或 `.../Observation?subject=Patient/{id}`
* **Delete (DELETE)**: `.../Observation/{id}` (用於數據修正機制)
