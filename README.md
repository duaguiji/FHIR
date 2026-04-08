隊伍名稱：(蓋章批准)
作品名稱：AnyPlace Sport-Health (APSH) - 跨場域運動生理監測與自動化評估系統
1. 專案簡介
本專案針對民眾在不同運動場所（如學校健身房、國民運動中心等）運動後，缺乏生理數值管理與專業評估的痛點。透過本系統，使用者可即時登記運動後的血氧、心率等關鍵數據。系統將數據轉換為 FHIR 國際標準格式 進行儲存，並結合生理變動邏輯，給予使用者即時的運動負荷建議與健康警示。

2. 競賽必要資訊
主題領域： 運動健康 / 預防醫學

使用者角色： * 運動民眾： 登記運動數值、查看生理變動評估與即時運動建議。

場域管理員/教練： 透過系統監測場內使用者狀態，預防過度運動風險。

核心 FHIR Resources：

Patient: 儲存運動者基本資訊（如學號、年齡、性別）。

Observation: 核心數據容器，記錄運動後的血氧 (SpO2) 與心率 (Heart Rate)。

Location: 標記不同的運動場所（如：台科大健身房、體育館）。

Organization: 管理場館的單位資訊。

3. 系統流程說明
本系統遵循以下自動化處理流程：

身分識別：使用者登入並選擇當前運動所在的 Location。

數值採集：輸入運動後測得之血氧與心率。

標準化轉換：系統將原始數據封裝為符合 FHIR 規範之 Observation JSON 格式。

即時評估：系統判定數值變動（例如：血氧是否低於 95%），並給予「建議休息」或「體能優異」之反饋。

雲端同步：將資料 POST 至大會指定的 FHIR Server 進行存儲。

4. 資料格式範例 (FHIR Observation)
系統產出的血氧量測資料格式如下：

JSON
{
  "resourceType": "Observation",
  "status": "final",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "2708-6",
      "display": "Oxygen saturation in Arterial blood by Pulse oxymetry"
    }]
  },
  "subject": { "reference": "Patient/example-user" },
  "valueQuantity": {
    "value": 94,
    "unit": "%",
    "system": "http://unitsofmeasure.org",
    "code": "%"
  },
  "note": [{ "text": "建議：偵測到疲勞風險，請立即坐下休息。" }]
}
5. 如何執行 (How to Run)
環境要求
瀏覽器 (Chrome / Edge / Safari)

VS Code

Live Server 擴充功能

執行步驟
1.Clone 本 Repository 到您的電腦。

2.使用 VS Code 開啟資料夾。

3.在 index.html 檔案上點擊右鍵，選擇 「Open with Live Server」。

4.網頁開啟後即可進行模擬操作。
