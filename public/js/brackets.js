const BRACKETS_COLUMNS = [
    { key: 'index', label: '序号' },
    { key: 'rounds', label: '轮次' },
    { key: 'total', label: '场次' },
    { key: 'order', label: '顺序' },
    { key: 'venue', label: '场地' },
    { key: 'unit', label: '单元' },
    { key: 'compMode', label: '竞赛方式' },
    { key: 'weightClass', label: '级别' },
    { key: 'count', label: '人数' },
    { key: 'totalMatches', label: '总场次' },
    { key: 'final', label: 'Final' },
    { key: 'half', label: '1/2' },
    { key: 'quarter', label: '1/4' },
    { key: 'eighth', label: '1/8' },
    { key: 'sixteenth', label: '1/16' },
    { key: 'thirtysecond', label: '1/32' },
    { key: 'sixtyfourth', label: '1/64' }, 
    { key: 'onetwentyeight', label: '1/128' },
    { key: 'twofiftysix', label: '1/256' },
    { key: 'gold', label: 'Gold' },
    { key: 'silver', label: 'Silver' },
    { key: 'bronze', label: 'Bronze' },
    { key: 'rep', label: 'Rep.' },
    { key: 'brom', label: 'Bro.m' }
];

const JJ_BRACKETS_COLUMNS = [
    { key: 'index', label: '序号' },
    { key: 'rounds', label: '轮次' },
    { key: 'total', label: '场次' },
    { key: 'order', label: '顺序' },
    { key: 'venue', label: '场地' },
    { key: 'unit', label: '单元' },
    { key: 'compMode', label: '竞赛方式' },
    { key: 'weightClass', label: '级别' },
    { key: 'count', label: '人数' },
    { key: 'totalMatches', label: '总场次' },
    { key: 'final', label: 'Final' },
    { key: 'match1', label: '赛1' },
    { key: 'match2', label: '赛2' },
    { key: 'match3', label: '赛3' },
    { key: 'match4', label: '赛4' },
    { key: 'match5', label: '赛5' },
    { key: 'match6', label: '赛6' },
    { key: 'match7', label: '赛7' },
    { key: 'match8', label: '赛8' },
    { key: 'gold', label: 'Gold' },
    { key: 'silver', label: 'Silver' },
    { key: 'bronze', label: 'Bronze' },
    { key: 'rep', label: 'Rep.' },
    { key: 'brom', label: 'Bro.m' }
];

function getActiveColumns() {
    const isJJPage = window.location.pathname === '/jj-brackets';
    return (isJJPage || currentEventType === 'jiu_jitsu') ? JJ_BRACKETS_COLUMNS : BRACKETS_COLUMNS;
}

let bracketsSelectedColumns = [];
let bracketsActiveContextMenu = null;
let bracketsSortState = { colIndex: -1, direction: '' };

function getBracketsColumnVisibility() {
    const isJJPage = window.location.pathname === '/jj-brackets';
    const isJJ = isJJPage || currentEventType === 'jiu_jitsu';
    const saved = localStorage.getItem(isJJ ? 'jj_brackets_column_visibility' : 'brackets_column_visibility');
    if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
    }
    const v = {};
    getActiveColumns().forEach(col => { v[col.key] = true; });
    return v;
}

function saveBracketsColumnVisibility(visibility) {
    const isJJPage = window.location.pathname === '/jj-brackets';
    const isJJ = isJJPage || currentEventType === 'jiu_jitsu';
    localStorage.setItem(isJJ ? 'jj_brackets_column_visibility' : 'brackets_column_visibility', JSON.stringify(visibility));
}

function initBracketsColumnVisibility() {
    applyBracketsColumnVisibility(getBracketsColumnVisibility());
}

function applyBracketsColumnVisibility(visibility) {
    const table = document.querySelector('.auto-arrange-table');
    if (!table) return;
    getActiveColumns().forEach(col => {
        const isVisible = visibility[col.key] !== false;
        table.querySelectorAll(`th[data-col="${col.key}"]`).forEach(th => {
            th.style.display = isVisible ? 'table-cell' : 'none';
        });
        table.querySelectorAll(`td[data-col="${col.key}"]`).forEach(td => {
            td.style.display = isVisible ? 'table-cell' : 'none';
        });
    });
}

function initBracketsColumnSelection() {
    const table = document.querySelector('.auto-arrange-table');
    if (!table) return;
    table.addEventListener('click', function(e) {
        if (e.target.closest('.excel-filter-icon') || e.target.closest('.excel-filter-menu') || e.target.closest('.brackets-filter-dropdown')) return;
        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            selectBracketsColumn(th.dataset.col);
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearBracketsColumnSelection();
            closeBracketsContextMenu();
        }
    });
}

function selectBracketsColumn(columnKey) {
    const idx = bracketsSelectedColumns.indexOf(columnKey);
    if (idx > -1) {
        bracketsSelectedColumns.splice(idx, 1);
    } else {
        bracketsSelectedColumns.push(columnKey);
    }
    highlightBracketsSelectedColumns();
}

function clearBracketsColumnSelection() {
    bracketsSelectedColumns = [];
    highlightBracketsSelectedColumns();
}

function highlightBracketsSelectedColumns() {
    const table = document.querySelector('.auto-arrange-table');
    if (!table) return;
    table.querySelectorAll('th').forEach(th => {
        if (bracketsSelectedColumns.includes(th.dataset.col)) {
            th.style.background = '#e6f4ff';
            th.style.color = '#409eff';
        } else {
            th.style.background = '';
            th.style.color = '';
        }
    });
    table.querySelectorAll('td').forEach(td => {
        if (bracketsSelectedColumns.includes(td.dataset.col)) {
            td.style.background = '#e6f4ff';
        } else {
            td.style.background = '';
        }
    });
}

function showBracketsContextMenu(x, y, columnKey) {
    closeBracketsContextMenu();
    const visibility = getBracketsColumnVisibility();
    const isSelected = bracketsSelectedColumns.length > 0;
    const menu = document.createElement('div');
    menu.className = 'excel-context-menu';
    menu.id = 'bracketsContextMenu';
    let html = '';
    html += `<div class="ecm-item" onclick="sortBracketsColumn('${columnKey}', 'asc')">
                <span class="ecm-icon">↑</span>
                <span>升序排序</span>
             </div>`;
    html += `<div class="ecm-item" onclick="sortBracketsColumn('${columnKey}', 'desc')">
                <span class="ecm-icon">↓</span>
                <span>降序排序</span>
             </div>`;
    html += `<div class="ecm-divider"></div>`;
    if (isSelected) {
        html += `<div class="ecm-item" onclick="hideBracketsSelectedColumns()">
                    <span class="ecm-icon">👁️‍🗨️</span>
                    <span>隐藏选中列</span>
                 </div>`;
    }
    html += `<div class="ecm-item" onclick="hideBracketsColumn('${columnKey}')">
                <span class="ecm-icon">👁️‍🗨️</span>
                <span>隐藏此列</span>
             </div>`;
    const hiddenColumns = getActiveColumns().filter(col => visibility[col.key] === false);
    if (hiddenColumns.length > 0) {
        html += `<div class="ecm-divider"></div>`;
        html += `<div style="padding:8px 12px;font-size:11px;color:#909399;font-weight:bold;">取消隐藏</div>`;
        hiddenColumns.forEach(col => {
            html += `<div class="ecm-item" onclick="showBracketsColumn('${col.key}')">
                        <span class="ecm-icon">👁️</span>
                        <span>${col.label}</span>
                     </div>`;
        });
    }
    html += `<div class="ecm-divider"></div>`;
    html += `<div class="ecm-item" onclick="showAllBracketsColumns()">
                <span class="ecm-icon">👁️</span>
                <span>显示全部列</span>
             </div>`;
    menu.innerHTML = html;
    document.body.appendChild(menu);
    bracketsActiveContextMenu = menu;
    requestAnimationFrame(() => {
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let posX = x;
        let posY = y;
        if (x + mw > window.innerWidth) posX = window.innerWidth - mw - 5;
        if (y + mh > window.innerHeight) posY = window.innerHeight - mh - 5;
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
    });
    setTimeout(() => { document.addEventListener('click', handleBracketsContextMenuOutsideClick); }, 10);
}

function closeBracketsContextMenu() {
    if (bracketsActiveContextMenu) {
        bracketsActiveContextMenu.remove();
        bracketsActiveContextMenu = null;
        document.removeEventListener('click', handleBracketsContextMenuOutsideClick);
    }
}

function handleBracketsContextMenuOutsideClick(e) {
    const menu = document.getElementById('bracketsContextMenu');
    if (menu && !menu.contains(e.target)) closeBracketsContextMenu();
}

function hideBracketsColumn(columnKey) {
    const visibility = getBracketsColumnVisibility();
    visibility[columnKey] = false;
    saveBracketsColumnVisibility(visibility);
    applyBracketsColumnVisibility(visibility);
    closeBracketsContextMenu();
    clearBracketsColumnSelection();
}

function hideBracketsSelectedColumns() {
    const visibility = getBracketsColumnVisibility();
    bracketsSelectedColumns.forEach(colKey => { visibility[colKey] = false; });
    saveBracketsColumnVisibility(visibility);
    applyBracketsColumnVisibility(visibility);
    closeBracketsContextMenu();
    clearBracketsColumnSelection();
}

function showBracketsColumn(columnKey) {
    const visibility = getBracketsColumnVisibility();
    visibility[columnKey] = true;
    saveBracketsColumnVisibility(visibility);
    applyBracketsColumnVisibility(visibility);
    closeBracketsContextMenu();
}

function showAllBracketsColumns() {
    const visibility = {};
    getActiveColumns().forEach(col => { visibility[col.key] = true; });
    saveBracketsColumnVisibility(visibility);
    applyBracketsColumnVisibility(visibility);
    closeBracketsContextMenu();
}

function sortBracketsColumn(columnKey, direction) {
    closeBracketsContextMenu();
    const colIndex = getActiveColumns().findIndex(col => col.key === columnKey);
    if (colIndex === -1) return;
    bracketsSortState = { colIndex, direction };
    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
        const cellA = a.querySelectorAll('td')[colIndex];
        const cellB = b.querySelectorAll('td')[colIndex];
        if (!cellA || !cellB) return 0;
        const inputA = cellA.querySelector('input, select');
        const inputB = cellB.querySelector('input, select');
        const valA = inputA ? inputA.value.trim() : cellA.textContent.trim();
        const valB = inputB ? inputB.value.trim() : cellB.textContent.trim();
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
            return direction === 'asc' ? numA - numB : numB - numA;
        }
        return direction === 'asc'
            ? valA.localeCompare(valB, 'zh-CN')
            : valB.localeCompare(valA, 'zh-CN');
    });
    rows.forEach(row => tbody.appendChild(row));
    updateBracketsSortIndicators();
}

function updateBracketsSortIndicators() {
    const headers = document.querySelectorAll('.auto-arrange-table thead th');
    const activeCols = getActiveColumns();
    headers.forEach((th, index) => {
        const col = activeCols[index];
        if (!col) return;
        const baseLabel = col.label;
        const filterIcon = th.querySelector('.excel-filter-icon');
        if (index === bracketsSortState.colIndex && bracketsSortState.direction) {
            const arrow = bracketsSortState.direction === 'asc' ? ' ↑' : ' ↓';
            th.childNodes[0].textContent = baseLabel + arrow;
            th.style.color = '#409eff';
        } else {
            th.childNodes[0].textContent = baseLabel;
            th.style.color = '';
        }
        if (filterIcon && !th.contains(filterIcon)) {
            th.appendChild(filterIcon);
        }
    });
}

function initBracketsContextMenu() {
    const table = document.querySelector('.auto-arrange-table');
    if (!table) return;
    table.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            showBracketsContextMenu(e.clientX, e.clientY, th.dataset.col);
        }
    });
}

function getWeightClassFromRow(tr) {
    const td = tr.querySelector('td[data-col="weightClass"]');
    return td ? td.textContent.trim() : '';
}

async function loadAutoArrangeData() {
    const tbody = document.getElementById('autoArrangeTableBody');
    tbody.innerHTML = '';

    if (!currentEventId) {
        tbody.innerHTML = '<tr><td colspan="24" style="text-align:center;color:#909399;padding:40px;">请先在「赛事列表」中选择一个赛事</td></tr>';
        document.getElementById('autoArrangeTotalAthletes').textContent = '0';
        document.getElementById('autoArrangeTotalClasses').textContent = '0';
        document.getElementById('autoArrangeTotalMatches').textContent = '0';
        const pl = document.getElementById('pendingClassList');
        if (pl) pl.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">请先选择赛事</div>';
        const pc = document.getElementById('pendingCount');
        if (pc) pc.textContent = '0';
        return;
    }

    const isJJPage = window.location.pathname === '/jj-brackets';
    const isJJ = isJJPage || currentEventType === 'jiu_jitsu';

    if (isJJ && typeof JiuJitsuBrackets !== 'undefined') {
        await JiuJitsuBrackets.loadCompModeConfig();
    }

    try {
        try {
            const syncResp = await apiPost('/brackets/sync-cache', { event_id: currentEventId });
            if (syncResp.success && syncResp.data && syncResp.data.syncedClasses && syncResp.data.syncedClasses.length > 0) {
                console.log('[sync-cache] 同步了以下级别的对阵数据:', syncResp.data.syncedClasses.join(', '));
            }
        } catch (e) {
            console.warn('[sync-cache] 同步缓存失败:', e);
        }

        let configVenueCount = 26;
        let configDateCount = 30;

        try {
            const configRes = await fetch(`${API_BASE}/config?event_id=${currentEventId}`);
            const configData = await configRes.json();
            if (configData.success) {
                currentVenueCount = configData.data.venue_count || 1;
                currentDateCount = configData.data.date_count || 1;
                configVenueCount = currentVenueCount;
                configDateCount = currentDateCount;
            }
        } catch (e) {
            console.warn('加载配置失败，使用默认值:', e);
        }
        if (typeof CategoryModeComponent !== 'undefined') {
            await CategoryModeComponent.init(currentEventId);
        }

        await loadTKDCompModeConfig();

        const athletesRes = await fetch(`${API_BASE}/athletes?${getEventParam()}`);
        const athletesData = await athletesRes.json();
        if (!athletesData.success) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#f56c6c;padding:40px;">加载运动员数据失败</td></tr>';
            return;
        }

        const athletes = athletesData.data || [];

        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#909399;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">⚔️</div><div>暂无竞技编排数据</div><div style="font-size:12px;">请先添加运动员</div></td></tr>';
            document.getElementById('autoArrangeTotalAthletes').textContent = '0';
            document.getElementById('autoArrangeTotalClasses').textContent = '0';
            document.getElementById('autoArrangeTotalMatches').textContent = '0';
            return;
        }

        let savedScheme = {};
        try {
            if (currentEventId) {
                const schemeRes = await fetch(`${API_BASE}/auto-arrange/scheme?event_id=${currentEventId}`);
                const schemeData = await schemeRes.json();
                if (schemeData.success) savedScheme = schemeData.data || {};
            }
        } catch (e) { console.warn('加载编排方案失败:', e); }

        let arrangedClasses = new Set();
        try {
            const matchesRes = await fetch(`${API_BASE}/matches?${getEventParam()}`);
            const matchesData = await matchesRes.json();
            if (matchesData.success && matchesData.data) {
                matchesData.data.forEach(m => {
                    if (m.weight_class) arrangedClasses.add(m.weight_class);
                });
            }
        } catch (e) { }

        const classMap = new Map();
        athletes.forEach(a => {
            const wc = a.athlete_category || '未分级';
            if (!classMap.has(wc)) {
                classMap.set(wc, { name: wc, gender: a.athlete_gender, group_class: a.athlete_age_group, count: 0, athletes: [] });
            }
            classMap.get(wc).count++;
            classMap.get(wc).athletes.push(a);
        });

        const classes = Array.from(classMap.values()).sort((a, b) => {
            if (a.gender !== b.gender) return (a.gender === '男' ? -1 : 1);
            if (a.group_class !== b.group_class) {
                const groupOrder = { '小学': 1, '初中': 2, '高中': 3, '大学': 4, '成年': 5 };
                return (groupOrder[a.group_class] || 99) - (groupOrder[b.group_class] || 99);
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });

        let totalAthletes = 0;
        let totalMatches = 0;

        const classRounds = classes.map(cls => {
            const count = cls.count;
            totalAthletes += count;
            if (isJJ && typeof JiuJitsuBrackets !== 'undefined') {
                const compMode = JiuJitsuBrackets.compModeConfig[cls.name] || 'single_elimination';
                const jjRounds = JiuJitsuBrackets.calculateJJRounds(count, compMode);
                const total = jjRounds.total || 0;
                totalMatches += total;
                return { ...cls, rounds: jjRounds, total: jjRounds.total, jjRounds };
            } else {
                const compMode = tkdCompModeConfig[cls.name] || 'single_elimination';
                const rounds = calculateRounds(count, compMode);
                const total = rounds.total || 0;
                totalMatches += total;
                return { ...cls, rounds, total, compMode };
            }
        });

        if (importedVenueData) {
            classRounds.sort((a, b) => {
                const va = importedVenueData.get(a.name) || {};
                const vb = importedVenueData.get(b.name) || {};
                const venueCmp = (va.category_venue || '').localeCompare(vb.category_venue || '');
                if (venueCmp !== 0) return venueCmp;
                const unitA = parseFloat(va.category_date_num) || 0;
                const unitB = parseFloat(vb.category_date_num) || 0;
                if (unitA !== unitB) return unitA - unitB;
                const orderA = parseFloat(va.category_order) || 0;
                const orderB = parseFloat(vb.category_order) || 0;
                return orderA - orderB;
            });
        }

        classRounds.sort((a, b) => {
            const vA = savedScheme[a.name] || (importedVenueData ? importedVenueData.get(a.name) : null);
            const vB = savedScheme[b.name] || (importedVenueData ? importedVenueData.get(b.name) : null);
            const venueA = vA ? (vA.category_venue || '').trim() : '';
            const venueB = vB ? (vB.category_venue || '').trim() : '';
            if (venueA !== venueB) {
                if (!venueA) return 1;
                if (!venueB) return -1;
                return venueA.localeCompare(venueB);
            }
            const unitA = vA ? parseFloat(vA.category_date_num) || 0 : 0;
            const unitB = vB ? parseFloat(vB.category_date_num) || 0 : 0;
            if (unitA !== unitB) return unitA - unitB;
            const orderA = vA ? parseFloat(vA.category_order) || 0 : 0;
            const orderB = vB ? parseFloat(vB.category_order) || 0 : 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.count - b.count;
        });

        classRounds.forEach((cls, index) => {
            const venueInfo = savedScheme[cls.name] || (importedVenueData ? importedVenueData.get(cls.name) : null);
            const totalRounds = Math.ceil(Math.log2(cls.count)) || 0;
            const tr = document.createElement('tr');

            let venueOptions = '<option value="">-</option>';
            for (let i = 0; i < configVenueCount; i++) {
                const letter = String.fromCharCode(65 + i);
                const selected = (venueInfo && venueInfo.category_venue === letter) ? ' selected' : '';
                venueOptions += `<option value="${letter}"${selected}>${letter}</option>`;
            }

            let unitOptions = '<option value="">-</option>';
            for (let i = 1; i <= configDateCount; i++) {
                const selected = (venueInfo && String(venueInfo.category_date_num) === String(i)) ? ' selected' : '';
                unitOptions += `<option value="${i}"${selected}>${i}</option>`;
            }

            const compMode = (isJJ && typeof JiuJitsuBrackets !== 'undefined') ? (JiuJitsuBrackets.compModeConfig[cls.name] || 'single_elimination') : (tkdCompModeConfig[cls.name] || 'single_elimination');
            const compModeLabel = isJJ ? (JiuJitsuBrackets.COMP_MODES.find(m => m.value === compMode) || JiuJitsuBrackets.COMP_MODES[0]).label : (TKD_COMP_MODES.find(m => m.value === compMode) || TKD_COMP_MODES[0]).label;

            if (isJJ && typeof JiuJitsuBrackets !== 'undefined') {
                const jjR = cls.jjRounds || JiuJitsuBrackets.calculateJJRounds(cls.count, compMode);
                tr.innerHTML = `
                    <td data-col="index">${index + 1}</td>
                    <td data-col="rounds">${totalRounds}</td>
                    <td data-col="total">${jjR.total}</td>
                    <td data-col="order"><input type="number" min="1" max="99" value="${venueInfo ? venueInfo.category_order : ''}" onchange="saveAutoArrangeSilent()" style="width:42px;text-align:center;border:1px solid #E6A23C;border-radius:3px;padding:2px;font-weight:bold;color:#E6A23C;" placeholder="-"></td>
                    <td data-col="venue"><select onchange="saveAutoArrangeSilent()" style="width:60px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">${venueOptions}</select></td>
                    <td data-col="unit"><select onchange="saveAutoArrangeSilent()" style="width:55px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">${unitOptions}</select></td>
                    <td data-col="compMode"><select onchange="JiuJitsuBrackets.onCompModeChange('${cls.name.replace(/'/g, "\\'")}', this.value);" style="width:90px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">
                        ${JiuJitsuBrackets.COMP_MODES.map(m => `<option value="${m.value}" ${compMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                    </select></td>
                    <td data-col="weightClass" style="text-align:left;min-width:120px;">${cls.name}</td>
                    <td data-col="count">${cls.count}</td>
                    <td data-col="totalMatches">${jjR.total}</td>
                    <td data-col="final">${jjR.final}</td>
                    <td data-col="match1">${jjR.match1}</td>
                    <td data-col="match2">${jjR.match2}</td>
                    <td data-col="match3">${jjR.match3}</td>
                    <td data-col="match4">${jjR.match4}</td>
                    <td data-col="match5">${jjR.match5}</td>
                    <td data-col="match6">${jjR.match6}</td>
                    <td data-col="match7">${jjR.match7}</td>
                    <td data-col="match8">${jjR.match8}</td>
                    <td data-col="gold">${jjR.gold}</td>
                    <td data-col="silver">${jjR.silver}</td>
                    <td data-col="bronze">${jjR.bronze}</td>
                    <td data-col="rep">${jjR.repechage}</td>
                    <td data-col="brom">${jjR.brom}</td>
                `;
            } else {
                const tkdCompMode = tkdCompModeConfig[cls.name] || 'single_elimination';
                tr.innerHTML = `
                    <td data-col="index">${index + 1}</td>
                    <td data-col="rounds">${totalRounds}</td>
                    <td data-col="total">${cls.total}</td>
                    <td data-col="order"><input type="number" min="1" max="99" value="${venueInfo ? venueInfo.category_order : ''}" onchange="saveAutoArrangeSilent()" style="width:42px;text-align:center;border:1px solid #E6A23C;border-radius:3px;padding:2px;font-weight:bold;color:#E6A23C;" placeholder="-"></td>
                    <td data-col="venue"><select onchange="saveAutoArrangeSilent()" style="width:60px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">${venueOptions}</select></td>
                    <td data-col="unit"><select onchange="saveAutoArrangeSilent()" style="width:55px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">${unitOptions}</select></td>
                    <td data-col="compMode"><select onchange="onTKDCompModeChange('${cls.name.replace(/'/g, "\\'")}', this.value);" style="width:90px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">
                        ${TKD_COMP_MODES.map(m => `<option value="${m.value}" ${tkdCompMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                    </select></td>
                    <td data-col="weightClass" style="text-align:left;min-width:120px;">${cls.name}</td>
                    <td data-col="count">${cls.count}</td>
                    <td data-col="totalMatches">${cls.total}</td>
                    <td data-col="final">${cls.rounds.final}</td>
                    <td data-col="half">${cls.rounds.half}</td>
                    <td data-col="quarter">${cls.rounds.quarter}</td>
                    <td data-col="eighth">${cls.rounds.eighth}</td>
                    <td data-col="sixteenth">${cls.rounds.sixteenth}</td>
                    <td data-col="thirtysecond">${cls.rounds.thirtysecond}</td>
                    <td data-col="sixtyfourth">${cls.rounds.sixtyfourth}</td>
                    <td data-col="onetwentyeight">${cls.rounds.onetwentyeighth}</td>
                    <td data-col="twofiftysix">${cls.rounds.twofiftysixth}</td>
                    <td data-col="gold">${cls.rounds.gold}</td>
                    <td data-col="silver">${cls.rounds.silver}</td>
                    <td data-col="bronze">${cls.rounds.bronze}</td>
                    <td data-col="rep">${cls.rounds.repechage}</td>
                    <td data-col="brom">0</td>
                `;
            }
            tbody.appendChild(tr);
        });

        document.getElementById('autoArrangeTotalAthletes').textContent = totalAthletes;
        document.getElementById('autoArrangeTotalClasses').textContent = classes.length;
        document.getElementById('autoArrangeTotalMatches').textContent = totalMatches;

        renderClassSidebar(classRounds, arrangedClasses, savedScheme);
        renderVenueAllocation(classRounds, savedScheme);
        initVenueDropZone();
        initBracketsColumnVisibility();
        initBracketsColumnSelection();
        initBracketsContextMenu();
        initBracketsExcelFilter();
        updateBracketsSortIndicators();
    } catch (e) {
        console.error('加载自动编排数据失败:', e);
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#f56c6c;padding:40px;">加载数据失败，请检查网络连接?/td></tr>';
    }
}

function initBracketsExcelFilter() {
    if (typeof ExcelFilter === 'undefined') return;
    ExcelFilter.init('bracketsTable', {
        excludeColumns: [3, 4, 5],
        onFilterChange: function() {}
    });
}

function filterByUnit() {
    const unitVal = document.getElementById('unitFilter').value;

    if (currentVenueData) {
        const container = document.getElementById('venueAllocationList');
        if (!container) return;
        const venueFilter = document.getElementById('venueFilter');
        const venueVal = venueFilter ? venueFilter.value : '';
        renderVenueList(currentVenueData, unitVal, venueVal);
    }
}

function getChineseOrdinal(num) {
    const ordinals = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
        '第十一', '第十二', '第十三', '第十四', '第十五', '第十六', '第十七', '第十八', '第十九', '第二十',
        '第二十一', '第二十二', '第二十三', '第二十四', '第二十五', '第二十六', '第二十七', '第二十八', '第二十九', '第三十'];
    return ordinals[num] || `第${num}`;
}

function sortWeightClass(a, b) {
    const extractParts = (name) => {
        const plusA = name.includes('+');
        const numMatch = name.match(/(\d+)/);
        const num = numMatch ? parseInt(numMatch[1]) : 0;
        const prefix = name.replace(/[+\d]+KG?/i, '').trim();
        return { prefix, num, plus: plusA };
    };
    const pa = extractParts(a);
    const pb = extractParts(b);
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, 'zh-CN');
    if (pa.plus !== pb.plus) return pa.plus ? 1 : -1;
    return pa.num - pb.num;
}

function renderClassSidebar(classRounds, arrangedClasses, savedScheme) {
    const pendingList = document.getElementById('pendingClassList');
    const pendingCountEl = document.getElementById('pendingCount');

    if (!pendingList) return;

    if (typeof CategoryModeComponent !== 'undefined' && CategoryModeComponent.categoryData.length > 0) {
        const venueArranged = new Set();
        CategoryModeComponent.categoryData.forEach(cat => {
            if (cat.category_venue && cat.category_venue.trim()) {
                venueArranged.add(cat.weight_class);
            }
        });

        const pendingCategories = CategoryModeComponent.categoryData.filter(cat => !venueArranged.has(cat.weight_class));
        pendingCountEl.textContent = pendingCategories.length;

        if (pendingCategories.length === 0) {
            pendingList.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">无待编排级别</div>';
        } else {
            pendingList.innerHTML = pendingCategories.map(cat =>
                `<div class="pending-class-item" draggable="true" data-class-name="${cat.weight_class}" onclick="scrollToClassRow('${cat.weight_class}')">
                    <span>${cat.weight_class}</span>
                    <span class="class-count">${cat.categroy_count || 0}人</span>
                </div>`
            ).join('');
            
            pendingList.querySelectorAll('.pending-class-item').forEach(item => {
                item.addEventListener('dragstart', function(e) {
                    e.dataTransfer.setData('text/plain', item.dataset.className);
                    e.dataTransfer.effectAllowed = 'move';
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', function(e) {
                    item.classList.remove('dragging');
                });
                item.addEventListener('dblclick', function(e) {
                    const venueSelect = document.getElementById('venueFilter');
                    const unitSelect = document.getElementById('unitFilter');
                    const selectedVenue = venueSelect ? venueSelect.value : '';
                    const selectedUnit = unitSelect ? unitSelect.value : '';
                    if (selectedVenue && selectedUnit) {
                        assignClassToVenueAndUnit(item.dataset.className, selectedVenue, selectedUnit);
                    } else {
                        scrollToClassRow(item.dataset.className);
                    }
                });
            });
        }
    } else {
        const venueArranged = new Set();
        classRounds.forEach(cls => {
            const info = savedScheme[cls.name];
            if (info && info.category_venue && info.category_venue.trim()) {
                venueArranged.add(cls.name);
            }
        });

        const pending = classRounds.filter(cls => !venueArranged.has(cls.name));
        pending.sort((a, b) => sortWeightClass(a.name, b.name));

        pendingCountEl.textContent = pending.length;

        if (pending.length === 0) {
            pendingList.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">无待编排级别</div>';
        } else {
            pendingList.innerHTML = pending.map(cls =>
                `<div class="pending-class-item" draggable="true" data-class-name="${cls.name}" onclick="scrollToClassRow('${cls.name}')">
                    <span>${cls.name}</span>
                    <span class="class-count">${cls.count}人</span>
                </div>`
            ).join('');
            pendingList.querySelectorAll('.pending-class-item').forEach(item => {
                item.addEventListener('dragstart', function(e) {
                    e.dataTransfer.setData('text/plain', item.dataset.className);
                    e.dataTransfer.effectAllowed = 'move';
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', function(e) {
                    item.classList.remove('dragging');
                });
                item.addEventListener('dblclick', function(e) {
                    const venueSelect = document.getElementById('venueFilter');
                    const unitSelect = document.getElementById('unitFilter');
                    const selectedVenue = venueSelect ? venueSelect.value : '';
                    const selectedUnit = unitSelect ? unitSelect.value : '';
                    if (selectedVenue && selectedUnit) {
                        assignClassToVenueAndUnit(item.dataset.className, selectedVenue, selectedUnit);
                    } else {
                        scrollToClassRow(item.dataset.className);
                    }
                });
            });
        }
    }
}

function scrollToClassRow(className) {
    const rows = document.querySelectorAll('#autoArrangeTableBody tr');
    rows.forEach(row => {
        row.style.background = '';
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7 && getWeightClassFromRow(row) === className) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.background = '#ecf5ff';
            setTimeout(() => { row.style.background = ''; }, 2000);
        }
    });
}

let currentVenueData = null;

function renderVenueAllocation(classRounds, savedScheme) {
    const container = document.getElementById('venueAllocationList');
    if (!container) return;

    const unitMap = new Map();
    const usedUnits = new Set();
    const usedVenues = new Set();

    classRounds.forEach(cls => {
        const info = savedScheme[cls.name] || (importedVenueData ? importedVenueData.get(cls.name) : null);
        const venue = info ? (info.category_venue || '').trim() : '';
        const unit = info ? (info.category_date_num || '').trim() : '';
        const order = info ? (info.category_order || '').trim() : '';

        const isJJ = window.location.pathname === '/jj-brackets' || currentEventType === 'jiu_jitsu';
        let totalMatches = 0;
        if (isJJ && typeof JiuJitsuBrackets !== 'undefined') {
            const compMode = JiuJitsuBrackets.compModeConfig[cls.name] || 'single_elimination';
            const jjR = JiuJitsuBrackets.calculateJJRounds(cls.count, compMode);
            totalMatches = jjR.total || 0;
        } else {
            const compMode = tkdCompModeConfig[cls.name] || 'single_elimination';
            const r = calculateRounds(cls.count, compMode);
            totalMatches = r.total || 0;
        }

        if (!venue && !unit && !order) {
            const key = '未分配';
            if (!unitMap.has(key)) unitMap.set(key, []);
            unitMap.get(key).push({ name: cls.name, count: cls.count, totalMatches, category_date_num: '', category_order: '', category_venue: '', isAssigned: false });
            return;
        }

        const isFullyAssigned = venue !== '' && unit !== '' && order !== '';

        if (isFullyAssigned) {
            const key = unit;
            if (!unitMap.has(key)) unitMap.set(key, []);
            unitMap.get(key).push({
                name: cls.name,
                count: cls.count,
                totalMatches,
                category_date_num: unit,
                category_order: order,
                category_venue: venue,
                isAssigned: true
            });
            usedUnits.add(unit);
            usedVenues.add(venue);
        } else {
            const key = '部分分配';
            if (!unitMap.has(key)) unitMap.set(key, []);
            unitMap.get(key).push({
                name: cls.name,
                count: cls.count,
                totalMatches,
                category_date_num: unit,
                category_order: order,
                category_venue: venue,
                isAssigned: false
            });
        }
    });

    currentVenueData = unitMap;

    const unitSelect = document.getElementById('unitFilter');
    if (unitSelect) {
        const currentUnitVal = unitSelect.value;
        unitSelect.innerHTML = '<option value="">全部单元</option>';

        for (let i = 1; i <= (currentDateCount || 30); i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `${getChineseOrdinal(i)}单元`;
            unitSelect.appendChild(opt);
        }

        unitSelect.value = currentUnitVal;
    }

    const venueSelect = document.getElementById('venueFilter');
    if (venueSelect) {
        const currentVenueVal = venueSelect.value;
        venueSelect.innerHTML = '<option value="">全部场地</option>';

        for (let i = 0; i < (currentVenueCount || 26); i++) {
            const letter = String.fromCharCode(65 + i);
            const opt = document.createElement('option');
            opt.value = letter;
            opt.textContent = `${letter}场地`;
            venueSelect.appendChild(opt);
        }

        venueSelect.value = currentVenueVal;
    }

    renderVenueList(unitMap, unitSelect ? unitSelect.value : '', venueSelect ? venueSelect.value : '');
}

function renderVenueList(unitMap, unitFilter, venueFilter) {
    const container = document.getElementById('venueAllocationList');
    if (!container) return;

    const sortedKeys = Array.from(unitMap.keys()).sort((a, b) => {
        if (a === '未分配') return 1;
        if (b === '未分配') return -1;
        if (a === '部分分配') return 1;
        if (b === '部分分配') return -1;
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
    });

    const assignedKeys = sortedKeys.filter(k => k !== '未分配' && k !== '部分分配');

    if (assignedKeys.length === 0 && !unitMap.has('未分配') && !unitMap.has('部分分配')) {
        if (!unitFilter && !venueFilter) {
            let emptyHtml = '';
            const unitCount = currentDateCount || 0;
            const venueCount = currentVenueCount || 0;
            if (unitCount > 0 && venueCount > 0) {
                for (let u = 1; u <= unitCount; u++) {
                    emptyHtml += `<div class="venue-group" data-unit="${u}">`;
                    emptyHtml += `<div class="venue-group-header">${getChineseOrdinal(u)}单元</div>`;
                    for (let v = 0; v < venueCount; v++) {
                        const letter = String.fromCharCode(65 + v);
                        emptyHtml += `<div class="venue-zone" data-unit="${u}" data-venue="${letter}" style="margin-left:12px;margin-bottom:6px;">`;
                        emptyHtml += `<div style="font-size:11px;color:#909399;font-weight:500;display:flex;align-items:center;justify-content:space-between;">
                            <span>${letter}场地</span>
                            <span style="font-size:10px;color:#409EFF;font-weight:600;">0场</span>
                        </div>`;
                        emptyHtml += `<div style="font-size:11px;color:#c0c4cc;padding:2px 10px;">-</div>`;
                        emptyHtml += `</div>`;
                    }
                    emptyHtml += `</div>`;
                }
                emptyHtml += `<div class="venue-summary">
                    <span>📊 <strong>0</strong> 级别</span>
                    <span>⚔️ <strong>0</strong> 场</span>
                </div>`;
            } else {
                emptyHtml = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">暂无场地分配</div>';
            }
            container.innerHTML = emptyHtml;
        } else {
            container.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">该筛选条件下暂无数据</div>';
        }
        return;
    }

    let html = '';

    const allUnitKeys = [];
    for (let u = 1; u <= (currentDateCount || 1); u++) {
        allUnitKeys.push(String(u));
    }

    allUnitKeys.forEach(unitKey => {
        if (unitFilter && unitKey !== unitFilter) return;

        const items = unitMap.get(unitKey) || [];

        const venueGroups = new Map();
        items.forEach(item => {
            if (!venueGroups.has(item.category_venue)) {
                venueGroups.set(item.category_venue, []);
            }
            venueGroups.get(item.category_venue).push(item);
        });

        const allVenues = [];
        for (let i = 0; i < (currentVenueCount || 26); i++) {
            allVenues.push(String.fromCharCode(65 + i));
        }

        let filteredVenues = allVenues;
        if (venueFilter) {
            filteredVenues = allVenues.filter(v => v === venueFilter);
        }

        if (filteredVenues.length === 0) return;

        html += `<div class="venue-group" data-unit="${unitKey}">`;
        html += `<div class="venue-group-header">${getChineseOrdinal(parseInt(unitKey))}单元</div>`;

        filteredVenues.forEach(venue => {
            const venueItems = venueGroups.get(venue) || [];
            venueItems.sort((a, b) => {
                const oA = parseFloat(a.category_order) || 0;
                const oB = parseFloat(b.category_order) || 0;
                return oA - oB;
            });

            html += `<div class="venue-zone" data-unit="${unitKey}" data-venue="${venue}" style="margin-left:12px;margin-bottom:6px;">`;
            let venueTotalMatches = 0;
            venueItems.forEach(item => {
                venueTotalMatches += item.totalMatches || 0;
            });
            html += `<div style="font-size:11px;color:#909399;font-weight:500;display:flex;align-items:center;justify-content:space-between;">
                <span>${venue}场地</span>
                <span style="font-size:10px;color:#409EFF;font-weight:600;">${venueTotalMatches}场</span>
            </div>`;
            if (venueItems.length === 0) {
                html += `<div style="font-size:11px;color:#c0c4cc;padding:2px 10px;">-</div>`;
            } else {
                venueItems.forEach(item => {
                    const info = item.category_order ? `序${item.category_order}` : '';
                    html += `<div class="venue-class-item" draggable="true" data-class-name="${item.name}" onclick="scrollToClassRow('${item.name}')">
                        <span>${item.name}</span>
                        <span class="venue-info">${info || item.count + '人'}</span>
                    </div>`;
                });
            }
            html += `</div>`;
        });
        html += `</div>`;
    });

    if (unitMap.has('部分分配') && (!unitFilter)) {
        const partialItems = unitMap.get('部分分配');
        if (partialItems.length > 0) {
            html += `<div class="venue-group">`;
            html += `<div class="venue-group-header">⚠️ 部分分配</div>`;
            partialItems.forEach(item => {
                html += `<div class="venue-class-item" onclick="scrollToClassRow('${item.name}')">
                    <span>${item.name}</span>
                    <span class="venue-info" style="color:#e6a23c;">待完善</span>
                </div>`;
            });
            html += `</div>`;
        }
    }

    if (!html) {
        if (!unitFilter && !venueFilter) {
            const unitCount = currentDateCount || 0;
            const venueCount = currentVenueCount || 0;
            if (unitCount > 0 && venueCount > 0) {
                for (let u = 1; u <= unitCount; u++) {
                    html += `<div class="venue-group" data-unit="${u}">`;
                    html += `<div class="venue-group-header">${getChineseOrdinal(u)}单元</div>`;
                    for (let v = 0; v < venueCount; v++) {
                        const letter = String.fromCharCode(65 + v);
                        html += `<div class="venue-zone" data-unit="${u}" data-venue="${letter}" style="margin-left:12px;margin-bottom:6px;">`;
                        html += `<div style="font-size:11px;color:#909399;font-weight:500;display:flex;align-items:center;justify-content:space-between;">
                            <span>${letter}场地</span>
                            <span style="font-size:10px;color:#409EFF;font-weight:600;">0场</span>
                        </div>`;
                        html += `<div style="font-size:11px;color:#c0c4cc;padding:2px 10px;">-</div>`;
                        html += `</div>`;
                    }
                    html += `</div>`;
                }
                html += `<div class="venue-summary">
                    <span>📊 <strong>0</strong> 级别</span>
                    <span>⚔️ <strong>0</strong> 场</span>
                </div>`;
            } else {
                html = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">该筛选条件下暂无数据</div>';
            }
        } else {
            html = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">该筛选条件下暂无数据</div>';
        }
    } else {
        let totalClasses = 0;
        let totalMatches = 0;
        allUnitKeys.forEach(unitKey => {
            if (unitFilter && unitKey !== unitFilter) return;
            const items = unitMap.get(unitKey) || [];
            items.forEach(item => {
                totalClasses++;
                totalMatches += item.totalMatches || 0;
            });
        });
        html += `<div class="venue-summary">
            <span>📊 <strong>${totalClasses}</strong> 级别</span>
            <span>⚔️ <strong>${totalMatches}</strong> 场</span>
        </div>`;
    }

    container.innerHTML = html;

    initVenueDragAndDrop();
}

function initVenueDragAndDrop() {
    const container = document.getElementById('venueAllocationList');
    if (!container) return;

    const dragItems = container.querySelectorAll('.venue-class-item[draggable="true"]');

    dragItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', this.dataset.className);
            e.dataTransfer.setData('drag-source', 'venue');
            e.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');
        });

        item.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
        });
    });

    const venueZones = container.querySelectorAll('.venue-zone[data-unit][data-venue]');
    venueZones.forEach(zone => {
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
            this.style.backgroundColor = 'rgba(64,158,255,0.08)';
            this.style.borderRadius = '4px';
        });

        zone.addEventListener('dragleave', function(e) {
            if (!this.contains(e.relatedTarget)) {
                this.classList.remove('drag-over');
                this.style.backgroundColor = '';
                this.style.borderRadius = '';
            }
        });

        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('drag-over');
            this.style.backgroundColor = '';
            this.style.borderRadius = '';

            const className = e.dataTransfer.getData('text/plain');
            if (!className) return;

            const targetUnit = this.dataset.unit;
            const targetVenue = this.dataset.venue;
            if (targetUnit && targetVenue && targetUnit !== '未分配') {
                assignClassToVenueAndUnit(className, targetVenue, targetUnit);
            }
        });
    });
}

let venueDropInitialized = false;

function assignClassToUnit(className, targetUnit) {
    if (!className || !targetUnit) return;

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    let found = false;
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const unitInput = cells[5].querySelector('select, input');
            if (unitInput) {
                unitInput.value = targetUnit;
                found = true;
            }
        }
    });

    if (found) {
        saveAutoArrangeSilent().then(() => {
            loadAutoArrangeData();
        });
    }
}

function assignClassToVenueAndUnit(className, targetVenue, targetUnit) {
    if (!className || !targetVenue || !targetUnit) return;

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    let srcVenue = '';
    let srcUnit = '';
    let srcOrder = 0;

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            const orderInput = cells[3].querySelector('input');
            srcVenue = venueInput ? venueInput.value.trim() : '';
            srcUnit = unitInput ? unitInput.value.trim() : '';
            srcOrder = parseFloat(orderInput ? orderInput.value : 0) || 0;
        }
    });

    if (srcVenue && srcUnit && srcOrder > 0 && (srcVenue !== targetVenue || srcUnit !== targetUnit)) {
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 7) return;
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            const orderInput = cells[3].querySelector('input');
            const currentVenue = venueInput ? venueInput.value.trim() : '';
            const currentUnit = unitInput ? unitInput.value.trim() : '';
            if (currentVenue === srcVenue && currentUnit === srcUnit && orderInput) {
                const currentOrder = parseFloat(orderInput.value) || 0;
                if (currentOrder > srcOrder) {
                    orderInput.value = String(currentOrder - 1);
                }
            }
        });
    }

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            if (venueInput) venueInput.value = targetVenue;
            if (unitInput) unitInput.value = targetUnit;
        }
    });

    const existingInTarget = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');
        const orderInput = cells[3].querySelector('input');
        const currentVenue = venueInput ? venueInput.value.trim() : '';
        const currentUnit = unitInput ? unitInput.value.trim() : '';
        if (currentVenue === targetVenue && currentUnit === targetUnit) {
            existingInTarget.push({
                row: tr,
                className: getWeightClassFromRow(tr),
                category_order: parseFloat(orderInput ? orderInput.value : 0) || 0,
                orderInput: orderInput,
                isNew: getWeightClassFromRow(tr) === className
            });
        }
    });

    const usedOrders = new Set();
    existingInTarget.forEach(item => {
        if (!item.isNew && item.category_order > 0) {
            usedOrders.add(item.category_order);
        }
    });

    let newOrder = 1;
    while (usedOrders.has(newOrder)) newOrder++;

    existingInTarget.forEach(item => {
        if (item.isNew) {
            if (item.orderInput) item.orderInput.value = String(newOrder);
        }
    });

    existingInTarget.sort((a, b) => {
        const ordA = a.isNew ? newOrder : a.category_order;
        const ordB = b.isNew ? newOrder : b.category_order;
        return ordA - ordB;
    });

    let seq = 1;
    existingInTarget.forEach(item => {
        if (item.orderInput) item.orderInput.value = String(seq);
        seq++;
    });

    saveAutoArrangeSilent().then(() => {
        loadAutoArrangeData();
    });
}

function initVenueDropZone() {
    if (venueDropInitialized) return;
    venueDropInitialized = true;

    const container = document.getElementById('venueAllocationList');
    if (!container) return;

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over');
        const group = e.target.closest('.venue-group');
        if (group) group.classList.add('drag-over');
    });

    container.addEventListener('dragleave', function(e) {
        if (!container.contains(e.relatedTarget)) {
            container.classList.remove('drag-over');
        }
        const group = e.target.closest('.venue-group');
        if (group && !group.contains(e.relatedTarget)) {
            group.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        const group = e.target.closest('.venue-group');
        if (group) group.classList.remove('drag-over');

        const className = e.dataTransfer.getData('text/plain');
        if (!className) return;

        const zone = e.target.closest('.venue-zone');
        if (zone && zone.dataset.unit && zone.dataset.venue) {
            assignClassToVenueAndUnit(className, zone.dataset.venue, zone.dataset.unit);
            return;
        }

        const groupUnit = group ? group.dataset.unit : '';
        if (groupUnit && groupUnit !== '未分配' && groupUnit !== '部分分配') {
            const select = document.getElementById('venueFilter');
            const selectedVenue = select ? select.value : '';
            if (selectedVenue) {
                assignClassToVenueAndUnit(className, selectedVenue, groupUnit);
            }
        }
    });

    container.addEventListener('dragstart', function(e) {
        const item = e.target.closest('.venue-class-item');
        if (!item) return;
        e.dataTransfer.setData('text/plain', item.dataset.className);
        e.dataTransfer.setData('drag-source', 'venue');
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
    });

    container.addEventListener('dragend', function(e) {
        const item = e.target.closest('.venue-class-item');
        if (item) item.classList.remove('dragging');
    });

    const pendingList = document.getElementById('pendingClassList');
    if (pendingList) {
        pendingList.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            pendingList.classList.add('drag-over');
        });

        pendingList.addEventListener('dragleave', function(e) {
            if (!pendingList.contains(e.relatedTarget)) {
                pendingList.classList.remove('drag-over');
            }
        });

        pendingList.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            pendingList.classList.remove('drag-over');

            const className = e.dataTransfer.getData('text/plain');
            const dragSource = e.dataTransfer.getData('drag-source');
            if (!className || dragSource !== 'venue') return;

            removeClassFromVenue(className);
        });
    }
}

function assignClassToVenue(className, venue) {
    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    const selectedUnit = document.getElementById('unitFilter') ? document.getElementById('unitFilter').value : '1';

    let srcVenue = '';
    let srcUnit = '';
    let srcOrder = 0;

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            const orderInput = cells[3].querySelector('input');
            srcVenue = venueInput ? venueInput.value.trim() : '';
            srcUnit = unitInput ? unitInput.value.trim() : '';
            srcOrder = parseFloat(orderInput ? orderInput.value : 0) || 0;
        }
    });

    if (srcVenue && srcUnit && srcOrder > 0 && (srcVenue !== venue || srcUnit !== selectedUnit)) {
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 7) return;
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            const orderInput = cells[3].querySelector('input');
            const currentVenue = venueInput ? venueInput.value.trim() : '';
            const currentUnit = unitInput ? unitInput.value.trim() : '';
            if (currentVenue === srcVenue && currentUnit === srcUnit && orderInput) {
                const currentOrder = parseFloat(orderInput.value) || 0;
                if (currentOrder > srcOrder) {
                    orderInput.value = String(currentOrder - 1);
                }
            }
        });
    }

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            if (venueInput) venueInput.value = venue;
            if (unitInput) unitInput.value = selectedUnit;
        }
    });

    const existingInTarget = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');
        const orderInput = cells[3].querySelector('input');
        const currentVenue = venueInput ? venueInput.value.trim() : '';
        const currentUnit = unitInput ? unitInput.value.trim() : '';
        if (currentVenue === venue && currentUnit === selectedUnit) {
            existingInTarget.push({
                row: tr,
                className: getWeightClassFromRow(tr),
                category_order: parseFloat(orderInput ? orderInput.value : 0) || 0,
                orderInput: orderInput,
                isNew: getWeightClassFromRow(tr) === className
            });
        }
    });

    const usedOrders = new Set();
    existingInTarget.forEach(item => {
        if (!item.isNew && item.category_order > 0) {
            usedOrders.add(item.category_order);
        }
    });

    let newOrder = 1;
    while (usedOrders.has(newOrder)) newOrder++;

    existingInTarget.forEach(item => {
        if (item.isNew) {
            if (item.orderInput) item.orderInput.value = String(newOrder);
        }
    });

    existingInTarget.sort((a, b) => {
        const ordA = a.isNew ? newOrder : a.category_order;
        const ordB = b.isNew ? newOrder : b.category_order;
        return ordA - ordB;
    });

    let seq = 1;
    existingInTarget.forEach(item => {
        if (item.orderInput) item.orderInput.value = String(seq);
        seq++;
    });

    saveAutoArrangeSilent().then(() => {
        loadAutoArrangeData();
    });
}

function removeClassFromVenue(className) {
    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    let removedVenue = '';
    let removedUnit = '';
    let removedOrderStr = '';

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (getWeightClassFromRow(tr) === className) {
            const orderInput = cells[3].querySelector('input');
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            removedVenue = venueInput ? venueInput.value.trim() : '';
            removedUnit = unitInput ? unitInput.value.trim() : '';
            removedOrderStr = orderInput ? orderInput.value : '';
            if (venueInput) venueInput.value = '';
            if (unitInput) unitInput.value = '';
            if (orderInput) orderInput.value = '';
        }
    });

    if (removedVenue && removedUnit) {
        const removedOrder = parseFloat(removedOrderStr) || 0;
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 7) return;
            const venueInput = cells[4].querySelector('select, input');
            const unitInput = cells[5].querySelector('select, input');
            const orderInput = cells[3].querySelector('input');
            const currentVenue = venueInput ? venueInput.value.trim() : '';
            const currentUnit = unitInput ? unitInput.value.trim() : '';
            if (currentVenue === removedVenue && currentUnit === removedUnit && orderInput) {
                const currentOrder = parseFloat(orderInput.value) || 0;
                if (currentOrder > removedOrder) {
                    orderInput.value = String(currentOrder - 1);
                }
            }
        });
    }

    saveAutoArrangeSilent().then(() => {
        loadAutoArrangeData();
    });
}

function filterVenueAllocation() {
    const select = document.getElementById('venueFilter');
    const unitSelect = document.getElementById('unitFilter');
    if (!select || !currentVenueData) return;
    renderVenueList(currentVenueData, unitSelect ? unitSelect.value : '', select.value);
}

function resetVenueFilter() {
    const venueSelect = document.getElementById('venueFilter');
    const unitSelect = document.getElementById('unitFilter');
    if (!venueSelect) return;

    const venue = venueSelect.value;
    const unit = unitSelect ? unitSelect.value : '';

    if (!venue && !unit) {
        if (!confirm('确定要将所有场地的所有级别重置为待编排吗？这将清除所有已分配的场地、单元和顺序信息！')) return;
    } else if (!venue) {
        if (!confirm(`确定要将所有场地的第${unit}单元的所有级别重置为待编排吗？`)) return;
    } else if (!unit) {
        if (!confirm(`确定要将场地 ${venue} 的所有单元级别重置为待编排吗？`)) return;
    } else {
        if (!confirm(`确定要将场地 ${venue} 第${unit}单元的所有级别重置为待编排吗？`)) return;
    }

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    const resetClasses = [];

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');

        const rowVenue = venueInput ? venueInput.value.trim() : '';
        const rowUnit = unitInput ? unitInput.value.trim() : '';

        let shouldReset = false;

        if (!venue && !unit) {
            shouldReset = !!rowVenue || !!rowUnit;
        } else if (!venue) {
            shouldReset = rowUnit === unit;
        } else if (!unit) {
            shouldReset = rowVenue === venue;
        } else {
            shouldReset = rowVenue === venue && rowUnit === unit;
        }

        if (shouldReset) {
            venueInput.value = '';
            if (unitInput) unitInput.value = '';
            if (orderInput) orderInput.value = '';
            const weightClassTd = tr.querySelector('td[data-col="weightClass"]');
            const weightClass = weightClassTd ? weightClassTd.textContent.trim() : '';
            if (weightClass) resetClasses.push(weightClass);
        }
    });

    if (resetClasses.length === 0) { alert('没有找到符合条件的已分配级别'); return; }

    console.log(`🔄 重置了 ${resetClasses.length} 个级别:`, resetClasses);

    saveAutoArrangeSilent().then(() => {
        loadAutoArrangeData();
    });
}

let currentVenueCount = 1;
let currentDateCount = 1;

async function showVenueUnitConfig() {
    if (!currentEventId) {
        alert('请先选择赛事');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/config?event_id=${currentEventId}`);
        const data = await res.json();
        if (data.success) {
            currentVenueCount = data.data.venue_count || 1;
            currentDateCount = data.data.date_count || 1;
        }
    } catch (e) {
        console.error('加载配置失败:', e);
    }

    const existingModal = document.getElementById('venueUnitConfigModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'venueUnitConfigModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    modal.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;min-width:450px;box-shadow:0 8px 32px rgba(0,0,0,0.2);animation:modalSlideIn 0.3s ease-out;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;color:#303133;font-size:18px;">⚙️ 场地与单元配置</h3>
                <button onclick="closeVenueUnitConfig()" style="border:none;background:none;font-size:24px;cursor:pointer;color:#909399;padding:0;line-height:1;">×</button>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:14px;color:#606266;margin-bottom:8px;font-weight:500;">🏟️ 赛事场地个数</label>
                <input type="number" id="configVenueCount" value="${currentVenueCount}" min="1" max="26" 
                    style="width:100%;padding:10px;border:1px solid #dcdfe6;border-radius:6px;font-size:16px;text-align:center;"
                    oninput="validateConfigInput(this)">
                <div style="font-size:12px;color:#909399;margin-top:4px;">设置 1-26 个场地（A-Z）</div>
            </div>
            
            <div style="margin-bottom:24px;">
                <label style="display:block;font-size:14px;color:#606266;margin-bottom:8px;font-weight:500;">📅 赛事单元（天数）</label>
                <input type="number" id="configDateCount" value="${currentDateCount}" min="1" max="30"
                    style="width:100%;padding:10px;border:1px solid #dcdfe6;border-radius:6px;font-size:16px;text-align:center;"
                    oninput="validateConfigInput(this)">
                <div style="font-size:12px;color:#909399;margin-top:4px;">设置 1-30 个单元（比赛天数）</div>
            </div>

            <div style="background:#eaf0ff;padding:16px;border-radius:8px;margin-bottom:20px;border:1px solid #b3d1ff;">
                <div style="font-size:13px;color:#1e46ad;margin-bottom:12px;font-weight:600;">🏟️ 自动分配场地</div>
                <div style="font-size:12px;color:#606266;margin-bottom:10px;">按场地数量自动将级别均分到各场地</div>
                <button onclick="applyAutoAssignVenue()" style="width:100%;padding:10px;background:#8e44ad;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.2s;" onmouseover="this.style.background='#9b59b6'" onmouseout="this.style.background='#8e44ad'">
                    🤖 执行自动分配
                </button>
            </div>

            <div style="background:#f5f7fa;padding:16px;border-radius:8px;margin-bottom:20px;">
                <div style="font-size:13px;color:#606266;margin-bottom:8px;font-weight:500;">📋 预览配置：</div>
                <div id="configPreview" style="font-size:12px;color:#909399;line-height:1.8;"></div>
            </div>
            
            <div style="display:flex;gap:12px;">
                <button onclick="saveVenueUnitConfig()" style="flex:1;padding:12px;background:#409EFF;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;" onmouseover="this.style.background='#66b1ff'" onmouseout="this.style.background='#409EFF'">
                    ✅ 保存配置
                </button>
                <button onclick="closeVenueUnitConfig()" style="flex:1;padding:12px;background:#f56c6c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;" onmouseover="this.style.background='#f78989'" onmouseout="this.style.background='#f56c6c'">
                    ❌ 取消
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    updateConfigPreview();

    document.getElementById('configVenueCount').addEventListener('input', updateConfigPreview);
    document.getElementById('configDateCount').addEventListener('input', updateConfigPreview);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeVenueUnitConfig();
    });
}

function validateConfigInput(input) {
    const min = parseInt(input.min);
    const max = parseInt(input.max);
    let val = parseInt(input.value) || min;
    
    if (val < min) val = min;
    if (val > max) val = max;
    
    input.value = val;
}

function updateConfigPreview() {
    const venueCount = parseInt(document.getElementById('configVenueCount')?.value) || currentVenueCount;
    const dateCount = parseInt(document.getElementById('configDateCount')?.value) || currentDateCount;

    const previewEl = document.getElementById('configPreview');
    if (!previewEl) return;

    let html = `<strong>总场地数：${venueCount} 个</strong> (`;
    for (let i = 0; i < Math.min(venueCount, 5); i++) {
        html += `${String.fromCharCode(65 + i)} `;
    }
    if (venueCount > 5) html += `... 共${venueCount}个`;
    html += `)<br>`;
    
    html += `<strong>总单元数：${dateCount} 个</strong> (1 - ${dateCount})<br>`;
    
    html += `<strong>最大容量：${venueCount * dateCount}</strong> 个场地-单元组合`;

    previewEl.innerHTML = html;
}

async function saveVenueUnitConfig() {
    const venueCount = parseInt(document.getElementById('configVenueCount').value);
    const dateCount = parseInt(document.getElementById('configDateCount').value);

    if (!venueCount || !dateCount || venueCount < 1 || dateCount < 1) {
        alert('⚠️ 请输入有效的数字！');
        return;
    }

    if (venueCount > 26) {
        alert('⚠️ 场地数量不能超过26个（A-Z）！');
        return;
    }

    if (dateCount > 30) {
        alert('⚠️ 单元数量不能超过30天！');
        return;
    }

    const validVenueLetters = new Set();
    for (let i = 0; i < venueCount; i++) {
        validVenueLetters.add(String.fromCharCode(65 + i));
    }

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody ? tbody.querySelectorAll('tr') : [];
    const clearedClasses = [];

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClass = getWeightClassFromRow(tr);
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');

        const currentVenue = venueInput ? venueInput.value.trim() : '';
        const currentUnit = unitInput ? unitInput.value.trim() : '';
        const currentOrder = orderInput ? orderInput.value.trim() : '';

        let needClear = false;

        if (currentUnit && parseInt(currentUnit) > dateCount) {
            needClear = true;
        }

        if (currentVenue && !validVenueLetters.has(currentVenue)) {
            needClear = true;
        }

        if (needClear && (currentVenue || currentUnit || currentOrder)) {
            clearedClasses.push(weightClass);
            if (venueInput) venueInput.value = '';
            if (unitInput) unitInput.value = '';
            if (orderInput) orderInput.value = '';
        }
    });

    try {
        const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: currentEventId,
                venue_count: venueCount,
                date_count: dateCount
            })
        });

        const result = await res.json();
        if (result.success) {
            currentVenueCount = venueCount;
            currentDateCount = dateCount;

            if (clearedClasses.length > 0) {
                await saveAutoArrangeSilent();
            }

            let msg = `✅ 配置已保存！\n\n🏟️ 场地数：${venueCount} 个\n📅 单元数：${dateCount} 个`;
            if (clearedClasses.length > 0) {
                msg += `\n\n⚠️ 以下 ${clearedClasses.length} 个级别因超出范围已重置为待编排：\n${clearedClasses.join('、')}`;
            }
            alert(msg);
            closeVenueUnitConfig();
            loadAutoArrangeData();
        } else {
            alert('❌ 保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('❌ 保存失败: ' + e.message);
    }
}

function closeVenueUnitConfig() {
    const modal = document.getElementById('venueUnitConfigModal');
    if (modal) modal.remove();
}

function showClassEditPanel(className, currentVenue, currentUnit) {
    const existingModal = document.getElementById('classEditModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'classEditModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    let venueOptions = '';
    for (let i = 0; i < (currentVenueCount || 26); i++) {
        const letter = String.fromCharCode(65 + i);
        venueOptions += `<option value="${letter}" ${letter === currentVenue ? 'selected' : ''}>${letter}</option>`;
    }

    let unitOptions = '';
    for (let i = 1; i <= (currentDateCount || 30); i++) {
        unitOptions += `<option value="${i}" ${i === parseInt(currentUnit) ? 'selected' : ''}>${i}</option>`;
    }

    modal.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.2);animation:modalSlideIn 0.3s ease-out;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;color:#303133;font-size:16px;">✏️ 编辑级别</h3>
                <button onclick="closeClassEditModal()" style="border:none;background:none;font-size:24px;cursor:pointer;color:#909399;padding:0;line-height:1;">×</button>
            </div>

            <div style="margin-bottom:12px;font-size:14px;color:#303133;font-weight:500;">📌 ${className}</div>

            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:13px;color:#606266;margin-bottom:6px;">🏟️ 场地</label>
                <select id="editVenue" style="width:100%;padding:10px;border:1px solid #dcdfe6;border-radius:6px;font-size:14px;">
                    <option value="">未分配</option>
                    ${venueOptions}
                </select>
            </div>

            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:13px;color:#606266;margin-bottom:6px;">📅 单元</label>
                <select id="editUnit" style="width:100%;padding:10px;border:1px solid #dcdfe6;border-radius:6px;font-size:14px;">
                    <option value="">未分配</option>
                    ${unitOptions}
                </select>
            </div>

            <div style="margin-bottom:24px;">
                <label style="display:block;font-size:13px;color:#606266;margin-bottom:6px;">🔢 顺序</label>
                <input type="number" id="editOrder" min="1" max="99"
                    style="width:100%;padding:10px;border:1px solid #dcdfe6;border-radius:6px;font-size:14px;"
                    placeholder="输入顺序号">
            </div>

            <div style="display:flex;gap:12px;">
                <button onclick="saveClassEdit('${className}')" style="flex:1;padding:12px;background:#409EFF;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">
                    ✅ 保存
                </button>
                <button onclick="closeClassEditModal()" style="flex:1;padding:12px;background:#f56c6c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">
                    ❌ 取消
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeClassEditModal();
    });
}

async function saveClassEdit(className) {
    const venue = document.getElementById('editVenue').value.trim();
    const unit = document.getElementById('editUnit').value.trim();
    const order = document.getElementById('editOrder').value.trim();

    try {
        const res = await fetch(`${API_BASE}/auto-arrange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: currentEventId,
                weight_class: className,
                venue,
                unit,
                order
            })
        });

        const result = await res.json();
        if (result.success) {
            closeClassEditModal();
            loadAutoArrangeData();
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

function closeClassEditModal() {
    const modal = document.getElementById('classEditModal');
    if (modal) modal.remove();
}

async function saveAutoArrangeSilent() {
    if (!currentEventId) return;

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    const classMap = new Map();
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClassTd = tr.querySelector('td[data-col="weightClass"]');
        const weightClass = weightClassTd ? weightClassTd.textContent.trim() : '';
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');
        if (weightClass && !classMap.has(weightClass)) {
            classMap.set(weightClass, {
                weight_class: weightClass,
                category_venue: venueInput ? venueInput.value : '',
                category_date_num: unitInput ? unitInput.value : '',
                category_order: orderInput ? orderInput.value : ''
            });
        }
    });

    try {
        await fetch(`${API_BASE}/auto-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: Array.from(classMap.values()) })
        });
    } catch (e) {
        console.error('静默保存失败:', e);
    }
}

const TKD_COMP_MODES = [
    { value: 'single_elimination', label: '单败淘汰赛' },
    { value: 'double_elimination', label: '双败淘汰赛' },
    { value: 'round_robin', label: '循环赛' },
    { value: 'pool_elimination', label: '分区循环赛' }
];

let tkdCompModeConfig = {};

async function loadTKDCompModeConfig() {
    if (!currentEventId) return;
    try {
        try {
            await fetch(`${API_BASE}/category-mode/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: currentEventId })
            });
        } catch (syncErr) {
            console.warn('[loadTKDCompModeConfig] 同步category_mode失败:', syncErr);
        }

        const resp = await fetch(`${API_BASE}/category-mode?event_id=${currentEventId}`);
        const data = await resp.json();
        if (data.success && data.data) {
            tkdCompModeConfig = {};
            data.data.forEach(cat => {
                if (cat.weight_class) {
                    tkdCompModeConfig[cat.weight_class] = cat.mode || 'single_elimination';
                }
            });
        }
    } catch (e) {
        console.warn('加载竞赛方式配置失败:', e);
    }
}

async function saveTKDCompMode(weightClass, mode) {
    if (!currentEventId) return;
    try {
        let catData;
        try {
            const syncResp = await fetch(`${API_BASE}/category-mode/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: currentEventId })
            });
            const syncData = await syncResp.json();
            catData = syncData;
        } catch (e) {
            const catResp = await fetch(`${API_BASE}/category-mode?event_id=${currentEventId}`);
            catData = await catResp.json();
        }

        if (catData.success && catData.data) {
            const cat = catData.data.find(c => c.weight_class === weightClass);
            if (cat && cat.category_id) {
                await fetch(`${API_BASE}/category-mode/${cat.category_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode, categroy_mode_name: TKD_COMP_MODES.find(m => m.value === mode)?.label || mode })
                });
            }
        }
        tkdCompModeConfig[weightClass] = mode;
    } catch (e) {
        console.error('保存竞赛方式失败:', e);
    }
}

async function onTKDCompModeChange(weightClass, mode) {
    await saveTKDCompMode(weightClass, mode);
    await loadAutoArrangeData();
}

function calculateRounds(count, compMode) {
    compMode = compMode || 'single_elimination';

    if (compMode === 'round_robin') {
        return calculateRoundRobinRounds(count);
    }
    if (compMode === 'double_elimination') {
        return calculateDoubleEliminationRounds(count);
    }
    if (compMode === 'pool_elimination') {
        return calculatePoolEliminationRounds(count);
    }
    return calculateSingleEliminationRounds(count);
}

function calculateSingleEliminationRounds(count) {
    const rounds = {
        final: 0, half: 0, quarter: 0, eighth: 0,
        sixteenth: 0, thirtysecond: 0, sixtyfourth: 0,
        onetwentyeighth: 0, twofiftysixth: 0,
        gold: 0, silver: 0, bronze: 0, repechage: 0
    };

    if (count <= 1) return { ...rounds, total: 0 };

    rounds.final = 1;
    rounds.gold = 1;
    rounds.silver = 1;
    rounds.bronze = 2;

    if (count === 2) return { ...rounds, total: 1 };

    let bracketSize = 4;
    while (bracketSize < count) bracketSize *= 2;

    const k = Math.round(Math.log2(bracketSize));
    const roundNames = ['final', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth', 'onetwentyeighth', 'twofiftysixth'];

    const firstRoundMatches = count - bracketSize / 2;
    if (k - 1 < roundNames.length) {
        rounds[roundNames[k - 1]] = firstRoundMatches;
    }

    for (let i = k - 2; i >= 1; i--) {
        rounds[roundNames[i]] = Math.pow(2, i);
    }

    return { ...rounds, total: count - 1 };
}

function calculateRoundRobinRounds(count) {
    const rounds = {
        final: 0, half: 0, quarter: 0, eighth: 0,
        sixteenth: 0, thirtysecond: 0, sixtyfourth: 0,
        onetwentyeighth: 0, twofiftysixth: 0,
        gold: 0, silver: 0, bronze: 0, repechage: 0,
        roundRobinRounds: 0
    };

    if (count <= 1) return { ...rounds, total: 0 };

    const totalMatches = count * (count - 1) / 2;
    const totalRounds = count % 2 === 0 ? count - 1 : count;
    rounds.roundRobinRounds = totalRounds;
    rounds.total = totalMatches;
    rounds.gold = 1;
    rounds.silver = 1;
    rounds.bronze = 2;

    return rounds;
}

function calculateDoubleEliminationRounds(count) {
    const rounds = {
        final: 0, half: 0, quarter: 0, eighth: 0,
        sixteenth: 0, thirtysecond: 0, sixtyfourth: 0,
        onetwentyeighth: 0, twofiftysixth: 0,
        gold: 0, silver: 0, bronze: 0, repechage: 0,
        winnersRounds: 0, losersRounds: 0
    };

    if (count <= 1) return { ...rounds, total: 0 };

    let bracketSize = 2;
    while (bracketSize < count) bracketSize *= 2;

    const k = Math.round(Math.log2(bracketSize));
    rounds.winnersRounds = k;
    rounds.losersRounds = Math.max(1, 2 * (k - 1));

    const winnersMatches = bracketSize - 1;
    const losersMatches = bracketSize - 2;
    const grandFinalMatches = 1;
    const total = winnersMatches + losersMatches + grandFinalMatches;

    rounds.final = 1;
    rounds.gold = 1;
    rounds.silver = 1;
    rounds.bronze = 0;
    rounds.repechage = losersMatches;
    rounds.total = total;

    const roundNames = ['final', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth', 'onetwentyeighth', 'twofiftysixth'];
    for (let i = 0; i < k; i++) {
        if (i < roundNames.length) {
            rounds[roundNames[i]] = Math.pow(2, k - 1 - i);
        }
    }

    return rounds;
}

function calculatePoolEliminationRounds(count) {
    const poolCount = Math.max(2, Math.ceil(count / 4));
    const poolSize = Math.ceil(count / poolCount);

    let poolMatches = 0;
    for (let i = 0; i < poolCount; i++) {
        const ps = Math.min(poolSize, count - i * poolSize);
        poolMatches += ps * (ps - 1) / 2;
    }

    const knockoutCount = poolCount;
    let bracketSize = 2;
    while (bracketSize < knockoutCount) bracketSize *= 2;
    const knockoutMatches = knockoutCount - 1;

    const rounds = {
        final: 0, half: 0, quarter: 0, eighth: 0,
        sixteenth: 0, thirtysecond: 0, sixtyfourth: 0,
        onetwentyeighth: 0, twofiftysixth: 0,
        gold: 0, silver: 0, bronze: 0, repechage: 0,
        poolMatches: poolMatches
    };

    rounds.total = poolMatches + knockoutMatches;
    rounds.gold = 1;
    rounds.silver = 1;
    rounds.bronze = 2;

    return rounds;
}

async function generateBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody ? tbody.querySelectorAll('tr') : [];
    if (rows.length === 0) { alert('暂无编排数据，请先添加运动员'); return; }

    const unassigned = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClass = getWeightClassFromRow(tr);
        const orderInput = cells[3].querySelector('input');
        const venueSelect = cells[4].querySelector('select');
        const unitSelect = cells[5].querySelector('select');

        const order = orderInput ? (parseInt(orderInput.value) || 0) : 0;
        const venue = venueSelect ? venueSelect.value.trim() : '';
        const unit = unitSelect ? unitSelect.value.trim() : '';

        const missing = [];
        if (!venue) missing.push('场地');
        if (!unit) missing.push('单元');
        if (!order) missing.push('顺序');
        if (missing.length > 0) {
            unassigned.push(`${weightClass}（未分配${missing.join('、')}）`);
        }
    });

    if (unassigned.length > 0) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:8px;padding:24px;max-width:500px;width:90%;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
        box.innerHTML = `
            <div style="font-size:18px;font-weight:bold;color:#E6A23C;margin-bottom:16px;">⚠️ 以下级别未完成场地分配</div>
            <div style="flex:1;overflow-y:auto;margin-bottom:16px;border:1px solid #EBEEF5;border-radius:4px;padding:12px;">
                ${unassigned.map(s => `<div style="padding:4px 0;font-size:13px;color:#606266;border-bottom:1px solid #F2F6FC;">${s}</div>`).join('')}
            </div>
            <div style="text-align:right;">
                <button id="closeUnassignedModal" style="padding:8px 24px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;cursor:pointer;font-size:14px;">确定</button>
            </div>
        `;
        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.querySelector('#closeUnassignedModal').onclick = () => document.body.removeChild(modal);
        modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
        return;
    }

    try {
        const checkRes = await fetch(`${API_BASE}/matches?${getEventParam()}`);
        const checkData = await checkRes.json();
        if (checkData.success && checkData.data && checkData.data.length > 0) {
            if (!confirm('当前赛事已有对阵表数据，生成新对阵表将清除原有数据，是否继续？')) return;
        }
    } catch (e) {}

    try {
        const genRes = await fetch(`${API_BASE}/auto-arrange/generate-bracket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getEventParamObj())
        });
        const genData = await genRes.json();
        if (!genData.success) {
            alert('❌ 生成对阵图失败: ' + (genData.error || '未知错误'));
            return;
        }

        const genResult = genData.data;
        let msg = '✅ 对阵图生成完成！\n\n成功: ' + genResult.generated + ' 个级别';
        if (genResult.skipped > 0) {
            msg += '\n跳过: ' + genResult.skipped + ' 个级别';
        }
        if (genResult.errors && genResult.errors.length > 0) {
            msg += '\n\n警告:\n' + genResult.errors.join('\n');
        }

        try {
            const syncRes = await fetch(`${API_BASE}/brackets/generate-matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(getEventParamObj())
            });
            const syncData = await syncRes.json();
            if (syncData.success && syncData.data) {
                msg += '\n\n比赛场次同步: ' + syncData.data.generated + ' 个级别';
                if (syncData.data.errors && syncData.data.errors.length > 0) {
                    msg += '\n同步警告:\n' + syncData.data.errors.join('\n');
                }
            }
        } catch (syncErr) {
            console.warn('同步比赛场次失败:', syncErr);
        }

        if (genResult.results && genResult.results.length > 0) {
            msg += '\n\n详情:\n' + genResult.results.join('\n');
        }
        alert(msg);

        await loadAutoArrangeData();
    } catch (e) {
        alert('❌ 生成请求失败: ' + e.message);
    }
}

async function autoAssignVenueNumbersAfterGenerate() {
    if (!currentEventId) return;

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody ? tbody.querySelectorAll('tr') : [];
    if (rows.length === 0) return;

    const classData = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClass = getWeightClassFromRow(tr);
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');

        const venue = venueInput ? venueInput.value.trim() : '';
        const unit = unitInput ? unitInput.value.trim() : '';
        const order = parseInt(orderInput ? orderInput.value : 0) || 0;

        if (weightClass && unit && order > 0) {
            classData.push({
                weight_class: weightClass,
                venue: venue || 'A',
                unit: unit,
                order: order
            });
        }
    });

    if (classData.length === 0) return;

    try {
        const res = await fetch(`${API_BASE}/matches/assign-venue-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: classData })
        });
        const result = await res.json();

        if (result.success) {
            console.log(`✅ 自动设置场次号完成！已更新 ${result.updated || classData.length} 场比赛的场次号`);
        }
    } catch (e) {
        console.warn('自动设置场次号失败:', e.message);
    }
}

async function saveAutoArrange() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) { alert('没有可保存的数据'); return; }

    const classMap = new Map();
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClass = getWeightClassFromRow(tr);
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');
        if (weightClass && !classMap.has(weightClass)) {
            classMap.set(weightClass, {
                weight_class: weightClass,
                category_venue: venueInput ? venueInput.value : '',
                category_date_num: unitInput ? unitInput.value : '',
                category_order: orderInput ? orderInput.value : ''
            });
        }
    });

    try {
        const res = await fetch(`${API_BASE}/auto-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: Array.from(classMap.values()) })
        });
        const result = await res.json();
        if (result.success) {
            alert(`保存成功！${result.message || ''}`);
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存请求失败: ' + e.message);
    }
}

async function exportArrangeData() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    try { window.open(`${API_BASE}/auto-arrange/export?event_id=${currentEventId}`, '_blank'); } catch (e) { alert('导出失败: ' + e.message); }
}

async function downloadArrangeTemplate() {
    try { window.open(`${API_BASE}/auto-arrange/template`, '_blank'); } catch (e) { alert('下载模板失败: ' + e.message); }
}

let importedVenueData = null;

async function handleArrangeImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (currentEventId) formData.append('event_id', currentEventId);

    try {
        const res = await fetch(`${API_BASE}/auto-arrange/import`, { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            const venueMap = new Map();
            data.data.forEach(item => {
                if (item.weight_class) {
                    venueMap.set(item.weight_class, {
                        category_venue: item.category_venue != null ? String(item.category_venue) : '',
                        category_date_num: item.category_date_num != null ? String(item.category_date_num) : '',
                        category_order: item.category_order != null ? String(item.category_order) : ''
                    });
                }
            });
            importedVenueData = venueMap;
            await loadAutoArrangeData();
            importedVenueData = null;
            alert(`导入成功！已更新 ${venueMap.size} 个级别的场地/单元/顺序`);
        } else {
            alert('导入失败: ' + (data.error || '未知错误'));
        }
    } catch (e) { alert('导入请求失败: ' + e.message); }
    event.target.value = '';
}

// ========== 自动分配场地功能（整合到配置弹窗中） ==========

async function applyAutoAssignVenue() {
    const venueCount = parseInt(document.getElementById('configVenueCount').value);
    const unitCount = parseInt(document.getElementById('configDateCount').value);

    if (!currentEventId) { alert('请先选择赛事'); return; }

    if (!venueCount || !unitCount || venueCount < 1 || unitCount < 1) {
        alert('⚠️ 请输入有效的场地数和单元数！');
        return;
    }

    if (venueCount > 26) {
        alert('⚠️ 场地数量不能超过26个（A-Z）！');
        return;
    }

    if (unitCount > 30) {
        alert('⚠️ 单元数量不能超过30天！');
        return;
    }

    try {
        const saveConfigRes = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: currentEventId,
                venue_count: venueCount,
                date_count: unitCount
            })
        });
        const configResult = await saveConfigRes.json();
        if (!configResult.success) {
            alert('保存配置失败: ' + (configResult.error || '未知错误'));
            return;
        }

        currentVenueCount = venueCount;
        currentDateCount = unitCount;
    } catch (e) {
        alert('保存配置失败: ' + e.message);
        return;
    }

    const currentAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : 'taekwondo_kyougi';
    const athletesRes = await fetch(`${API_BASE}/athletes?event_id=${currentEventId}&athlete_type=${currentAthleteType}`);
    const athletesData = await athletesRes.json();
    if (!athletesData.success || !athletesData.data || athletesData.data.length === 0) {
        alert('没有运动员数据');
        closeVenueUnitConfig();
        return;
    }

    const classMap = new Map();
    athletesData.data.forEach(a => {
        const wc = a.athlete_category || '未分级';
        if (!classMap.has(wc)) classMap.set(wc, 0);
        classMap.set(wc, classMap.get(wc) + 1);
    });

    const classes = [];
    for (const [name, athleteCount] of classMap) {
        const rounds = calculateRounds(athleteCount);
        classes.push({ name, athleteCount, matches: rounds.total || 0 });
    }

    if (classes.length === 0) {
        alert('没有可分配的级别');
        closeVenueUnitConfig();
        return;
    }

    classes.sort((a, b) => b.matches - a.matches);

    const totalSlots = venueCount * unitCount;
    const slots = [];
    for (let u = 0; u < unitCount; u++) {
        for (let v = 0; v < venueCount; v++) {
            slots.push({
                unit: u + 1,
                venue: String.fromCharCode(65 + v),
                matches: 0,
                classes: []
            });
        }
    }

    classes.forEach(cls => {
        let minIdx = 0;
        for (let i = 1; i < slots.length; i++) {
            if (slots[i].matches < slots[minIdx].matches) {
                minIdx = i;
            }
        }
        slots[minIdx].matches += cls.matches;
        slots[minIdx].classes.push(cls);
    });

    const saveData = [];
    slots.forEach(slot => {
        slot.classes.forEach((cls, i) => {
            saveData.push({
                weight_class: cls.name,
                category_venue: slot.venue,
                category_date_num: String(slot.unit),
                category_order: String(i + 1)
            });
        });
    });

    try {
        await fetch(`${API_BASE}/auto-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: saveData })
        });
    } catch (e) {
        alert('保存分配结果失败: ' + e.message);
        return;
    }

    closeVenueUnitConfig();
    await loadAutoArrangeData();

    const slotDetails = [];
    for (let u = 1; u <= unitCount; u++) {
        for (let v = 0; v < venueCount; v++) {
            const venueLetter = String.fromCharCode(65 + v);
            const slot = slots.find(s => s.unit === u && s.venue === venueLetter);
            if (slot) {
                slotDetails.push(`第${u}单元 ${venueLetter}场地：${slot.classes.length}个级别，${slot.matches}场`);
            }
        }
    }

    alert(`✅ 自动分配完成！

${slotDetails.join('\n')}

共 ${classes.length} 个级别，${slots.reduce((sum, s) => sum + s.matches, 0)} 场比赛`);
}

// ========== 手工编排功能 ==========

let manualArrangeData = {
    athletes: [],
    bracket: {},
    currentWeightClass: null
};

function switchToManualArrange() {
    if (!currentEventId) {
        alert('请先选择赛事');
        return;
    }
    document.getElementById('manualArrangeModal').style.display = 'block';
    loadWeightClassesForManual();
}

function closeManualArrangeModal() {
    document.getElementById('manualArrangeModal').style.display = 'none';
}

async function loadWeightClassesForManual() {
    const select = document.getElementById('manualWeightClassSelect');
    select.innerHTML = '<option value="">选择级别</option>';
    
    try {
        const currentAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : 'taekwondo_kyougi';
        const res = await fetch(`${API_BASE}/athletes?${getEventParam()}&athlete_type=${currentAthleteType}`);
        const data = await res.json();
        if (!data.success) return;
        
        const classMap = new Map();
        data.data.forEach(a => {
            const wc = a.athlete_category || '未分级';
            if (!classMap.has(wc)) {
                classMap.set(wc, { name: wc, gender: a.athlete_gender, group_class: a.athlete_age_group, count: 0 });
            }
            classMap.get(wc).count++;
        });
        
        const classes = Array.from(classMap.values()).sort((a, b) => {
            if (a.gender !== b.gender) return (a.gender === '男' ? -1 : 1);
            if (a.group_class !== b.group_class) {
                const groupOrder = { '小学': 1, '初中': 2, '高中': 3, '大学': 4, '成年': 5 };
                return (groupOrder[a.group_class] || 99) - (groupOrder[b.group_class] || 99);
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls.name;
            option.textContent = `${cls.name} (${cls.gender} ${cls.group_class} ${cls.count}人)?`;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('加载级别失败:', e);
    }
}

async function loadManualArrangeData() {
    const weightClass = document.getElementById('manualWeightClassSelect').value;
    if (!weightClass) {
        document.getElementById('manualAthletesList').innerHTML = '<p style="color:#909399; text-align:center;">请先选择级别</p>';
        document.getElementById('manualBracketContainer').innerHTML = '<p style="color:#909399; text-align:center;">请先选择级别</p>';
        return;
    }
    
    manualArrangeData.currentWeightClass = weightClass;
    
    try {
        const currentAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : 'taekwondo_kyougi';
        const res = await fetch(`${API_BASE}/athletes?${getEventParam()}&athlete_type=${currentAthleteType}`);
        const data = await res.json();
        if (!data.success) return;
        
        const athletes = data.data.filter(a => (a.athlete_category || '未分级') === weightClass);
        manualArrangeData.athletes = athletes;
        
        renderAthletesList(athletes);
        renderBracket(athletes.length, weightClass);
    } catch (e) {
        console.error('加载手工编排数据失败:', e);
    }
}

function renderAthletesList(athletes) {
    const container = document.getElementById('manualAthletesList');
    if (athletes.length === 0) {
        container.innerHTML = '<p style="color:#909399; text-align:center;">该级别暂无运动员</p>';
        return;
    }
    
    container.innerHTML = athletes.map((a, index) => `
        <div class="athlete-item" draggable="true" data-athlete-id="${a.id}" data-athlete-name="${a.name}" data-athlete-index="${index}">
            <span>${a.name}</span>
            <span style="color:#909399; font-size:12px;">${a.team || '无队伍'}</span>
        </div>
    `).join('');
    
    // 添加拖拽事件
    container.querySelectorAll('.athlete-item').forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });
}

function renderBracket(count, weightClass) {
    const container = document.getElementById('manualBracketContainer');
    const rounds = calculateRounds(count);
    
    let html = '<div style="display:flex; flex-direction:column; gap:20px;">';
    
    // 生成各轮次的对阵位置
    const roundNames = [
        { key: 'final', name: '决赛' },
        { key: 'half', name: '半决赛' },
        { key: 'quarter', name: '1/4决赛' },
        { key: 'eighth', name: '1/8决赛' },
        { key: 'sixteenth', name: '1/16决赛' },
        { key: 'thirtysecond', name: '1/32决赛' }
    ];
    
    roundNames.forEach(round => {
        const numMatches = rounds[round.key];
        if (numMatches > 0) {
            html += `<div class="bracket-round">`;
            html += `<h4>${round.name} (${numMatches}场)?</h4>`;
            html += `<div style="display:flex; flex-wrap:wrap; gap:10px;">`;
            
            for (let i = 0; i < numMatches; i++) {
                const matchId = `${round.key}_${i}`;
                html += `
                    <div class="bracket-match" data-match-id="${matchId}">
                        <div class="bracket-position" data-position="${matchId}_red" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" onclick="clearPosition('${matchId}_red')">
                            <span class="placeholder">红方${i+1}</span>
                        </div>
                        <span style="margin:0 10px; color:#909399;">VS</span>
                        <div class="bracket-position" data-position="${matchId}_blue" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" onclick="clearPosition('${matchId}_blue')">
                            <span class="placeholder">蓝方${i+1}</span>
                        </div>
                    </div>
                `;
            }
            
            html += `</div></div>`;
        }
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // 加载已保存的手工编排数据
    loadSavedManualArrange(weightClass);
}

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
        athleteId: e.target.dataset.athleteId,
        athleteName: e.target.dataset.athleteName,
        athleteIndex: e.target.dataset.athleteIndex
    }));
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const position = e.target.closest('.bracket-position');
    
    if (!position) return;
    
    // 检查该运动员是否已经在其他位置
    const existingPosition = document.querySelector(`[data-athlete-id="${data.athleteId}"]`);
    if (existingPosition && existingPosition !== position) {
        if (!confirm(`${data.athleteName} 已经在其他位置，是否移动到新位置？`)) {
            return;
        }
        // 清除原位置
        const oldPosition = existingPosition.closest('.bracket-position');
        if (oldPosition) {
            clearPositionByElement(oldPosition);
        }
    }
    
    // 设置新位置
    position.innerHTML = `<span class="athlete-name">${data.athleteName}</span>`;
    position.classList.add('occupied');
    position.dataset.athleteId = data.athleteId;
    position.dataset.athleteName = data.athleteName;
    
    // 从运动员列表中移除或标记
    const athleteItem = document.querySelector(`.athlete-item[data-athlete-id="${data.athleteId}"]`);
    if (athleteItem) {
        athleteItem.style.opacity = '0.5';
        athleteItem.draggable = false;
    }
}

function clearPosition(positionId) {
    const position = document.querySelector(`[data-position="${positionId}"]`);
    if (!position) return;
    
    clearPositionByElement(position);
}

function clearPositionByElement(position) {
    const athleteId = position.dataset.athleteId;
    if (athleteId) {
        // 恢复运动员列表中的项
        const athleteItem = document.querySelector(`.athlete-item[data-athlete-id="${athleteId}"]`);
        if (athleteItem) {
            athleteItem.style.opacity = '1';
            athleteItem.draggable = true;
        }
    }
    
    const matchId = position.dataset.position.split('_')[0] + '_' + position.dataset.position.split('_')[1];
    const side = position.dataset.position.split('_')[2];
    position.innerHTML = `<span class="placeholder">${side === 'red' ? '红方' : '蓝方'}${parseInt(position.dataset.position.split('_')[1]) + 1}</span>`;
    position.classList.remove('occupied');
    delete position.dataset.athleteId;
    delete position.dataset.athleteName;
}

function clearManualArrange() {
    if (!confirm('确定要清空当前手工编排吗？')) return;
    
    // 恢复所有运动员
    document.querySelectorAll('.athlete-item').forEach(item => {
        item.style.opacity = '1';
        item.draggable = true;
    });
    
    // 清空所有位置
    document.querySelectorAll('.bracket-position.occupied').forEach(position => {
        const matchId = position.dataset.position.split('_')[0] + '_' + position.dataset.position.split('_')[1];
        const side = position.dataset.position.split('_')[2];
        position.innerHTML = `<span class="placeholder">${side === 'red' ? '红方' : '蓝方'}${parseInt(position.dataset.position.split('_')[1]) + 1}</span>`;
        position.classList.remove('occupied');
        delete position.dataset.athleteId;
        delete position.dataset.athleteName;
    });
}

function autoFillManualArrange() {
    const athletes = [...manualArrangeData.athletes];
    if (athletes.length === 0) return;
    
    // 清空现有编排
    clearManualArrange();
    
    // 随机打乱运动员顺序
    for (let i = athletes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [athletes[i], athletes[j]] = [athletes[j], athletes[i]];
    }
    
    // 获取所有空位置
    const positions = document.querySelectorAll('.bracket-position:not(.occupied)');
    
    // 自动填充
    let athleteIndex = 0;
    positions.forEach(position => {
        if (athleteIndex >= athletes.length) return;
        
        const athlete = athletes[athleteIndex];
        position.innerHTML = `<span class="athlete-name">${athlete.name}</span>`;
        position.classList.add('occupied');
        position.dataset.athleteId = athlete.id;
        position.dataset.athleteName = athlete.name;
        
        // 标记运动员为已使用
        const athleteItem = document.querySelector(`.athlete-item[data-athlete-id="${athlete.id}"]`);
        if (athleteItem) {
            athleteItem.style.opacity = '0.5';
            athleteItem.draggable = false;
        }
        
        athleteIndex++;
    });
}

async function saveManualArrange() {
    if (!manualArrangeData.currentWeightClass) {
        alert('请先选择级别');
        return;
    }
    
    const arrangements = [];
    document.querySelectorAll('.bracket-match').forEach(match => {
        const matchId = match.dataset.matchId;
        const redPosition = match.querySelector('[data-position$="_red"]');
        const bluePosition = match.querySelector('[data-position$="_blue"]');
        
        if (redPosition.dataset.athleteId || bluePosition.dataset.athleteId) {
            arrangements.push({
                match_id: matchId,
                red_athlete_id: redPosition.dataset.athleteId || null,
                red_athlete_name: redPosition.dataset.athleteName || null,
                blue_athlete_id: bluePosition.dataset.athleteId || null,
                blue_athlete_name: bluePosition.dataset.athleteName || null
            });
        }
    });
    
    try {
        const res = await fetch(`${API_BASE}/manual-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: currentEventId,
                weight_class: manualArrangeData.currentWeightClass,
                arrangements: arrangements
            })
        });
        
        const result = await res.json();
        if (result.success) {
            alert(`手工编排保存成功！共保存 ${arrangements.length} 场比赛`);
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存请求失败: ' + e.message);
    }
}

async function loadSavedManualArrange(weightClass) {
    try {
        const res = await fetch(`${API_BASE}/manual-arrange?event_id=${currentEventId}&weight_class=${encodeURIComponent(weightClass)}`);
        const data = await res.json();
        
        if (data.success && data.data && data.data.arrangements) {
            data.data.arrangements.forEach(arr => {
                if (arr.red_athlete_id) {
                    const redPosition = document.querySelector(`[data-position="${arr.match_id}_red"]`);
                    if (redPosition) {
                        redPosition.innerHTML = `<span class="athlete-name">${arr.red_athlete_name}</span>`;
                        redPosition.classList.add('occupied');
                        redPosition.dataset.athleteId = arr.red_athlete_id;
                        redPosition.dataset.athleteName = arr.red_athlete_name;
                    }
                }
                if (arr.blue_athlete_id) {
                    const bluePosition = document.querySelector(`[data-position="${arr.match_id}_blue"]`);
                    if (bluePosition) {
                        bluePosition.innerHTML = `<span class="athlete-name">${arr.blue_athlete_name}</span>`;
                        bluePosition.classList.add('occupied');
                        bluePosition.dataset.athleteId = arr.blue_athlete_id;
                        bluePosition.dataset.athleteName = arr.blue_athlete_name;
                    }
                }
            });
            
            // 更新运动员列表状态
            document.querySelectorAll('.athlete-item').forEach(item => {
                const athleteId = item.dataset.athleteId;
                const isUsed = document.querySelector(`[data-athlete-id="${athleteId}"].occupied`);
                if (isUsed) {
                    item.style.opacity = '0.5';
                    item.draggable = false;
                }
            });
        }
    } catch (e) {
        console.error('加载已保存的手工编排失败:', e);
    }
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('manualArrangeModal');
    if (event.target === modal) {
        closeManualArrangeModal();
    }
}

const style = document.createElement('style');
style.textContent = `
@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
`;
document.head.appendChild(style);

let _allMatchResultData = [];
let _matchResultCollapsed = false;

function formatRoundNameForMatch(name) {
    if (!name) return '';
    if (name === '决赛' || name === 'Final') return '决赛';
    if (name === '半决赛' || name === '1/2') return '半决赛';
    const m = name.match(/1\/(\d+)/);
    if (m) return `1/${m[1]}`;
    return name;
}

async function loadMatchResult() {
    if (!currentEventId) {
        document.getElementById('matchResultCard').style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/matches?${getEventParam()}`);
        const data = await res.json();
        if (!data.success) {
            document.getElementById('matchResultCard').style.display = 'none';
            return;
        }

        _allMatchResultData = data.data || [];

        if (_allMatchResultData.length === 0) {
            document.getElementById('matchResultCard').style.display = 'none';
            return;
        }

        document.getElementById('matchResultCard').style.display = '';

        const classSet = new Set();
        const venueSet = new Set();
        _allMatchResultData.forEach(m => {
            if (m.weight_class && m.match_status !== '已分配') classSet.add(m.weight_class);
            const venueLetter = m.venue || (m.venue_no || '').charAt(0);
            if (venueLetter) venueSet.add(venueLetter);
        });

        const classFilter = document.getElementById('matchResultClassFilter');
        const venueFilter = document.getElementById('matchResultVenueFilter');
        const prevClassVal = classFilter.value;
        const prevVenueVal = venueFilter.value;

        classFilter.innerHTML = '<option value="">全部级别</option>' +
            [...classSet].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        venueFilter.innerHTML = '<option value="">全部场地</option>' +
            [...venueSet].sort().map(v => `<option value="${v}">${v}</option>`).join('');

        if (prevClassVal && classSet.has(prevClassVal)) classFilter.value = prevClassVal;
        if (prevVenueVal && venueSet.has(prevVenueVal)) venueFilter.value = prevVenueVal;

        renderMatchResult();
    } catch (e) {
        console.warn('加载对阵表失败:', e);
        document.getElementById('matchResultCard').style.display = 'none';
    }
}

function renderMatchResult() {
    const classFilter = document.getElementById('matchResultClassFilter').value;
    const venueFilter = document.getElementById('matchResultVenueFilter').value;

    let filtered = _allMatchResultData;

    if (classFilter) {
        filtered = filtered.filter(m => m.weight_class === classFilter);
    }
    if (venueFilter) {
        filtered = filtered.filter(m => {
            const venueLetter = m.venue || (m.venue_no || '').charAt(0);
            return venueLetter === venueFilter;
        });
    }

    filtered.sort((a, b) => {
        const matchIdA = parseInt(a.match_id) || 0;
        const matchIdB = parseInt(b.match_id) || 0;
        return matchIdA - matchIdB;
    });

    const tbody = document.getElementById('matchResultTableBody');
    const classSet = new Set();

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#909399;padding:20px;">暂无对阵数据</td></tr>';
    } else {
        tbody.innerHTML = filtered.map(m => {
            const venueLetter = m.venue || (m.venue_no || '').charAt(0) || '';
            const matchNo = m.match_id || (m.venue_no || '').substring(1) || '';
            const roundName = formatRoundNameForMatch(m.round_name || '');
            const blueName = m.blue_name || '-';
            const redName = m.red_name || '-';
            const blueUnit = m.blue_unit || '';
            const redUnit = m.red_unit || '';
            const weightClass = m.weight_class || '';
            const status = m.match_status || '未开始';
            const isBye = (!m.blue_name || !m.red_name) && status !== '已分配';

            if (weightClass && status !== '已分配') classSet.add(weightClass);

            let statusClass = 'status-pending';
            if (status === '进行中') statusClass = 'status-active';
            else if (status === '已结束') statusClass = 'status-finished';
            else if (status === '已分配') statusClass = 'status-pending';

            if (status === '已分配') {
                return `<tr class="bye-match">
                    <td class="venue-cell">${venueLetter}</td>
                    <td class="match-no-cell">-</td>
                    <td class="round-cell">${roundName}</td>
                    <td colspan="4" style="text-align:center;color:#909399;">${weightClass}</td>
                    <td class="class-cell" title="${weightClass}">${weightClass}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                </tr>`;
            }

            return `<tr class="${isBye ? 'bye-match' : ''}">
                <td class="venue-cell">${venueLetter}</td>
                <td class="match-no-cell">${matchNo}</td>
                <td class="round-cell">${roundName}</td>
                <td class="blue-name">${blueName}</td>
                <td style="color:#409EFF;font-size:12px;">${blueUnit}</td>
                <td class="vs-cell">VS</td>
                <td class="red-name">${redName}</td>
                <td style="color:#F56C6C;font-size:12px;">${redUnit}</td>
                <td class="class-cell" title="${weightClass}">${weightClass}</td>
                <td><span class="${statusClass}">${status}</span></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('matchResultTotal').textContent = filtered.length;
    document.getElementById('matchResultClasses').textContent = classSet.size;
    document.getElementById('matchResultCount').textContent = `(${filtered.length} 场)`;
}

function filterMatchResult() {
    renderMatchResult();
}

function toggleMatchResult() {
    _matchResultCollapsed = !_matchResultCollapsed;
    const body = document.getElementById('matchResultBody');
    const icon = document.getElementById('matchResultToggleIcon');
    if (_matchResultCollapsed) {
        body.style.maxHeight = '0';
        icon.style.transform = 'rotate(-90deg)';
    } else {
        body.style.maxHeight = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

function printMatchResult() {
    const classFilter = document.getElementById('matchResultClassFilter').value;
    const venueFilter = document.getElementById('matchResultVenueFilter').value;

    let filtered = _allMatchResultData;
    if (classFilter) filtered = filtered.filter(m => m.weight_class === classFilter);
    if (venueFilter) filtered = filtered.filter(m => {
        const venueLetter = m.venue || (m.venue_no || '').charAt(0);
        return venueLetter === venueFilter;
    });

    if (filtered.length === 0) { alert('没有可打印的对阵表'); return; }

    filtered.sort((a, b) => {
        const matchIdA = parseInt(a.match_id) || 0;
        const matchIdB = parseInt(b.match_id) || 0;
        return matchIdA - matchIdB;
    });

    const eventName = currentEventName || '';
    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 对阵表</title>');
    d.write('<style>');
    d.write('@page { size: A4 landscape; margin: 10mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 10px; font-size: 11px; }');
    d.write('.print-header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #000; margin-bottom: 10px; }');
    d.write('.print-header h1 { font-size: 18pt; font-weight: bold; letter-spacing: 4px; margin-bottom: 4px; }');
    d.write('.print-header h2 { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }');
    d.write('table { width: 100%; border-collapse: collapse; font-size: 11px; }');
    d.write('th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }');
    d.write('th { background: #ddd; font-weight: bold; }');
    d.write('.blue { color: #0066cc; }');
    d.write('.red { color: #cc0000; }');
    d.write('.vs { font-weight: bold; color: #666; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }');
    d.write('</style></head><body>');
    d.write('<div class="print-header"><h1>' + eventName + '</h1><h2>对阵表</h2></div>');
    d.write('<table><thead><tr><th>场地</th><th>场次</th><th>轮次</th><th>青方</th><th>代表队</th><th></th><th>红方</th><th>代表队</th><th>级别</th></tr></thead><tbody>');

    filtered.forEach(m => {
        const venueLetter = m.venue || (m.venue_no || '').charAt(0) || '';
        const matchNo = m.match_id || (m.venue_no || '').substring(1) || '';
        const roundName = formatRoundNameForMatch(m.round_name || '');
        if (m.match_status === '已分配') {
            d.write(`<tr><td>${venueLetter}</td><td>-</td><td>${roundName}</td><td colspan="5" style="text-align:center;">${m.weight_class || ''}</td><td>${m.weight_class || ''}</td></tr>`);
        } else {
            d.write(`<tr><td>${venueLetter}</td><td>${matchNo}</td><td>${roundName}</td><td class="blue">${m.blue_name || '-'}</td><td>${m.blue_unit || ''}</td><td class="vs">VS</td><td class="red">${m.red_name || '-'}</td><td>${m.red_unit || ''}</td><td>${m.weight_class || ''}</td></tr>`);
        }
    });

    d.write('</tbody></table></body></html>');
    d.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

async function assignVenueNumbersByUnit() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const tbody = document.getElementById('autoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) { alert('没有可设置场次的级别数据'); return; }

    const classData = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const weightClass = getWeightClassFromRow(tr);
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('select, input');
        const unitInput = cells[5].querySelector('select, input');

        const venue = venueInput ? venueInput.value.trim() : 'A';
        const unit = unitInput ? unitInput.value.trim() : '';
        const order = parseInt(orderInput ? orderInput.value : 0) || 0;

        if (weightClass && unit && order > 0) {
            classData.push({
                weight_class: weightClass,
                venue: venue || 'A',
                unit: unit,
                order: order
            });
        }
    });

    if (classData.length === 0) {
        alert('请先为每个级别设置单元号和顺序号');
        return;
    }

    const confirmMsg = `确定要按以下规则设置场次号吗？\n\n格式：{场地}{单元号}{顺序}\n示例：A2001\n  - A = 场地号\n  - 2 = 单元号\n  - 001 = 该单元内按order排序后的第1个\n\n规则说明：\n  • 同一单元内按order字段升序排列\n  • 自动分配顺序号(001,002,003...)\n  • 不同单元独立编号\n\n共 ${classData.length} 个级别将被更新`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`${API_BASE}/matches/assign-venue-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: classData })
        });
        const result = await res.json();

        if (result.success) {
            alert(`场次设置成功！\n已更新 ${result.updated || classData.length} 场比赛的场次号`);
            await loadAutoArrangeData();
        } else {
            alert('设置失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('请求失败: ' + e.message);
    }
}
