let charts = {};

// 初始化
window.onload = () => {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('measureTime').value = localNow.toISOString().slice(0, 16);
    document.getElementById('queryDate').value = now.toISOString().slice(0, 10);
};

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

// 獲取該週週一
function getMonday(d) {
    d = new Date(d);
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// 1. 同步資料 (FHIR POST)
async function uploadData() {
    const pId = document.getElementById('patientId').value.trim();
    const sbp = document.getElementById('sbp').value;
    const dbp = document.getElementById('dbp').value;
    const hr = document.getElementById('hr').value;
    const temp = document.getElementById('temp').value;
    const sport = document.getElementById('sportType').value;
    const mTime = document.getElementById('measureTime').value;

    if(!pId || !sbp || !dbp || !hr) return alert("請完整填寫數據！");

    const fhirObs = {
        resourceType: "Observation",
        status: "final",
        subject: { reference: `Patient/${pId}` },
        effectiveDateTime: new Date(mTime).toISOString(),
        component: [
            { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: Number(sbp), unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: Number(dbp), unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] }, valueQuantity: { value: Number(hr), unit: "BPM" } },
            { code: { coding: [{ system: "http://loinc.org", code: "60832-3" }] }, valueQuantity: { value: Number(temp), unit: "C" } }
        ],
        note: [{ text: sport }]
    };

    try {
        const res = await fetch("https://hapi.fhir.org/baseR4/Observation", {
            method: 'POST',
            headers: { 'Content-Type': 'application/fhir+json' },
            body: JSON.stringify(fhirObs)
        });
        if (res.ok) alert("✅ 同步成功！");
    } catch (e) { alert("同步失敗"); }
}

// 2. 獲取並診斷
async function fetchAndAnalyze() {
    const pId = document.getElementById('queryId').value.trim();
    const dateStr = document.getElementById('queryDate').value;
    const mode = document.getElementById('queryMode').value;

    if (!pId || !dateStr) return alert("請輸入 ID 與日期");

    let start, end;
    const selDate = new Date(dateStr);

    if (mode === 'day') {
        start = new Date(new Date(dateStr).setHours(0,0,0,0)).toISOString();
        end = new Date(new Date(dateStr).setHours(23,59,59,999)).toISOString();
    } else {
        const mon = getMonday(selDate);
        mon.setHours(0,0,0,0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
        start = mon.toISOString(); end = sun.toISOString();
    }

    document.getElementById('resultContent').style.display = "block";
    const response = await fetch(`https://hapi.fhir.org/baseR4/Observation?subject=Patient/${pId}&date=ge${start}&date=le${end}&_sort=date&_count=50`);
    const bundle = await response.json();
    const data = bundle.entry ? bundle.entry.map(i => i.resource) : [];

    renderView(data, mode);
}

// 3. 診斷與渲染 (整合週警報與日清單)
function renderView(data, mode) {
    const adviceBox = document.getElementById('adviceBox');
    const daySection = document.getElementById('dayListSection');
    const weekSection = document.getElementById('weekChartsSection');
    
    daySection.innerHTML = "";
    if (data.length === 0) {
        adviceBox.innerHTML = "⚠️ 此時段無資料紀錄。";
        weekSection.style.display = "none";
        return;
    }

    let weekAlerts = []; // 用來存放所有發現的異常

    if (mode === 'day') {
        // --- 單日列表模式 ---
        weekSection.style.display = "none";
        daySection.style.display = "block";

        data.forEach(d => {
            const s = d.component.find(c => c.code.coding[0].code === '8480-6').valueQuantity.value;
            const db = d.component.find(c => c.code.coding[0].code === '8462-4').valueQuantity.value;
            const h = d.component.find(c => c.code.coding[0].code === '8867-4').valueQuantity.value;
            const t = d.component.find(c => c.code.coding[0].code === '60832-3').valueQuantity.value;
            const time = new Date(d.effectiveDateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            
            // 診斷顏色
            let statusColor = "var(--success)";
            if (s >= 160 || db >= 100) statusColor = "red";
            else if (s >= 140 || db >= 90) statusColor = "orange";

            daySection.innerHTML += `
                <div class="day-card" style="border-left-color: ${statusColor}">
                    <div class="card-header">
                        <strong>🕒 時間：${time} | 運動：${d.note?.[0]?.text || "一般"}</strong>
                    </div>
                    <div class="data-grid">
                        <div class="data-item">血壓<div class="data-value">${s}/${db}</div></div>
                        <div class="data-item">心率<div class="data-value">${h}</div></div>
                        <div class="data-item">氣溫<div class="data-value">${t}°C</div></div>
                    </div>
                </div>
            `;
        });
        adviceBox.innerHTML = `<strong>📅 今日摘要：</strong> 已顯示今日所有量測明細。`;

    } else {
        // --- 週圖表模式 (補回週警報) ---
        daySection.style.display = "none";
        weekSection.style.display = "block";
        
        const weekDays = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
        let buckets = Array.from({length: 7}, () => ({sbp:[], dbp:[], hr:[], temp:[], sports:[]}));

        // 掃描每一筆資料，計算平均並抓取異常
        data.forEach(d => {
            const date = new Date(d.effectiveDateTime);
            let idx = date.getDay() === 0 ? 6 : date.getDay() - 1;
            const dayName = weekDays[idx];

            const s = d.component.find(c => c.code.coding[0].code === '8480-6').valueQuantity.value;
            const db = d.component.find(c => c.code.coding[0].code === '8462-4').valueQuantity.value;
            const h = d.component.find(c => c.code.coding[0].code === '8867-4').valueQuantity.value;
            const t = d.component.find(c => c.code.coding[0].code === '60832-3').valueQuantity.value;

            // 放入籃子算平均
            buckets[idx].sbp.push(s); buckets[idx].dbp.push(db);
            buckets[idx].hr.push(h); buckets[idx].temp.push(t);

            // 🔍 補回的週警報邏輯
            if (s >= 180 || db >= 110) weekAlerts.push(`🚨 ${dayName}: 【緊急】血壓達急症值 (${s}/${db})！`);
            else if (s >= 160 || db >= 100) weekAlerts.push(`🔴 ${dayName}: 【危險】二級高血壓 (${s}/${db})`);
            else if (s >= 140 || db >= 90) weekAlerts.push(`🟠 ${dayName}: 【警告】一級高血壓 (${s}/${db})`);
            if (h > 180) weekAlerts.push(`🚩 ${dayName}: 心率過高 (${h} BPM)`);
            if (t > 33 && h > 150) weekAlerts.push(`🌡️ ${dayName}: 高溫運動熱衰竭風險`);
        });

        const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b)/arr.length) : null;
        const sbpList = buckets.map(b => avg(b.sbp));
        const dbpList = buckets.map(b => avg(b.dbp));
        const hrList = buckets.map(b => avg(b.hr));
        const tempList = buckets.map(b => avg(b.temp));

        // 渲染警告文字
        let adviceHtml = `<strong>📊 週分析報告：</strong><br>`;
        if (weekAlerts.length > 0) {
            const unique = [...new Set(weekAlerts)];
            adviceHtml += `<div style="margin-top:10px; padding:10px; background:#fff5f5; border:1px solid #ffcccc; border-radius:8px;">`;
            unique.forEach(msg => {
                let color = msg.includes("🚨") || msg.includes("🔴") ? "red" : "orange";
                adviceHtml += `<div style="color:${color}; font-weight:bold; font-size:14px;">${msg}</div>`;
            });
            adviceHtml += `</div>`;
            adviceBox.style.borderLeftColor = "red";
        } else {
            adviceHtml += `<span style="color:var(--success);">✅ 本週生理數據全數正常。</span>`;
            adviceBox.style.borderLeftColor = "var(--success)";
        }
        adviceBox.innerHTML = adviceHtml;

        // 繪圖
        drawChart('chartBP', weekDays, [
            { label: '收縮壓', data: sbpList, color: '#9e1b32' },
            { label: '舒張壓', data: dbpList, color: '#3498db' }
        ]);
        drawChart('chartHR', weekDays, [{ label: '心率', data: hrList, color: '#27ae60' }]);
        drawChart('chartTemp', weekDays, [{ label: '氣溫', data: tempList, color: '#f39c12' }]);
    }
}

function drawChart(id, labels, datasets) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: 'line',
        data: { labels: labels, datasets: datasets.map(d => ({ ...d, borderColor: d.color, tension: 0.3, spanGaps: true })) },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
