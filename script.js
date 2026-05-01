let charts = {};
let currentPatientId = localStorage.getItem('apsh_id');
let currentPatientName = localStorage.getItem('apsh_name');
let userBaseline = { sbp: 120, hr: 70 }; 

window.onload = () => {
    const now = new Date();
    document.getElementById('queryDate').value = now.toISOString().slice(0, 10);
    document.getElementById('measureTime').value = now.toISOString().slice(0, 16);
    if (currentPatientId) { updateUserUI(); switchPage('inputPage'); }
};

function toggleTag(btn) { btn.classList.toggle('selected'); }

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function updateUserUI() {
    document.getElementById('userDisplay').innerText = `👤 使用者：${currentPatientName} (ID: ${currentPatientId})`;
}

function logout() { localStorage.clear(); location.reload(); }

// 1. 登入邏輯[cite: 15]
async function loginWithAccount() {
    const idCard = document.getElementById('loginIdCard').value.toUpperCase();
    const inputPwd = document.getElementById('loginPassword').value;
    if (!idCard || !inputPwd) return alert("請輸入帳號密碼");
    try {
        const res = await fetch(`https://hapi.fhir.org/baseR4/Patient?identifier=${idCard}`);
        const bundle = await res.json();
        if (!bundle.entry) return alert("找不到帳號");
        const patient = bundle.entry[0].resource;
        const storedPwd = patient.extension.find(ext => ext.url === "http://my-system.com/password").valueString;
        if (inputPwd === storedPwd) {
            currentPatientId = patient.id;
            currentPatientName = patient.name[0].text;
            localStorage.setItem('apsh_id', currentPatientId);
            localStorage.setItem('apsh_name', currentPatientName);
            updateUserUI(); switchPage('inputPage');
        } else { alert("密碼錯誤"); }
    } catch (e) { alert("伺服器連線失敗"); }
}

// 2. 氣溫自動抓取 API[cite: 14]
async function autoFetchWeather() {
    if (!navigator.geolocation) {
        console.warn("瀏覽器不支援定位");
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        try {
            // 使用 Open-Meteo 免費 API 抓取即時氣溫[cite: 14]
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const data = await response.json();
            const temp = Math.round(data.current_weather.temperature);
            
            // 自動填入動態數值框[cite: 15]
            document.getElementById('dynamicVal').value = temp;
            console.log(`自動抓取成功：當前位置氣溫 ${temp}°C`);
        } catch (error) {
            console.error("氣象 API 請求失敗", error);
        }
    }, (err) => {
        console.warn("定位權限被拒絕或失敗");
    });
}

// 3. 動態欄位顯示：切換運動時觸發氣溫抓取[cite: 14, 15]
function toggleSportFields() {
    const sport = document.getElementById('sportType').value;
    const dynamicArea = document.getElementById('dynamicLabelArea');
    
    // 只有在慢跑或日常情境下才自動抓取氣溫[cite: 15]
    if (sport === 'Running' || sport === 'General') {
        dynamicArea.querySelector('label').innerText = "環境氣溫 (°C)";
        autoFetchWeather(); 
    } else if (sport === 'Weightlifting') {
        dynamicArea.querySelector('label').innerText = "RPE 強度 (1-10)";
        document.getElementById('dynamicVal').value = ""; // 清空供手動輸入
    } else if (sport === 'HIIT') {
        dynamicArea.querySelector('label').innerText = "1分鐘恢復心率差";
        document.getElementById('dynamicVal').value = "";
    }
}

// 4. 數據上傳 (組件化存儲)[cite: 15]
async function uploadData() {
    const sbp = Number(document.getElementById('sbp').value);
    const dbp = Number(document.getElementById('dbp').value);
    const hr = Number(document.getElementById('hr').value);
    const extraVal = Number(document.getElementById('dynamicVal').value);
    const sport = document.getElementById('sportType').value;
    const tags = Array.from(document.querySelectorAll('.tag-btn.selected')).map(t => t.dataset.val);

    const diag = getAdvancedDiagnosis(sbp, hr, sport, extraVal, tags.join(','), dbp);

    const obs = {
        resourceType: "Observation", status: "final",
        subject: { reference: `Patient/${currentPatientId}` },
        effectiveDateTime: new Date(document.getElementById('measureTime').value).toISOString(),
        component: [
            { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: sbp, unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: dbp, unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] }, valueQuantity: { value: hr, unit: "BPM" } },
            { code: { coding: [{ system: "http://lifestyle/tags" }] }, valueString: tags.join(',') },
            { code: { coding: [{ system: "http://loinc.org", code: "60832-3" }] }, valueQuantity: { value: extraVal, unit: "C" } }
        ],
        note: [{ text: sport }]
    };

    // 建立 Condition 風險記錄[cite: 15]
    if (diag.color === 'red' || diag.color === 'orange') {
        const cond = {
            resourceType: "Condition",
            subject: { reference: `Patient/${currentPatientId}` },
            code: { text: diag.riskLevel },
            severity: { text: diag.color === 'red' ? 'High' : 'Medium' }
        };
        await fetch("https://hapi.fhir.org/baseR4/Condition", {
            method: 'POST', headers: { 'Content-Type': 'application/fhir+json' },
            body: JSON.stringify(cond)
        });
    }

    const res = await fetch("https://hapi.fhir.org/baseR4/Observation", {
        method: 'POST', headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(obs)
    });
    
    if (res.ok) alert(`數據同步成功！診斷結果：${diag.riskLevel}`);
}

// 5. 智慧診斷引擎 (分析抓取到的氣溫)[cite: 15]
function getAdvancedDiagnosis(s, h, sport, extra, tags, d) {
    const pp = s - d; // 脈壓差分析[cite: 15]
    if (pp > 60) return { riskLevel: "⚠️ 脈壓差過大", color: "orange", advice: "脈壓差 > 60mmHg 顯示大動脈彈性降低，常見於高齡或動脈硬化。" };
    
    // 利用 API 抓取的氣溫進行熱應激判斷[cite: 15]
    if (extra >= 33 && s >= userBaseline.sbp * 1.1) {
        return { riskLevel: "🚨 熱應激風險", color: "red", advice: "氣溫高於 33°C 且血壓異常上升，請立即補水並停止戶外活動。" };
    }
    
    if (tags.includes('HighStress') && h >= userBaseline.hr * 1.2) {
        return { riskLevel: "🧠 壓力過載", color: "#3498db", advice: "偵測到壓力與心率連動升高，建議進行冥想或提早休息。" };
    }
    return { riskLevel: "✅ 數值穩定", color: "#27ae60", advice: "指標正常，請保持良好習慣。" };
}

// 6. 分析與圖表 (保留原有邏輯)[cite: 15]
async function fetchAndAnalyze() {
    const dateStr = document.getElementById('queryDate').value;
    const mode = document.getElementById('queryMode').value;
    const selDate = new Date(dateStr);
    const mon = new Date(selDate); mon.setDate(selDate.getDate() - (selDate.getDay() || 7) + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const start = mon.toISOString();
    const end = new Date(sun.setHours(23,59,59)).toISOString();

    const res = await fetch(`https://hapi.fhir.org/baseR4/Observation?subject=Patient/${currentPatientId}&date=ge${start}&date=le${end}&_sort=date`);
    const bundle = await res.json();
    const data = bundle.entry ? bundle.entry.map(i => i.resource) : [];

    if (data.length > 0) {
        userBaseline.sbp = Math.round(data.reduce((acc, d) => acc + d.component[0].valueQuantity.value, 0) / data.length);
    }

    if (mode === 'day') {
        document.getElementById('weekChartsSection').style.display = 'none';
        renderDayList(data.filter(d => d.effectiveDateTime.includes(dateStr)));
    } else {
        document.getElementById('dayListSection').innerHTML = "";
        document.getElementById('weekChartsSection').style.display = 'block';
        renderWeekAnalysis(data);
    }
}

function renderDayList(data) {
    const container = document.getElementById('dayListSection');
    container.innerHTML = "";
    data.forEach(d => {
        const sbp = d.component[0].valueQuantity.value;
        const dbp = d.component[1].valueQuantity.value;
        const hr = d.component[2].valueQuantity.value;
        const tags = d.component[3]?.valueString || "無標籤";
        const extra = d.component[4]?.valueQuantity.value || 0;
        const diag = getAdvancedDiagnosis(sbp, hr, d.note?.[0]?.text, extra, tags, dbp);

        container.innerHTML += `
            <div class="day-card" style="border-left-color: ${diag.color}">
                <div class="badge-risk" style="background:${diag.color}">${diag.riskLevel}</div>
                <strong>🕒 ${new Date(d.effectiveDateTime).toLocaleTimeString()}</strong>
                <div class="data-grid">
                    <div>SBP<br><b>${sbp}</b></div>
                    <div>DBP<br><b>${dbp}</b></div>
                    <div>HR<br><b>${hr}</b></div>
                    <div>脈壓<br><b>${sbp-dbp}</b></div>
                    <div>負荷/Temp<br><b>${extra}</b></div>
                </div>
            </div>`;
    });
}

function renderWeekAnalysis(data) {
    const labels = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
    let sbpAvg = Array(7).fill(0), loadAvg = Array(7).fill(0), counts = Array(7).fill(0);

    data.forEach(d => {
        const dayIdx = (new Date(d.effectiveDateTime).getDay() + 6) % 7;
        sbpAvg[dayIdx] += d.component[0].valueQuantity.value;
        loadAvg[dayIdx] += d.component[4]?.valueQuantity.value || 0;
        counts[dayIdx]++;
    });

    drawChart('chartBP', labels, [
        { label: '收縮壓', data: sbpAvg.map((v, i) => counts[i] ? Math.round(v/counts[i]) : 0), type: 'line', color: '#9e1b32', yAxisID: 'y' },
        { label: '外部負荷/氣溫', data: loadAvg.map((v, i) => counts[i] ? Math.round(v/counts[i]) : 0), type: 'bar', color: 'rgba(52, 152, 219, 0.2)', yAxisID: 'y1' }
    ]);
}

function drawChart(id, labels, datasets) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        data: { labels, datasets: datasets.map(d => ({ ...d, borderColor: d.color, backgroundColor: d.color, tension: 0.3 })) },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { 
                y: { type: 'linear', position: 'left' },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

function exportMedicalCard() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text("Health Summary (SOAP)", 20, 30);
    doc.setFontSize(12); doc.text(`Patient: ${currentPatientName} | Baseline SBP: ${userBaseline.sbp}`, 20, 45);
    doc.text("- Assessment: Stable with environmental tracking enabled.", 20, 60);
    doc.save(`APSH_Report_${currentPatientName}.pdf`);
}
