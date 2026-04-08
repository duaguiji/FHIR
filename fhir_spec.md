資料規格文件 (FHIR Data Specification)
本專案採用 HL7 FHIR R4 標準作為運動生理數據交換格式。以下說明本系統所使用的資源 (Resources) 及其欄位定義。

1. 使用之 Resource 種類
本系統主要運用以下四種 Resource：

Patient: 使用者基本識別。

Observation: 核心運動生理指標（心率、血氧）。

Location: 運動量測發生之場域資訊。

Organization: 負責管理場館與資料之行政單位。
## 2. 詳細欄位定義 (Observation)
這是本系統最核心的資料格式，用於記錄運動後的生理狀態。

| 欄位名稱 (Element) | 子欄位 (Sub-element) | 說明 (Description) | 使用代碼/範例值 |
| :--- | :--- | :--- | :--- |
| **status** | - | 資料狀態 | `final` (代表已完成量測) |
| **category** | coding | 資料分類 | `vital-signs` (生命徵象) |
| **code** | coding | 量測項目標準代碼 | **心率**: LOINC `8867-4`<br>**血氧**: LOINC `2708-6` |
| **subject** | reference | 指向的使用者 | `Patient/{ID}` |
| **effectiveDateTime** | - | 量測時間 | ISO 8601 格式 |
| **valueQuantity** | value / unit | 量測數值與單位 | 例如: `98` / `%` 或 `75` / `BPM` |
| **note** | text | 系統產出的評估建議 | 「偵測到疲勞風險，請立即休息」 |
Gemini 說了
這份檔案 fhir_spec.md 是你的資料規格說明書。它的目的不是寫程式碼，而是要告訴評審：「在我的系統裡，我決定用哪些 FHIR 欄位來存資料，以及這些資料代表什麼意義。」

身為台科大電子系的學生，這份文件能展現你對資料結構與國際醫療標準的嚴謹度。以下我幫你寫好這份文件的內容，你可以直接複製並建立一個 fhir_spec.md 檔案。

資料規格文件 (FHIR Data Specification)
本專案採用 HL7 FHIR R4 標準作為運動生理數據交換格式。以下說明本系統所使用的資源 (Resources) 及其欄位定義。

1. 使用之 Resource 種類
本系統主要運用以下四種 Resource：

Patient: 使用者基本識別。

Observation: 核心運動生理指標（心率、血氧）。

Location: 運動量測發生之場域資訊。

Organization: 負責管理場館與資料之行政單位。

2. 詳細欄位定義 (Observation)
這是本系統最核心的資料格式，用於記錄運動後的生理狀態。

欄位名稱 (Element)	子欄位 (Sub-element)	說明 (Description)	使用代碼/範例值
status	-	資料狀態	final (代表已完成量測)
category	coding	資料分類	vital-signs (生命徵象)
code	coding	量測項目標準代碼	
心率: LOINC 8867-4


血氧: LOINC 2708-6

subject	reference	指向的使用者	Patient/{ID}
effectiveDateTime	-	量測時間	ISO 8601 格式 (如: 2026-04-08T...)
valueQuantity	value / unit	量測數值與單位	例如: 98 / % 或 75 / BPM
note	text	系統產出的評估建議	「偵測到疲勞風險，請立即休息」
3. 代碼系統 (Terminology / Coding)
為了確保跨系統的相容性，本專案採用以下國際標準代碼：

心率 (Heart Rate)
System: http://loinc.org

Code: 8867-4

Display: Heart rate

血氧飽和度 (SpO2)
System: http://loinc.org

Code: 2708-6

Display: Oxygen saturation in Arterial blood by Pulse oxymetry

4. 擴充欄位 (Extensions)
為了記錄運動發生的「場所」，我們在 Observation 中加入了場域資訊的擴充：

Extension URL: http://example.org/location

Value: 記錄使用者所在的 Location 代碼 (如: NTUST-Gym)。

5. 資料交互邏輯
系統會透過 HTTP POST 方法將封裝好的 JSON 傳送至 FHIR Server。

Endpoint: [大會提供之伺服器位址]/Observation

Header: Content-Type: application/fhir+json
