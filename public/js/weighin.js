let weighInData = [];
let allAthletesListForWeighin = [];

async function loadAllAthletesForWeighin() {
    try {
        let url = API_BASE + '/athletes';
        if (currentEventId) url += '?event_id=' + currentEventId;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.success && data.data) {
            allAthletesListForWeighin = Array.isArray(data.data) ? data.data : (data.data.results || data.data.athletes || []);
        }
    } catch (err) {
        console.error('加载运动员列表失败:', err);
        allAthletesListForWeighin = [];
    }
}

async function loadWeighinData() {
    try {
        await loadAllAthletesForWeighin();
        let url = API_BASE + '/athletes/weighin-data';
        if (currentEventId) url += '?event_id=' + currentEventId;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.success && data.data.results.length > 0) {
            weighInData = data.data.results;
            displayWeighInResults(data.data);
        } else {
            const display = document.getElementById('weighinDisplay');
            if (display) display.innerHTML = '<p style="color:#909399;text-align:center;padding:20px;">暂无称重数据，请导入称重表或手动录入</p>';
        }
    } catch (err) { console.error('加载称重数据失败:', err); }
}

async function loadWeighinTolerance() {
    try {
        const url = '/config' + (currentEventId ? '?event_id=' + currentEventId : '');
        const resp = await apiGet(url);
        if (resp.success) {
            if (resp.data.weighin_tolerance !== undefined) document.getElementById('weighinTolerance').value = resp.data.weighin_tolerance;
            if (resp.data.eventconfig_max_limit_tolerance !== undefined) document.getElementById('weighinMaxLevelLimit').value = resp.data.eventconfig_max_limit_tolerance;
            if (resp.data.eventconfig_min_limit_tolerance !== undefined) document.getElementById('weighinMinLevelLimit').value = resp.data.eventconfig_min_limit_tolerance;
        }
    } catch (err) { console.error('加载称重规则失败:', err); }
}

async function saveWeighinRules() {
    const tolerance = parseFloat(document.getElementById('weighinTolerance').value);
    const maxLimit = parseFloat(document.getElementById('weighinMaxLevelLimit').value);
    const minLimit = parseFloat(document.getElementById('weighinMinLevelLimit').value);

    if (isNaN(tolerance) || tolerance < 0) {
        alert('请输入有效的称重上下浮动区间'); return;
    }
    if (isNaN(maxLimit) || maxLimit < 0) {
        alert('请输入有效的最大级别上限'); return;
    }
    if (isNaN(minLimit) || minLimit < 0) {
        alert('请输入有效的最小级别上限'); return;
    }

    try {
        const resp = await apiPost('/config', {
            event_id: currentEventId,
            weighin_tolerance: tolerance,
            eventconfig_max_limit_tolerance: maxLimit,
            eventconfig_min_limit_tolerance: minLimit
        });
        if (resp.success) {
            alert('称重规则已保存');
        } else {
            alert('保存失败: ' + resp.error);
        }
    } catch (err) { alert('保存失败: ' + err.message); }
}

async function exportWeighInSheet() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const urlParams = getEventParam();
    const resp = await apiGet('/athletes?' + urlParams + '&athlete_type=taekwondo_kyougi');
    if (!resp.success || resp.data.length === 0) { alert('没有运动员数据'); return; }

    try {
        const response = await fetch(API_BASE + '/athletes/weighin-export?' + urlParams);
        if (!response.ok) throw new Error('导出失败');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '称重表.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) { alert('导出失败: ' + err.message); }
}

async function importWeighInResult(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (currentEventId) formData.append('event_id', currentEventId);

    try {
        const resp = await fetch(API_BASE + '/athletes/weighin-result', { method: 'POST', body: formData });
        const data = await resp.json();

        if (data.success) {
            weighInData = data.data.results;
            displayWeighInResults(data.data);
        } else {
            alert('导入失败: ' + data.error);
        }
    } catch (err) { alert('上传错误: ' + err.message); }
    event.target.value = '';
}

function displayWeighInResults(data) {
    const display = document.getElementById('weighinDisplay');
    let html = `<div class="stats-row" style="margin-bottom: 20px;">`;
    html += `<div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-value">${data.total}</div><div class="stat-label">总人数</div></div></div>`;
    html += `<div class="stat-card"><div class="stat-icon green">✓</div><div class="stat-info"><div class="stat-value" id="weighinQualifiedCount">${data.qualified}</div><div class="stat-label">合格</div></div></div>`;
    html += `<div class="stat-card"><div class="stat-icon red">✗</div><div class="stat-info"><div class="stat-value" id="weighinUnqualifiedCount">${data.unqualified}</div><div class="stat-label">不合格</div></div></div>`;
    html += `</div>`;

    html += `<div class="table-container" style="max-height:450px;overflow-y:auto;position:relative;">`;
    html += `<table id="weighinTable">`;
    html += `<thead><tr>
        <th data-col="index" style="display:table-cell;position:relative;cursor:pointer;">序号</th>
        <th data-col="athleteNo" style="display:table-cell;position:relative;cursor:pointer;">运动员号</th>
        <th data-col="name" style="display:table-cell;position:relative;cursor:pointer;">姓名</th>
        <th data-col="gender" style="display:table-cell;position:relative;cursor:pointer;">性别</th>
        <th data-col="unit" style="display:table-cell;position:relative;cursor:pointer;">代表队</th>
        <th data-col="weightClass" style="display:table-cell;position:relative;cursor:pointer;">级别</th>
        <th data-col="firstWeight" style="display:table-cell;position:relative;cursor:pointer;">第一次称重</th>
        <th data-col="secondWeight" style="display:table-cell;position:relative;cursor:pointer;">第二次称重</th>
        <th data-col="isQualified" style="display:table-cell;position:relative;cursor:pointer;">是否合格</th>
    </tr></thead>`;
    html += `<tbody>`;

    data.results.forEach((r, i) => {
        const statusClass = r.isQualified === '合格' ? 'status-pass' : r.isQualified === '不合格' ? 'status-fail' : '';
        const statusText = r.isQualified === '合格' ? '✓ 合格' : r.isQualified === '不合格' ? '✗ 不合格' : r.isQualified;
        html += `<tr data-idx="${i}">`;
        html += `<td data-col="index" style="display:table-cell;">${r.index}</td>`;
        html += `<td data-col="athleteNo" style="display:table-cell;">${r.athleteNo}</td>`;
        html += `<td data-col="name" style="display:table-cell;"><strong>${r.name}</strong></td>`;
        html += `<td data-col="gender" style="display:table-cell;">${r.gender}</td>`;
        html += `<td data-col="unit" style="display:table-cell;">${r.unit}</td>`;

        const availableClasses = typeof WeightClassSelector !== 'undefined' && allAthletesListForWeighin
            ? WeightClassSelector.getAvailableClasses(allAthletesListForWeighin, r.ageGroup, r.gender)
            : [...new Set(data.results.map(item => item.weightClass).filter(Boolean))].sort();
        const weightClassHtml = typeof WeightClassSelector !== 'undefined'
            ? WeightClassSelector.generateSelectWithButton('weighin_wc_' + i, r.weightClass, availableClasses, 'updateWeighinWeightClass(' + i + ')', 'data-idx="' + i + '"')
            : `<select id="weighin_wc_${i}" style="padding:3px 6px;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;max-width:140px;" data-idx="${i}"><option value="${r.weightClass}" selected>${r.weightClass}</option></select><button class="btn btn-primary" onclick="updateWeighinWeightClass(${i})" style="padding:3px 8px;font-size:11px;margin-left:4px;">✓</button>`;

        html += `<td data-col="weightClass" style="display:table-cell;text-align:center;">
                    ${weightClassHtml}
                 </td>`;

        const wcStr = String(r.weightClass || '');
        const rawFirst = r.firstWeight || '';
        const firstWeightVal = rawFirst ? (String(rawFirst).match(/(\d+(?:\.\d+)?)/) || [])[1] || '' : (wcStr ? (wcStr.match(/(\d+(?:\.\d+)?)/) || [])[1] || '' : '');
        const wcUnit = wcStr.includes('+') ? 'kg+' : 'kg';
        html += `<td data-col="firstWeight" style="display:table-cell;white-space:nowrap;"><input type="number" step="0.01" class="weighin-edit" data-field="firstWeight" data-idx="${i}" value="${firstWeightVal}" style="width:55px;padding:2px 4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;text-align:center;"><span style="font-size:12px;color:#606266;margin-left:2px;">${wcUnit}</span></td>`;
        const rawSecond = r.secondWeight || '';
        const secondWeightVal = rawSecond ? (String(rawSecond).match(/(\d+(?:\.\d+)?)/) || [])[1] || '' : '';
        html += `<td data-col="secondWeight" style="display:table-cell;white-space:nowrap;"><input type="number" step="0.01" class="weighin-edit" data-field="secondWeight" data-idx="${i}" value="${secondWeightVal}" style="width:55px;padding:2px 4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;text-align:center;"><span style="font-size:12px;color:#606266;margin-left:2px;">kg</span></td>`;
        html += `<td data-col="isQualified" style="display:table-cell;"><span class="status-badge ${statusClass} weighin-status" data-idx="${i}">${statusText}</span></td>`;
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    display.innerHTML = html;

    initWeighinColumnVisibility();
    initWeighinColumnSelection();

    if (typeof ExcelFilter !== 'undefined') {
        ExcelFilter.init('weighinTable', {
            excludeColumns: [6, 7],
            onFilterChange: function() {}
        });
        initWeighinContextMenu();
    }

    const thead = document.querySelector('#weighinTable thead');
    if (thead) {
        thead.style.cssText = 'position:sticky;top:0;z-index:10;background:linear-gradient(to right,#8B0000,#00008B);';
        thead.querySelectorAll('th').forEach(th => {
            th.style.cssText = 'position:sticky;top:0;z-index:10;background:transparent;';
        });
    }

    document.querySelectorAll('.weighin-edit').forEach(input => {
        input.addEventListener('change', function() {
            const idx = parseInt(this.dataset.idx);
            const field = this.dataset.field;
            weighInData[idx][field] = this.value;
            recalcWeighinStatus(idx);
            const r = weighInData[idx];
            fetch(API_BASE + '/athletes/weighin-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    athlete_no: r.athleteNo,
                    event_id: currentEventId || null,
                    first_weight: r.firstWeight || '',
                    second_weight: r.secondWeight || '',
                    is_qualified: r.isQualified || ''
                })
            }).catch(err => console.error('保存称重数据失败:', err));
        });
    });
}

function judgeSingleWeight(weightClass, weight) {
    if (!weight || isNaN(parseFloat(weight))) return '未标注';
    const w = parseFloat(weight);
    const match = String(weightClass).match(/(\d+(?:\.\d+)?)/);
    const kg = match ? parseFloat(match[1]) : null;
    const tolerance = parseFloat(document.getElementById('weighinTolerance').value) || 0.3;
    const maxLevelLimit = parseFloat(document.getElementById('weighinMaxLevelLimit').value) || 6;
    const minLevelLimit = parseFloat(document.getElementById('weighinMinLevelLimit').value) || 5;

    if (kg === null || isNaN(w)) return '未标注';
    if (String(weightClass).includes('+')) {
        return w > kg + maxLevelLimit ? '不合格' : '合格';
    }
    const allClasses = [...new Set(weighInData.map(d => d.weightClass).filter(Boolean))];
    const prefix = String(weightClass).replace(/(\d+(?:\.\d+)?)(\+?)(kg.*)$/i, '').trim();
    const sameGroupClasses = allClasses.filter(cls => {
        const clsPrefix = String(cls).replace(/(\d+(?:\.\d+)?)(\+?)(kg.*)$/i, '').trim();
        return clsPrefix === prefix;
    });
    const lowerClasses = sameGroupClasses
        .filter(cls => !cls.includes('+'))
        .map(cls => { const m = cls.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; })
        .filter(k => k !== null && k < kg)
        .sort((a, b) => b - a);
    const isMinLevel = lowerClasses.length === 0;
    if (isMinLevel && w < kg - minLevelLimit) return '不合格';
    if (!isMinLevel && w <= lowerClasses[0] + tolerance) return '不合格';
    if (w > kg + tolerance) return '不合格';
    return '合格';
}

function recalcWeighinStatus(idx) {
    const r = weighInData[idx];
    if (!r.firstWeight && !r.secondWeight) {
        r.isQualified = '未标注';
    } else {
        const firstResult = r.firstWeight ? judgeSingleWeight(r.weightClass, r.firstWeight) : '未标注';
        const secondResult = r.secondWeight ? judgeSingleWeight(r.weightClass, r.secondWeight) : '未标注';
        if (firstResult === '合格' || secondResult === '合格') {
            r.isQualified = '合格';
        } else if (firstResult === '不合格' || secondResult === '不合格') {
            r.isQualified = '不合格';
        } else {
            r.isQualified = '未标注';
        }
    }

    const statusEl = document.querySelector(`.weighin-status[data-idx="${idx}"]`);
    if (statusEl) {
        const statusClass = r.isQualified === '合格' ? 'status-pass' : r.isQualified === '不合格' ? 'status-fail' : '';
        const statusText = r.isQualified === '合格' ? '✓ 合格' : r.isQualified === '不合格' ? '✗ 不合格' : r.isQualified;
        statusEl.className = `status-badge ${statusClass} weighin-status`;
        statusEl.textContent = statusText;
    }

    let qualified = 0, unqualified = 0;
    weighInData.forEach(r => {
        if (r.isQualified === '合格') qualified++;
        else if (r.isQualified === '不合格') unqualified++;
    });
    const qEl = document.getElementById('weighinQualifiedCount');
    const uEl = document.getElementById('weighinUnqualifiedCount');
    if (qEl) qEl.textContent = qualified;
    if (uEl) uEl.textContent = unqualified;
}

async function removeUnqualifiedAthletes() {
    if (weighInData.length === 0) { alert('请先导入称重结果'); return; }

    const unqualified = weighInData.filter(r => r.isQualified === '不合格');
    if (unqualified.length === 0) { alert('没有不合格运动员'); return; }
    if (!confirm(`确定删除 ${unqualified.length} 名不合格运动员吗？\n${unqualified.map(u => u.name).join(', ')}`)) return;

    const resp = await apiPost('/athletes/remove-unqualified', {
        athleteNos: unqualified.map(u => u.athleteNo),
        event_id: currentEventId
    });

    if (resp.success) {
        alert(`已删除 ${resp.data.removed} 名不合格运动员`);
        safeCall('loadAthletes');
        weighInData = [];
        document.getElementById('weighinDisplay').innerHTML = '<p style="text-align: center; color: #909399; padding: 40px 0;">导出称重表供运动员称重，然后导入称重结果并删除不合格运动员</p>';
    } else {
        alert('删除失败: ' + resp.error);
    }
}

async function markAllQualified() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm('确定将所有运动员标记为合格？此操作将跳过称重环节。')) return;

    const resp = await apiGet('/athletes?event_id=' + currentEventId + '&athlete_type=taekwondo_kyougi');
    if (!resp.success || resp.data.length === 0) { alert('没有运动员数据'); return; }

    let successCount = 0;
    for (const a of resp.data) {
        try {
            const wcStr = String(a.weight_class || '');
            const numMatch = wcStr.match(/(\d+(?:\.\d+)?)/);
            const presetWeight = numMatch ? numMatch[1] : '';
            await fetch(API_BASE + '/athletes/weighin-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    athlete_no: a.athlete_no,
                    event_id: currentEventId,
                    first_weight: presetWeight,
                    second_weight: '',
                    is_qualified: '合格'
                })
            });
            successCount++;
        } catch (err) {
            console.error('标记合格失败:', a.name, err);
        }
    }

    alert(`✅ 已将 ${successCount} 名运动员全部标记为合格`);
    loadWeighinData();
}

async function updateWeighinWeightClass(idx) {
    const select = document.getElementById('weighin_wc_' + idx);
    const newClass = select.value.trim();
    if (!newClass) { alert('级别不能为空'); return; }

    const r = weighInData[idx];
    if (!r) { alert('找不到运动员数据'); return; }

    try {
        const resp = await fetch(API_BASE + '/athletes/' + r.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ athlete_category: newClass })
        });
        const data = await resp.json();

        if (data.success) {
            r.weightClass = newClass;
            recalcWeighinStatus(idx);

            await fetch(API_BASE + '/athletes/weighin-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    athlete_no: r.athleteNo,
                    event_id: currentEventId || null,
                    first_weight: r.firstWeight || '',
                    second_weight: r.secondWeight || '',
                    is_qualified: r.isQualified
                })
            });

            alert('✅ 级别修改成功');
        } else {
            alert('修改失败: ' + data.error);
        }
    } catch (err) {
        console.error('更新级别失败:', err);
        alert('修改失败: ' + err.message);
    }
}

const WEIGHIN_COLUMNS = [
    { key: 'index', label: '序号' },
    { key: 'athleteNo', label: '运动员号' },
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别' },
    { key: 'unit', label: '代表队' },
    { key: 'weightClass', label: '级别' },
    { key: 'firstWeight', label: '第一次称重' },
    { key: 'secondWeight', label: '第二次称重' },
    { key: 'isQualified', label: '是否合格' }
];

let selectedColumns = [];
let activeContextMenu = null;

function getWeighinColumnVisibility() {
    const saved = localStorage.getItem('weighin_column_visibility');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('解析列显示设置失败:', e);
        }
    }
    const defaultVisibility = {};
    WEIGHIN_COLUMNS.forEach(col => {
        defaultVisibility[col.key] = true;
    });
    return defaultVisibility;
}

function saveWeighinColumnVisibility(visibility) {
    localStorage.setItem('weighin_column_visibility', JSON.stringify(visibility));
}

function initWeighinColumnVisibility() {
    const visibility = getWeighinColumnVisibility();
    applyWeighinColumnVisibility(visibility);
}

function applyWeighinColumnVisibility(visibility) {
    if (!document.querySelector('#weighinTable')) return;

    WEIGHIN_COLUMNS.forEach(col => {
        const isVisible = visibility[col.key] !== false;
        document.querySelectorAll(`#weighinTable th[data-col="${col.key}"]`).forEach(th => {
            th.style.display = isVisible ? 'table-cell' : 'none';
        });
        document.querySelectorAll(`#weighinTable td[data-col="${col.key}"]`).forEach(td => {
            td.style.display = isVisible ? 'table-cell' : 'none';
        });
    });
}

function initWeighinColumnSelection() {
    const table = document.getElementById('weighinTable');
    if (!table) return;

    table.addEventListener('click', function(e) {
        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            selectColumn(th.dataset.col, e.shiftKey);
        } else if (!e.target.closest('.excel-filter-icon')) {
            clearColumnSelection();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearColumnSelection();
            closeContextMenu();
        }
    });
}

function selectColumn(columnKey, isShift) {
    if (isShift && selectedColumns.length > 0) {
        const lastSelected = selectedColumns[selectedColumns.length - 1];
        const lastIndex = WEIGHIN_COLUMNS.findIndex(col => col.key === lastSelected);
        const currentIndex = WEIGHIN_COLUMNS.findIndex(col => col.key === columnKey);

        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        for (let i = start; i <= end; i++) {
            if (!selectedColumns.includes(WEIGHIN_COLUMNS[i].key)) {
                selectedColumns.push(WEIGHIN_COLUMNS[i].key);
            }
        }
    } else {
        const idx = selectedColumns.indexOf(columnKey);
        if (idx > -1) {
            selectedColumns.splice(idx, 1);
        } else {
            selectedColumns.push(columnKey);
        }
    }

    updateColumnSelectionUI();
}

function clearColumnSelection() {
    selectedColumns = [];
    updateColumnSelectionUI();
}

function updateColumnSelectionUI() {
    const table = document.getElementById('weighinTable');
    if (!table) return;

    table.querySelectorAll('th').forEach(th => {
        if (selectedColumns.includes(th.dataset.col)) {
            th.style.background = '#c6e2ff';
            th.style.color = '#0050b3';
        } else {
            th.style.background = '';
            th.style.color = '';
        }
    });

    table.querySelectorAll('td').forEach(td => {
        if (selectedColumns.includes(td.dataset.col)) {
            td.style.background = '#e6f4ff';
        } else {
            td.style.background = '';
        }
    });
}

function initWeighinContextMenu() {
    const table = document.getElementById('weighinTable');
    if (!table) return;

    table.addEventListener('contextmenu', function(e) {
        e.preventDefault();

        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            showContextMenu(e.clientX, e.clientY, th.dataset.col);
        }
    });
}

function showContextMenu(x, y, columnKey) {
    closeContextMenu();

    const visibility = getWeighinColumnVisibility();
    const isSelected = selectedColumns.length > 0;
    const isHidden = visibility[columnKey] === false;

    const menu = document.createElement('div');
    menu.className = 'excel-context-menu';
    menu.id = 'weighinContextMenu';

    let html = '';

    if (isSelected) {
        html += `<div class="ecm-item" onclick="hideSelectedColumns()">
                    <span class="ecm-icon">👁️‍🗨️</span>
                    <span>隐藏选中列</span>
                 </div>`;
    }

    html += `<div class="ecm-item" onclick="hideColumn('${columnKey}')">
                <span class="ecm-icon">👁️‍🗨️</span>
                <span>隐藏此列</span>
             </div>`;

    const hiddenColumns = WEIGHIN_COLUMNS.filter(col => visibility[col.key] === false);
    if (hiddenColumns.length > 0) {
        html += `<div class="ecm-divider"></div>`;
        html += `<div style="padding:8px 12px;font-size:11px;color:#909399;font-weight:bold;">取消隐藏</div>`;
        hiddenColumns.forEach(col => {
            html += `<div class="ecm-item" onclick="showColumn('${col.key}')">
                        <span class="ecm-icon">👁️</span>
                        <span>${col.label}</span>
                     </div>`;
        });
    }

    html += `<div class="ecm-divider"></div>`;
    html += `<div class="ecm-item" onclick="showAllWeighinColumns()">
                <span class="ecm-icon">👁️</span>
                <span>显示全部列</span>
             </div>`;

    menu.innerHTML = html;
    document.body.appendChild(menu);
    activeContextMenu = menu;

    requestAnimationFrame(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let posX = x;
        let posY = y;

        if (x + menuWidth > viewportWidth) {
            posX = viewportWidth - menuWidth - 5;
        }
        if (y + menuHeight > viewportHeight) {
            posY = viewportHeight - menuHeight - 5;
        }

        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
    });

    setTimeout(() => {
        document.addEventListener('click', handleContextMenuOutsideClick);
    }, 10);
}

function closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
        document.removeEventListener('click', handleContextMenuOutsideClick);
    }
}

function handleContextMenuOutsideClick(e) {
    const menu = document.getElementById('weighinContextMenu');
    if (menu && !menu.contains(e.target)) {
        closeContextMenu();
    }
}

function hideColumn(columnKey) {
    const visibility = getWeighinColumnVisibility();
    visibility[columnKey] = false;
    saveWeighinColumnVisibility(visibility);
    applyWeighinColumnVisibility(visibility);
    closeContextMenu();
    clearColumnSelection();
}

function hideSelectedColumns() {
    const visibility = getWeighinColumnVisibility();
    selectedColumns.forEach(colKey => {
        visibility[colKey] = false;
    });
    saveWeighinColumnVisibility(visibility);
    applyWeighinColumnVisibility(visibility);
    closeContextMenu();
    clearColumnSelection();
}

function showColumn(columnKey) {
    const visibility = getWeighinColumnVisibility();
    visibility[columnKey] = true;
    saveWeighinColumnVisibility(visibility);
    applyWeighinColumnVisibility(visibility);
    closeContextMenu();
}

function showAllWeighinColumns() {
    const visibility = {};
    WEIGHIN_COLUMNS.forEach(col => {
        visibility[col.key] = true;
    });
    saveWeighinColumnVisibility(visibility);
    applyWeighinColumnVisibility(visibility);
    closeContextMenu();
}
