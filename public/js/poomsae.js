const FORMAT_SLOT_MAP = {
    'final_1':              ['决赛', '', '', '', '', ''],
    'final_2':              ['决赛', '决赛', '', '', '', ''],
    'prelim_final_1':       ['预赛', '', '决赛', '', '', ''],
    'prelim_final_2':       ['预赛', '预赛', '决赛', '决赛', '', ''],
    'prelim_semi_final_1':  ['预赛', '', '复赛', '', '决赛', ''],
    'prelim_semi_final_2':  ['预赛', '预赛', '复赛', '复赛', '决赛', '决赛']
};

let poomsaeScheduleData = [];
let poomsaeScheduleFilterClass = '';

function switchPoomsaeTab(tab) {
    document.getElementById('poomsaeTabArrange').classList.toggle('active', tab === 'arrange');
    document.getElementById('poomsaeTabSchedule').classList.toggle('active', tab === 'schedule');
    document.getElementById('poomsaeArrangePanel').style.display = tab === 'arrange' ? '' : 'none';
    document.getElementById('poomsaeSchedulePanel').style.display = tab === 'schedule' ? '' : 'none';
    document.getElementById('poomsaeArrangeToolbar').style.display = tab === 'arrange' ? '' : 'none';
    document.getElementById('poomsaeScheduleToolbar').style.display = tab === 'schedule' ? '' : 'none';

    if (tab === 'schedule') {
        loadPoomsaeSchedule();
    }
}

async function generatePoomsaeSchedule() {
    if (!currentEventId) {
        alert('请先选择赛事');
        return;
    }

    if (!confirm('生成赛程将覆盖现有赛程数据，确认继续？')) return;

    try {
        const res = await fetch(`${API_BASE}/poomsae-schedule/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId })
        });
        const data = await res.json();
        if (data.success) {
            alert(`赛程生成成功！共 ${data.data.total} 人，${data.data.classes} 个级别`);
            loadPoomsaeSchedule();
        } else {
            alert('生成失败：' + data.error);
        }
    } catch (e) {
        alert('生成失败：' + e.message);
    }
}

async function clearPoomsaeSchedule() {
    if (!currentEventId) return;
    if (!confirm('确认清除所有赛程数据？')) return;

    try {
        const res = await fetch(`${API_BASE}/poomsae-schedule?event_id=${currentEventId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert('赛程已清除');
            loadPoomsaeSchedule();
        }
    } catch (e) {
        alert('清除失败：' + e.message);
    }
}

async function loadPoomsaeSchedule() {
    const tbody = document.getElementById('poomsaeScheduleTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!currentEventId) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#909399;padding:40px;">请先选择赛事</td></tr>';
        return;
    }

    try {
        const venueFilter = document.getElementById('poomsaeScheduleVenueFilter');
        const venueVal = venueFilter ? venueFilter.value : '';
        let url = `${API_BASE}/poomsae-schedule?event_id=${currentEventId}`;
        if (venueVal) url += `&venue=${encodeURIComponent(venueVal)}`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#f56c6c;padding:40px;">加载赛程失败</td></tr>';
            return;
        }

        poomsaeScheduleData = data.data || [];

        if (poomsaeScheduleData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#909399;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">📅</div><div>暂无赛程数据</div><div style="font-size:12px;">请先点击「生成赛程」按钮</div></td></tr>';
            document.getElementById('poomsaeScheduleTotal').textContent = '0';
            document.getElementById('poomsaeScheduleDone').textContent = '0';
            document.getElementById('poomsaeSchedulePending').textContent = '0';
            document.getElementById('poomsaeScheduleClassCount').textContent = '0';
            renderPoomsaeScheduleClassList([]);
            return;
        }

        updatePoomsaeScheduleVenueFilter(poomsaeScheduleData);

        let filtered = poomsaeScheduleData;
        if (poomsaeScheduleFilterClass) {
            filtered = poomsaeScheduleData.filter(m => {
                const classKey = [m.poomsae_type, m.gender, m.group_class, m.weight_class].join('|');
                return classKey === poomsaeScheduleFilterClass;
            });
        }

        const classSet = new Set();
        poomsaeScheduleData.forEach(m => classSet.add([m.poomsae_type, m.gender, m.group_class, m.weight_class].join('|')));
        renderPoomsaeScheduleClassList(poomsaeScheduleData);

        let html = '';
        let lastClassKey = '';
        let classIdx = 0;
        let doneCount = 0;
        let pendingCount = 0;

        filtered.forEach((match, idx) => {
            const classKey = [match.poomsae_type, match.gender, match.group_class, match.weight_class].join('|');
            const displayLabel = match.gender + match.group_class + match.weight_class;

            if (classKey !== lastClassKey) {
                if (lastClassKey !== '') {
                    html += `<tr style="height:8px;"><td colspan="11" style="padding:0;"></td></tr>`;
                }
                html += `<tr class="schedule-level-header">
                    <td colspan="11">${match.poomsae_type}品势 - ${displayLabel}</td>
                </tr>`;
                lastClassKey = classKey;
                classIdx = 0;
            }
            classIdx++;

            const statusClass = match.status === 'done' ? 'schedule-row-done' : (match.status === 'playing' ? 'schedule-row-playing' : 'schedule-row-pending');
            const statusBadge = match.status === 'done' ? '<span class="status-badge status-done">已完成</span>' :
                (match.status === 'playing' ? '<span class="status-badge status-playing">比赛中</span>' :
                '<span class="status-badge status-pending">待比赛</span>');

            if (match.status === 'done') doneCount++;
            else pendingCount++;

            html += `<tr class="${statusClass}" data-id="${match.id}">
                <td>${match.display_num}</td>
                <td>${match.venue}</td>
                <td>${match.poomsae_type}</td>
                <td>${match.gender}</td>
                <td>${match.group_class}</td>
                <td>${match.weight_class}</td>
                <td>${match.draw_no || '-'}</td>
                <td style="text-align:left;min-width:80px;">${match.athlete_name}</td>
                <td style="text-align:left;min-width:80px;">${match.athlete_unit || ''}</td>
                <td>${statusBadge}</td>
                <td>
                    ${match.status === 'pending' ? `<button onclick="updatePoomsaeMatchStatus(${match.id}, 'playing')" style="font-size:11px;padding:2px 8px;border:1px solid #e6a23c;border-radius:3px;background:#fdf6ec;color:#e6a23c;cursor:pointer;">开始</button>` : ''}
                    ${match.status === 'playing' ? `<button onclick="updatePoomsaeMatchStatus(${match.id}, 'done')" style="font-size:11px;padding:2px 8px;border:1px solid #67c23a;border-radius:3px;background:#f0f9eb;color:#67c23a;cursor:pointer;">完成</button>` : ''}
                    ${match.status === 'done' ? `<button onclick="updatePoomsaeMatchStatus(${match.id}, 'pending')" style="font-size:11px;padding:2px 8px;border:1px solid #909399;border-radius:3px;background:#f4f4f5;color:#909399;cursor:pointer;">重置</button>` : ''}
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;

        document.getElementById('poomsaeScheduleTotal').textContent = poomsaeScheduleData.length;
        document.getElementById('poomsaeScheduleDone').textContent = doneCount;
        document.getElementById('poomsaeSchedulePending').textContent = pendingCount;
        document.getElementById('poomsaeScheduleClassCount').textContent = classSet.size;

    } catch (e) {
        console.error('加载赛程失败:', e);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#f56c6c;padding:40px;">加载赛程失败</td></tr>';
    }
}

function renderPoomsaeScheduleClassList(scheduleData) {
    const container = document.getElementById('poomsaeScheduleClassList');
    if (!container) return;

    const classMap = new Map();
    scheduleData.forEach(m => {
        const key = [m.poomsae_type, m.gender, m.group_class, m.weight_class].join('|');
        if (!classMap.has(key)) {
            classMap.set(key, { poomsae_type: m.poomsae_type, gender: m.gender, group_class: m.group_class, weight_class: m.weight_class, count: 0, done: 0 });
        }
        const info = classMap.get(key);
        info.count++;
        if (m.status === 'done') info.done++;
    });

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const sorted = Array.from(classMap.entries()).sort((a, b) => {
        const ptIdxA = poomsaeTypeOrder.indexOf(a[1].poomsae_type);
        const ptIdxB = poomsaeTypeOrder.indexOf(b[1].poomsae_type);
        if (ptIdxA !== ptIdxB) return ptIdxA - ptIdxB;
        if (a[1].gender !== b[1].gender) return (a[1].gender === '男' ? -1 : 1);
        return a[1].weight_class.localeCompare(b[1].weight_class, 'zh-CN');
    });

    let html = '';
    let lastType = '';

    html += `<div class="schedule-class-item ${poomsaeScheduleFilterClass === '' ? 'active' : ''}" onclick="filterPoomsaeScheduleClass('')">
        <span>全部级别</span>
        <span class="class-count">${scheduleData.length}人</span>
    </div>`;

    sorted.forEach(([key, info]) => {
        if (info.poomsae_type !== lastType) {
            html += `<div class="schedule-class-group-title">${info.poomsae_type}品势</div>`;
            lastType = info.poomsae_type;
        }
        const displayLabel = info.gender + info.group_class + info.weight_class;
        const isActive = poomsaeScheduleFilterClass === key;
        const progress = info.done > 0 ? ` ${info.done}/${info.count}` : '';
        html += `<div class="schedule-class-item ${isActive ? 'active' : ''}" onclick="filterPoomsaeScheduleClass('${key}')">
            <span>${displayLabel}${progress}</span>
            <span class="class-count">${info.count}人</span>
        </div>`;
    });

    container.innerHTML = html;
}

function filterPoomsaeScheduleClass(classKey) {
    poomsaeScheduleFilterClass = classKey;
    loadPoomsaeSchedule();
}

function updatePoomsaeScheduleVenueFilter(scheduleData) {
    const select = document.getElementById('poomsaeScheduleVenueFilter');
    if (!select) return;

    const currentVal = select.value;
    const venues = new Set();
    scheduleData.forEach(m => venues.add(m.venue));

    select.innerHTML = '<option value="">全部场地</option>';
    Array.from(venues).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = '场地 ' + v;
        select.appendChild(opt);
    });
    select.value = currentVal;
}

async function updatePoomsaeMatchStatus(matchId, status) {
    try {
        const res = await fetch(`${API_BASE}/poomsae-schedule/${matchId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            loadPoomsaeSchedule();
        } else {
            alert('更新失败：' + data.error);
        }
    } catch (e) {
        alert('更新失败：' + e.message);
    }
}

async function exportPoomsaeSchedule() {
    if (!currentEventId) {
        alert('请先选择赛事');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/poomsae-schedule?event_id=${currentEventId}`);
        const data = await res.json();
        if (!data.success || !data.data || data.data.length === 0) {
            alert('暂无赛程数据可导出');
            return;
        }

        const scheduleData = data.data;
        const wb = XLSX.utils.book_new();

        const headers = ['场次', '场地', '品势类型', '性别', '组别', '级别', '签号', '姓名', '代表队', '状态'];
        const rows = scheduleData.map(m => [
            m.display_num, m.venue, m.poomsae_type, m.gender, m.group_class, m.weight_class,
            m.draw_no || '', m.athlete_name, m.athlete_unit || '',
            m.status === 'done' ? '已完成' : (m.status === 'playing' ? '比赛中' : '待比赛')
        ]);

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = headers.map(() => ({ wch: 12 }));
        ws['!cols'][6] = { wch: 8 };
        ws['!cols'][7] = { wch: 16 };
        ws['!cols'][8] = { wch: 16 };

        XLSX.utils.book_append_sheet(wb, ws, '品势赛程');

        const eventName = currentEventName || '赛事';
        XLSX.writeFile(wb, `${eventName}_品势赛程.xlsx`);
    } catch (e) {
        alert('导出失败：' + e.message);
    }
};

const FORMAT_LABEL_MAP = {
    'final_1': '决赛(1套)',
    'final_2': '决赛(2套)',
    'prelim_final_1': '预决(1套)',
    'prelim_final_2': '预决(2套)',
    'prelim_semi_final_1': '预复决(1套)',
    'prelim_semi_final_2': '预复决(2套)'
};

let poomsaeCurrentVenueData = null;
let poomsaeImportedVenueData = null;

function detectPoomsaeFormat(athlete) {
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

async function loadPoomsaeArrangeData() {
    const tbody = document.getElementById('poomsaeArrangeTableBody');
    tbody.innerHTML = '';

    if (!currentEventId) {
        tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#909399;padding:40px;">请先在「赛事列表」中选择一个赛事</td></tr>';
        document.getElementById('poomsaeArrangeTotalAthletes').textContent = '0';
        document.getElementById('poomsaeArrangeTotalClasses').textContent = '0';
        const pl = document.getElementById('poomsaePendingClassList');
        if (pl) pl.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">请先选择赛事</div>';
        const vl = document.getElementById('poomsaeVenueAllocationList');
        if (vl) vl.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">请先选择赛事</div>';
        document.getElementById('poomsaePendingCount').textContent = '0';
        return;
    }

    try {
        const athletesRes = await fetch(`${API_BASE}/athletes?event_id=${currentEventId}&athlete_type=poomsae`);
        const athletesData = await athletesRes.json();
        if (!athletesData.success) {
            tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#f56c6c;padding:40px;">加载运动员数据失败</td></tr>';
            return;
        }

        const athletes = athletesData.data || [];

        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#909399;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">🧘</div><div>暂无品势编排数据</div><div style="font-size:12px;">请先在品势运动员管理中添加运动员</div></td></tr>';
            document.getElementById('poomsaeArrangeTotalAthletes').textContent = '0';
            document.getElementById('poomsaeArrangeTotalClasses').textContent = '0';
            document.getElementById('poomsaePendingCount').textContent = '0';
            return;
        }

        let savedScheme = {};
        try {
            if (currentEventId) {
                const schemeRes = await fetch(`${API_BASE}/poomsae-arrange/scheme?event_id=${currentEventId}`);
                const schemeData = await schemeRes.json();
                if (schemeData.success) savedScheme = schemeData.data || {};
            }
        } catch (e) { console.warn('加载品势编排方案失败:', e); }

        const poomsaeTypeOrder = ['个人', '混双', '团体'];
        const classMap = new Map();

        athletes.forEach(a => {
            const pt = a.poomsae_type || '个人';
            const gender = a.gender || '';
            const gc = a.group_class || '';
            const cls = a.weight_class || '';
            const key = [pt, gender, gc, cls].join('|');
            if (!classMap.has(key)) {
                const formatKey = detectPoomsaeFormat(a);
                classMap.set(key, {
                    poomsae_type: pt, gender, group_class: gc, weight_class: cls,
                    count: 0, format: formatKey,
                    slot1: a.format_slot_1 || '', slot2: a.format_slot_2 || '',
                    slot3: a.format_slot_3 || '', slot4: a.format_slot_4 || '',
                    slot5: a.format_slot_5 || '', slot6: a.format_slot_6 || ''
                });
            }
            classMap.get(key).count++;
        });

        const classes = Array.from(classMap.values()).sort((a, b) => {
            const ptIdxA = poomsaeTypeOrder.indexOf(a.poomsae_type);
            const ptIdxB = poomsaeTypeOrder.indexOf(b.poomsae_type);
            if (ptIdxA !== ptIdxB) return ptIdxA - ptIdxB;
            if (a.gender !== b.gender) return (a.gender === '男' ? -1 : 1);
            if (a.group_class !== b.group_class) return a.group_class.localeCompare(b.group_class, 'zh-CN');
            return a.weight_class.localeCompare(b.weight_class, 'zh-CN');
        });

        if (poomsaeImportedVenueData) {
            classes.sort((a, b) => {
                const va = poomsaeImportedVenueData.get([a.poomsae_type, a.gender, a.group_class, a.weight_class].join('|')) || {};
                const vb = poomsaeImportedVenueData.get([b.poomsae_type, b.gender, b.group_class, b.weight_class].join('|')) || {};
                const venueCmp = (va.venue || '').localeCompare(vb.venue || '');
                if (venueCmp !== 0) return venueCmp;
                const unitA = parseFloat(va.unit) || 0;
                const unitB = parseFloat(vb.unit) || 0;
                if (unitA !== unitB) return unitA - unitB;
                const orderA = parseFloat(va.order) || 0;
                const orderB = parseFloat(vb.order) || 0;
                return orderA - orderB;
            });
        }

        classes.sort((a, b) => {
            const keyA = [a.poomsae_type, a.gender, a.group_class, a.weight_class].join('|');
            const keyB = [b.poomsae_type, b.gender, b.group_class, b.weight_class].join('|');
            const vA = savedScheme[keyA] || (poomsaeImportedVenueData ? poomsaeImportedVenueData.get(keyA) : null);
            const vB = savedScheme[keyB] || (poomsaeImportedVenueData ? poomsaeImportedVenueData.get(keyB) : null);
            const venueA = vA ? (vA.venue || '').trim() : '';
            const venueB = vB ? (vB.venue || '').trim() : '';
            if (venueA !== venueB) {
                if (!venueA) return 1;
                if (!venueB) return -1;
                return venueA.localeCompare(venueB);
            }
            const unitA = vA ? parseFloat(vA.unit) || 0 : 0;
            const unitB = vB ? parseFloat(vB.unit) || 0 : 0;
            if (unitA !== unitB) return unitA - unitB;
            const orderA = vA ? parseFloat(vA.order) || 0 : 0;
            const orderB = vB ? parseFloat(vB.order) || 0 : 0;
            if (orderA !== orderB) return orderA - orderB;
            const ptIdxA = poomsaeTypeOrder.indexOf(a.poomsae_type);
            const ptIdxB = poomsaeTypeOrder.indexOf(b.poomsae_type);
            if (ptIdxA !== ptIdxB) return ptIdxA - ptIdxB;
            if (a.gender !== b.gender) return (a.gender === '男' ? -1 : 1);
            return a.weight_class.localeCompare(b.weight_class, 'zh-CN');
        });

        let totalAthletes = 0;

        classes.forEach((cls, index) => {
            const key = [cls.poomsae_type, cls.gender, cls.group_class, cls.weight_class].join('|');
            const venueInfo = savedScheme[key] || (poomsaeImportedVenueData ? poomsaeImportedVenueData.get(key) : null);
            totalAthletes += cls.count;
            const formatLabel = FORMAT_LABEL_MAP[cls.format] || '';
            const tr = document.createElement('tr');
            tr.dataset.key = key;
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td><input type="text" value="${venueInfo ? venueInfo.venue : ''}" onchange="savePoomsaeArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td><input type="text" value="${venueInfo ? venueInfo.unit : ''}" onchange="savePoomsaeArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td><input type="text" value="${venueInfo ? venueInfo.order : ''}" onchange="savePoomsaeArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td>${cls.poomsae_type}</td>
                <td>${cls.gender}</td>
                <td>${cls.group_class}</td>
                <td style="min-width:80px;">${cls.weight_class}</td>
                <td>${cls.count}</td>
                <td>${formatLabel}</td>
                <td>${cls.slot1}</td>
                <td>${cls.slot2}</td>
                <td>${cls.slot3}</td>
                <td>${cls.slot4}</td>
                <td>${cls.slot5}</td>
                <td>${cls.slot6}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('poomsaeArrangeTotalAthletes').textContent = totalAthletes;
        document.getElementById('poomsaeArrangeTotalClasses').textContent = classes.length;

        renderPoomsaePendingSidebar(classes, savedScheme);
        renderPoomsaeVenueAllocation(classes, savedScheme);
        initPoomsaeVenueDropZone();
    } catch (e) {
        console.error('加载品势编排数据失败:', e);
        tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#f56c6c;padding:40px;">加载数据失败，请检查网络连接</td></tr>';
    }
}

function renderPoomsaePendingSidebar(classRounds, savedScheme) {
    const pendingList = document.getElementById('poomsaePendingClassList');
    const pendingCountEl = document.getElementById('poomsaePendingCount');
    if (!pendingList) return;

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const venueArranged = new Set();
    classRounds.forEach(cls => {
        const key = [cls.poomsae_type, cls.gender, cls.group_class, cls.weight_class].join('|');
        const info = savedScheme[key];
        if (info && info.venue && info.venue.trim()) {
            venueArranged.add(key);
        }
    });

    const pending = classRounds.filter(cls => !venueArranged.has([cls.poomsae_type, cls.gender, cls.group_class, cls.weight_class].join('|')));
    pendingCountEl.textContent = pending.length;

    if (pending.length === 0) {
        pendingList.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">无待编排级别</div>';
    } else {
        let html = '';
        let lastType = '';
        pending.forEach(cls => {
            if (cls.poomsae_type !== lastType) {
                html += `<div class="pending-class-group-title">${cls.poomsae_type}品势</div>`;
                lastType = cls.poomsae_type;
            }
            const displayLabel = cls.gender + cls.group_class + cls.weight_class;
            const key = [cls.poomsae_type, cls.gender, cls.group_class, cls.weight_class].join('|');
            html += `<div class="pending-class-item" draggable="true" data-class-key="${key}" onclick="scrollToPoomsaeClassRow('${key}')">
                <span>${displayLabel}</span>
                <span class="class-count">${cls.count}人</span>
            </div>`;
        });
        pendingList.innerHTML = html;
        pendingList.querySelectorAll('.pending-class-item').forEach(item => {
            item.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', item.dataset.classKey);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', function(e) {
                item.classList.remove('dragging');
            });
        });
    }
}

function scrollToPoomsaeClassRow(key) {
    const rows = document.querySelectorAll('#poomsaeArrangeTableBody tr');
    rows.forEach(row => {
        row.style.background = '';
        if (row.dataset.key === key) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.background = '#ecf5ff';
            setTimeout(() => { row.style.background = ''; }, 2000);
        }
    });
}

function renderPoomsaeVenueAllocation(classRounds, savedScheme) {
    const container = document.getElementById('poomsaeVenueAllocationList');
    if (!container) return;

    const venueMap = new Map();
    classRounds.forEach(cls => {
        const key = [cls.poomsae_type, cls.gender, cls.group_class, cls.weight_class].join('|');
        const info = savedScheme[key] || (poomsaeImportedVenueData ? poomsaeImportedVenueData.get(key) : null);
        const venue = info ? (info.venue || '').trim() : '';
        const unit = info ? (info.unit || '').trim() : '';
        const order = info ? (info.order || '').trim() : '';
        const vKey = venue || '未分配';
        if (!venueMap.has(vKey)) venueMap.set(vKey, []);
        venueMap.get(vKey).push({ ...cls, unit, order, venue });
    });

    poomsaeCurrentVenueData = venueMap;

    const select = document.getElementById('poomsaeVenueFilter');
    if (select) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">全部</option>';
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const opt = document.createElement('option');
            opt.value = letter;
            opt.textContent = letter + '场地';
            select.appendChild(opt);
        }
        select.value = currentVal;
    }

    renderPoomsaeVenueList(venueMap, select ? select.value : '', document.getElementById('poomsaeUnitFilter') ? document.getElementById('poomsaeUnitFilter').value : '');
}

function renderPoomsaeVenueList(venueMap, filter, unitFilter) {
    const container = document.getElementById('poomsaeVenueAllocationList');
    if (!container) return;

    const sortedKeys = Array.from(venueMap.keys()).sort();
    const assigned = sortedKeys.filter(k => k !== '未分配');

    if (assigned.length === 0) {
        container.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">暂无场地分配</div>';
        return;
    }

    let html = '';
    assigned.forEach(venue => {
        if (filter && venue !== filter) return;

        const items = venueMap.get(venue);
        items.sort((a, b) => {
            const uA = parseFloat(a.unit) || 0;
            const uB = parseFloat(b.unit) || 0;
            if (uA !== uB) return uA - uB;
            const oA = parseFloat(a.order) || 0;
            const oB = parseFloat(b.order) || 0;
            return oA - oB;
        });
        html += `<div class="venue-group" data-venue="${venue}">`;
        html += `<div class="venue-group-header">${venue === '未分配' ? '📌 未分配' : '场地 ' + venue}</div>`;
        items.forEach(item => {
            if (unitFilter && String(item.unit) !== String(unitFilter)) return;
            const displayLabel = item.gender + item.group_class + item.weight_class;
            const info = item.unit ? `单元${item.unit}` + (item.order ? ` 序${item.order}` : '') : '';
            const key = [item.poomsae_type, item.gender, item.group_class, item.weight_class].join('|');
            html += `<div class="venue-class-item" draggable="true" data-class-key="${key}" onclick="scrollToPoomsaeClassRow('${key}')">
                <span>${displayLabel}</span>
                <span class="venue-info">${info || item.count + '人'}</span>
            </div>`;
        });
        if (!filter) {
            let venueClasses = 0;
            let venueMatches = 0;
            items.forEach(item => {
                if (unitFilter && String(item.unit) !== String(unitFilter)) return;
                venueClasses++;
                venueMatches += item.count;
            });
            if (venueClasses > 0) {
                html += `<div class="venue-group-summary">
                    <span>${venueClasses} 级别</span>
                    <span>${venueMatches} 场</span>
                </div>`;
            }
        }
        html += `</div>`;
    });

    if (!html) {
        html = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">该场地暂无级别</div>';
    } else {
        let totalClasses = 0;
        let totalMatches = 0;
        assigned.forEach(venue => {
            if (filter && venue !== filter) return;
            const vItems = venueMap.get(venue);
            vItems.forEach(item => {
                if (unitFilter && String(item.unit) !== String(unitFilter)) return;
                totalClasses++;
                totalMatches += item.count;
            });
        });
        html += `<div class="venue-summary">
            <span>📊 <strong>${totalClasses}</strong> 级别</span>
            <span>🏆 <strong>${totalMatches}</strong> 场</span>
        </div>`;
    }

    container.innerHTML = html;
}

let poomsaeVenueDropInitialized = false;

function initPoomsaeVenueDropZone() {
    if (poomsaeVenueDropInitialized) return;
    poomsaeVenueDropInitialized = true;

    const container = document.getElementById('poomsaeVenueAllocationList');
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

        const classKey = e.dataTransfer.getData('text/plain');
        const dragSource = e.dataTransfer.getData('drag-source');
        if (!classKey) return;
        if (dragSource === 'venue') return;

        const select = document.getElementById('poomsaeVenueFilter');
        const selectedVenue = select ? select.value : '';
        const groupVenue = group ? group.dataset.venue : '';
        let targetVenue = groupVenue || selectedVenue;

        if (!targetVenue || targetVenue === '未分配') return;

        assignPoomsaeClassToVenue(classKey, targetVenue);
    });

    container.addEventListener('dragstart', function(e) {
        const item = e.target.closest('.venue-class-item');
        if (!item) return;
        e.dataTransfer.setData('text/plain', item.dataset.classKey);
        e.dataTransfer.setData('drag-source', 'venue');
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
    });

    container.addEventListener('dragend', function(e) {
        const item = e.target.closest('.venue-class-item');
        if (item) item.classList.remove('dragging');
    });

    const pendingList = document.getElementById('poomsaePendingClassList');
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

            const classKey = e.dataTransfer.getData('text/plain');
            const dragSource = e.dataTransfer.getData('drag-source');
            if (!classKey || dragSource !== 'venue') return;

            removePoomsaeClassFromVenue(classKey);
        });
    }
}

function assignPoomsaeClassToVenue(classKey, venue) {
    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    const selectedUnit = document.getElementById('poomsaeUnitFilter') ? document.getElementById('poomsaeUnitFilter').value : '';

    let maxOrder = 0;
    rows.forEach(tr => {
        if (tr.dataset.key === classKey) return;
        const cells = tr.querySelectorAll('td');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        if (venueInput && venueInput.value.trim() === venue && unitInput && unitInput.value.trim() === selectedUnit && orderInput) {
            const ord = parseFloat(orderInput.value) || 0;
            if (ord > maxOrder) maxOrder = ord;
        }
    });

    let found = false;
    rows.forEach(tr => {
        if (tr.dataset.key !== classKey) return;
        const cells = tr.querySelectorAll('td');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        if (venueInput) venueInput.value = venue;
        if (unitInput) unitInput.value = selectedUnit || '1';
        if (orderInput) orderInput.value = String(maxOrder + 1);
        found = true;
    });

    if (found) {
        savePoomsaeArrangeSilent().then(() => {
            loadPoomsaeArrangeData();
        });
    }
}

function removePoomsaeClassFromVenue(classKey) {
    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    let found = false;

    rows.forEach(tr => {
        if (tr.dataset.key !== classKey) return;
        const cells = tr.querySelectorAll('td');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        if (venueInput) venueInput.value = '';
        if (unitInput) unitInput.value = '';
        if (orderInput) orderInput.value = '';
        found = true;
    });

    if (found) {
        savePoomsaeArrangeSilent().then(() => {
            loadPoomsaeArrangeData();
        });
    }
}

function filterPoomsaeVenueAllocation() {
    const select = document.getElementById('poomsaeVenueFilter');
    const unitSelect = document.getElementById('poomsaeUnitFilter');
    if (!select || !poomsaeCurrentVenueData) return;
    renderPoomsaeVenueList(poomsaeCurrentVenueData, select.value, unitSelect ? unitSelect.value : '');
}

function filterByPoomsaeUnit() {
    const unitVal = document.getElementById('poomsaeUnitFilter').value;

    if (poomsaeCurrentVenueData) {
        const container = document.getElementById('poomsaeVenueAllocationList');
        if (!container) return;
        const venueFilter = document.getElementById('poomsaeVenueFilter');
        const venueVal = venueFilter ? venueFilter.value : '';
        renderPoomsaeVenueList(poomsaeCurrentVenueData, venueVal, unitVal);
    }
}

function resetPoomsaeVenueFilter() {
    const select = document.getElementById('poomsaeVenueFilter');
    if (!select) return;
    const venue = select.value;
    if (!venue) { alert('请先选择一个场地'); return; }
    if (!confirm(`确定要将场地 ${venue} 的所有级别重置为待编排吗？`)) return;

    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        const venueInput = cells[1].querySelector('input');
        if (venueInput && venueInput.value.trim() === venue) {
            venueInput.value = '';
            cells[2].querySelector('input').value = '';
            cells[3].querySelector('input').value = '';
        }
    });

    savePoomsaeArrangeSilent().then(() => {
        loadPoomsaeArrangeData();
    });
}

async function savePoomsaeArrangeSilent() {
    if (!currentEventId) return;

    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    const data = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 8) return;
        const key = tr.dataset.key;
        if (!key) return;
        const parts = key.split('|');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        data.push({
            poomsae_type: parts[0] || '',
            gender: parts[1] || '',
            group_class: parts[2] || '',
            weight_class: parts[3] || '',
            venue: venueInput ? venueInput.value : '',
            unit: unitInput ? unitInput.value : '',
            order: orderInput ? orderInput.value : ''
        });
    });

    try {
        await fetch(`${API_BASE}/poomsae-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data })
        });
    } catch (e) {
        console.error('品势编排静默保存失败:', e);
    }
}

async function savePoomsaeArrange() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) { alert('没有可保存的数据'); return; }

    const data = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 8) return;
        const key = tr.dataset.key;
        if (!key) return;
        const parts = key.split('|');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        data.push({
            poomsae_type: parts[0] || '',
            gender: parts[1] || '',
            group_class: parts[2] || '',
            weight_class: parts[3] || '',
            venue: venueInput ? venueInput.value : '',
            unit: unitInput ? unitInput.value : '',
            order: orderInput ? orderInput.value : ''
        });
    });

    try {
        const res = await fetch(`${API_BASE}/poomsae-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data })
        });
        const result = await res.json();
        if (result.success) {
            alert(`保存成功！共保存 ${result.saved} 个级别的编排数据`);
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存请求失败: ' + e.message);
    }
}

async function executePoomsaeArrange() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const tbody = document.getElementById('poomsaeArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) { alert('没有编排数据，请先编排'); return; }

    if (!confirm('执行编排将保存当前编排并生成赛程，现有赛程数据将被覆盖，确认继续？')) return;

    const data = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 8) return;
        const key = tr.dataset.key;
        if (!key) return;
        const parts = key.split('|');
        const venueInput = cells[1].querySelector('input');
        const unitInput = cells[2].querySelector('input');
        const orderInput = cells[3].querySelector('input');
        data.push({
            poomsae_type: parts[0] || '',
            gender: parts[1] || '',
            group_class: parts[2] || '',
            weight_class: parts[3] || '',
            venue: venueInput ? venueInput.value : '',
            unit: unitInput ? unitInput.value : '',
            order: orderInput ? orderInput.value : ''
        });
    });

    try {
        const saveRes = await fetch(`${API_BASE}/poomsae-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data })
        });
        const saveResult = await saveRes.json();
        if (!saveResult.success) {
            alert('保存编排失败: ' + (saveResult.error || '未知错误'));
            return;
        }

        const genRes = await fetch(`${API_BASE}/poomsae-schedule/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId })
        });
        const genResult = await genRes.json();
        if (genResult.success) {
            alert(`执行编排成功！共 ${genResult.data.total} 人，${genResult.data.classes} 个级别`);
            switchPoomsaeTab('schedule');
        } else {
            alert('生成赛程失败：' + genResult.error);
        }
    } catch (e) {
        alert('执行编排失败: ' + e.message);
    }
}

async function exportPoomsaeArrangeData() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    try { window.open(`${API_BASE}/poomsae-arrange/export?event_id=${currentEventId}`, '_blank'); } catch (e) { alert('导出失败: ' + e.message); }
}

async function handlePoomsaeArrangeImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (currentEventId) formData.append('event_id', currentEventId);

    try {
        const res = await fetch(`${API_BASE}/poomsae-arrange/import`, { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            const venueMap = new Map();
            data.data.forEach(item => {
                const key = [item.poomsae_type, item.gender, item.group_class, item.weight_class].join('|');
                venueMap.set(key, {
                    venue: item.venue != null ? String(item.venue) : '',
                    unit: item.unit != null ? String(item.unit) : '',
                    order: item.order != null ? String(item.order) : ''
                });
            });
            poomsaeImportedVenueData = venueMap;
            await loadPoomsaeArrangeData();
            poomsaeImportedVenueData = null;
            alert(`导入成功！已更新 ${venueMap.size} 个级别的场地/单元/顺序`);
        } else {
            alert('导入失败: ' + (data.error || '未知错误'));
        }
    } catch (e) { alert('导入请求失败: ' + e.message); }
    event.target.value = '';
}

function showPoomsaeAutoAssignVenueModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    document.getElementById('poomsaeVenueCountInput').value = 2;
    updatePoomsaeVenuePreview();
    document.getElementById('poomsaeAutoAssignVenueModal').classList.add('active');
}

function closePoomsaeAutoAssignVenueModal() {
    document.getElementById('poomsaeAutoAssignVenueModal').classList.remove('active');
}

function updatePoomsaeVenuePreview() {
    const count = parseInt(document.getElementById('poomsaeVenueCountInput').value) || 1;
    const clamped = Math.max(1, Math.min(26, count));
    const letters = [];
    for (let i = 0; i < clamped; i++) letters.push(String.fromCharCode(65 + i));
    document.getElementById('poomsaeVenuePreview').textContent = '将分配到场地：' + letters.join('、');
}

document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('poomsaeVenueCountInput');
    if (input) input.addEventListener('input', updatePoomsaeVenuePreview);
});

async function applyPoomsaeAutoAssignVenue() {
    const count = parseInt(document.getElementById('poomsaeVenueCountInput').value) || 1;
    const clamped = Math.max(1, Math.min(26, count));

    if (!currentEventId) { alert('请先选择赛事'); return; }

    const athletesRes = await fetch(`${API_BASE}/athletes?event_id=${currentEventId}&athlete_type=poomsae`);
    const athletesData = await athletesRes.json();
    if (!athletesData.success || !athletesData.data || athletesData.data.length === 0) {
        alert('没有运动员数据'); return;
    }

    const classMap = new Map();
    athletesData.data.forEach(a => {
        const pt = a.poomsae_type || '个人';
        const gender = a.gender || '';
        const gc = a.group_class || '';
        const cls = a.weight_class || '';
        const key = [pt, gender, gc, cls].join('|');
        if (!classMap.has(key)) classMap.set(key, 0);
        classMap.set(key, classMap.get(key) + 1);
    });

    const classes = [];
    for (const [key, athleteCount] of classMap) {
        const parts = key.split('|');
        classes.push({ poomsae_type: parts[0], gender: parts[1], group_class: parts[2], weight_class: parts[3], athleteCount });
    }

    if (classes.length === 0) { alert('没有可分配的级别'); return; }

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const classesByType = {};
    poomsaeTypeOrder.forEach(t => classesByType[t] = []);
    classes.forEach(cls => {
        const type = cls.poomsae_type || '个人';
        if (!classesByType[type]) classesByType[type] = [];
        classesByType[type].push(cls);
    });

    const venueTotals = [];
    const venueClasses = [];
    for (let v = 0; v < clamped; v++) {
        venueTotals.push(0);
        venueClasses.push([]);
    }

    poomsaeTypeOrder.forEach(type => {
        const typeClasses = classesByType[type] || [];
        typeClasses.forEach(cls => {
            let minIdx = 0;
            for (let v = 1; v < clamped; v++) {
                if (venueTotals[v] < venueTotals[minIdx]) minIdx = v;
            }
            venueTotals[minIdx] += cls.athleteCount;
            venueClasses[minIdx].push(cls);
        });
    });

    const saveData = [];
    for (let v = 0; v < clamped; v++) {
        const venueLetter = String.fromCharCode(65 + v);
        venueClasses[v].forEach((cls, i) => {
            saveData.push({
                poomsae_type: cls.poomsae_type,
                gender: cls.gender,
                group_class: cls.group_class,
                weight_class: cls.weight_class,
                venue: venueLetter,
                unit: '1',
                order: String(i + 1)
            });
        });
    }

    try {
        await fetch(`${API_BASE}/poomsae-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: saveData })
        });
    } catch (e) {
        alert('保存失败: ' + e.message); return;
    }

    closePoomsaeAutoAssignVenueModal();
    await loadPoomsaeArrangeData();

    const details = venueTotals.map((t, v) =>
        `${String.fromCharCode(65 + v)}: ${t}人(${venueClasses[v].length}级别)`
    ).join('\n');
    alert(`✅ 已将 ${classes.length} 个级别分配到 ${clamped} 个场地\n\n${details}`);
}
