let charts = {};
let currentPatientId = localStorage.getItem('apsh_id');
let currentPatientName = localStorage.getItem('apsh_name');

// --- 介面初始化 ---
window.onload = () => {
    const now = new Date();
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
    
    // 限制時間選擇不可超過「當下」
    document.getElementById('measureTime').max = localISO.slice(0, 16);
    document.getElementById('measureTime').value = localISO.slice(0, 16);
    document.getElementById('regBirth').max = now.toISOString().slice(0, 10);
    document.getElementById('queryDate').max = now.toISOString().slice(0, 10);
    document.getElementById('queryDate').value = now.toISOString().slice(0, 10);

    if (currentPatientId) {
        updateUserUI();
        switchPage('inputPage');
    }
};

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function updateUserUI() {
    document.getElementById('userDisplay').innerText = `👤 使用者：${currentPatientName} (ID: ${currentPatientId})`;
}

function logout() {
    localStorage.clear();
    location.reload();
}

function getMonday(d) {
    d = new Date(d);
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// --- [C] Create Patient (註冊) ---
async function registerUser() {
    const name = document.getElementById('regName').value.trim();
    const gender = document.getElementById('regGender').value;
    const birth = document.getElementById('regBirth').value;

    if (!name) return alert("請輸入姓名");

    const patientData = {
        resourceType: "Patient",
        name: [{ text: name }],
        gender: gender,
        managingOrganization: { display: "國立臺灣科技大學電子系運動中心" }
    };
    if (birth) patientData.birthDate = birth;

    try {
        const res = await fetch("https://hapi.fhir.org/baseR4/Patient", {
            method: 'POST',
            headers: { 'Content-Type': 'application/fhir+json' },
            body: JSON.stringify(patientData)
        });
        const data = await res.json();
        if (res.ok) {
            currentPatientId = data.id;
            currentPatientName = name;
            localStorage.setItem('apsh_id', data.id);
            localStorage.setItem('apsh_name', name);
            updateUserUI();
            switchPage('inputPage');
            alert(`註冊成功！您的專屬 ID 為: ${data.id}`);
        }
    } catch (e) { alert("連線失敗"); }
}

// --- [R] Read Patient (登入驗證) ---
async function loginWithId() {
    const inputId = document.getElementById('loginId').value.trim();
    if (!inputId) return alert("請輸入 ID");
    try {
        const res = await fetch(`https://hapi.fhir.org/baseR4/Patient/${inputId}`);
        if (res.status === 404) return alert("找不到此 ID，請重新確認");
        const data = await res.json();
        currentPatientId = data.id;
        currentPatientName = data.name?.[0]?.text || "使用者";
        localStorage.setItem('apsh_id', currentPatientId);
        localStorage.setItem('apsh_name', currentPatientName);
        updateUserUI();
        switchPage('inputPage');
        alert(`歡迎回來，${currentPatientName}！`);
    } catch (e) { alert("驗證失敗"); }
}

// --- [C] Create Observation (上傳紀錄) ---
async function uploadData() {
    if (!currentPatientId) return alert("請先登入");
    const sbp = document.getElementById('sbp').value;
    const dbp = document.getElementById('dbp').value;
    const hr = document.getElementById('hr').value;
    const temp = document.getElementById('temp').value;
    const mTime = document.getElementById('measureTime').value;

    if (!sbp || !dbp || !hr) return alert("數據填寫不完整");

    const fhirObs = {
        resourceType: "Observation",
        status: "final",
        subject: { reference: `Patient/${currentPatientId}` },
        effectiveDateTime: new Date(mTime).toISOString(),
        component: [
            { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: Number(sbp), unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: Number(dbp), unit: "mmHg" } },
            { code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] }, valueQuantity: { value: Number(hr), unit: "BPM" } },
            { code: { coding: [{ system: "http://loinc.org", code: "60832-3" }] }, valueQuantity: { value: Number(temp), unit: "C" } }
        ],
        note: [{ text: document.getElementById('sportType').value }]
    };

    const res = await fetch("https://hapi.fhir.org/baseR4/Observation", {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(fhirObs)
    });
    if (res.ok) alert("✅ 數據已上傳至 FHIR 雲端伺服器");
}

// --- [R] Read Observation (查詢與診斷) ---
async function fetchAndAnalyze() {
    const dateStr = document.getElementById('queryDate').value;
    const mode = document.getElementById('queryMode').value;
    let start, end;
    const selDate = new Date(dateStr);

    if (mode === 'day') {
        start = new Date(selDate.setHours(0,0,0,0)).toISOString();
        end = new Date(selDate.setHours(23,59,59,999)).toISOString();
    } else {
        const mon = getMonday(selDate);
        mon.setHours(0,0,0,0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
        start = mon.toISOString(); end = sun.toISOString();
    }

    const res = await fetch(`https://hapi.fhir.org/baseR4/Observation?subject=Patient/${currentPatientId}&date=ge${start}&date=le${end}&_sort=date`);
    const bundle = await res.json();
    const data = bundle.entry ? bundle.entry.map(i => i.resource) : [];
    renderView(data, mode);
}

// --- 渲染分析視圖與 CDSS 邏輯 ---
function renderView(data, mode) {
    const adviceBox = document.getElementById('adviceBox');
    const daySection = document.getElementById('dayListSection');
    const weekSection = document.getElementById('weekChartsSection');
    let alerts = []; // 用於存放異常警訊
    daySection.innerHTML = "";

    if (data.length === 0) {
        adviceBox.innerHTML = "⚠️ 無量測歷史紀錄。";
        weekSection.style.display = "none";
        return;
    }

    if (mode === 'day') {
        weekSection.style.display = "none";
        daySection.style.display = "block";
        
        data.forEach(d => {
            const s = d.component[0].valueQuantity.value;
            const db = d.component[1].valueQuantity.value;
            const h = d.component[2].valueQuantity.value;
            const t = d.component[3].valueQuantity.value;
            const time = new Date(d.effectiveDateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const obsId = d.id;
            
            let res = getDiagnosis(s, db, h, t);

            // 如果該筆資料有異常 (Level >= 2)，記錄詳細警訊
            if (res.level >= 2) {
                alerts.push(`<strong>[${time} 異常提醒]</strong>：檢測到 <strong>${res.status}</strong> (${s}/${db} mmHg)。<br>💡 建議：${res.advice}`);
            }

            daySection.innerHTML += `
                <div class="day-card" style="border-left: 8px solid ${res.color}; background: #fff; margin-bottom: 15px; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" id="obs-${obsId}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>🕒 ${time} | 項目：${d.note?.[0]?.text || '一般'}</strong>
                        <button class="btn-delete" onclick="deleteObservation('${obsId}')" style="color:red; border:1px solid red; background:none; padding:2px 5px; cursor:pointer; border-radius:4px;">🗑️ 刪除</button>
                    </div>
                    <div style="display: flex; justify-content: space-around; margin-top: 10px; text-align: center;">
                        <div>血壓<div style="font-size: 1.2em; font-weight: bold;">${s}/${db}</div></div>
                        <div>心率<div style="font-size: 1.2em; font-weight: bold;">${h}</div></div>
                        <div>氣溫<div style="font-size: 1.2em; font-weight: bold;">${t}°C</div></div>
                    </div>
                </div>`;
        });

        // 顯示單日摘要建議
        if (alerts.length > 0) {
            adviceBox.innerHTML = `<div style="color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 8px;">
                                    <h4 style="margin-top: 0;">⚠️ 今日異常警訊紀錄：</h4>
                                    ${alerts.join('<hr style="border: 0; border-top: 1px solid #f5c6cb; margin: 10px 0;">')}
                                  </div>`;
            adviceBox.style.borderLeftColor = "red";
        } else {
            adviceBox.innerHTML = `<div style="color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px;">
                                    ✅ <strong>今日狀態穩定：</strong> 共有 ${data.length} 筆量測，生理指標均在正常範圍內。
                                  </div>`;
            adviceBox.style.borderLeftColor = "#28a745";
        }

    } else {
        // --- 週模式邏輯 ---
        daySection.style.display = "none";
        weekSection.style.display = "block";
        const weekDays = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
        let buckets = Array.from({length: 7}, () => ({s:[], db:[], h:[], t:[]}));

        data.forEach(d => {
            const date = new Date(d.effectiveDateTime);
            let idx = date.getDay() === 0 ? 6 : date.getDay() - 1;
            const s = d.component[0].valueQuantity.value;
            const db = d.component[1].valueQuantity.value;
            const h = d.component[2].valueQuantity.value;
            const t = d.component[3].valueQuantity.value;

            buckets[idx].s.push(s); buckets[idx].db.push(db);
            buckets[idx].h.push(h); buckets[idx].t.push(t);

            // 週模式掃描異常
            let res = getDiagnosis(s, db, h, t);
            if (res.level >= 2) {
                const time = new Date(d.effectiveDateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                alerts.push(`<strong>${weekDays[idx]} ${time}</strong>: ${res.status} (${s}/${db} mmHg)。💡 ${res.advice}`);
            }
        });

        let adviceHtml = `<strong>📊 週健康摘要與異常日期：</strong><br>`;
        if (alerts.length > 0) {
            adviceHtml += `<div style="margin-top:10px; padding:12px; background:#fff5f5; border:1px solid #ffcccc; border-radius:8px;">
                            <span style="color:red; font-weight:bold;">⚠️ 本週偵測到以下異常：</span><br>
                            <ul style="margin: 5px 0; padding-left: 20px;">
                                ${alerts.map(a => `<li style="margin-bottom:5px;">${a}</li>`).join('')}
                            </ul>
                          </div>`;
            adviceBox.style.borderLeftColor = "red";
        } else {
            adviceHtml += `<span style="color:var(--success);">✅ 本週生理數據均在安全範圍內。</span>`;
            adviceBox.style.borderLeftColor = "var(--success)";
        }
        adviceBox.innerHTML = adviceHtml;

        const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b)/arr.length) : null;
        drawChart('chartBP', weekDays, [{ label: '收縮壓', data: buckets.map(b => avg(b.s)), color: '#9e1b32' }, { label: '舒張壓', data: buckets.map(b => avg(b.db)), color: '#3498db' }]);
        drawChart('chartHR', weekDays, [{ label: '心率', data: buckets.map(b => avg(b.h)), color: '#27ae60' }]);
        drawChart('chartTemp', weekDays, [{ label: '氣溫', data: buckets.map(b => avg(b.t)), color: '#f39c12' }]);
    }
}

// --- [D] Delete Observation ---
async function deleteObservation(obsId) {
    if (!confirm("確定要移除這筆數據嗎？")) return;
    try {
        const res = await fetch(`https://hapi.fhir.org/baseR4/Observation/${obsId}`, { method: 'DELETE' });
        if (res.ok || res.status === 204) {
            alert("✅ 數據已移除");
            const element = document.getElementById(`obs-${obsId}`);
            if (element) element.remove();
            fetchAndAnalyze();
        }
    } catch (e) { alert("刪除失敗"); }
}

// --- 臨床級診斷引擎 ---
function getDiagnosis(s, db, h, t) {
    if (s >= 180 || db >= 110) return { level: 4, status: "🚨 緊急危急值", color: "#9e1b32", advice: "血壓極高！請停止一切活動並立即聯繫醫護或前往急診。" };
    if (s >= 160 || db >= 100) return { level: 3, status: "🔴 二級高血壓", color: "#d32f2f", advice: "應絕對停止訓練，靜坐休息，若持續未降請諮詢醫療人員。" };
    if (s >= 140 || db >= 90) return { level: 2, status: "🟠 一級高血壓", color: "#e67e22", advice: "建議調降訓練強度，休息 10 分鐘後再次確認數據。" };
    if (s > 130) return { level: 1, status: "🟡 偏高", color: "#f1c40f", advice: "目前生理負荷稍重，注意控制情緒與壓力。" };
    if (t > 33 && h > 155) return { level: 3, status: "🌡️ 熱衰竭預兆", color: "red", advice: "環境氣溫過高且心率異常，請立即移至陰涼處並補充水分。" };
    return { level: 0, status: "正常穩定", color: "#28a745", advice: "目前狀態優異，請繼續保持規律量測。" };
}

function drawChart(id, labels, datasets) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: 'line',
        data: { labels, datasets: datasets.map(d => ({ ...d, borderColor: d.color, tension: 0.3, spanGaps: true })) },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
