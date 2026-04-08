function processData() {
    const pId = document.getElementById('patientId').value;
    const loc = document.getElementById('location').value;
    const hr = document.getElementById('hr').value;
    const spo2 = document.getElementById('spo2').value;
    const resultDiv = document.getElementById('result');
    const fhirDiv = document.getElementById('fhirOutput');

    if (!pId || !hr || !spo2) {
        alert("請填寫完整資訊！");
        return;
    }

    // 1. 生理邏輯評估
    let advice = "";
    let statusClass = "";

    if (spo2 < 95) {
        advice = "⚠️ 警示：偵測到血氧飽和度偏低（" + spo2 + "%），請立即停止高強度運動，並坐下深呼吸休息。";
        statusClass = "warn";
    } else if (hr > 160) {
        advice = "💡 提醒：您目前心率較高（" + hr + " BPM），建議進行 10 分鐘緩和運動再結束。";
        statusClass = "warn";
    } else {
        advice = "✅ 狀態優異：您的生理數值恢復良好，記得適時補充水分！";
        statusClass = "success";
    }

    // 顯示結果
    resultDiv.innerHTML = advice;
    resultDiv.className = statusClass;
    resultDiv.style.display = "block";

    // 2. 轉換為 FHIR Observation JSON 格式
    const fhirObservation = {
        "resourceType": "Observation",
        "status": "final",
        "category": [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "vital-signs"
            }]
        }],
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "2708-6",
                "display": "Oxygen saturation"
            }]
        },
        "subject": { "reference": "Patient/" + pId },
        "effectiveDateTime": new Date().toISOString(),
        "valueQuantity": {
            "value": parseInt(spo2),
            "unit": "%",
            "system": "http://unitsofmeasure.org",
            "code": "%"
        },
        "note": [{ "text": advice }],
        "extension": [{
            "url": "http://example.org/location",
            "valueString": loc
        }]
    };

    // 顯示 JSON 預覽
    document.getElementById('jsonPreview').innerText = JSON.stringify(fhirObservation, null, 2);
    fhirDiv.style.display = "block";

    console.log("已產出 FHIR JSON:", fhirObservation);
}
