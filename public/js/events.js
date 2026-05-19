async function loadEvents() {
    const resp = await apiGet('/events');
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    resp.data.forEach(e => {
        const statusMap = { '准备中': 'status-pending', '报名中': 'status-reg', '比赛进行中': 'status-active', '已结束': 'status-finished' };
        const statusClass = statusMap[e.status] || 'status-pending';
        const isSelected = currentEventId === e.id;
        const eventTypeLabel = e.event_type === 'chinese_wrestle' ? '摔跤赛事' : 
                           e.event_type === 'taekwondo_poomsae' ? '跆拳道品势赛事' : '跆拳道竞技赛事';
        const eventTypeClass = e.event_type === 'chinese_wrestle' ? 'status-active' : 
                              e.event_type === 'taekwondo_poomsae' ? 'status-reg' : 'status-pending';

        const fmtTime = (t) => {
            if (!t) return '-';
            const d = new Date(t);
            return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        };

        const compTime = e.comp_start || e.comp_end ? `${fmtTime(e.comp_start)} ~ ${fmtTime(e.comp_end)}` : '-';

        const tr = document.createElement('tr');
        if (isSelected) tr.style.background = '#ecf5ff';
        tr.innerHTML = `
            <td data-col="checkbox"><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="selectEvent(${e.id}, '${(e.name || '').replace(/'/g, "\\'")}', '${e.event_type || 'taekwondo_kyougi'}')"></td>
            <td data-col="name"><strong>${e.name}</strong></td>
            <td data-col="eventType"><select onchange="updateEventType(${e.id}, this.value)" style="padding:3px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;cursor:pointer;">
                <option value="taekwondo_kyougi" ${e.event_type === 'taekwondo_kyougi' ? 'selected' : ''}>跆拳道竞技赛事</option>
                <option value="taekwondo_poomsae" ${e.event_type === 'taekwondo_poomsae' ? 'selected' : ''}>跆拳道品势赛事</option>
                <option value="chinese_wrestle" ${e.event_type === 'chinese_wrestle' ? 'selected' : ''}>摔跤赛事</option>
            </select></td>
            <td data-col="venue">${e.venue || '-'}</td>
            <td data-col="compTime" style="font-size: 12px;">${compTime}</td>
            <td data-col="status"><span class="status-badge ${statusClass}">${e.status}</span></td>
            <td data-col="editAction"><button class="btn btn-primary" onclick="showEditEventModal(${e.id})" style="padding: 5px 12px; font-size: 12px;">修改</button></td>
            <td data-col="deleteAction"><button class="btn btn-danger" onclick="deleteEvent(${e.id})" style="padding: 5px 12px; font-size: 12px;">删除</button></td>
        `;
        tbody.appendChild(tr);
    });

    updateCurrentEventInfo();

    if (typeof ExcelFilter !== 'undefined') {
        const table = document.getElementById('eventsTable');
        if (table) {
            const thead = table.querySelector('thead');
            if (thead) {
                thead.style.cssText = 'position:sticky;top:0;z-index:10;background:linear-gradient(to right,#8B0000,#00008B);';
                const headers = thead.querySelectorAll('th');
                headers.forEach(th => {
                    th.style.cssText = th.getAttribute('style') + ';position:sticky;top:0;z-index:10;background:transparent;';
                });
            }

            ExcelFilter.init('eventsTable', {
                excludeColumns: [0, 6, 7]
            });

            initEventsColumnVisibility();
            initEventsColumnSelection();
            initEventsContextMenu();
        }
    }
}

async function updateCurrentEventInfo() {
    const infoDiv = document.getElementById('currentEventInfo');
    if (!infoDiv) return;
    if (!currentEventId) {
        infoDiv.innerHTML = '<p style="color: #909399; text-align: center; padding: 40px 0;">暂无进行中的赛事，请先创建或选择赛事</p>';
        return;
    }
    const resp = await apiGet('/events');
    const event = resp.data.find(e => e.id === currentEventId);
    if (!event) {
        infoDiv.innerHTML = '<p style="color: #909399; text-align: center; padding: 40px 0;">暂无进行中的赛事，请先创建或选择赛事</p>';
        return;
    }
    const statusMap2 = { '准备中': 'status-pending', '报名中': 'status-reg', '比赛进行中': 'status-active', '已结束': 'status-finished' };
    const currentStatusClass = statusMap2[event.status] || 'status-pending';

    const fmtTime2 = (t) => {
        if (!t) return '未设置';
        const d = new Date(t);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    infoDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="color: #409EFF; margin-bottom: 5px;">🏆 ${event.name}</h3>
                <p style="color: #606266;">赛事类型：<span class="status-badge ${event.event_type === 'chinese_wrestle' ? 'status-active' : event.event_type === 'taekwondo_poomsae' ? 'status-reg' : 'status-pending'}">${event.event_type === 'chinese_wrestle' ? '摔跤赛事' : event.event_type === 'taekwondo_poomsae' ? '跆拳道品势赛事' : '跆拳道竞技赛事'}</span> | 场馆：${event.venue || '未设置'} | 状态：<span class="status-badge ${currentStatusClass}">${event.status}</span></p>
                <p style="color: #909399; font-size: 13px; margin-top: 4px;">比赛：${fmtTime2(event.comp_start)} ~ ${fmtTime2(event.comp_end)}</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-success" onclick="location.href='/athletes';">📥 导入名单</button>
                <button class="btn btn-primary" onclick="location.href='/weighin';">📥 导出称重表</button>
                <button class="btn btn-warning" onclick="generateOrderBook()">📖 生成秩序册</button>
            </div>
        </div>
    `;
}

function showEventModal() {
    document.getElementById('eventModalTitle').textContent = '新增赛事';
    document.getElementById('editEventId').value = '';
    document.getElementById('eventModal').classList.add('active');
    document.getElementById('newEventName').value = '';
    document.getElementById('newEventType').value = 'taekwondo_kyougi';
    document.getElementById('newEventVenue').value = '';
    document.getElementById('newCompStart').value = '';
    document.getElementById('newCompEnd').value = '';
}

function closeEventModal() { document.getElementById('eventModal').classList.remove('active'); }

async function showEditEventModal(eventId) {
    const resp = await apiGet('/events');
    const event = resp.data.find(e => e.id === eventId);
    if (!event) { alert('赛事不存在'); return; }

    document.getElementById('eventModalTitle').textContent = '修改赛事';
    document.getElementById('editEventId').value = eventId;
    document.getElementById('eventModal').classList.add('active');
    document.getElementById('newEventName').value = event.name || '';
    document.getElementById('newEventType').value = event.event_type || 'taekwondo_kyougi';
    document.getElementById('newEventVenue').value = event.venue || '';
    document.getElementById('newCompStart').value = event.comp_start ? event.comp_start.slice(0, 16) : '';
    document.getElementById('newCompEnd').value = event.comp_end ? event.comp_end.slice(0, 16) : '';
}

async function saveEvent() {
    const name = document.getElementById('newEventName').value.trim();
    const event_type = document.getElementById('newEventType').value;
    const venue = document.getElementById('newEventVenue').value.trim();
    const comp_start = document.getElementById('newCompStart').value;
    const comp_end = document.getElementById('newCompEnd').value;
    const reg_start = document.getElementById('newRegStart') ? document.getElementById('newRegStart').value : '';
    const reg_end = document.getElementById('newRegEnd') ? document.getElementById('newRegEnd').value : '';
    const editId = document.getElementById('editEventId').value;

    if (!name) { alert('请输入赛事名称'); return; }

    if (editId) {
        const putResp = await fetch(API_BASE + '/events/' + editId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, venue, event_type, comp_start, comp_end, reg_start, reg_end
            })
        });
        if (putResp.ok) {
            if (currentEventId === Number(editId)) {
                currentEventName = name;
                currentEventType = event_type;
                localStorage.setItem('currentEventName', name);
                localStorage.setItem('currentEventType', event_type);
                updateEventBadge();
                updateArrangeMenu();
            }
            closeEventModal(); loadEvents();
        } else {
            const errData = await putResp.json().catch(() => ({}));
            alert('修改失败: ' + (errData.error || putResp.status));
        }
    } else {
        const resp = await apiPost('/events', { name, venue, event_type, comp_start, comp_end, reg_start, reg_end });
        if (resp.success) { closeEventModal(); loadEvents(); }
    }
}

async function selectEvent(id, name, eventType) {
    if (currentEventId === id) {
        currentEventId = null;
        currentEventName = '';
        currentEventType = '';
        localStorage.removeItem('currentEventId');
        localStorage.removeItem('currentEventName');
        localStorage.removeItem('currentEventType');
        updateEventBadge();
        updateArrangeMenu();
        loadEvents(); safeCall('loadAthletes'); safeCall('loadBracketClassList'); safeCall('loadMatches');
        return;
    }

    currentEventId = id;
    currentEventName = name;
    currentEventType = eventType || 'taekwondo_kyougi';
    localStorage.setItem('currentEventId', id);
    localStorage.setItem('currentEventName', name);
    localStorage.setItem('currentEventType', currentEventType);
    updateEventBadge();
    updateArrangeMenu();
    loadEvents(); safeCall('loadAthletes'); safeCall('loadBracketClassList'); safeCall('loadMatches');
}

async function deleteEvent(id) {
    if (!confirm('确定删除该赛事？')) return;
    try {
        const resp = await fetch(API_BASE + '/events/' + id, { method: 'DELETE' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            alert('删除失败: ' + (data.error || resp.status));
            return;
        }
        if (currentEventId === id) {
            currentEventId = null;
            currentEventName = '';
            currentEventType = '';
            localStorage.removeItem('currentEventId');
            localStorage.removeItem('currentEventName');
            localStorage.removeItem('currentEventType');
            updateEventBadge();
            updateArrangeMenu();
        }
        loadEvents(); safeCall('loadAthletes'); safeCall('loadMatches');
    } catch (e) {
        alert('删除异常: ' + e.message);
    }
}

async function updateEventType(id, eventType) {
    try {
        const resp = await apiGet('/events');
        const event = resp.data.find(e => e.id === id);
        if (!event) { alert('赛事不存在'); return; }
        const putResp = await fetch(API_BASE + '/events/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: event.name,
                venue: event.venue,
                event_date: event.event_date,
                reg_start: event.reg_start,
                reg_end: event.reg_end,
                comp_start: event.comp_start,
                comp_end: event.comp_end,
                status: event.status,
                event_type: eventType
            })
        });
        if (!putResp.ok) {
            const errData = await putResp.json().catch(() => ({}));
            alert('更新赛事类型失败: ' + (errData.error || putResp.status));
            loadEvents();
            return;
        }
        if (currentEventId === id) {
            currentEventType = eventType;
            localStorage.setItem('currentEventType', eventType);
            updateArrangeMenu();
        }
    } catch (err) {
        alert('更新赛事类型失败: ' + err.message);
        loadEvents();
    }
}

async function generateOrderBook() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const resp = await apiGet('/events');
    const event = resp.data.find(e => e.id === currentEventId);
    if (!event) { alert('赛事不存在'); return; }

    const urlParams = getEventParam();
    const athletesResp = await apiGet('/athletes' + (urlParams ? '?' + urlParams : ''));
    const athletes = athletesResp.data;
    if (athletes.length === 0) { alert('没有运动员数据'); return; }

    const sorted = [...athletes].sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === '男' ? -1 : 1;
        const unitCompare = (a.unit || '').localeCompare(b.unit || '', 'zh-CN');
        if (unitCompare !== 0) return unitCompare;
        return (a.weight_class || '').localeCompare(b.weight_class || '', 'zh-CN');
    });

    let html = `<div style="max-width: 800px; margin: 0 auto; background: white; color: black; padding: 40px;">`;
    html += `<h1 style="text-align: center; font-size: 24px; margin-bottom: 10px;">${event.name}</h1>`;
    html += `<h2 style="text-align: center; font-size: 18px; margin-bottom: 30px; color: #666;">秩序册</h2>`;
    html += `<p style="text-align: center; color: #666; margin-bottom: 30px;">场馆：${event.venue || '未设置'} | 日期：${event.event_date || '未设置'}</p>`;

    const maleCount = athletes.filter(a => a.gender === '男').length;
    const femaleCount = athletes.filter(a => a.gender === '女').length;
    html += `<div style="margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px;">`;
    html += `<p><strong>参赛总人数：</strong>${athletes.length} 人（男子 ${maleCount} 人，女子 ${femaleCount} 人）</p></div>`;

    html += `<h3 style="margin-bottom: 15px;">运动员名单</h3>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
    html += `<thead><tr style="background: #333; color: white;">`;
    html += `<th style="padding: 10px; border: 1px solid #ddd;">序号</th><th style="padding: 10px; border: 1px solid #ddd;">运动员号</th>`;
    html += `<th style="padding: 10px; border: 1px solid #ddd;">姓名</th><th style="padding: 10px; border: 1px solid #ddd;">性别</th>`;
    html += `<th style="padding: 10px; border: 1px solid #ddd;">代表队</th><th style="padding: 10px; border: 1px solid #ddd;">级别</th>`;
    html += `<th style="padding: 10px; border: 1px solid #ddd;">种子号</th></tr></thead><tbody>`;

    sorted.forEach((a, i) => {
        const bg = i % 2 === 0 ? '#fff' : '#f9f9f9';
        html += `<tr style="background: ${bg};">`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${i + 1}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.athlete_no}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.name}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.gender}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.unit || '-'}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.weight_class}</td>`;
        html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${a.athlete_draw_num || '-'}</td></tr>`;
    });

    html += `</tbody></table></div>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${event.name} - 秩序册</title>`);
    printWindow.document.write(`<style>body{font-family:'Microsoft YaHei',sans-serif;margin:0;padding:20px;background:#f0f0f0;}@media print{body{background:white;padding:0;}}</style>`);
    printWindow.document.write(`</head><body>${html}</body></html>`);
    printWindow.document.close();
    printWindow.print();
}

// ==================== 列管理（与称重管理界面统一） ====================

const EVENTS_COLUMNS = [
    { key: 'checkbox', label: '选择' },
    { key: 'name', label: '赛事名称' },
    { key: 'eventType', label: '赛事类型' },
    { key: 'venue', label: '场馆' },
    { key: 'compTime', label: '比赛时间' },
    { key: 'status', label: '状态' },
    { key: 'editAction', label: '修改操作' },
    { key: 'deleteAction', label: '删除操作' }
];

let eventsSelectedColumns = [];
let eventsActiveContextMenu = null;

function getEventsColumnVisibility() {
    const saved = localStorage.getItem('events_column_visibility');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('解析列显示设置失败:', e);
        }
    }
    const defaultVisibility = {};
    EVENTS_COLUMNS.forEach(col => {
        defaultVisibility[col.key] = true;
    });
    return defaultVisibility;
}

function saveEventsColumnVisibility(visibility) {
    localStorage.setItem('events_column_visibility', JSON.stringify(visibility));
}

function initEventsColumnVisibility() {
    const visibility = getEventsColumnVisibility();
    applyEventsColumnVisibility(visibility);
}

function applyEventsColumnVisibility(visibility) {
    if (!document.querySelector('#eventsTable')) return;

    EVENTS_COLUMNS.forEach(col => {
        const isVisible = visibility[col.key] !== false;
        document.querySelectorAll(`#eventsTable th[data-col="${col.key}"]`).forEach(th => {
            th.style.display = isVisible ? '' : 'none';
        });
        document.querySelectorAll(`#eventsTable td[data-col="${col.key}"]`).forEach(td => {
            td.style.display = isVisible ? '' : 'none';
        });
    });
}

function initEventsColumnSelection() {
    const table = document.getElementById('eventsTable');
    if (!table) return;

    table.addEventListener('click', function(e) {
        const th = e.target.closest('th');
        if (th && th.dataset.col && th.dataset.col !== 'checkbox') {
            selectEventsColumn(th.dataset.col, e.shiftKey);
        } else if (!e.target.closest('.excel-filter-icon')) {
            clearEventsColumnSelection();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearEventsColumnSelection();
            closeEventsContextMenu();
        }
    });
}

function selectEventsColumn(columnKey, isShift) {
    if (isShift && eventsSelectedColumns.length > 0) {
        const lastSelected = eventsSelectedColumns[eventsSelectedColumns.length - 1];
        const lastIndex = EVENTS_COLUMNS.findIndex(col => col.key === lastSelected);
        const currentIndex = EVENTS_COLUMNS.findIndex(col => col.key === columnKey);

        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        for (let i = start; i <= end; i++) {
            if (!eventsSelectedColumns.includes(EVENTS_COLUMNS[i].key)) {
                eventsSelectedColumns.push(EVENTS_COLUMNS[i].key);
            }
        }
    } else {
        const idx = eventsSelectedColumns.indexOf(columnKey);
        if (idx > -1) {
            eventsSelectedColumns.splice(idx, 1);
        } else {
            eventsSelectedColumns.push(columnKey);
        }
    }

    updateEventsColumnSelectionUI();
}

function clearEventsColumnSelection() {
    eventsSelectedColumns = [];
    updateEventsColumnSelectionUI();
}

function updateEventsColumnSelectionUI() {
    const table = document.getElementById('eventsTable');
    if (!table) return;

    table.querySelectorAll('th').forEach(th => {
        if (eventsSelectedColumns.includes(th.dataset.col)) {
            th.style.background = '#c6e2ff';
            th.style.color = '#0050b3';
        } else {
            th.style.background = '';
            th.style.color = '';
        }
    });

    table.querySelectorAll('td').forEach(td => {
        if (eventsSelectedColumns.includes(td.dataset.col)) {
            td.style.background = '#e6f4ff';
        } else {
            td.style.background = '';
        }
    });
}

function initEventsContextMenu() {
    const table = document.getElementById('eventsTable');
    if (!table) return;

    table.addEventListener('contextmenu', function(e) {
        e.preventDefault();

        const th = e.target.closest('th');
        if (th && th.dataset.col && th.dataset.col !== 'checkbox') {
            showEventsContextMenu(e.clientX, e.clientY, th.dataset.col);
        }
    });
}

function showEventsContextMenu(x, y, columnKey) {
    closeEventsContextMenu();

    const visibility = getEventsColumnVisibility();
    const isSelected = eventsSelectedColumns.length > 0;

    const menu = document.createElement('div');
    menu.className = 'excel-context-menu';
    menu.id = 'eventsContextMenu';

    let html = '';

    if (isSelected) {
        html += `<div class="ecm-item" onclick="hideEventsSelectedColumns()">
                    <span class="ecm-icon">👁️‍🗨️</span>
                    <span>隐藏选中列</span>
                 </div>`;
    }

    html += `<div class="ecm-item" onclick="hideEventsColumn('${columnKey}')">
                <span class="ecm-icon">👁️‍🗨️</span>
                <span>隐藏此列</span>
             </div>`;

    const hiddenColumns = EVENTS_COLUMNS.filter(col => visibility[col.key] === false);
    if (hiddenColumns.length > 0) {
        html += `<div class="ecm-divider"></div>`;
        html += `<div style="padding:8px 12px;font-size:11px;color:#909399;font-weight:bold;">取消隐藏</div>`;
        hiddenColumns.forEach(col => {
            html += `<div class="ecm-item" onclick="showEventsColumn('${col.key}')">
                        <span class="ecm-icon">👁️</span>
                        <span>${col.label}</span>
                     </div>`;
        });
    }

    html += `<div class="ecm-divider"></div>`;
    html += `<div class="ecm-item" onclick="showAllEventsColumns()">
                <span class="ecm-icon">👁️</span>
                <span>显示全部列</span>
             </div>`;

    menu.innerHTML = html;
    document.body.appendChild(menu);
    eventsActiveContextMenu = menu;

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
        document.addEventListener('click', handleEventsContextMenuOutsideClick);
    }, 10);
}

function closeEventsContextMenu() {
    if (eventsActiveContextMenu) {
        eventsActiveContextMenu.remove();
        eventsActiveContextMenu = null;
        document.removeEventListener('click', handleEventsContextMenuOutsideClick);
    }
}

function handleEventsContextMenuOutsideClick(e) {
    const menu = document.getElementById('eventsContextMenu');
    if (menu && !menu.contains(e.target)) {
        closeEventsContextMenu();
    }
}

function hideEventsColumn(columnKey) {
    const visibility = getEventsColumnVisibility();
    visibility[columnKey] = false;
    saveEventsColumnVisibility(visibility);
    applyEventsColumnVisibility(visibility);
    closeEventsContextMenu();
}

function hideEventsSelectedColumns() {
    const visibility = getEventsColumnVisibility();
    eventsSelectedColumns.forEach(key => {
        visibility[key] = false;
    });
    saveEventsColumnVisibility(visibility);
    applyEventsColumnVisibility(visibility);
    closeEventsContextMenu();
}

function showEventsColumn(columnKey) {
    const visibility = getEventsColumnVisibility();
    visibility[columnKey] = true;
    saveEventsColumnVisibility(visibility);
    applyEventsColumnVisibility(visibility);
    closeEventsContextMenu();
}

function showAllEventsColumns() {
    const visibility = {};
    EVENTS_COLUMNS.forEach(col => {
        visibility[col.key] = true;
    });
    saveEventsColumnVisibility(visibility);
    applyEventsColumnVisibility(visibility);
    closeEventsContextMenu();
}
