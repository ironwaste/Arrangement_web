// ==================== 运动员管理页面 ====================

// ==================== 工具函数 ====================

function isPoomsaeEvent() {
    return currentEventType === 'taekwondo_poomsae';
}

function getTypeLabel() {
    return isPoomsaeEvent() ? '品势' : '竞技';
}

function buildAthleteQuery(extraParams) {
    if (isPoomsaeEvent()) {
        let url = '/poomsae-athletes?' + getEventParam();
        if (extraParams) {
            for (const [key, val] of Object.entries(extraParams)) {
                if (val !== undefined && val !== null && val !== '') {
                    url += '&' + key + '=' + encodeURIComponent(val);
                }
            }
        }
        return url;
    }
    let url = '/athletes?' + getEventParam() + '&athlete_type=' + (currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : currentEventType === 'chinese_wrestle' ? 'chinese_wrestle' : 'taekwondo_kyougi');
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
    if (isPoomsaeEvent()) return bodyOrUrl;
    const at = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : currentEventType === 'chinese_wrestle' ? 'chinese_wrestle' : 'taekwondo_kyougi';
    if (isUrl) {
        bodyOrUrl += '&athlete_type=' + at;
    } else {
        bodyOrUrl.athlete_type = at;
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

    let displayList = allAthletesList;
    if (selectedClass) {
        displayList = allAthletesList.filter(a => a.athlete_category === selectedClass);
    }

    displayList.forEach((a, index) => {
        const tr = document.createElement('tr');
        if (index % 2 === 1) tr.style.background = '#A8D8B9';

        const availableClasses = typeof WeightClassSelector !== 'undefined'
            ? WeightClassSelector.getAvailableClasses(allAthletesList, a.athlete_age_group, a.athlete_gender, a.athlete_type)
            : [];
        const isUnqualified = a.is_qualified === '不合格';
        const weightClassHtml = typeof WeightClassSelector !== 'undefined'
            ? WeightClassSelector.generateSelectWithButton('wc_' + a.id, a.athlete_category, availableClasses, 'updateWeightClass(' + a.id + ')', 'data-unqualified="' + isUnqualified + '"', isUnqualified)
            : `<select id="wc_${a.id}" style="padding:3px 6px;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;max-width:140px;"><option value="${a.athlete_category}" selected>${a.athlete_category}</option></select><button class="btn btn-primary" onclick="updateWeightClass(${a.id})" style="padding:3px 8px;font-size:11px;margin-left:4px;">✓</button>`;

        let typeLabel = '竞技';

        tr.innerHTML = `
            <td data-col="index" style="text-align:center;">${index + 1}</td>
            <td data-col="type" style="text-align:center;">${typeLabel}</td>
            <td data-col="athleteId" style="text-align:center;">${a.athlete_id}</td>
            <td data-col="drawNo" style="white-space:nowrap;text-align:center;">
                <input type="number" id="draw_${a.id}" value="${a.athlete_draw_num || ''}"
                    style="width:50px;padding:2px 4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;text-align:center;"
                    onchange="updateDrawNo(${a.id})">
            </td>
            <td data-col="name" style="text-align:center;">${a.athlete_name}</td>
            <td data-col="gender" style="text-align:center;">${a.athlete_gender}</td>
            <td data-col="unit" style="text-align:center;">${a.athlete_team || '-'}</td>
            <td data-col="ageGroup" style="text-align:center;">${a.athlete_age_group || '-'}</td>
            <td data-col="category" style="text-align:center;">${a.athlete_category}</td>
            <td data-col="weightClassSelect" style="text-align:center;">
                ${weightClassHtml}
            </td>
            <td data-col="action" style="text-align:center;">
                <button class="btn btn-danger" onclick="deleteAthlete(${a.id})" style="padding:5px 12px;font-size:12px;">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const totalEl = document.getElementById('totalAthletes');
    if (totalEl) totalEl.textContent = displayList.length;
    loadClassList(allAthletesList);

    if (typeof ExcelFilter !== 'undefined') {
        const table = document.querySelector('.athlete-main table');
        if (table && !table.id) {
            table.id = 'athletesMainTable';
            
            const thead = table.querySelector('thead');
            if (thead) {
                const headers = thead.querySelectorAll('th');
                const colKeys = ['index', 'type', 'athleteId', 'drawNo', 'name', 'gender', 'unit', 'ageGroup', 'category', 'weightClassSelect', 'action'];
                headers.forEach((th, idx) => {
                    if (colKeys[idx]) {
                        th.setAttribute('data-col', colKeys[idx]);
                        th.style.cursor = 'pointer';
                    }
                });
                
                thead.style.cssText = 'position:sticky;top:0;z-index:10;background:linear-gradient(to right,#8B0000,#00008B);';
                headers.forEach(th => {
                    th.style.cssText = th.getAttribute('style') + ';position:sticky;top:0;z-index:10;background:transparent;';
                });
            }
            
            ExcelFilter.init('athletesMainTable', {
                excludeColumns: [9, 10]
            });
            
            initAthletesColumnVisibility();
            initAthletesColumnSelection();
            initAthletesContextMenu();
        }
    }

    applyAthletesColumnVisibility(getAthletesColumnVisibility());
}

function parseWeightFromClass(cls) {
    const match = String(cls).match(/(\d+(?:\.\d+)?)(?:kg|KG)?/i);
    return match ? parseFloat(match[1]) : 0;
}

function getGroupOrderFromClass(cls) {
    const schoolOrder = { '小学': 1, '初中': 2, '高中': 3, '大学': 4, '成年': 5 };
    const tianganOrder = { '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10 };
    
    for (const key of Object.keys(schoolOrder)) {
        if (cls.includes(key)) {
            return schoolOrder[key];
        }
    }
    
    for (const key of Object.keys(tianganOrder)) {
        if (cls.includes(key)) {
            return tianganOrder[key] + 100;
        }
    }
    
    return 99;
}

function getGenderFromClass(cls) {
    return cls.includes('女') ? '女' : '男';
}

function sortWeightClasses(classes) {
    return [...classes].sort((a, b) => {
        const genderA = getGenderFromClass(a);
        const genderB = getGenderFromClass(b);
        if (genderA !== genderB) {
            return genderA === '男' ? -1 : 1;
        }
        
        const groupA = getGroupOrderFromClass(a);
        const groupB = getGroupOrderFromClass(b);
        if (groupA !== groupB) {
            return groupA - groupB;
        }
        
        return a.localeCompare(b, 'zh-CN');
    });
}

function loadClassList(allAthletes) {
    if (!currentEventId) {
        document.getElementById('classList').innerHTML = '';
        return;
    }

    const athletes = allAthletes || [];

    const groupMap = {};
    
    athletes.forEach(a => {
        const group = a.athlete_age_group || '未分组';
        const cls = a.athlete_category || '未分类';
        
        if (!groupMap[group]) groupMap[group] = {};
        if (!groupMap[group][cls]) groupMap[group][cls] = { total: 0, drawn: 0 };
        
        groupMap[group][cls].total++;
        if (a.athlete_draw_num) {
            groupMap[group][cls].drawn++;
        }
    });

    const listEl = document.getElementById('classList');
    listEl.innerHTML = '';
    
    if (Object.keys(groupMap).length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'background:transparent;border:1px dashed #d9deea;color:#8a93a6;cursor:default;text-align:center;';
        emptyLi.textContent = '暂无运动员数据';
        listEl.appendChild(emptyLi);
        return;
    }

    const schoolOrder = { '小学': 1, '初中': 2, '高中': 3, '大学': 4, '成年': 5 };
    const tianganOrder = { '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10 };
    
    const getGroupSortValue = (group) => {
        for (const key of Object.keys(schoolOrder)) {
            if (group.includes(key)) return schoolOrder[key];
        }
        for (const key of Object.keys(tianganOrder)) {
            if (group.includes(key)) return tianganOrder[key] + 100;
        }
        return 99;
    };
    
    const groups = Object.keys(groupMap).sort((a, b) => {
        return getGroupSortValue(a) - getGroupSortValue(b);
    });

    const allItem = document.createElement('li');
    allItem.className = 'all-item' + (selectedClass === '' ? ' active' : '');
    allItem.innerHTML = `<span>全部</span><span class="count">${athletes.length}</span>`;
    allItem.onclick = () => { selectedClass = ''; loadAthletes(); };
    listEl.appendChild(allItem);

    groups.forEach(group => {
        const classMap = groupMap[group];
        const classes = sortWeightClasses(Object.keys(classMap));
        const classCount = classes.length;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'group-container';
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.innerHTML = `<span style="font-weight:bold;">${group}</span><span class="count" style="margin-left:auto;">${classCount}个级别</span>`;
        groupHeader.onclick = () => {
            groupDiv.classList.toggle('collapsed');
        };
        groupDiv.appendChild(groupHeader);

        const classList = document.createElement('ul');
        classList.className = 'group-class-list';
        
        classes.forEach(cls => {
            const info = classMap[cls];
            const isFullyDrawn = info.drawn === info.total;
            const isPartiallyDrawn = info.drawn > 0 && info.drawn < info.total;
            const isNotDrawn = info.drawn === 0;
            
            const li = document.createElement('li');
            li.className = selectedClass === cls ? 'active' : '';
            
            let statusBadge = '';
            let statusStyle = '';
            
            if (isFullyDrawn) {
                statusBadge = '✅';
                statusStyle = 'background:#f0f9eb;border-color:#c2e7b0;';
            } else if (isPartiallyDrawn) {
                statusBadge = '⏳';
                statusStyle = 'background:#fdf6ec;border-color:#faecd8;';
            } else {
                statusBadge = '⏸️';
                statusStyle = 'background:#fef0f0;border-color:#fde2e2;';
            }
            
            li.style.cssText = statusStyle;
            li.innerHTML = `<span>${statusBadge} ${cls}</span><span class="count">${info.drawn}/${info.total}</span>`;
            li.onclick = (e) => {
                e.stopPropagation();
                selectedClass = cls;
                loadAthletes();
            };
            classList.appendChild(li);
        });
        
        groupDiv.appendChild(classList);
        listEl.appendChild(groupDiv);
    });
}

// ==================== 类型筛选 ====================

function filterByType(type) {
    currentAthleteType = type;
    selectedClass = '';
    loadAthletes();
}

// ==================== 单个运动员 CRUD ====================

function showAddAthleteModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    document.getElementById('athleteModal').classList.add('active');
}

function closeModal() {
    document.getElementById('athleteModal').classList.remove('active');
}

async function saveAthlete() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    if (isPoomsaeEvent()) {
        const data = {
            athlete_name: document.getElementById('newAthleteName').value,
            athlete_gender: document.getElementById('newAthleteGender').value,
            athlete_team: document.getElementById('newAthleteUnit').value,
            event_id: currentEventId
        };
        const resp = await apiPost('/poomsae-athletes', data);
        if (resp.success) { closeModal(); loadAthletes(); }
    } else {
        const data = {
            athlete_id: document.getElementById('newAthleteNo').value,
            athlete_name: document.getElementById('newAthleteName').value,
            athlete_gender: document.getElementById('newAthleteGender').value,
            athlete_team: document.getElementById('newAthleteUnit').value,
            athlete_age_group: document.getElementById('newAthleteAgeGroup').value,
            athlete_category: document.getElementById('newAthleteClass').value,
            athlete_draw_num: parseInt(document.getElementById('newAthleteSeed').value) || 0,
            event_id: currentEventId
        };
        applyAthleteTypeFilter(data, false);
        const resp = await apiPost('/athletes', data);
        if (resp.success) { 
            closeModal(); 
            loadAthletes(); 
        } else {
            alert(resp.error || '添加失败');
        }
    }
}

async function deleteAthlete(id) {
    if (!confirm('确定删除该运动员？')) return;
    const url = isPoomsaeEvent() ? '/poomsae-athletes/' + id : '/athletes/' + id;
    await fetch(API_BASE + url, { method: 'DELETE' });
    loadAthletes();
}

async function updateWeightClass(id) {
    const select = document.getElementById('wc_' + id);
    const newClass = select.value.trim();
    if (!newClass) { alert('级别不能为空'); return; }
    const resp = await fetch(API_BASE + '/athletes/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athlete_category: newClass })
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
        body: JSON.stringify({ athlete_draw_num: newDrawNo })
    });
    const data = await resp.json();
    if (!data.success) { alert('修改签号失败: ' + data.error); loadAthletes(); }
}

// ==================== 抽签管理 ====================

async function doDraw(weightClass) {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const resp = await apiGet(buildAthleteQuery());
    const allAthletes = resp.data || [];

    const classMap = {};
    allAthletes.forEach(a => {
        const cls = a.athlete_category || '未分组';
        if (!classMap[cls]) classMap[cls] = [];
        classMap[cls].push(a);
    });

    const singlePersonClasses = [];
    for (const [cls, athletes] of Object.entries(classMap)) {
        if (athletes.length === 1) {
            singlePersonClasses.push({ athlete_category: cls, athlete: athletes[0] });
        }
    }

    const otherClasses = Object.keys(classMap).filter(cls => classMap[cls].length > 1).sort();

    if (singlePersonClasses.length > 0) {
        showMergeClassModal(singlePersonClasses, otherClasses, weightClass);
        return;
    }

    proceedDraw(weightClass);
}

function showMergeClassModal(singlePersonClasses, otherClasses, drawWeightClass) {
    const listDiv = document.getElementById('mergeClassList');
    listDiv.innerHTML = '';

    singlePersonClasses.forEach((item, idx) => {
        const a = item.athlete;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #ebeef5;';

        let suggestClass = '';
        const currentCls = item.athlete_category;
        const numMatch = currentCls.match(/[\d.]+/);
        if (numMatch) {
            const currentNum = parseFloat(numMatch[0]);
            let closest = null;
            let minDiff = Infinity;
            otherClasses.forEach(cls => {
                const m = cls.match(/[\d.]+/);
                if (m) {
                    const diff = Math.abs(parseFloat(m[0]) - currentNum);
                    if (diff < minDiff) { minDiff = diff; closest = cls; }
                }
            });
            if (closest) suggestClass = closest;
        } else if (otherClasses.length > 0) {
            suggestClass = otherClasses[0];
        }

        const allOptions = [...otherClasses, currentCls].sort().map(cls =>
            `<option value="${cls}" ${cls === suggestClass ? 'selected' : ''}>${cls}</option>`
        ).join('');

        row.innerHTML = `
            <span style="flex:1;color:#f56c6c;font-weight:600;">${currentCls}</span>
            <span style="flex:1;">${a.athlete_name}（${a.athlete_team || '-'}）</span>
            <span style="flex:1;">
                <select id="mergeTarget_${idx}" style="padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:13px;width:90%;">
                    ${allOptions}
                </select>
            </span>
            <input type="hidden" id="mergeAthleteId_${idx}" value="${a.id}">
        `;
        listDiv.appendChild(row);
    });

    window._mergeDrawWeightClass = drawWeightClass;
    window._mergeSingleCount = singlePersonClasses.length;
    document.getElementById('mergeClassModal').classList.add('active');
}

function closeMergeClassModal() {
    document.getElementById('mergeClassModal').classList.remove('active');
}

async function applyMergeAndDraw() {
    const count = window._mergeSingleCount || 0;
    let successCount = 0;

    for (let i = 0; i < count; i++) {
        const athleteId = document.getElementById('mergeAthleteId_' + i).value;
        const newClass = document.getElementById('mergeTarget_' + i).value;
        const resp = await fetch(API_BASE + '/athletes/' + athleteId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ athlete_category: newClass })
        });
        const data = await resp.json();
        if (data.success) successCount++;
    }

    closeMergeClassModal();

    if (successCount > 0) {
        await loadAthletes();
    }

    proceedDraw(window._mergeDrawWeightClass);
}

async function proceedDraw(weightClass) {
    const msg = weightClass ? `确定对「${weightClass}」进行抽签？` : '确定对所有级别进行抽签？';
    if (!confirm(msg)) return;

    if (typeof currentEventType !== 'undefined' && currentEventType === 'jiu_jitsu' && currentEventId) {
        try {
            const clearBody = { event_id: currentEventId };
            if (weightClass) clearBody.weight_class = weightClass;
            await apiPost('/jj-brackets/clear', clearBody);
        } catch (e) {}
    }

    const body = {
        event_id: currentEventId,
        weight_class: weightClass || undefined,
        avoid_same_team: true
    };
    applyAthleteTypeFilter(body);

    const resp = await apiPost('/athletes/draw', body);

    if (resp.success) {
        const d = resp.data || {};
        const totalDrawn = d.total_drawn || 0;
        const classes = d.classes || [];
        let msg = `✅ 抽签完成！共 ${totalDrawn} 人，涉及 ${classes.length} 个级别`;
        if (d.team_adjustments && d.team_adjustments.length > 0) {
            msg += '\n🔄 同队回避调整：';
            d.team_adjustments.forEach(t => { msg += `\n  ${t.athlete_team}:${t.count} 人 → 分配到 ${t.zones} 个分区`; });
        }
        alert(msg);
        selectedClass = weightClass || '';
        loadAthletes();
    } else {
        alert('❌ 抽签失败: ' + resp.error);
    }
}

function showDrawModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    document.getElementById('drawModal').classList.add('active');
    document.getElementById('drawResult').style.display = 'none';
    document.getElementById('drawResult').innerHTML = '';
    const searchClassEl = document.getElementById('searchClass');
    const searchClass = searchClassEl ? searchClassEl.value.trim() : '';
    if (searchClass) {
        document.getElementById('drawScope').value = 'class';
        document.getElementById('drawClassInput').value = searchClass;
        document.getElementById('drawClassGroup').style.display = 'block';
    }
}

function closeDrawModal() {
    document.getElementById('drawModal').classList.remove('active');
}

async function executeDraw() {
    const scope = document.getElementById('drawScope').value;
    const avoidSameTeam = document.getElementById('drawAvoidSameTeam').checked;
    const weightClass = scope === 'class' ? document.getElementById('drawClassInput').value.trim() : '';

    if (scope === 'class' && !weightClass) { alert('请输入级别'); return; }

    const resultDiv = document.getElementById('drawResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p style="color:#e6a23c;">⏳ 正在抽签...</p>';

    if (typeof currentEventType !== 'undefined' && currentEventType === 'jiu_jitsu' && currentEventId) {
        try {
            const clearBody = { event_id: currentEventId };
            if (weightClass) clearBody.weight_class = weightClass;
            await apiPost('/jj-brackets/clear', clearBody);
        } catch (e) {}
    }

    const body = {
        event_id: currentEventId,
        weight_class: weightClass || undefined,
        avoid_same_team: avoidSameTeam
    };
    applyAthleteTypeFilter(body);

    const resp = await apiPost('/athletes/draw', body);

    if (resp.success) {
        const d = resp.data || {};
        const totalDrawn = d.total_drawn || 0;
        const classes = d.classes || [];
        let html = `<p style="color:#67c23a;">✅ 抽签完成！共 ${totalDrawn} 人，涉及 ${classes.length} 个级别</p>`;
        if (d.team_adjustments && d.team_adjustments.length > 0) {
            html += `<p style="color:#409EFF;margin-top:8px;">🔄 同队回避调整：</p><ul style="color:#606266;font-size:13px;padding-left:20px;">`;
            d.team_adjustments.forEach(t => { html += `<li>${t.unit}：${t.count} 人 → 分配到 ${t.zones} 个分区</li>`; });
            html += `</ul>`;
        }
        resultDiv.innerHTML = html;
        loadAthletes();
    } else {
        resultDiv.innerHTML = `<p style="color:#f56c6c;">❌ 抽签失败: ${resp.error}</p>`;
    }
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

function showBatchAthleteModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    document.getElementById('batchAthleteModal').classList.add('active');
    document.getElementById('batchResult').style.display = 'none';
    document.getElementById('batchResult').innerHTML = '';
}

function closeBatchModal() {
    document.getElementById('batchAthleteModal').classList.remove('active');
}

async function saveBatchAthletes(type) {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const rawText = document.getElementById('batchAthleteData').value.trim();
    if (!rawText) { alert('请输入运动员数据'); return; }

    const lines = rawText.split('\n').filter(line => line.trim());
    const athletes = [];
    const errors = [];

    const batchAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : currentEventType === 'chinese_wrestle' ? 'chinese_wrestle' : 'taekwondo_kyougi';

    lines.forEach((line, index) => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 5) { errors.push(`第 ${index + 1} 行格式错误: ${line}`); return; }

        if (parts.length === 7) {
            athletes.push({
                athlete_id: parts[1], athlete_name: parts[2], athlete_gender: parts[3],
                athlete_team: parts[4], athlete_age_group: parts[5], athlete_category: parts[6],
                athlete_draw_num: 0, athlete_type: batchAthleteType
            });
        } else {
            athletes.push({
                athlete_id: parts[0], athlete_name: parts[1], athlete_gender: parts[2],
                athlete_team: parts[3], athlete_category: parts[4],
                athlete_draw_num: parseInt(parts[5]) || 0, athlete_type: batchAthleteType
            });
        }
    });

    if (errors.length > 0) { alert('数据格式错误:\n' + errors.join('\n')); return; }

    const resp = await apiPost('/athletes/batch', { athletes, event_id: currentEventId, athlete_type: batchAthleteType });
    const resultDiv = document.getElementById('batchResult');
    resultDiv.style.display = 'block';

    if (resp.success) {
        resultDiv.innerHTML = `<p style="color:#28a745;">✅ 成功添加 ${resp.data.success} 条竞技运动员，失败 ${resp.data.failed} 条</p>`;
        document.getElementById('batchAthleteData').value = '';
        loadAthletes();
    } else {
        resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 批量添加失败: ${resp.error}</p>`;
    }
}

// ==================== Excel 导入 ====================

async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentEventId) {
        alert('⚠️ 请先选择赛事！');
        document.getElementById('excelFileName').textContent = '';
        document.getElementById('excelFileInput').value = '';
        return;
    }

    document.getElementById('excelFileName').textContent = '已选择: ' + file.name;

    const formData = new FormData();
    formData.append('file', file);
    if (currentEventId) formData.append('event_id', currentEventId);
    const excelAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : currentEventType === 'chinese_wrestle' ? 'chinese_wrestle' : 'taekwondo_kyougi';
    formData.append('athlete_type', excelAthleteType);

    const resultDiv = document.getElementById('batchResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p style="color:#ffc107;">⏳ 正在导入...</p>';

    try {
        const resp = await fetch(API_BASE + '/athletes/import-excel', { method: 'POST', body: formData });
        const data = await resp.json();

        if (data.success) {
            resultDiv.innerHTML = `<p style="color:#28a745;">✅ 导入成功！成功 ${data.data.success} 条竞技运动员，失败 ${data.data.failed} 条，共 ${data.data.total} 条</p>`;
            document.getElementById('excelFileName').textContent = '';
            document.getElementById('excelFileInput').value = '';
            loadAthletes();
        } else {
            resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 导入失败: ${data.error}</p>`;
        }
    } catch (err) {
        resultDiv.innerHTML = `<p style="color:#dc3545;">❌ 上传错误: ${err.message}</p>`;
    }
}

// ==================== 模板下载 ====================

function downloadTemplate() {
    const headers = ['签号', '运动员号', '姓名', '性别', '单位简称', '组别', '级别'];
    const sampleData = [
        ['1', '1001', '张三', '男', '北京队', '小学', '小学男子38kg'],
        ['2', '1002', '李四', '男', '上海队', '小学', '小学男子35kg'],
        ['3', '1003', '王五', '女', '广州队', '初中', '初中女子45kg'],
        ['4', '1004', '赵六', '女', '深圳队', '初中', '初中女子45kg+'],
        ['5', '1005', '孙七', '男', '北京队', '高中', '高中男子58kg']
    ];

    let csvContent = '\uFEFF';
    csvContent += headers.join(',') + '\n';
    sampleData.forEach(row => { csvContent += row.join(',') + '\n'; });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', '竞技运动员导入模板.csv');
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
        if ((a.athlete_team || '') < (b.athlete_team || '')) return -1;
        if ((a.athlete_team || '') > (b.athlete_team || '')) return 1;
        if ((a.athlete_gender || '') < (b.athlete_gender || '')) return -1;
        if ((a.athlete_gender || '') > (b.athlete_gender || '')) return 1;
        return 0;
    });

    const unitGroups = new Map();
    athletes.forEach(a => {
        const unit = a.athlete_team || '未指定';
        if (!unitGroups.has(unit)) unitGroups.set(unit, []);
        unitGroups.get(unit).push(a);
    });

    const eventName = currentEventName || '';
    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 运动员名单</title>');
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
        const maleCount = list.filter(a => a.athlete_gender === '男').length;
        const femaleCount = list.filter(a => a.athlete_gender === '女').length;
        d.write('<div class="unit-section">');
        d.write('<div class="print-header"><h1>' + eventName + '</h1><h2>运动员名单</h2></div>');
        d.write('<div class="unit-title"><img class="unit-logo" src="' + window.location.origin + '/images/logo.png">' + unit + '</div>');
        d.write('<div class="unit-stats">共 ' + list.length + ' 人（男 ' + maleCount + ' 人，女 ' + femaleCount + ' 人）</div>');
        d.write('<table>');
        d.write('<thead><tr><th>序号</th><th>运动员号</th><th>签号</th><th>姓名</th><th>性别</th><th>组别</th><th>级别</th></tr></thead>');
        d.write('<tbody>');
        list.forEach(a => {
            idx++;
            const genderClass = a.athlete_gender === '男' ? 'male' : 'female';
            d.write('<tr>');
            d.write('<td>' + idx + '</td>');
            d.write('<td>' + (a.athlete_id || '') + '</td>');
            d.write('<td>' + (a.athlete_draw_num || '') + '</td>');
            d.write('<td>' + (a.athlete_name || '') + '</td>');
            d.write('<td class="' + genderClass + '">' + (a.athlete_gender || '') + '</td>');
            d.write('<td>' + (a.athlete_age_group || '') + '</td>');
            d.write('<td>' + (a.athlete_category || '') + '</td>');
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

// ==================== 搜索 ====================

function searchAthletes() { loadAthletes(); }

// ==================== 列管理（与称重管理界面统一） ====================

const ATHLETES_COLUMNS = [
    { key: 'index', label: '序号' },
    { key: 'type', label: '类型' },
    { key: 'athleteId', label: '运动员号' },
    { key: 'drawNo', label: '签号' },
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别' },
    { key: 'unit', label: '代表队' },
    { key: 'ageGroup', label: '组别' },
    { key: 'category', label: '级别' },
    { key: 'weightClassSelect', label: '级别选择' },
    { key: 'action', label: '操作' }
];

let athletesSelectedColumns = [];
let athletesActiveContextMenu = null;

function getAthletesColumnVisibility() {
    const saved = localStorage.getItem('athletes_column_visibility');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('解析列显示设置失败:', e);
        }
    }
    const defaultVisibility = {};
    ATHLETES_COLUMNS.forEach(col => {
        defaultVisibility[col.key] = true;
    });
    return defaultVisibility;
}

function saveAthletesColumnVisibility(visibility) {
    localStorage.setItem('athletes_column_visibility', JSON.stringify(visibility));
}

function initAthletesColumnVisibility() {
    const visibility = getAthletesColumnVisibility();
    applyAthletesColumnVisibility(visibility);
}

function applyAthletesColumnVisibility(visibility) {
    if (!document.querySelector('#athletesMainTable')) return;

    ATHLETES_COLUMNS.forEach(col => {
        const isVisible = visibility[col.key] !== false;
        document.querySelectorAll(`#athletesMainTable th[data-col="${col.key}"]`).forEach(th => {
            th.style.display = isVisible ? '' : 'none';
        });
        document.querySelectorAll(`#athletesMainTable td[data-col="${col.key}"]`).forEach(td => {
            td.style.display = isVisible ? '' : 'none';
        });
    });
}

function initAthletesColumnSelection() {
    const table = document.getElementById('athletesMainTable');
    if (!table) return;

    table.addEventListener('click', function(e) {
        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            selectAthletesColumn(th.dataset.col, e.shiftKey);
        } else if (!e.target.closest('.excel-filter-icon')) {
            clearAthletesColumnSelection();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearAthletesColumnSelection();
            closeAthletesContextMenu();
        }
    });
}

function selectAthletesColumn(columnKey, isShift) {
    if (isShift && athletesSelectedColumns.length > 0) {
        const lastSelected = athletesSelectedColumns[athletesSelectedColumns.length - 1];
        const lastIndex = ATHLETES_COLUMNS.findIndex(col => col.key === lastSelected);
        const currentIndex = ATHLETES_COLUMNS.findIndex(col => col.key === columnKey);

        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        for (let i = start; i <= end; i++) {
            if (!athletesSelectedColumns.includes(ATHLETES_COLUMNS[i].key)) {
                athletesSelectedColumns.push(ATHLETES_COLUMNS[i].key);
            }
        }
    } else {
        const idx = athletesSelectedColumns.indexOf(columnKey);
        if (idx > -1) {
            athletesSelectedColumns.splice(idx, 1);
        } else {
            athletesSelectedColumns.push(columnKey);
        }
    }

    updateAthletesColumnSelectionUI();
}

function clearAthletesColumnSelection() {
    athletesSelectedColumns = [];
    updateAthletesColumnSelectionUI();
}

function updateAthletesColumnSelectionUI() {
    const table = document.getElementById('athletesMainTable');
    if (!table) return;

    table.querySelectorAll('th').forEach(th => {
        if (athletesSelectedColumns.includes(th.dataset.col)) {
            th.style.background = '#c6e2ff';
            th.style.color = '#0050b3';
        } else {
            th.style.background = '';
            th.style.color = '';
        }
    });

    table.querySelectorAll('td').forEach(td => {
        if (athletesSelectedColumns.includes(td.dataset.col)) {
            td.style.background = '#e6f4ff';
        } else {
            td.style.background = '';
        }
    });
}

function initAthletesContextMenu() {
    const table = document.getElementById('athletesMainTable');
    if (!table) return;

    table.addEventListener('contextmenu', function(e) {
        e.preventDefault();

        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            showAthletesContextMenu(e.clientX, e.clientY, th.dataset.col);
        }
    });
}

function showAthletesContextMenu(x, y, columnKey) {
    closeAthletesContextMenu();

    const visibility = getAthletesColumnVisibility();
    const isSelected = athletesSelectedColumns.length > 0;
    const isHidden = visibility[columnKey] === false;

    const menu = document.createElement('div');
    menu.className = 'excel-context-menu';
    menu.id = 'athletesContextMenu';

    let html = '';

    if (isSelected) {
        html += `<div class="ecm-item" onclick="hideAthletesSelectedColumns()">
                    <span class="ecm-icon">👁️‍🗨️</span>
                    <span>隐藏选中列</span>
                 </div>`;
    }

    html += `<div class="ecm-item" onclick="hideAthletesColumn('${columnKey}')">
                <span class="ecm-icon">👁️‍🗨️</span>
                <span>隐藏此列</span>
             </div>`;

    const hiddenColumns = ATHLETES_COLUMNS.filter(col => visibility[col.key] === false);
    if (hiddenColumns.length > 0) {
        html += `<div class="ecm-divider"></div>`;
        html += `<div style="padding:8px 12px;font-size:11px;color:#909399;font-weight:bold;">取消隐藏</div>`;
        hiddenColumns.forEach(col => {
            html += `<div class="ecm-item" onclick="showAthletesColumn('${col.key}')">
                        <span class="ecm-icon">👁️</span>
                        <span>${col.label}</span>
                     </div>`;
        });
    }

    html += `<div class="ecm-divider"></div>`;
    html += `<div class="ecm-item" onclick="showAllAthletesColumns()">
                <span class="ecm-icon">👁️</span>
                <span>显示全部列</span>
             </div>`;

    menu.innerHTML = html;
    document.body.appendChild(menu);
    athletesActiveContextMenu = menu;

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
        document.addEventListener('click', handleAthletesContextMenuOutsideClick);
    }, 10);
}

function closeAthletesContextMenu() {
    if (athletesActiveContextMenu) {
        athletesActiveContextMenu.remove();
        athletesActiveContextMenu = null;
        document.removeEventListener('click', handleAthletesContextMenuOutsideClick);
    }
}

function handleAthletesContextMenuOutsideClick(e) {
    const menu = document.getElementById('athletesContextMenu');
    if (menu && !menu.contains(e.target)) {
        closeAthletesContextMenu();
    }
}

function hideAthletesColumn(columnKey) {
    const visibility = getAthletesColumnVisibility();
    visibility[columnKey] = false;
    saveAthletesColumnVisibility(visibility);
    applyAthletesColumnVisibility(visibility);
    closeAthletesContextMenu();
}

function hideAthletesSelectedColumns() {
    const visibility = getAthletesColumnVisibility();
    athletesSelectedColumns.forEach(key => {
        visibility[key] = false;
    });
    saveAthletesColumnVisibility(visibility);
    applyAthletesColumnVisibility(visibility);
    closeAthletesContextMenu();
}

function showAthletesColumn(columnKey) {
    const visibility = getAthletesColumnVisibility();
    visibility[columnKey] = true;
    saveAthletesColumnVisibility(visibility);
    applyAthletesColumnVisibility(visibility);
    closeAthletesContextMenu();
}

function showAllAthletesColumns() {
    const visibility = {};
    ATHLETES_COLUMNS.forEach(col => {
        visibility[col.key] = true;
    });
    saveAthletesColumnVisibility(visibility);
    applyAthletesColumnVisibility(visibility);
    closeAthletesContextMenu();
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', function() {
    const scopeSelect = document.getElementById('drawScope');
    if (scopeSelect) {
        scopeSelect.addEventListener('change', function() {
            document.getElementById('drawClassGroup').style.display = this.value === 'class' ? 'block' : 'none';
        });
    }
});
