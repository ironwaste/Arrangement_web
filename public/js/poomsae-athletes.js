// ==================== 品势运动员管理页面 ====================

currentAthleteType = 'poomsae';
selectedClass = '';
let selectedGroupClass = '';
let selectedGender = '';
let selectedUndrawnClass = '';
let selectedUndrawnGroupClass = '';
let selectedUndrawnGender = '';
let selectedDrawnClass = '';
let selectedDrawnGroupClass = '';
let selectedDrawnGender = '';
let selectedPoomsaeType = '';
let selectedUndrawnPoomsaeType = '';
let selectedDrawnPoomsaeType = '';
let competitionFormat = 'final_1';

function getTypeLabel() {
    return '品势';
}

function buildAthleteQuery(extraParams) {
    let url = '/athletes?' + getEventParam() + '&athlete_type=poomsae';
    if (extraParams) {
        for (const [key, val] of Object.entries(extraParams)) {
            if (val !== undefined && val !== null && val !== '') {
                url += '&' + key + '=' + encodeURIComponent(val);
            }
        }
    }
    return url;
}

function applyAthleteTypeFilter(bodyOrUrl, isUrl) {
    if (isUrl) {
        bodyOrUrl += '&athlete_type=poomsae';
    } else {
        bodyOrUrl.athlete_type = 'poomsae';
    }
    return bodyOrUrl;
}

// ==================== 数据加载 ====================

let _cachedAllAthletes = null;

async function fetchAllAthletes(forceRefresh) {
    if (!forceRefresh && _cachedAllAthletes) return _cachedAllAthletes;
    const resp = await apiGet(buildAthleteQuery());
    _cachedAllAthletes = resp.data || [];
    return _cachedAllAthletes;
}

async function loadAthletes() {
    const tbody = document.getElementById('athletesTable');
    tbody.innerHTML = '';

    if (!currentEventId) {
        const totalEl = document.getElementById('totalAthletes');
        if (totalEl) totalEl.textContent = '0';
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#909399;padding:40px 0;">请先在「赛事列表」中选择一个赛事</td></tr>';
        document.getElementById('classList').innerHTML = '';
        document.getElementById('drawnClassList').innerHTML = '';
        return;
    }

    _cachedAllAthletes = null;
    const allAthletesList = await fetchAllAthletes(true);

    const getClassList = (groupClass, gender, athleteType) => {
        const filtered = allAthletesList.filter(a =>
            (a.group_class || '') === (groupClass || '') && a.gender === gender && (a.athlete_type || 'taekwondo_kyougi') === (athleteType || 'taekwondo_kyougi')
        );
        return [...new Set(filtered.map(a => a.weight_class).filter(Boolean))].sort();
    };

    let displayList = allAthletesList;
    if (selectedClass && selectedPoomsaeType && selectedGroupClass && selectedGender) {
        displayList = allAthletesList.filter(a => a.weight_class === selectedClass && (a.poomsae_type || '个人') === selectedPoomsaeType && (a.group_class || '未分组') === selectedGroupClass && a.gender === selectedGender);
    } else if (selectedClass && selectedPoomsaeType && selectedGroupClass) {
        displayList = allAthletesList.filter(a => a.weight_class === selectedClass && (a.poomsae_type || '个人') === selectedPoomsaeType && (a.group_class || '未分组') === selectedGroupClass);
    } else if (selectedClass && selectedPoomsaeType) {
        displayList = allAthletesList.filter(a => a.weight_class === selectedClass && (a.poomsae_type || '个人') === selectedPoomsaeType);
    } else if (selectedClass) {
        displayList = allAthletesList.filter(a => a.weight_class === selectedClass);
    }

    displayList.forEach((a, index) => {
        const tr = document.createElement('tr');
        if (index % 2 === 1) tr.style.background = '#A8D8B9';

        const classOptions = getClassList(a.group_class, a.gender, a.athlete_type);
        const optionsHtml = classOptions.map(cls =>
            `<option value="${cls}" ${cls === a.weight_class ? 'selected' : ''}>${cls}</option>`
        ).join('');

        const isUnqualified = a.is_qualified === '不合格';
        const selectStyle = isUnqualified
            ? 'padding:3px 6px;font-size:12px;border:1px solid #f56c6c;border-radius:4px;max-width:140px;background-color:#f56c6c;color:#fff;'
            : 'padding:3px 6px;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;max-width:140px;';

        let typeLabel;
        if (a.poomsae_type === '团体') typeLabel = '团品';
        else if (a.poomsae_type === '混双') typeLabel = '混双';
        else if (a.poomsae_type === '个人') typeLabel = '个品';
        else {
            const nameCount = (a.name || '').split('/').filter(n => n.trim()).length;
            if (nameCount >= 3) typeLabel = '团品';
            else if (nameCount === 2) typeLabel = '混双';
            else typeLabel = '个品';
        }

        const formatFields = [
            { key: 'format_slot_1' },
            { key: 'format_slot_2' },
            { key: 'format_slot_3' },
            { key: 'format_slot_4' },
            { key: 'format_slot_5' },
            { key: 'format_slot_6' }
        ];

        const formatInputs = formatFields.map(f => {
            const val = a[f.key] || '';
            return `<td style="text-align:center;font-size:12px;">${val}</td>`;
        }).join('\n');

        tr.innerHTML = `
            <td style="text-align:center;">${index + 1}</td>
            <td style="text-align:center;">${typeLabel}</td>
            <td style="text-align:center;">${a.athlete_no}</td>
            <td style="white-space:nowrap;text-align:center;">
                <input type="number" id="draw_${a.id}" value="${a.draw_no || ''}"
                    style="width:50px;padding:2px 4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;text-align:center;"
                    onchange="updateDrawNo(${a.id})">
            </td>
            <td style="text-align:center;">${a.name}</td>
            <td style="text-align:center;">${a.gender}</td>
            <td style="text-align:center;">${a.unit || '-'}</td>
            <td style="text-align:center;">${a.group_class || '-'}</td>
            <td style="text-align:center;">${a.weight_class}</td>
            <td style="text-align:center;">
                <select id="wc_${a.id}" style="${selectStyle}" data-unqualified="${isUnqualified}">
                    ${optionsHtml}
                </select>
                <button class="btn btn-primary" onclick="updateWeightClass(${a.id})" style="padding:3px 8px;font-size:11px;margin-left:4px;">✓</button>
            </td>
            ${formatInputs}
            <td style="text-align:center;">
                <button class="btn btn-danger" onclick="deleteAthlete(${a.id})" style="padding:5px 12px;font-size:12px;">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const totalEl = document.getElementById('totalAthletes');
    if (totalEl) totalEl.textContent = displayList.length;
    loadPoomsaeClassList(allAthletesList);

    const formatSet = new Set(allAthletesList.map(a => a.format).filter(Boolean));
    const formatSelect = document.getElementById('competitionFormat');
    if (formatSelect && formatSet.size === 1) {
        formatSelect.value = [...formatSet][0];
        competitionFormat = [...formatSet][0];
    } else if (formatSelect && formatSet.size === 0) {
        formatSelect.value = '';
        competitionFormat = '';
    }
}

// ==================== 品势分组级别列表 ====================

function getPoomsaeTypeLabel(pt) {
    if (pt === '个人') return '个人品势';
    if (pt === '混双') return '混双品势';
    if (pt === '团体') return '团体品势';
    return '品势';
}

function loadPoomsaeClassList(athletes) {
    if (!currentEventId) {
        document.getElementById('classList').innerHTML = '';
        document.getElementById('drawnClassList').innerHTML = '';
        return;
    }

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const typeGenderGcClsMap = {};
    const typeDrawnGenderGcClsMap = {};

    athletes.forEach(a => {
        const pt = a.poomsae_type || '个人';
        const gender = a.gender || '未知';
        const gc = a.group_class || '未分组';
        const cls = a.weight_class || '未分级';
        const key = gender + '/' + gc + '/' + cls;
        if (!typeGenderGcClsMap[pt]) typeGenderGcClsMap[pt] = {};
        if (!typeDrawnGenderGcClsMap[pt]) typeDrawnGenderGcClsMap[pt] = {};
        if (a.draw_no) {
            typeDrawnGenderGcClsMap[pt][key] = (typeDrawnGenderGcClsMap[pt][key] || 0) + 1;
        } else {
            typeGenderGcClsMap[pt][key] = (typeGenderGcClsMap[pt][key] || 0) + 1;
        }
    });

    const leftList = document.getElementById('classList');
    leftList.innerHTML = '';

    const hasUndrawn = poomsaeTypeOrder.some(pt => typeGenderGcClsMap[pt] && Object.keys(typeGenderGcClsMap[pt]).length > 0);

    if (hasUndrawn) {
        const allItem = document.createElement('li');
        allItem.className = 'all-item' + (selectedUndrawnClass === '' ? ' active' : '');
        allItem.innerHTML = `<span>全部</span><span class="count">${athletes.filter(a => !a.draw_no).length}</span>`;
        allItem.onclick = () => { selectedUndrawnClass = ''; selectedUndrawnGroupClass = ''; selectedUndrawnGender = ''; selectedUndrawnPoomsaeType = ''; selectedClass = ''; selectedGroupClass = ''; selectedGender = ''; selectedPoomsaeType = ''; loadAthletes(); };
        leftList.appendChild(allItem);

        poomsaeTypeOrder.forEach(pt => {
            const items = typeGenderGcClsMap[pt];
            if (!items || Object.keys(items).length === 0) return;

            const typeLi = document.createElement('li');
            typeLi.className = 'class-group-title';
            typeLi.innerHTML = `<span>${getPoomsaeTypeLabel(pt)}</span>`;
            leftList.appendChild(typeLi);

            Object.keys(items).sort().forEach(key => {
                const [gender, gc, cls] = key.split('/');
                const displayLabel = gender + gc + cls;
                const li = document.createElement('li');
                li.className = selectedUndrawnClass === cls && selectedUndrawnPoomsaeType === pt && selectedUndrawnGroupClass === gc && selectedUndrawnGender === gender ? 'active' : '';
                li.style.paddingLeft = '24px';
                li.innerHTML = `<span>${displayLabel}</span><span class="count">${items[key]}</span>`;
                li.onclick = () => { selectedUndrawnClass = cls; selectedUndrawnGroupClass = gc; selectedUndrawnGender = gender; selectedUndrawnPoomsaeType = pt; selectedClass = cls; selectedGroupClass = gc; selectedGender = gender; selectedPoomsaeType = pt; loadAthletes(); };
                leftList.appendChild(li);
            });
        });
    } else {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'background:transparent;border:1px dashed #d9deea;color:#8a93a6;cursor:default;text-align:center;';
        emptyLi.textContent = '全部已抽签';
        leftList.appendChild(emptyLi);
    }

    const rightList = document.getElementById('drawnClassList');
    rightList.innerHTML = '';

    const hasDrawn = poomsaeTypeOrder.some(pt => typeDrawnGenderGcClsMap[pt] && Object.keys(typeDrawnGenderGcClsMap[pt]).length > 0);

    if (hasDrawn) {
        poomsaeTypeOrder.forEach(pt => {
            const items = typeDrawnGenderGcClsMap[pt];
            if (!items || Object.keys(items).length === 0) return;

            const typeLi = document.createElement('li');
            typeLi.className = 'class-group-title';
            typeLi.innerHTML = `<span>${getPoomsaeTypeLabel(pt)}</span>`;
            rightList.appendChild(typeLi);

            Object.keys(items).sort().forEach(key => {
                const [gender, gc, cls] = key.split('/');
                const displayLabel = gender + gc + cls;
                const li = document.createElement('li');
                li.className = selectedDrawnClass === cls && selectedDrawnPoomsaeType === pt && selectedDrawnGroupClass === gc && selectedDrawnGender === gender ? 'active' : '';
                li.style.paddingLeft = '24px';
                li.innerHTML = `<span>${displayLabel}</span><span class="count">${items[key]}</span>`;
                li.onclick = () => { selectedDrawnClass = cls; selectedDrawnGroupClass = gc; selectedDrawnGender = gender; selectedDrawnPoomsaeType = pt; selectedClass = cls; selectedGroupClass = gc; selectedGender = gender; selectedPoomsaeType = pt; loadAthletes(); };
                rightList.appendChild(li);
            });
        });
    } else {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'background:transparent;border:1px dashed #c2e7b0;color:#8a93a6;cursor:default;text-align:center;';
        emptyLi.textContent = '暂无已抽签';
        rightList.appendChild(emptyLi);
    }
}

// ==================== 类型筛选 ====================

async function changeCompetitionFormat(format) {
    competitionFormat = format;
    if (!currentEventId || !_cachedAllAthletes || _cachedAllAthletes.length === 0) return;

    const promises = _cachedAllAthletes.map(a => {
        return fetch(API_BASE + '/athletes/' + a.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: format })
        });
    });
    await Promise.all(promises);
    loadAthletes();
}

function exportPoomsaeRoutineTemplate() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    downloadFile(`/api/poomsae-routine/template?event_id=${currentEventId}`);
}

function importPoomsaeRoutine() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('event_id', currentEventId);
        try {
            const res = await fetch('/api/poomsae-routine/import', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                alert(`导入完成！成功 ${result.data.success} 条，失败 ${result.data.failed} 条`);
                loadAthletes();
            } else {
                alert('导入失败：' + (result.error || '未知错误'));
            }
        } catch (err) {
            alert('导入出错：' + err.message);
        }
    };
    input.click();
}

// ==================== 配置品势套路 ====================

const FORMAT_OPTIONS = [
    { value: 'final_1', label: '决赛（1套品势）' },
    { value: 'final_2', label: '决赛（2套品势）' },
    { value: 'prelim_final_1', label: '预赛-决赛（1套品势）' },
    { value: 'prelim_final_2', label: '预赛-决赛（2套品势）' },
    { value: 'prelim_semi_final_1', label: '预赛-复赛-决赛（1套品势）' },
    { value: 'prelim_semi_final_2', label: '预赛-复赛-决赛（2套品势）' }
];

const FORMAT_SLOT_MAP = {
    'final_1':              ['决赛', '', '', '', '', ''],
    'final_2':              ['决赛', '决赛', '', '', '', ''],
    'prelim_final_1':       ['预赛', '决赛', '', '', '', ''],
    'prelim_final_2':       ['预赛', '预赛', '决赛', '决赛', '', ''],
    'prelim_semi_final_1':  ['预赛', '复赛', '决赛', '', '', ''],
    'prelim_semi_final_2':  ['预赛', '预赛', '复赛', '复赛', '决赛', '决赛']
};

function detectFormat(athlete) {
    const slots = [
        athlete.format_slot_1, athlete.format_slot_2, athlete.format_slot_3,
        athlete.format_slot_4, athlete.format_slot_5, athlete.format_slot_6
    ];
    for (const [key, pattern] of Object.entries(FORMAT_SLOT_MAP)) {
        let match = true;
        for (let i = 0; i < 6; i++) {
            const slotFilled = slots[i] && String(slots[i]).trim() !== '';
            const patternActive = pattern[i] !== '';
            if (slotFilled !== patternActive) { match = false; break; }
        }
        if (match) return key;
    }
    return '';
}

function showFormatConfigModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!_cachedAllAthletes || _cachedAllAthletes.length === 0) { alert('暂无运动员数据'); return; }

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const typeGenderGcClsMap = {};

    _cachedAllAthletes.forEach(a => {
        const pt = a.poomsae_type || '个人';
        const gender = a.gender || '未知';
        const gc = a.group_class || '未分组';
        const cls = a.weight_class || '未分级';
        const key = gender + '/' + gc + '/' + cls;
        if (!typeGenderGcClsMap[pt]) typeGenderGcClsMap[pt] = {};
        if (!typeGenderGcClsMap[pt][key]) typeGenderGcClsMap[pt][key] = [];
        typeGenderGcClsMap[pt][key].push(a);
    });

    const container = document.getElementById('formatConfigContent');
    let html = '<table id="formatConfigTable" style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">';
    html += '<colgroup>';
    html += '<col style="width:36px;">';
    html += '<col style="width:50px;">';
    html += '<col style="width:110px;">';
    html += '<col style="width:140px;">';
    for (let i = 0; i < 6; i++) html += '<col style="width:auto;">';
    html += '</colgroup>';
    html += '<thead><tr style="background:linear-gradient(to right,#8B0000,#00008B);">';
    html += '<th style="padding:8px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;color:#fff;background:transparent;">序号</th>';
    html += '<th style="padding:8px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;color:#fff;background:transparent;">竞赛类别</th>';
    html += '<th style="padding:8px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;color:#fff;background:transparent;">组别</th>';
    html += '<th style="padding:8px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;color:#fff;background:transparent;">赛制</th>';
    for (let i = 1; i <= 6; i++) {
        html += `<th id="fmtHeader${i}" style="padding:8px 2px;border:1px solid #e0e0e0;text-align:center;font-size:12px;color:#fff;background:transparent;">套路${i}</th>`;
    }
    html += '</tr></thead><tbody>';

    let rowIdx = 0;
    const rowDataMap = {};

    poomsaeTypeOrder.forEach(pt => {
        const items = typeGenderGcClsMap[pt];
        if (!items) return;
        Object.keys(items).sort().forEach(key => {
            const [gender, gc, cls] = key.split('/');
            const athletes = items[key];
            const currentFormat = athletes[0] ? (athletes[0].format || detectFormat(athletes[0])) : '';
            const rowId = `fcr${rowIdx}`;
            rowDataMap[rowId] = { pt, gender, gc, cls };
            rowIdx++;
            let typeLabel;
            if (pt === '个人') typeLabel = '个品';
            else if (pt === '混双') typeLabel = '混双';
            else if (pt === '团体') typeLabel = '团品';
            else typeLabel = pt;
            html += '<tr>';
            html += `<td style="padding:5px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;">${rowIdx}</td>`;
            html += `<td style="padding:5px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;">${typeLabel}</td>`;
            html += `<td style="padding:5px 4px;border:1px solid #e0e0e0;text-align:center;font-size:12px;">${gender}${gc}${cls}</td>`;
            html += `<td style="padding:5px 4px;border:1px solid #e0e0e0;text-align:center;">`;
            html += `<select id="${rowId}" onchange="onFormatSelectChange('${rowId}')" style="padding:3px 4px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;width:100%;box-sizing:border-box;">`;
            html += '<option value="">-- 未配置 --</option>';
            FORMAT_OPTIONS.forEach(opt => {
                const selected = currentFormat === opt.value ? 'selected' : '';
                html += `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
            });
            html += '</select></td>';
            for (let i = 0; i < 6; i++) {
                const savedVal = athletes[0] ? (athletes[0][`format_slot_${i + 1}`] || '') : '';
                const inputStyle = 'width:100%;padding:3px 4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;text-align:center;box-sizing:border-box;';
                html += `<td style="padding:5px 2px;border:1px solid #e0e0e0;text-align:center;">`;
                html += `<input type="text" id="${rowId}_slot${i + 1}" value="${savedVal}" style="${inputStyle}">`;
                html += `</td>`;
            }
            html += '</tr>';
        });
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    window._formatRowDataMap = rowDataMap;

    updateFormatHeaders();

    for (const [rowId] of Object.entries(window._formatRowDataMap || {})) {
        onFormatSelectChange(rowId);
    }

    document.getElementById('formatConfigModal').style.display = 'flex';
}

function updateFormatHeaders() {
    const rowDataMap = window._formatRowDataMap || {};
    let activeLabels = ['', '', '', '', '', ''];

    for (const [rowId] of Object.entries(rowDataMap)) {
        const select = document.getElementById(rowId);
        if (!select || !select.value) continue;
        const labels = FORMAT_SLOT_MAP[select.value];
        if (!labels) continue;
        for (let i = 0; i < 6; i++) {
            if (labels[i] && !activeLabels[i]) activeLabels[i] = labels[i];
        }
    }

    for (let i = 1; i <= 6; i++) {
        const th = document.getElementById(`fmtHeader${i}`);
        if (th) th.textContent = activeLabels[i - 1] || `套路${i}`;
    }
}

function onFormatSelectChange(rowId) {
    updateFormatHeaders();
    const select = document.getElementById(rowId);
    if (!select) return;
    const fmt = select.value;
    const labels = fmt ? FORMAT_SLOT_MAP[fmt] : null;
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`${rowId}_slot${i}`);
        if (!input) continue;
        const isActive = labels && labels[i - 1] !== '';
        input.disabled = !isActive;
        input.style.opacity = isActive ? '1' : '0.4';
        if (!isActive) input.value = '';
    }
}

function closeFormatConfigModal() {
    document.getElementById('formatConfigModal').style.display = 'none';
}

async function saveFormatConfig() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!_cachedAllAthletes || _cachedAllAthletes.length === 0) return;

    const typeGenderGcClsMap = {};
    _cachedAllAthletes.forEach(a => {
        const pt = a.poomsae_type || '个人';
        const gender = a.gender || '未知';
        const gc = a.group_class || '未分组';
        const cls = a.weight_class || '未分级';
        const key = gender + '/' + gc + '/' + cls;
        if (!typeGenderGcClsMap[pt]) typeGenderGcClsMap[pt] = {};
        if (!typeGenderGcClsMap[pt][key]) typeGenderGcClsMap[pt][key] = [];
        typeGenderGcClsMap[pt][key].push(a);
    });

    const rowDataMap = window._formatRowDataMap || {};
    let updateCount = 0;

    for (const [rowId, { pt, gender, gc, cls }] of Object.entries(rowDataMap)) {
        const select = document.getElementById(rowId);
        const selectedFormat = select ? select.value : '';
        const roundLabels = selectedFormat ? FORMAT_SLOT_MAP[selectedFormat] : ['', '', '', '', '', ''];
        const key = gender + '/' + gc + '/' + cls;
        const athletes = typeGenderGcClsMap[pt] && typeGenderGcClsMap[pt][key];
        if (!athletes) continue;

        const updateData = {};
        updateData['format'] = selectedFormat;
        for (let i = 1; i <= 6; i++) {
            const input = document.getElementById(`${rowId}_slot${i}`);
            const isActive = roundLabels[i - 1] !== '';
            updateData[`format_slot_${i}`] = (input && isActive) ? (input.value || '') : '';
        }

        for (const a of athletes) {
            await fetch(API_BASE + '/athletes/' + a.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            updateCount++;
        }
    }

    closeFormatConfigModal();
    alert(`配置已保存，更新了 ${updateCount} 条运动员数据`);
    loadAthletes();
}

// ==================== 运动员 CRUD ====================

async function deleteAthlete(id) {
    if (!confirm('确定删除该运动员？')) return;
    await fetch(API_BASE + '/athletes/' + id, { method: 'DELETE' });
    loadAthletes();
}

async function updateWeightClass(id) {
    const select = document.getElementById('wc_' + id);
    const newClass = select.value.trim();
    if (!newClass) { alert('级别不能为空'); return; }
    const resp = await fetch(API_BASE + '/athletes/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_class: newClass })
    });
    const data = await resp.json();
    if (data.success) { loadAthletes(); } else { alert('修改失败: ' + data.error); }
}

async function updateDrawNo(id) {
    const input = document.getElementById('draw_' + id);
    const newDrawNo = parseInt(input.value) || 0;
    const resp = await fetch(API_BASE + '/athletes/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw_no: newDrawNo })
    });
    const data = await resp.json();
    if (!data.success) { alert('修改签号失败: ' + data.error); loadAthletes(); }
}

// ==================== 抽签管理 ====================

async function doDraw(weightClass) {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    proceedDraw(weightClass);
}

async function proceedDraw(weightClass) {
    const msg = weightClass ? `确定对当前级别进行抽签？` : '确定对所有级别进行抽签？';
    if (!confirm(msg)) return;

    const resp = await apiGet(buildAthleteQuery());
    let allAthletes = resp.data || [];

    if (weightClass && selectedPoomsaeType && selectedGender && selectedGroupClass) {
        allAthletes = allAthletes.filter(a =>
            a.weight_class === weightClass &&
            (a.poomsae_type || '个人') === selectedPoomsaeType &&
            a.gender === selectedGender &&
            (a.group_class || '未分组') === selectedGroupClass
        );
    }

    if (allAthletes.length === 0) {
        alert('没有运动员可抽签');
        return;
    }

    const classGroups = {};
    allAthletes.forEach(a => {
        const pt = a.poomsae_type || '个人';
        const gender = a.gender || '未知';
        const gc = a.group_class || '未分组';
        const cls = a.weight_class || '未分级';
        const key = pt + '|' + gender + '|' + gc + '|' + cls;
        if (!classGroups[key]) classGroups[key] = [];
        classGroups[key].push(a);
    });

    let totalDrawn = 0;
    const classNames = [];

    for (const [key, group] of Object.entries(classGroups)) {
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }

        for (let i = 0; i < group.length; i++) {
            await fetch(API_BASE + '/athletes/' + group[i].id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draw_no: i + 1 })
            });
        }

        totalDrawn += group.length;
        classNames.push(key.replace(/\|/g, ' '));
    }

    alert(`✅ 抽签完成！共 ${totalDrawn} 人，涉及 ${classNames.length} 个级别`);
    loadAthletes();
}

// ==================== 清除操作 ====================

async function clearDraw() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    const cls = selectedClass;
    const typeLabel = getTypeLabel();
    const msg = cls
        ? `确定清除「${cls}」的签号？`
        : `确定清除${typeLabel || '所有'}运动员的签号？`;
    if (!confirm(msg)) return;

    const body = { event_id: currentEventId };
    if (cls) body.weight_class = cls;
    applyAthleteTypeFilter(body);
    if (selectedPoomsaeType) body.poomsae_type = selectedPoomsaeType;
    if (selectedGender) body.gender = selectedGender;
    if (selectedGroupClass) body.group_class = selectedGroupClass;

    const resp = await apiPost('/athletes/clear-draw', body);

    if (resp.success) {
        alert(`✅ 已清除 ${resp.data.cleared} 人的签号`);
        loadAthletes();
    } else {
        alert('❌ 清除失败: ' + resp.error);
    }
}

async function clearAllAthletes() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    const typeLabel = getTypeLabel();
    if (!confirm(`⚠️ 确定清除当前赛事的${typeLabel || '所有'}运动员？此操作不可恢复！`)) return;
    if (!confirm('再次确认：将删除运动员数据，是否继续？')) return;

    let url = API_BASE + '/athletes/all?event_id=' + currentEventId;
    url = applyAthleteTypeFilter(url, true);

    const resp = await fetch(url, { method: 'DELETE' });
    const data = await resp.json();

    if (data.success) {
        alert(`✅ 已清除 ${data.data.deleted} 名运动员`);
        loadAthletes();
    } else {
        alert('❌ 清除失败: ' + data.error);
    }
}

// ==================== 批量添加 ====================

function showBatchPoomsaeModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    document.getElementById('poomsaeBatchModal').classList.add('active');
    document.getElementById('poomsaeBatchResult').style.display = 'none';
    document.getElementById('poomsaeBatchResult').innerHTML = '';
}

function closePoomsaeBatchModal() {
    document.getElementById('poomsaeBatchModal').classList.remove('active');
}

async function saveBatchPoomsaeAthletes() {
    const rawText = document.getElementById('poomsaeBatchData').value.trim();
    if (!rawText) { alert('请输入品势运动员数据'); return; }

    const poomsaeType = document.getElementById('poomsaeBatchType').value || '个人';
    const lines = rawText.split('\n').filter(line => line.trim());
    const athletes = [];
    const errors = [];

    lines.forEach((line, index) => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 5) { errors.push(`第 ${index + 1} 行格式错误: ${line}`); return; }
        athletes.push({
            name: parts[0], unit: parts[1], gender: parts[2],
            group_class: parts[3], weight_class: parts[4], athlete_type: 'poomsae', poomsae_type: poomsaeType
        });
    });

    if (errors.length > 0) { alert('数据格式错误:\n' + errors.join('\n')); return; }

    const resp = await apiPost('/athletes/batch', { athletes, event_id: currentEventId, athlete_type: 'poomsae' });
    const resultDiv = document.getElementById('poomsaeBatchResult');
    resultDiv.style.display = 'block';

    if (resp.success) {
        resultDiv.innerHTML = `<p style="color:#28a745;">✅ 成功添加 ${resp.data.success} 条品势运动员，失败 ${resp.data.failed} 条</p>`;
        document.getElementById('poomsaeBatchData').value = '';
        loadAthletes();
    } else {
        resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 批量添加失败: ${resp.error}</p>`;
    }
}

async function handlePoomsaeExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('poomsaeExcelFileName').textContent = '已选择: ' + file.name;

    const formData = new FormData();
    formData.append('file', file);
    if (currentEventId) formData.append('event_id', currentEventId);
    formData.append('athlete_type', 'poomsae');

    const resultDiv = document.getElementById('poomsaeBatchResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p style="color:#ffc107;">⏳ 正在导入品势运动员...</p>';

    try {
        const resp = await fetch(API_BASE + '/athletes/import-excel', { method: 'POST', body: formData });
        const data = await resp.json();

        if (data.success) {
            resultDiv.innerHTML = `<p style="color:#28a745;">✅ 导入成功！成功 ${data.data.success} 条品势运动员，失败 ${data.data.failed} 条，共 ${data.data.total} 条</p>`;
            document.getElementById('poomsaeExcelFileName').textContent = '';
            document.getElementById('poomsaeExcelFileInput').value = '';
            loadAthletes();
        } else {
            resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 导入失败: ${data.error}</p>`;
        }
    } catch (err) {
        resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 上传错误: ${err.message}</p>`;
    }
}

function downloadPoomsaeTemplate() {
    const headers = ['姓名', '单位', '性别', '组别', '级别'];
    const sampleData = [
        ['张三', '北京队', '男', '少年组', '太极一章'],
        ['李四', '上海队', '女', '少年组', '太极一章'],
        ['王五', '广州队', '男', '儿童组', '太极二章'],
        ['赵六', '深圳队', '女', '儿童组', '太极二章']
    ];

    let csvContent = '\uFEFF';
    csvContent += headers.join(',') + '\n';
    sampleData.forEach(row => { csvContent += row.join(',') + '\n'; });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', '品势运动员导入模板.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== 打印 ====================

async function printAllAthletes() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const resp = await apiGet(buildAthleteQuery());
    if (!resp.success || !resp.data || resp.data.length === 0) {
        alert('没有运动员数据');
        return;
    }

    const athletes = resp.data;
    athletes.sort((a, b) => {
        if ((a.unit || '') < (b.unit || '')) return -1;
        if ((a.unit || '') > (b.unit || '')) return 1;
        if ((a.gender || '') < (b.gender || '')) return -1;
        if ((a.gender || '') > (b.gender || '')) return 1;
        return 0;
    });

    const unitGroups = new Map();
    athletes.forEach(a => {
        const unit = a.unit || '未指定';
        if (!unitGroups.has(unit)) unitGroups.set(unit, []);
        unitGroups.get(unit).push(a);
    });

    const eventName = currentEventName || '';
    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 品势运动员名单</title>');
    d.write('<style>');
    d.write('@page { size: A4 portrait; margin: 12mm 8mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 0; margin: 0; font-size: 10pt; }');
    d.write('.print-header { text-align: center; padding: 8px 0 12px; border-bottom: 2px solid #000; margin-bottom: 12px; }');
    d.write('.print-header h1 { font-size: 18pt; font-weight: bold; letter-spacing: 4px; margin: 0 0 4px; }');
    d.write('.print-header h2 { font-size: 14pt; font-weight: bold; margin: 0; }');
    d.write('.unit-section { page-break-before: always; break-before: page; }');
    d.write('.unit-section:first-of-type { page-break-before: auto; break-before: auto; }');
    d.write('.unit-title { font-size: 12pt; font-weight: bold; text-align: center; margin: 12px 0 6px; padding: 4px 0; border-bottom: 1px solid #333; position: relative; }');
    d.write('.unit-logo { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 28px; }');
    d.write('.unit-stats { font-size: 9pt; text-align: center; color: #666; margin-bottom: 8px; }');
    d.write('table { width: 100%; border-collapse: collapse; }');
    d.write('thead { display: table-header-group; }');
    d.write('tbody { display: table-row-group; }');
    d.write('th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; font-size: 9pt; white-space: nowrap; }');
    d.write('th { background: #f0f0f0; font-weight: bold; font-size: 9pt; }');
    d.write('tr { page-break-inside: avoid; break-inside: avoid; }');
    d.write('.male { color: #1565C0; }');
    d.write('.female { color: #C62828; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }');
    d.write('</style></head><body>');

    let idx = 0;
    for (const [unit, list] of unitGroups) {
        const maleCount = list.filter(a => a.gender === '男').length;
        const femaleCount = list.filter(a => a.gender === '女').length;
        d.write('<div class="unit-section">');
        d.write('<div class="print-header"><h1>' + eventName + '</h1><h2>品势运动员名单</h2></div>');
        d.write('<div class="unit-title"><img class="unit-logo" src="' + window.location.origin + '/images/logo.png">' + unit + '</div>');
        d.write('<div class="unit-stats">共 ' + list.length + ' 人（男 ' + maleCount + ' 人，女 ' + femaleCount + ' 人）</div>');
        d.write('<table>');
        d.write('<thead><tr><th>序号</th><th>运动员号</th><th>签号</th><th>姓名</th><th>性别</th><th>组别</th><th>级别</th></tr></thead>');
        d.write('<tbody>');
        list.forEach(a => {
            idx++;
            const genderClass = a.gender === '男' ? 'male' : 'female';
            d.write('<tr>');
            d.write('<td>' + idx + '</td>');
            d.write('<td>' + (a.athlete_no || '') + '</td>');
            d.write('<td>' + (a.draw_no || '') + '</td>');
            d.write('<td>' + (a.name || '') + '</td>');
            d.write('<td class="' + genderClass + '">' + (a.gender || '') + '</td>');
            d.write('<td>' + (a.group_class || '') + '</td>');
            d.write('<td>' + (a.weight_class || '') + '</td>');
            d.write('</tr>');
        });
        d.write('</tbody></table>');
        d.write('</div>');
    }

    d.write('</body></html>');
    d.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', function() {
});
