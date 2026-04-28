let charts = {};
let currentPatientId = localStorage.getItem('apsh_id');
let currentPatientName = localStorage.getItem('apsh_name');

window.onload = () => {
    const now = new Date();
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

// 登入邏輯
async function loginWithAccount() {
    const idCard = document.getElementById('loginIdCard').value.toUpperCase();
    const inputPwd = document.getElementById('loginPassword').value;

    if (!idCard || !inputPwd) return alert("請輸入帳號密碼");

    try {
        const res = await fetch(`https://hapi.fhir.org/baseR4/Patient?identifier=${idCard}`);
        const bundle = await res.json();

        if (!bundle.entry || bundle.total === 0) return alert("找不到該帳號");

        const patient = bundle.entry[0].resource;
        const storedPwd = patient.extension.find(ext => ext.url === "http://my-system.com/password").valueString;

        if (inputPwd === storedPwd) {
            currentPatientId = patient.id;
            currentPatientName = patient.name[0].text;
            localStorage.setItem('apsh_id', currentPatientId);
            localStorage.setItem('apsh_name', currentPatientName);
            updateUserUI();
            switchPage('inputPage');
        } else {
            alert("密碼錯誤！");
        }
    } catch (e) {
        alert("登入失敗。");
    }
}

// 動態欄位顯示
function toggleSportFields() {
    const sport = document.getElementById('sportType').value;
    document.getElementById('recordSection').style.display = sport ? 'block' : 'none';
    document.querySelectorAll('.dynamic-group').forEach(g => g.style.display = 'none');
    if (sport) {
        const target = (sport === 'Weightlifting') ? 'groupWeightlifting' : `group${sport}`;
        if (document.getElementById(target)) document.getElementById(target).style.display = 'block';
    }
}

// 氣溫自動讀取
function autoGetWeather(targetId) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            try {
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const data = await response.json();
                const temp = data.current_weather.temperature;
                document.getElementById(targetId).value = Math.round(temp);
            } catch (error) {
                alert("天氣抓取失敗。");
            }
        }, () => {
            alert("無法取得定位，請手動輸入。");
        });
    } else {
        alert("瀏覽器不支援定位功能。");
    }
}

// 數據上傳
async function uploadData() {
    if (!currentPatientId) return alert("請先登入");
    const sport = document.getElementById('sportType').value;
    const sbp = Number(document.getElementById('sbp').value);
    const dbp = Number(document.getElementById('dbp').value);
    const hr = Number(document.getElementById('hr').value);
    const mTime = document.getElementById('measureTime').value;

    if (!sbp || !dbp || !hr) return alert("數據不完整");

    let components = [
        { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: sbp, unit: "mmHg" } },
        { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: dbp, unit: "mmHg" } },
        { code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] }, valueQuantity: { value: hr, unit: "BPM" } }
    ];

    if (sport === 'Swimming') {
        const spo2 = Number(document.getElementById('spo2').value);
        components.push({ code: { coding: [{ system: "http://loinc.org", code: "2708-6" }] }, valueQuantity: { value: spo2, unit: "%" } });
    } else if (sport === 'Running' || sport === 'Cycling') {
        const tempId = sport === 'Running' ? 'runTemp' : 'cycleTemp';
        const temp = Number(document.getElementById(tempId).value);
        components.push({ code: { coding: [{ system: "http://loinc.org", code: "60832-3" }] }, valueQuantity: { value: temp, unit: "C" } });
    } else if (sport === 'HIIT') {
        const rec = Number(document.getElementById('recoveryHr').value);
        components.push({ code: { coding: [{ code: "recovery" }] }, valueQuantity: { value: rec, unit: "BPM" } });
    } else if (sport === 'Weightlifting') {
        const rpe = Number(document.getElementById('rpe').value);
        components.push({ code: { coding: [{ system: "http://loinc.org", code: "11451-2" }] }, valueQuantity: { value: rpe, unit: "score" } });
    }

    const observation = {
        resourceType: "Observation", status: "final",
        subject: { reference: `Patient/${currentPatientId}` },
        effectiveDateTime: new Date(mTime).toISOString(),
        component: components, note: [{ text: sport }]
    };

    const res = await fetch("https://hapi.fhir.org/baseR4/Observation", {
        method: 'POST', headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(observation)
    });
    if (res.ok) alert("數據已成功同步！");
}

// 分析與診斷
async function fetchAndAnalyze() {
    const dateStr = document.getElementById('queryDate').value;
    const filter = document.getElementById('filterSport').value;
    const mode = document.getElementById('queryMode').value;
    const selDate = new Date(dateStr);
    let start, end;

    if (mode === 'day') {
        start = new Date(selDate.setHours(0,0,0,0)).toISOString();
        end = new Date(selDate.setHours(23,59,59,999)).toISOString();
    } else {
        const mon = new Date(selDate);
        mon.setDate(selDate.getDate() - (selDate.getDay() || 7) + 1);
        mon.setHours(0,0,0,0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
        start = mon.toISOString(); end = sun.toISOString();
    }

    const res = await fetch(`https://hapi.fhir.org/baseR4/Observation?subject=Patient/${currentPatientId}&date=ge${start}&date=le${end}&_sort=date`);
    const bundle = await res.json();
    let data = bundle.entry ? bundle.entry.map(i => i.resource) : [];
    if (filter !== 'all') data = data.filter(obs => obs.note?.[0]?.text === filter);
    renderView(data, mode);
}

function renderView(data, mode) {
    const daySection = document.getElementById('dayListSection');
    const weekSection = document.getElementById('weekChartsSection');
    daySection.innerHTML = "";

    if (mode === 'day') {
        weekSection.style.display = 'none';
        daySection.style.display = 'block';
        data.forEach(d => {
            const sport = d.note?.[0]?.text || "一般";
            const sbp = d.component.find(c => c.code.coding[0].code === '8480-6').valueQuantity.value;
            const dbp = d.component.find(c => c.code.coding[0].code === '8462-4').valueQuantity.value;
            const hr = d.component.find(c => c.code.coding[0].code === '8867-4').valueQuantity.value;
            const temp = d.component.find(c => c.code.coding[0].code === '60832-3')?.valueQuantity?.value || '--';

            let details = {};
            d.component.forEach(c => details[c.code.coding[0].code] = c.valueQuantity.value);
            let diag = getDetailedDiagnosis(sbp, dbp, hr, sport, details);

            daySection.innerHTML += `
                <div class="day-card" style="border-left-color: ${diag.color}">
                    <strong>🕒 ${new Date(d.effectiveDateTime).toLocaleTimeString()} | ${sport}</strong>
                    <div class="data-grid">
                        <div>血壓<br><strong>${sbp}/${dbp}</strong></div>
                        <div>心率<br><strong>${hr}</strong></div>
                        <div>氣溫<br><strong>${temp}°C</strong></div>
                    </div>
                    <div class="diag-box">🩺 <strong>分析建議：</strong>${diag.advice}</div>
                </div>`;
        });
    } else {
        daySection.style.display = 'none';
        weekSection.style.display = 'block';
        renderWeekCharts(data);
    }
}

// 智慧建議引擎
function getDetailedDiagnosis(s, db, h, sport, details) {
    if (s >= 160 || db >= 100) return { status: "危急", color: "#d32f2f", advice: "生理壓力極大，請立即停止訓練。" };
    
    // 特定運動建議
    if (sport === 'Swimming' && details['2708-6'] < 95) {
        return { status: "血氧低", color: "#f39c12", advice: "游泳後血氧偵測不足，請加強深呼吸恢復。" };
    }
    if (sport === 'HIIT' && details['recovery'] < 15) {
        return { status: "心肺疲勞", color: "#f39c12", advice: "心率恢復速度較慢，代表心臟負荷尚未緩解，建議拉長間歇休息。" };
    }
    if (sport === 'Weightlifting' && details['11451-2'] >= 9) {
        return { status: "神經過載", color: "#f39c12", advice: "自覺強度極高，代表神經系統疲勞，建議減輕重量避免過度訓練。" };
    }
    if ((sport === 'Running' || sport === 'Cycling') && details['60832-3'] >= 32) {
        return { status: "熱應激風險", color: "#f39c12", advice: "高溫環境下運動血壓反應明顯，請立即補水並注意體溫。" };
    }

    return { status: "良好", color: "#27ae60", advice: "生理反應正常，體能狀況穩定適應中。" };
}

// 週趨勢繪圖
function renderWeekCharts(data) {
    const labels = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
    let buckets = Array.from({length: 7}, () => ({ s: [], h: [] }));
    data.forEach(d => {
        const date = new Date(d.effectiveDateTime);
        let idx = (date.getDay() + 6) % 7;
        const sbp = d.component.find(c => c.code.coding[0].code === '8480-6').valueQuantity.value;
        const hr = d.component.find(c => c.code.coding[0].code === '8867-4').valueQuantity.value;
        buckets[idx].s.push(sbp);
        buckets[idx].h.push(hr);
    });
    const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b)/arr.length) : null;
    drawChart('chartBP', labels, [{ label: '平均收縮壓', data: buckets.map(b => avg(b.s)), color: '#9e1b32' }], 'mmHg');
    drawChart('chartHR', labels, [{ label: '平均心跳', data: buckets.map(b => avg(b.h)), color: '#27ae60' }], 'BPM');
}

function drawChart(id, labels, datasets, unit) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: 'line',
        data: { labels, datasets: datasets.map(d => ({ ...d, borderColor: d.color, tension: 0.3, spanGaps: true })) },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: unit } } } }
    });
}
