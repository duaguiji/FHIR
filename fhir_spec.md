# 資料規格文件 (FHIR Data Specification)

## 1. 使用之 Resource 定義
本系統採用 **Observation** 資源作為多維度生理指標的載體，將相關連的數據（血壓、心率、氣溫）封裝在同一個資源實例中。

## 2. Observation 欄位詳細定義
| 欄位名稱 (Element) | 子欄位 | 說明 | 標準代碼 / 範例值 |
| :--- | :--- | :--- | :--- |
| **status** | - | 資料狀態 | `final` |
| **subject** | reference | 指向使用者 | `Patient/{ID}` |
| **effectiveDateTime** | - | 臨床有效時間 | ISO 8601 格式 |
| **valueQuantity** | - | 主數值 (血氧) | LOINC `2708-6` |
| **note** | text | 運動類別標籤 | 如: `Running`, `Swimming` |

### Component (多組件) 定義
為了在同一個量測事件中紀錄多項指標，我們使用了 component：
* **收縮壓 (SBP)**: LOINC `8480-6`, 單位 `mmHg`
* **舒張壓 (DBP)**: LOINC `8462-4`, 單位 `mmHg`
* **心率 (Heart Rate)**: LOINC `8867-4`, 單位 `BPM`
* **環境氣溫 (Temp)**: LOINC `60832-3`, 單位 `C`

## 3. 臨床警告評估標準 (Blood Pressure Levels)
系統內建之自動判斷邏輯遵循以下標準：
* **Normal**: SBP < 130 且 DBP < 85
* **Elevated (🟡)**: SBP 131-139 或 DBP 85-89
* **Stage 1 (🟠)**: SBP 140-159 或 DBP 90-99
* **Stage 2 (🔴)**: SBP 160-179 或 DBP 100-109
* **Emergency (🚨)**: SBP ≥ 180 或 DBP ≥ 110

## 4. 數據交互規範
* **Endpoint**: `https://hapi.fhir.org/baseR4/Observation`
* **Method**: `POST` (上傳資料), `GET` (查詢範圍資料)
* **Query Parameters**: 使用 `date=ge[start]` 與 `date=le[end]` 進行時間區間過濾。
