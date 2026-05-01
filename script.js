const FHIR_BASE_URL = 'https://hapi.fhir.org/baseR4';
const GEMINI_API_KEY = localStorage.getItem('gemini_api_key') || 'YOUR_API_KEY';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const APSH_CODE_SYSTEM = 'https://apsh.example.org/fhir/CodeSystem/observation-code';
const OBSERVATION_FIELDS = {
    sbp: {
        label: '收縮壓',
        meaning: '運動前後量測到的動脈收縮壓，不是脈搏或壓力感受',
        unit: 'mmHg',
        codes: ['8480-6']
    },
    dbp: {
        label: '舒張壓',
        meaning: '運動前後量測到的動脈舒張壓，不是脈搏或壓力感受',
        unit: 'mmHg',
        codes: ['8462-4']
    },
    hr: {
        label: '心率',
        meaning: '量測當下每分鐘心跳數，需搭配運動類型和環境溫度判讀',
        unit: 'BPM',
        codes: ['8867-4']
    },
    ambientTemp: {
        label: '環境溫度',
        meaning: '使用者運動環境或所在位置的氣溫，不是體溫，也不能用來判斷發燒',
        unit: '°C',
        codes: ['ambient-temperature', '60832-3']
    }
};

let charts = {};
let currentPatientId = localStorage.getItem('apsh_id');
let currentPatientName = localStorage.getItem('apsh_name');
let consultMessages = [];
let consultProfile = null;
let consultStarted = false;
let consultRecordCache = [];

window.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
    const localDate = localISO.slice(0, 10);

    applySavedTheme();
    setValue('measureTime', localISO.slice(0, 16));
    setAttribute('measureTime', 'max', localISO.slice(0, 16));
    setAttribute('regBirth', 'max', localDate);
    setAttribute('queryDate', 'max', localDate);
    setValue('queryDate', localDate);
    setValue('consultRecordStart', localDate);
    setValue('consultRecordEnd', localDate);
    toggleOtherSportInput();

    if (currentPatientId) {
        updateUserUI();
    } else {
        switchPage('authPage');
    }
});

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
}

function setAttribute(id, name, value) {
    const element = document.getElementById(id);
    if (element) element.setAttribute(name, value);
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');

    document.querySelectorAll('#navLinks button').forEach(button => button.classList.remove('active'));
    const navButton = document.getElementById('nav' + pageId.charAt(0).toUpperCase() + pageId.slice(1));
    if (navButton) navButton.classList.add('active');

    updateNavigation();
}

function updateNavigation() {
    const isLoggedIn = Boolean(currentPatientId);
    document.getElementById('navAuthPage').style.display = isLoggedIn ? 'none' : 'inline-block';
    document.getElementById('navInputPage').style.display = isLoggedIn ? 'inline-block' : 'none';
    document.getElementById('navQueryPage').style.display = isLoggedIn ? 'inline-block' : 'none';
    document.getElementById('navConsultPage').style.display = isLoggedIn ? 'inline-block' : 'none';
    document.getElementById('navProfile').style.display = isLoggedIn ? 'inline-block' : 'none';
    document.getElementById('navLogout').style.display = isLoggedIn ? 'inline-block' : 'none';
}

function applySavedTheme() {
    const theme = localStorage.getItem('apsh_theme') || 'default';
    document.body.classList.toggle('theme-peach', theme === 'peach');
    updateThemeToggleText();
}

function toggleTheme() {
    const isPeach = document.body.classList.toggle('theme-peach');
    localStorage.setItem('apsh_theme', isPeach ? 'peach' : 'default');
    updateThemeToggleText();
}

function updateThemeToggleText() {
    const button = document.getElementById('themeToggle');
    if (!button) return;

    button.textContent = document.body.classList.contains('theme-peach') ? '預設風格' : '米杏風格';
}

function updateUserUI() {
    document.getElementById('userDisplay').innerText = `目前使用者：${currentPatientName || '未命名'} (FHIR ID: ${currentPatientId})`;
    switchPage('inputPage');
}

function showPersonalInfo() {
    if (!currentPatientId) {
        switchPage('authPage');
        return;
    }

    switchPage('profilePage');
    loadProfileInfo();
}

async function loadProfileInfo() {
    const profileContent = document.getElementById('profileContent');
    
    try {
        profileContent.innerHTML = '<div style="text-align: center;"><div style="font-size: 18px; color: var(--muted-text);">載入個人資訊中...</div></div>';
        
        const response = await fetch(`${FHIR_BASE_URL}/Patient/${currentPatientId}`);
        if (!response.ok) throw new Error(`查詢失敗 (${response.status})`);
        
        const patient = await response.json();
        
        // 提取個人資訊
        const name = patient.name?.[0]?.text || '未命名';
        const gender = patient.gender || '未提供';
        const birthDate = patient.birthDate || '未提供';
        const idCard = patient.identifier?.find(id => id.system === 'http://www.moi.gov.tw/')?.value || '未提供';
        const contactInfo = patient.telecom?.[0] || null;
        const address = patient.address?.[0] || null;
        
        // 計算年齡
        let age = '未計算';
        if (birthDate && birthDate !== '未提供') {
            const birth = new Date(birthDate);
            const today = new Date();
            age = today.getFullYear() - birth.getFullYear();
            if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
                age--;
            }
            age = age + ' 歲';
        }
        
        // 轉換性別為中文
        const genderText = {
            'male': '男性',
            'female': '女性',
            'other': '其他',
            'unknown': '未提供'
        }[gender] || gender;
        
        // 構建 HTML
        let html = `
            <h3>基本資訊</h3>
            <div class="data-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">姓名</label>
                    <span class="data-value">${name}</span>
                </div>
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">身分證字號</label>
                    <span class="data-value" style="font-size: 18px;">${idCard}</span>
                </div>
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">FHIR ID</label>
                    <span class="data-value" style="font-size: 16px;">${currentPatientId}</span>
                </div>
            </div>

            <h3 style="margin-top: 30px;">生理資訊</h3>
            <div class="data-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">生理性別</label>
                    <span class="data-value" style="font-size: 18px;">${genderText}</span>
                </div>
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">生日</label>
                    <span class="data-value" style="font-size: 16px;">${birthDate}</span>
                </div>
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">年齡</label>
                    <span class="data-value" style="font-size: 20px;">${age}</span>
                </div>
            </div>
        `;
        
        // 新增聯絡資訊
        if (contactInfo) {
            const contactType = {
                'phone': '電話',
                'email': '電子郵件',
                'url': '網址'
            }[contactInfo.system] || contactInfo.system;
            html += `
                <h3 style="margin-top: 30px;">聯絡資訊</h3>
                <div class="data-grid">
                    <div class="data-item">
                        <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">${contactType}</label>
                        <span class="data-value" style="font-size: 16px;">${contactInfo.value}</span>
                    </div>
                </div>
            `;
        }
        
        // 新增地址資訊
        if (address) {
            const addressText = [
                address.line?.join(' '),
                address.city,
                address.district,
                address.country
            ].filter(Boolean).join(' ');
            
            html += `
                <h3 style="margin-top: 30px;">地址</h3>
                <div style="padding: 15px; background: var(--surface); border-radius: var(--border-radius); border-left: 4px solid var(--info);">
                    ${addressText || '未提供'}
                </div>
            `;
        }
        
        // 新增系統資訊
        html += `
            <h3 style="margin-top: 30px;">系統資訊</h3>
            <div class="data-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                <div class="data-item">
                    <label style="color: var(--muted-text); font-size: 14px; margin: 0 0 8px 0;">帳戶建立日期</label>
                    <span class="data-value" style="font-size: 14px;">${patient.meta?.lastUpdated?.slice(0, 10) || '未知'}</span>
                </div>
            </div>
        `;
        
        profileContent.innerHTML = html;
    } catch (error) {
        console.error('載入個人資訊失敗:', error);
        profileContent.innerHTML = `
            <div style="padding: 20px; background: #f8d7da; border-radius: var(--border-radius); border-left: 4px solid #dc3545; color: #721c24;">
                <strong>載入失敗</strong><br>
                ${error.message}<br>
                <button class="btn btn-secondary" style="margin-top: 10px;" onclick="loadProfileInfo()">重新嘗試</button>
            </div>
        `;
    }
}

function refreshProfileInfo() {
    loadProfileInfo();
}

function logout() {
    localStorage.removeItem('apsh_id');
    localStorage.removeItem('apsh_name');
    currentPatientId = null;
    currentPatientName = null;
    updateNavigation();
    switchPage('authPage');
}

async function registerUserWithAccount() {
    const name = document.getElementById('regName').value.trim();
    const idCard = document.getElementById('regIdCard').value.trim().toUpperCase();
    const password = document.getElementById('regPassword').value;
    const gender = document.getElementById('regGender').value;
    const birth = document.getElementById('regBirth').value;

    if (!name || !idCard || !password || !birth) {
        alert('請完整填寫註冊資料。');
        return;
    }

    if (!checkIdCardFormat(idCard)) {
        alert('身分證字號格式不正確，請輸入例如 A123456789。');
        return;
    }

    if (!checkPasswordStrength(password)) {
        alert('密碼至少 8 碼，且需包含大寫英文、小寫英文與數字。');
        return;
    }

    const patientData = {
        resourceType: 'Patient',
        name: [{ text: name }],
        gender,
        birthDate: birth,
        identifier: [{
            system: 'http://www.moi.gov.tw/',
            value: idCard
        }],
        extension: [{
            url: 'http://my-system.com/password',
            valueString: password
        }]
    };

    try {
        const response = await fetch(`${FHIR_BASE_URL}/Patient`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/fhir+json' },
            body: JSON.stringify(patientData)
        });
        const data = await response.json();

        if (!response.ok || !data.id) {
            throw new Error(data.issue?.[0]?.diagnostics || 'FHIR 建立 Patient 失敗');
        }

        alert(`註冊成功！FHIR Patient ID：${data.id}\n請使用身分證字號與密碼登入。`);
        document.getElementById('loginIdCard').value = idCard;
        document.getElementById('loginPassword').value = '';
    } catch (error) {
        console.error('註冊失敗:', error);
        alert(`註冊失敗：${error.message}`);
    }
}

async function loginWithAccount() {
    const idCard = document.getElementById('loginIdCard').value.trim().toUpperCase();
    const inputPassword = document.getElementById('loginPassword').value;

    if (!idCard || !inputPassword) {
        alert('請輸入身分證字號與密碼。');
        return;
    }

    try {
        const response = await fetch(`${FHIR_BASE_URL}/Patient?identifier=${encodeURIComponent(idCard)}`);
        if (!response.ok) throw new Error(`FHIR 查詢失敗 (${response.status})`);

        const bundle = await response.json();
        const patient = bundle.entry?.[0]?.resource;

        if (!patient) {
            alert('查無此帳號，請先註冊。');
            return;
        }

        const storedPassword = patient.extension?.find(extension => extension.url === 'http://my-system.com/password')?.valueString;
        if (inputPassword !== storedPassword) {
            alert('密碼錯誤。');
            return;
        }

        currentPatientId = patient.id;
        currentPatientName = patient.name?.[0]?.text || idCard;
        localStorage.setItem('apsh_id', currentPatientId);
        localStorage.setItem('apsh_name', currentPatientName);
        updateUserUI();
    } catch (error) {
        console.error('登入失敗:', error);
        alert(`登入失敗：${error.message}`);
    }
}

async function uploadData() {
    if (!currentPatientId) {
        alert('請先登入。');
        return;
    }

    const sbp = Number(document.getElementById('sbp').value);
    const dbp = Number(document.getElementById('dbp').value);
    const hr = Number(document.getElementById('hr').value);
    const ambientTemp = Number(document.getElementById('temp').value);
    const measureTime = document.getElementById('measureTime').value;
    const sportText = getSelectedSportText();

    if (!sbp || !dbp || !hr || !measureTime) {
        alert('請完整輸入血壓、心率與測量時間。');
        return;
    }

    if (!sportText) {
        alert('請輸入其他運動名稱。');
        return;
    }

    const validationMessage = validateMeasurementInput(sbp, dbp, hr, ambientTemp, measureTime);
    if (validationMessage) {
        alert(validationMessage);
        return;
    }

    const observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: { reference: `Patient/${currentPatientId}` },
        effectiveDateTime: new Date(measureTime).toISOString(),
        component: [
            { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: sbp, unit: 'mmHg' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: dbp, unit: 'mmHg' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] }, valueQuantity: { value: hr, unit: 'BPM' } },
            { code: { coding: [{ system: APSH_CODE_SYSTEM, code: 'ambient-temperature', display: 'Ambient temperature' }] }, valueQuantity: { value: ambientTemp, unit: 'Cel', code: 'Cel' } }
        ],
        note: [{ text: sportText }]
    };

    try {
        const response = await fetch(`${FHIR_BASE_URL}/Observation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/fhir+json' },
            body: JSON.stringify(observation)
        });

        if (!response.ok) throw new Error(`FHIR 上傳失敗 (${response.status})`);
        document.getElementById('queryDate').value = measureTime.slice(0, 10);
        alert('健康資料已上傳到 FHIR。');
    } catch (error) {
        console.error('上傳失敗:', error);
        alert(`上傳失敗：${error.message}`);
    }
}

async function fetchAndAnalyze() {
    if (!currentPatientId) {
        alert('請先登入。');
        return;
    }

    const dateStr = document.getElementById('queryDate').value;
    const mode = document.getElementById('queryMode').value;
    const selectedDate = parseLocalDate(dateStr);
    let start;
    let end;

    if (mode === 'day') {
        start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);
    } else {
        const monday = getMonday(selectedDate);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        start = monday;
        end = sunday;
    }

    try {
        const data = await fetchPatientObservations(start, end);
        renderView(data, mode);
    } catch (error) {
        console.error('查詢失敗:', error);
        alert(`查詢失敗：${error.message}`);
    }
}

async function fetchPatientObservations(start, end) {
    const params = new URLSearchParams({
        subject: `Patient/${currentPatientId}`,
        date: `ge${start.toISOString()}`,
        _sort: 'date',
        _count: '100'
    });
    params.append('date', `le${end.toISOString()}`);

    let url = `${FHIR_BASE_URL}/Observation?${params.toString()}`;
    const observations = [];

    while (url) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`FHIR 查詢失敗 (${response.status})`);

        const bundle = await response.json();
        observations.push(...(bundle.entry || []).map(item => item.resource));

        const nextLink = bundle.link?.find(link => link.relation === 'next')?.url;
        url = nextLink || '';
    }

    return observations
        .filter(record => record?.subject?.reference === `Patient/${currentPatientId}`)
        .filter(record => {
            const time = new Date(record.effectiveDateTime);
            return time >= start && time <= end;
        })
        .sort((a, b) => new Date(a.effectiveDateTime) - new Date(b.effectiveDateTime));
}

function renderView(data, mode) {
    const adviceBox = document.getElementById('adviceBox');
    const daySection = document.getElementById('dayListSection');
    const weekSection = document.getElementById('weekChartsSection');
    const geminiBox = document.getElementById('geminiBox');
    daySection.innerHTML = '';
    if (geminiBox) geminiBox.style.display = 'none';

    if (data.length === 0) {
        adviceBox.innerHTML = '此期間尚無健康紀錄。';
        weekSection.style.display = 'none';
        return;
    }

    if (mode === 'day') {
        weekSection.style.display = 'none';
        daySection.style.display = 'block';

        const alerts = [];
        data.forEach(record => {
            const values = readObservationValues(record);
            const diagnosis = getDiagnosis(values.sbp, values.dbp, values.hr, values.ambientTemp);
            const time = new Date(record.effectiveDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (diagnosis.level >= 2) {
                alerts.push(`${time} ${diagnosis.status}：${diagnosis.advice}`);
            }

            daySection.insertAdjacentHTML('beforeend', `
                <div class="day-card" style="border-left-color: ${diagnosis.color};" id="obs-${record.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap: 12px; margin-bottom: 15px; flex-wrap: wrap;">
                        <strong>${time} | 運動：${formatSportType(record.note?.[0]?.text)} | ${diagnosis.status}</strong>
                        <button class="btn btn-danger" onclick="deleteObservation('${record.id}')" style="font-size: 12px; padding: 6px 12px;">刪除</button>
                    </div>
                    <div class="data-grid">
                        <div class="data-item"><div>血壓</div><span class="data-value">${formatMeasurement(values.sbp, '')}/${formatMeasurement(values.dbp, '')}</span></div>
                        <div class="data-item"><div>心率</div><span class="data-value">${formatMeasurement(values.hr, '')}</span></div>
                        <div class="data-item"><div>環境溫度</div><span class="data-value">${formatMeasurement(values.ambientTemp, '°C')}</span></div>
                    </div>
                </div>
            `);
        });

        if (alerts.length) {
            adviceBox.style.borderLeftColor = 'red';
            adviceBox.innerHTML = `<strong>今日提醒</strong><ul>${alerts.map(alert => `<li>${alert}</li>`).join('')}</ul>`;
        } else {
            adviceBox.style.borderLeftColor = '#28a745';
            adviceBox.innerHTML = `共 ${data.length} 筆紀錄，未偵測到明顯高風險數值。`;
        }
        renderGeminiResponse(data, mode);
        return;
    }

    daySection.style.display = 'none';
    weekSection.style.display = 'block';
    renderWeekView(data, adviceBox);
    renderGeminiResponse(data, mode);
}

function renderWeekView(data, adviceBox) {
    const weekDays = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
    const buckets = Array.from({ length: 7 }, () => ({ sbp: [], dbp: [], hr: [], ambientTemp: [] }));
    const alerts = [];

    data.forEach(record => {
        const date = new Date(record.effectiveDateTime);
        const index = date.getDay() === 0 ? 6 : date.getDay() - 1;
        const values = readObservationValues(record);
        const diagnosis = getDiagnosis(values.sbp, values.dbp, values.hr, values.ambientTemp);

        buckets[index].sbp.push(values.sbp);
        buckets[index].dbp.push(values.dbp);
        buckets[index].hr.push(values.hr);
        buckets[index].ambientTemp.push(values.ambientTemp);

        if (diagnosis.level >= 2) {
            alerts.push(`${weekDays[index]} ${diagnosis.status}：${values.sbp}/${values.dbp} mmHg`);
        }
    });

    const avg = values => {
        const validValues = values.filter(value => Number.isFinite(value));
        return validValues.length ? Math.round(validValues.reduce((sum, value) => sum + value, 0) / validValues.length) : null;
    };

    if (alerts.length) {
        adviceBox.style.borderLeftColor = 'red';
        adviceBox.innerHTML = `<strong>一週風險提醒</strong><ul>${alerts.map(alert => `<li>${alert}</li>`).join('')}</ul>`;
    } else {
        adviceBox.style.borderLeftColor = '#28a745';
        adviceBox.innerHTML = `本週共 ${data.length} 筆紀錄，未偵測到明顯高風險數值。`;
    }

    drawChart('chartBP', weekDays, [
        { label: '收縮壓', data: buckets.map(bucket => avg(bucket.sbp)), color: '#9e1b32' },
        { label: '舒張壓', data: buckets.map(bucket => avg(bucket.dbp)), color: '#3498db' }
    ]);
    drawChart('chartHR', weekDays, [
        { label: '心率', data: buckets.map(bucket => avg(bucket.hr)), color: '#27ae60' }
    ]);
    drawChart('chartTemp', weekDays, [
        { label: '環境溫度', data: buckets.map(bucket => avg(bucket.ambientTemp)), color: '#f39c12' }
    ]);
}

async function deleteObservation(obsId) {
    if (!confirm('確定要刪除此筆健康資料嗎？')) return;

    try {
        const response = await fetch(`${FHIR_BASE_URL}/Observation/${obsId}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 204) {
            throw new Error(`FHIR 刪除失敗 (${response.status})`);
        }

        const element = document.getElementById(`obs-${obsId}`);
        if (element) element.remove();
        alert('資料已刪除。');
    } catch (error) {
        console.error('刪除失敗:', error);
        alert(`刪除失敗：${error.message}`);
    }
}

function readObservationValues(record) {
    return {
        sbp: findComponentValue(record, OBSERVATION_FIELDS.sbp.codes, 0),
        dbp: findComponentValue(record, OBSERVATION_FIELDS.dbp.codes, 1),
        hr: findComponentValue(record, OBSERVATION_FIELDS.hr.codes, 2),
        ambientTemp: findComponentValue(record, OBSERVATION_FIELDS.ambientTemp.codes, 3)
    };
}

function findComponentValue(record, codes, fallbackIndex) {
    const component = record.component?.find(item =>
        item.code?.coding?.some(coding => codes.includes(coding.code))
    ) || record.component?.[fallbackIndex];

    const value = Number(component?.valueQuantity?.value);
    return Number.isFinite(value) ? value : null;
}

async function renderGeminiResponse(data, mode) {
    const geminiBox = document.getElementById('geminiBox');
    const geminiContent = document.getElementById('geminiContent');
    if (!geminiBox || !geminiContent) return;

    geminiBox.style.display = 'block';

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') {
        geminiContent.innerHTML = '尚未設定 Gemini API Key。請在 script.js 設定 GEMINI_API_KEY，或在瀏覽器 Console 執行 localStorage.setItem("gemini_api_key", "你的 API Key") 後重新整理。';
        return;
    }

    geminiContent.textContent = '正在透過AI分析這次查詢結果...';

    try {
        const prompt = buildGeminiPrompt(data, mode);
        const result = await generateGeminiContent(prompt);

        const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
        geminiContent.textContent = text || 'Gemini 沒有回傳可顯示的內容。';
    } catch (error) {
        console.error('Gemini 分析失敗:', error);
        geminiContent.textContent = `Gemini 分析失敗：${error.message}`;
    }
}

async function generateGeminiContent(prompt) {
    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            const result = await response.json();
            if (response.ok) return result;

            lastError = new Error(`${model}: ${result.error?.message || `Gemini API 回傳 ${response.status}`}`);
        } catch (error) {
            lastError = new Error(`${model}: ${error.message}`);
        }
    }

    throw lastError || new Error('沒有可用的 Gemini 模型。');
}

async function startMedicalConsultation() {
    consultProfile = readConsultProfile();
    const chatWindow = document.getElementById('consultChatWindow');
    if (!chatWindow) return;

    if (!consultProfile.symptoms) {
        alert('請先輸入主要症狀，AI 才能進行初步諮詢。');
        return;
    }

    consultMessages = [];
    consultStarted = false;
    chatWindow.innerHTML = '';
    const profileText = buildConsultProfileText(consultProfile);
    consultMessages.push({ role: 'user', text: profileText });
    appendConsultMessage('user', profileText);
    appendConsultMessage('ai', '正在整理資訊並進行初步風險分層...');

    try {
        const result = await generateGeminiContent(buildConsultPrompt('請根據上述參數進行初步線上健康諮詢。', true));
        const text = extractGeminiText(result);
        replaceLastConsultMessage(text || 'AI 沒有回傳可顯示的內容。');
        consultMessages.push({ role: 'ai', text });
        consultStarted = true;
    } catch (error) {
        replaceLastConsultMessage(`線上諮詢失敗：${error.message}`);
    }
}

async function sendConsultMessage() {
    const input = document.getElementById('consultMessage');
    const message = input.value.trim();

    if (!message) return;
    if (!consultProfile) {
        alert('請先填寫參數並按「開始諮詢」。');
        return;
    }

    input.value = '';
    appendConsultMessage('user', message);
    appendConsultMessage('ai', '正在回覆...');
    consultMessages.push({ role: 'user', text: message });

    try {
        const result = await generateGeminiContent(buildConsultPrompt(message, false));
        const text = extractGeminiText(result);
        replaceLastConsultMessage(text || 'AI 沒有回傳可顯示的內容。');
        consultMessages.push({ role: 'ai', text });
    } catch (error) {
        replaceLastConsultMessage(`線上諮詢失敗：${error.message}`);
    }
}

function clearConsultMemory() {
    consultMessages = [];
    consultProfile = null;
    consultStarted = false;

    const chatWindow = document.getElementById('consultChatWindow');
    const input = document.getElementById('consultMessage');
    if (chatWindow) chatWindow.innerHTML = '';
    if (input) input.value = '';
}

function toggleConsultRecordPicker() {
    const picker = document.getElementById('consultRecordPicker');
    if (!picker) return;

    const shouldShow = picker.style.display === 'none' || !picker.style.display;
    picker.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) autoFillConsultAge();
}

async function loadConsultRecords() {
    if (!currentPatientId) {
        alert('請先登入。');
        return;
    }

    const startInput = document.getElementById('consultRecordStart').value;
    const endInput = document.getElementById('consultRecordEnd').value || startInput;
    if (!startInput) {
        alert('請選擇開始日期。');
        return;
    }

    const start = parseLocalDate(startInput);
    start.setHours(0, 0, 0, 0);
    const end = parseLocalDate(endInput);
    end.setHours(23, 59, 59, 999);

    try {
        consultRecordCache = await fetchPatientObservations(start, end);
        renderConsultRecordOptions();
    } catch (error) {
        alert(`載入紀錄失敗：${error.message}`);
    }
}

function renderConsultRecordOptions() {
    const select = document.getElementById('consultRecordSelect');
    select.innerHTML = '';

    if (!consultRecordCache.length) {
        select.innerHTML = '<option value="">此期間沒有紀錄</option>';
        return;
    }

    consultRecordCache.forEach((record, index) => {
        const values = readObservationValues(record);
        const time = new Date(record.effectiveDateTime).toLocaleString('zh-TW');
        const sport = formatSportType(record.note?.[0]?.text);
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${time} | ${sport} | ${formatMeasurement(values.sbp, '')}/${formatMeasurement(values.dbp, '')} mmHg | HR ${formatMeasurement(values.hr, '')} | 氣溫 ${formatMeasurement(values.ambientTemp, '°C')}`;
        select.appendChild(option);
    });
}

function applySelectedConsultRecord() {
    const select = document.getElementById('consultRecordSelect');
    const index = Number(select.value);
    const record = consultRecordCache[index];

    if (!record) {
        alert('請先選擇一筆紀錄。');
        return;
    }

    const values = readObservationValues(record);
    const sport = formatSportType(record.note?.[0]?.text);
    const time = new Date(record.effectiveDateTime).toLocaleString('zh-TW');

    setValue('consultSbp', Number.isFinite(values.sbp) ? values.sbp : '');
    setValue('consultDbp', Number.isFinite(values.dbp) ? values.dbp : '');
    setValue('consultHr', Number.isFinite(values.hr) ? values.hr : '');
    setValue('consultAmbientTemp', Number.isFinite(values.ambientTemp) ? values.ambientTemp : '');

    const symptoms = document.getElementById('consultSymptoms');
    if (symptoms && !symptoms.value.trim()) {
        symptoms.value = `想諮詢 ${time} 的${sport}紀錄與身體狀況`;
    }

    autoFillConsultAge();
}

async function autoFillConsultAge() {
    const ageInput = document.getElementById('consultAge');
    const sexSelect = document.getElementById('consultSex');
    if (!currentPatientId || !ageInput) return;

    try {
        const patient = await fetchCurrentPatient();
        const age = calculateAge(patient.birthDate);
        if (Number.isFinite(age)) ageInput.value = age;

        if (sexSelect && patient.gender) {
            const genderMap = { male: '男性', female: '女性', other: '其他 / 不透露', unknown: '其他 / 不透露' };
            sexSelect.value = genderMap[patient.gender] || '';
        }
    } catch (error) {
        console.warn('自動填入年齡失敗:', error);
    }
}

async function fetchCurrentPatient() {
    const response = await fetch(`${FHIR_BASE_URL}/Patient/${currentPatientId}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`查詢 Patient 失敗 (${response.status})`);
    return response.json();
}

function calculateAge(birthDate) {
    if (!birthDate) return null;

    const birth = parseLocalDate(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const hasNotHadBirthday =
        today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());

    if (hasNotHadBirthday) age--;
    return age;
}

function readConsultProfile() {
    return {
        age: document.getElementById('consultAge').value || '未提供',
        sex: document.getElementById('consultSex').value || '未提供',
        duration: document.getElementById('consultDuration').value.trim() || '未提供',
        symptoms: document.getElementById('consultSymptoms').value.trim(),
        history: document.getElementById('consultHistory').value.trim() || '未提供',
        sbp: document.getElementById('consultSbp').value || '未提供',
        dbp: document.getElementById('consultDbp').value || '未提供',
        hr: document.getElementById('consultHr').value || '未提供',
        ambientTemp: document.getElementById('consultAmbientTemp').value || '未提供'
    };
}

function buildConsultProfileText(profile) {
    return `諮詢資料
年齡：${profile.age}
生理性別：${profile.sex}
主要症狀：${profile.symptoms}
持續時間：${profile.duration}
病史 / 用藥 / 過敏：${profile.history}
血壓：${profile.sbp}/${profile.dbp} mmHg
心率：${profile.hr} BPM
環境溫度：${profile.ambientTemp}°C（環境溫度(氣溫)）`;
}

function buildConsultPrompt(latestMessage, isInitial = false) {
    const historyText = consultMessages
        .slice(-16)
        .map(item => `${item.role === 'user' ? '使用者' : 'AI'}：${item.text}`)
        .join('\n\n');

    const responseStyle = isInitial
        ? `這是第一次回覆。可以用清楚小標題整理：急症風險、可能原因、需要追問、下一步建議。`
        : `這是延續對話。請不要每次套用固定小標題或固定格式，要像專業醫師線上問診一樣自然接續前文；可簡短承接、追問關鍵細節、更新風險判斷，必要時才條列。`;

    return `你是線上健康諮詢 AI，請以醫師問診思維回覆，但必須清楚表示這不是正式診斷，不能取代醫師、急診或實體檢查。

回覆要求：
1. 一定要保留並利用最近對話脈絡，不要把每句都當成新個案。
2. 風險判斷要隨使用者新資訊更新；如果比前面更危險，要直接說明。
3. 說明可能原因時用「可能」，不可做確診。
4. 若提到環境溫度，必須解讀為氣溫，不可當作體溫或發燒。
5. 若出現胸痛、呼吸困難、昏厥、意識混亂、單側無力、劇烈頭痛、血壓 >= 180/110、心率持續 > 150 或症狀快速惡化，請明確建議立即就醫或撥打緊急電話。
6. 使用繁體中文，口吻專業、清楚、像真人對話，控制在 350 字內。
7. ${responseStyle}

使用者基本資料：
${consultProfile ? buildConsultProfileText(consultProfile) : '未提供'}

最近對話：
${historyText || '尚無'}

使用者最新訊息：
${latestMessage}`;
}

function appendConsultMessage(role, text) {
    const chatWindow = document.getElementById('consultChatWindow');
    if (!chatWindow) return;

    const message = document.createElement('div');
    message.className = `chat-message ${role}`;
    message.textContent = text;
    chatWindow.appendChild(message);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function replaceLastConsultMessage(text) {
    const chatWindow = document.getElementById('consultChatWindow');
    const last = chatWindow?.lastElementChild;
    if (last) {
        last.textContent = text;
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

function extractGeminiText(result) {
    return result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
}

function buildGeminiPrompt(data, mode) {
    const summary = buildHealthSummary(data);
    const rows = data.map((record, index) => {
        const values = readObservationValues(record);
        const diagnosis = getDiagnosis(values.sbp, values.dbp, values.hr, values.ambientTemp);
        const time = new Date(record.effectiveDateTime).toLocaleString('zh-TW');
        return `${index + 1}. ${time}，運動類型：${formatSportType(record.note?.[0]?.text)}，收縮壓：${formatDataValue(values.sbp)} mmHg，舒張壓：${formatDataValue(values.dbp)} mmHg，心率：${formatDataValue(values.hr)} BPM，環境溫度：${formatDataValue(values.ambientTemp)}°C（氣溫，非體溫），系統判斷：${diagnosis.status}，系統建議：${diagnosis.advice}`;
    }).join('\n');

    return `你是運動健康管理助理。請根據以下 ${mode === 'day' ? '單日' : '一週'}健康紀錄，產出一份繁體中文「健康分析報告」。

請使用以下格式：
【整體摘要】用 2 句話說明本次資料整體狀態。
【數據重點】列出平均值、最高/最低值，以及是否有異常筆數。
【趨勢判讀】根據第一筆到最後一筆的變化，判斷血壓與心率是上升、下降或大致穩定。
【風險提醒】只針對資料中真的出現的風險提醒；環境溫度只能用於熱負荷、補水、降溫與運動強度建議，不能寫成體溫、發燒或感染。
【建議】給 2 到 3 點可執行建議。

限制：
- 不要做正式醫療診斷，也不要誇大病情。
- 若數值明顯異常，提醒使用者尋求醫療專業協助。
- 必須遵守資料意義，不得把環境溫度誤解成體溫。
- 文字控制在 280 字以內。

欄位定義：
- ${OBSERVATION_FIELDS.sbp.label}：${OBSERVATION_FIELDS.sbp.meaning}，單位 ${OBSERVATION_FIELDS.sbp.unit}
- ${OBSERVATION_FIELDS.dbp.label}：${OBSERVATION_FIELDS.dbp.meaning}，單位 ${OBSERVATION_FIELDS.dbp.unit}
- ${OBSERVATION_FIELDS.hr.label}：${OBSERVATION_FIELDS.hr.meaning}，單位 ${OBSERVATION_FIELDS.hr.unit}
- ${OBSERVATION_FIELDS.ambientTemp.label}：${OBSERVATION_FIELDS.ambientTemp.meaning}，單位 ${OBSERVATION_FIELDS.ambientTemp.unit}
- 運動類型：使用者當次紀錄的活動型態，例如跑步、重量訓練、游泳或自行車，應用於判斷心率與熱負荷是否合理。

統計摘要：
- 紀錄筆數：${summary.count}
- 收縮壓平均：${summary.sbp.avg} mmHg，最高：${summary.sbp.max}，最低：${summary.sbp.min}，趨勢：${summary.sbp.trend}
- 舒張壓平均：${summary.dbp.avg} mmHg，最高：${summary.dbp.max}，最低：${summary.dbp.min}，趨勢：${summary.dbp.trend}
- 心率平均：${summary.hr.avg} BPM，最高：${summary.hr.max}，最低：${summary.hr.min}，趨勢：${summary.hr.trend}
- 環境溫度平均：${summary.ambientTemp.avg}°C，最高：${summary.ambientTemp.max}，最低：${summary.ambientTemp.min}，此為氣溫不是體溫
- 異常或需注意筆數：${summary.riskCount}
- 最高風險等級：${summary.maxRiskLevel}
- 出現狀態：${summary.statuses.join('、')}
- 資料品質提醒：${summary.qualityNotes.length ? summary.qualityNotes.join('；') : '未發現明顯缺漏或格式問題'}

健康紀錄：
${rows}`;
}

function buildHealthSummary(data) {
    const records = data.map(record => {
        const values = readObservationValues(record);
        const diagnosis = getDiagnosis(values.sbp, values.dbp, values.hr, values.ambientTemp);
        return { values, diagnosis };
    });

    const pick = key => records.map(record => record.values[key]).filter(value => Number.isFinite(value));
    const stats = values => ({
        avg: values.length ? roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length) : '無資料',
        max: values.length ? Math.max(...values) : '無資料',
        min: values.length ? Math.min(...values) : '無資料',
        trend: describeTrend(values)
    });

    const statuses = [...new Set(records.map(record => record.diagnosis.status))];
    const qualityNotes = buildDataQualityNotes(records);

    return {
        count: records.length,
        sbp: stats(pick('sbp')),
        dbp: stats(pick('dbp')),
        hr: stats(pick('hr')),
        ambientTemp: stats(pick('ambientTemp')),
        riskCount: records.filter(record => record.diagnosis.level >= 2).length,
        maxRiskLevel: records.length ? Math.max(...records.map(record => record.diagnosis.level)) : 0,
        statuses,
        qualityNotes
    };
}

function describeTrend(values) {
    if (values.length < 2) return '資料不足';

    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;
    const threshold = Math.max(3, Math.round(Math.abs(first) * 0.05));

    if (diff > threshold) return `上升（+${diff}）`;
    if (diff < -threshold) return `下降（${diff}）`;
    return '大致穩定';
}

function buildDataQualityNotes(records) {
    const notes = [];
    const missing = field => records.filter(record => !Number.isFinite(record.values[field])).length;
    const missingSbp = missing('sbp');
    const missingDbp = missing('dbp');
    const missingHr = missing('hr');
    const missingAmbientTemp = missing('ambientTemp');
    const impossibleBloodPressure = records.filter(record =>
        Number.isFinite(record.values.sbp) &&
        Number.isFinite(record.values.dbp) &&
        record.values.dbp >= record.values.sbp
    ).length;

    if (missingSbp) notes.push(`${missingSbp} 筆缺少收縮壓`);
    if (missingDbp) notes.push(`${missingDbp} 筆缺少舒張壓`);
    if (missingHr) notes.push(`${missingHr} 筆缺少心率`);
    if (missingAmbientTemp) notes.push(`${missingAmbientTemp} 筆缺少環境溫度`);
    if (impossibleBloodPressure) notes.push(`${impossibleBloodPressure} 筆舒張壓大於或等於收縮壓，需重新確認`);

    return notes;
}

function roundToOne(value) {
    return Math.round(value * 10) / 10;
}

function getDiagnosis(sbp, dbp, hr, ambientTemp) {
    if (!Number.isFinite(sbp) || !Number.isFinite(dbp) || !Number.isFinite(hr)) {
        return { level: 0, status: '資料不足', color: '#95a5a6', advice: '此筆紀錄缺少血壓或心率，請補齊後再判讀。' };
    }
    if (sbp >= 180 || dbp >= 110) {
        return { level: 4, status: '高血壓危象', color: '#9e1b32', advice: '請停止運動並立即就醫或尋求協助。' };
    }
    if (sbp >= 160 || dbp >= 100) {
        return { level: 3, status: '第二期高血壓', color: '#d32f2f', advice: '建議休息、補充水分，並盡快諮詢醫療人員。' };
    }
    if (sbp >= 140 || dbp >= 90) {
        return { level: 2, status: '第一期高血壓', color: '#e67e22', advice: '建議降低運動強度，休息 10 分鐘後重新測量。' };
    }
    if (sbp > 130) {
        return { level: 1, status: '血壓偏高', color: '#f1c40f', advice: '請觀察身體狀況並避免突然增加運動強度。' };
    }
    if (Number.isFinite(ambientTemp) && ambientTemp > 33 && hr > 155) {
        return { level: 3, status: '高溫環境與高心率風險', color: '#d32f2f', advice: '環境溫度偏高且心率高，請移至陰涼處休息、補充水分並降低運動強度。' };
    }
    return { level: 0, status: '狀態正常', color: '#28a745', advice: '請維持規律紀錄。' };
}

function validateMeasurementInput(sbp, dbp, hr, ambientTemp, measureTime) {
    const measureDate = new Date(measureTime);
    const now = new Date();

    if (Number.isNaN(measureDate.getTime())) return '測量時間格式不正確。';
    if (measureDate > now) return '測量時間不可晚於現在。';
    if (!isInRange(sbp, 70, 250)) return '收縮壓需介於 70 到 250 mmHg 之間，請確認輸入值。';
    if (!isInRange(dbp, 40, 150)) return '舒張壓需介於 40 到 150 mmHg 之間，請確認輸入值。';
    if (dbp >= sbp) return '舒張壓應小於收縮壓，請確認血壓輸入順序。';
    if (!isInRange(hr, 30, 220)) return '心率需介於 30 到 220 BPM 之間，請確認輸入值。';
    if (!isInRange(ambientTemp, -10, 50)) return '環境溫度需介於 -10 到 50°C 之間，請確認這是氣溫而非體溫。';

    return '';
}

function isInRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

function formatDataValue(value) {
    return Number.isFinite(value) ? value : '無資料';
}

function formatMeasurement(value, unit) {
    return Number.isFinite(value) ? `${value}${unit}` : '無資料';
}

function formatSportType(value) {
    const sportLabels = {
        Still: '靜態不動 / 休息',
        Running: '跑步',
        Walking: '步行',
        Jogging: '慢跑',
        Weightlifting: '重量訓練',
        HIIT: '高強度間歇訓練',
        Basketball: '籃球',
        Badminton: '羽球',
        Tennis: '網球',
        Baseball: '棒球',
        Soccer: '足球',
        Swimming: '游泳',
        Cycling: '自行車',
        Yoga: '瑜伽',
        Stretching: '伸展',
        Pilates: '皮拉提斯',
        Dancing: '舞蹈',
        Climbing: '登山 / 爬坡',
        Rowing: '划船',
        Skating: '滑冰 / 直排輪',
        Other: '其他'
    };

    return sportLabels[value] || value || '未記錄';
}

function getSelectedSportText() {
    const sportType = document.getElementById('sportType').value;
    if (sportType === 'Other') {
        return document.getElementById('otherSport').value.trim();
    }

    return formatSportType(sportType);
}

function toggleOtherSportInput() {
    const isOther = document.getElementById('sportType').value === 'Other';
    const otherSportRow = document.getElementById('otherSportRow');
    const otherSportInput = document.getElementById('otherSport');

    if (!otherSportRow || !otherSportInput) return;

    otherSportRow.style.display = isOther ? 'flex' : 'none';
    if (isOther) {
        otherSportInput.focus();
    } else {
        otherSportInput.value = '';
    }
}

function drawChart(id, labels, datasets) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: datasets.map(dataset => ({
                label: dataset.label,
                data: dataset.data,
                borderColor: dataset.color,
                backgroundColor: dataset.color,
                tension: 0.3,
                spanGaps: true
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function getMonday(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(result.setDate(diff));
}

function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function checkPasswordStrength(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function checkIdCardFormat(id) {
    return /^[A-Z][12][0-9]{8}$/.test(id);
}

function autoGetWeather() {
    if (!navigator.geolocation) {
        alert('此瀏覽器不支援定位功能，請手動輸入環境溫度。');
        return;
    }

    navigator.geolocation.getCurrentPosition(async position => {
        await fetchWeatherData(position.coords.latitude, position.coords.longitude);
    }, () => {
        alert('無法取得位置，請手動輸入環境溫度。');
    });
}

function autoGetConsultWeather() {
    if (!navigator.geolocation) {
        alert('此瀏覽器不支援定位功能，請手動輸入環境溫度。');
        return;
    }

    navigator.geolocation.getCurrentPosition(async position => {
        await fetchWeatherData(position.coords.latitude, position.coords.longitude, 'consultAmbientTemp');
    }, () => {
        alert('無法取得位置，請手動輸入環境溫度。');
    });
}

async function fetchWeatherData(lat, lon, targetInputId = 'temp') {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await response.json();
        document.getElementById(targetInputId).value = Math.round(data.current_weather.temperature);
    } catch (error) {
        console.error('取得天氣失敗:', error);
        alert('取得天氣失敗，請手動輸入環境溫度。');
    }
}
