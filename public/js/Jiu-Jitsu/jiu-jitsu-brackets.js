/**
 * 柔术编排控制器 (JiuJitsuBrackets)
 *
 * 职责：柔术赛事编排页面的前端UI控制层，管理编排表格的交互、
 *       竞赛方式配置、对阵图生成、对阵表生成等核心操作。
 *
 * 依赖：
 *   - currentEventId（全局变量，当前赛事ID）
 *   - API_BASE（全局变量，API基础路径）
 *   - getEventParam() / getEventParamObj()（全局工具函数）
 *   - loadAutoArrangeData()（全局函数，刷新编排数据）
 *   - ExcelFilter（可选，Excel风格筛选组件）
 *   - refreshBracketDisplay()（bracket-detail.js中定义，刷新对阵图）
 *
 * 核心业务流程：
 *   1. 抽签 → athletes表写入 athlete_draw_num
 *   2. 生成对阵图 → 调用 /jj-brackets/generate → 生成 bracket_* 表（不含对阵表记录）
 *   3. 设置编排 → category_mode 表设置场地/单元/顺序
 *   4. 生成对阵表 → 调用 /jj-brackets/generate-matches → 同步+排序+分配场次号
 *
 * 主要功能模块：
 *   - 编排表格：列显隐、右键菜单、排序、Excel筛选
 *   - 竞赛方式配置：为每个级别选择赛制（单败/双败/循环/分区循环）
 *   - 对阵图生成：调用后端API生成 bracket_* 数据
 *   - 对阵表生成：检查编排完整性后分配场地号和场次号
 */
const JiuJitsuBrackets = {

    JJ_COLUMNS: [
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
        { key: 'match1', label: 'R1' },
        { key: 'match2', label: 'R2' },
        { key: 'match3', label: 'R3' },
        { key: 'match4', label: 'R4' },
        { key: 'match5', label: 'R5' },
        { key: 'match6', label: 'R6' },
        { key: 'match7', label: 'R7' },
        { key: 'match8', label: 'R8' },
        { key: 'gold', label: 'Gold' },
        { key: 'silver', label: 'Silver' },
        { key: 'bronze', label: 'Bronze' },
        { key: 'rep', label: 'Rep.' },
        { key: 'brom', label: 'Bro.m' }
    ],

    selectedColumns: [],
    activeContextMenu: null,
    sortState: { colIndex: -1, direction: '' },

    COMP_MODES: [
        { value: 'single_elimination', label: '单败淘汰赛' },
        { value: 'double_elimination', label: '双败淘汰赛' },
        { value: 'round_robin', label: '单循环赛' },
        { value: 'pool_elimination', label: '分区循环赛' }
    ],

    /**
     * 从 localStorage 加载列可见性配置
     * @returns {Object} 列key到布尔值的映射
     */
    getColumnVisibility() {
        const saved = localStorage.getItem('jj_brackets_column_visibility');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        const v = {};
        this.JJ_COLUMNS.forEach(col => { v[col.key] = true; });
        return v;
    },

    saveColumnVisibility(visibility) {
        localStorage.setItem('jj_brackets_column_visibility', JSON.stringify(visibility));
    },

    applyColumnVisibility(visibility) {
        const table = document.querySelector('.auto-arrange-table');
        if (!table) return;
        this.JJ_COLUMNS.forEach(col => {
            const isVisible = visibility[col.key] !== false;
            table.querySelectorAll(`th[data-col="${col.key}"]`).forEach(th => {
                th.style.display = isVisible ? 'table-cell' : 'none';
            });
            table.querySelectorAll(`td[data-col="${col.key}"]`).forEach(td => {
                td.style.display = isVisible ? 'table-cell' : 'none';
            });
        });
    },

    initColumnVisibility() {
        this.applyColumnVisibility(this.getColumnVisibility());
    },

    initColumnSelection() {
        const table = document.querySelector('.auto-arrange-table');
        if (!table) return;
        table.addEventListener('click', (e) => {
            if (e.target.closest('.excel-filter-icon') || e.target.closest('.excel-filter-menu') || e.target.closest('.jj-filter-dropdown')) return;
            const th = e.target.closest('th');
            if (th && th.dataset.col) {
                const idx = this.selectedColumns.indexOf(th.dataset.col);
                if (idx > -1) {
                    this.selectedColumns.splice(idx, 1);
                } else {
                    this.selectedColumns.push(th.dataset.col);
                }
                this.highlightSelectedColumns();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.selectedColumns = [];
                this.highlightSelectedColumns();
                this.closeContextMenu();
            }
        });
    },

    highlightSelectedColumns() {
        const table = document.querySelector('.auto-arrange-table');
        if (!table) return;
        table.querySelectorAll('th').forEach(th => {
            if (this.selectedColumns.includes(th.dataset.col)) {
                th.style.background = '#e6f4ff';
                th.style.color = '#409eff';
            } else {
                th.style.background = '';
                th.style.color = '';
            }
        });
        table.querySelectorAll('td').forEach(td => {
            if (this.selectedColumns.includes(td.dataset.col)) {
                td.style.background = '#e6f4ff';
            } else {
                td.style.background = '';
            }
        });
    },

    closeContextMenu() {
        if (this.activeContextMenu) {
            this.activeContextMenu.remove();
            this.activeContextMenu = null;
            document.removeEventListener('click', this._contextMenuOutsideHandler);
        }
    },

    showContextMenu(x, y, columnKey) {
        this.closeContextMenu();
        const visibility = this.getColumnVisibility();
        const isSelected = this.selectedColumns.length > 0;
        const menu = document.createElement('div');
        menu.className = 'excel-context-menu';
        menu.id = 'jjContextMenu';
        let html = '';
        html += `<div class="ecm-item" onclick="JiuJitsuBrackets.sortColumn('${columnKey}', 'asc')"><span class="ecm-icon">↑</span><span>升序排序</span></div>`;
        html += `<div class="ecm-item" onclick="JiuJitsuBrackets.sortColumn('${columnKey}', 'desc')"><span class="ecm-icon">↓</span><span>降序排序</span></div>`;
        html += `<div class="ecm-divider"></div>`;
        if (isSelected) {
            html += `<div class="ecm-item" onclick="JiuJitsuBrackets.hideSelectedColumns()"><span class="ecm-icon">👁️‍🗨️</span><span>隐藏选中列</span></div>`;
        }
        html += `<div class="ecm-item" onclick="JiuJitsuBrackets.hideColumn('${columnKey}')"><span class="ecm-icon">👁️‍🗨️</span><span>隐藏此列</span></div>`;
        const hiddenColumns = this.JJ_COLUMNS.filter(col => visibility[col.key] === false);
        if (hiddenColumns.length > 0) {
            html += `<div class="ecm-divider"></div>`;
            html += `<div style="padding:8px 12px;font-size:11px;color:#909399;font-weight:bold;">取消隐藏</div>`;
            hiddenColumns.forEach(col => {
                html += `<div class="ecm-item" onclick="JiuJitsuBrackets.showColumn('${col.key}')"><span class="ecm-icon">👁️</span><span>${col.label}</span></div>`;
            });
        }
        html += `<div class="ecm-divider"></div>`;
        html += `<div class="ecm-item" onclick="JiuJitsuBrackets.showAllColumns()"><span class="ecm-icon">👁️</span><span>显示全部列</span></div>`;
        menu.innerHTML = html;
        document.body.appendChild(menu);
        this.activeContextMenu = menu;
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
        this._contextMenuOutsideHandler = (e) => {
            const m = document.getElementById('jjContextMenu');
            if (m && !m.contains(e.target)) this.closeContextMenu();
        };
        setTimeout(() => { document.addEventListener('click', this._contextMenuOutsideHandler); }, 10);
    },

    hideColumn(columnKey) {
        const v = this.getColumnVisibility();
        v[columnKey] = false;
        this.saveColumnVisibility(v);
        this.applyColumnVisibility(v);
        this.closeContextMenu();
        this.selectedColumns = [];
        this.highlightSelectedColumns();
    },

    hideSelectedColumns() {
        const v = this.getColumnVisibility();
        this.selectedColumns.forEach(k => { v[k] = false; });
        this.saveColumnVisibility(v);
        this.applyColumnVisibility(v);
        this.closeContextMenu();
        this.selectedColumns = [];
        this.highlightSelectedColumns();
    },

    showColumn(columnKey) {
        const v = this.getColumnVisibility();
        v[columnKey] = true;
        this.saveColumnVisibility(v);
        this.applyColumnVisibility(v);
        this.closeContextMenu();
    },

    showAllColumns() {
        const v = {};
        this.JJ_COLUMNS.forEach(col => { v[col.key] = true; });
        this.saveColumnVisibility(v);
        this.applyColumnVisibility(v);
        this.closeContextMenu();
    },

    sortColumn(columnKey, direction) {
        this.closeContextMenu();
        const colIndex = this.JJ_COLUMNS.findIndex(col => col.key === columnKey);
        if (colIndex === -1) return;
        this.sortState = { colIndex, direction };
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
        this.updateSortIndicators();
    },

    updateSortIndicators() {
        const headers = document.querySelectorAll('.auto-arrange-table thead th');
        headers.forEach((th, index) => {
            const col = this.JJ_COLUMNS[index];
            if (!col) return;
            const baseLabel = col.label;
            if (index === this.sortState.colIndex && this.sortState.direction) {
                const arrow = this.sortState.direction === 'asc' ? ' ↑' : ' ↓';
                th.childNodes[0].textContent = baseLabel + arrow;
                th.style.color = '#409eff';
            } else {
                th.childNodes[0].textContent = baseLabel;
                th.style.color = '';
            }
        });
    },

    initContextMenu() {
        const table = document.querySelector('.auto-arrange-table');
        if (!table) return;
        table.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const th = e.target.closest('th');
            if (th && th.dataset.col) {
                this.showContextMenu(e.clientX, e.clientY, th.dataset.col);
            }
        });
    },

    initExcelFilter() {
        if (typeof ExcelFilter === 'undefined') return;
        ExcelFilter.init('bracketsTable', {
            excludeColumns: [3, 4, 5],
            onFilterChange: function() {}
        });
    },

    calculateJJRounds(count, mode) {
        const rounds = {
            final: 0,
            match1: 0, match2: 0, match3: 0, match4: 0,
            match5: 0, match6: 0, match7: 0, match8: 0,
            gold: 0, silver: 0, bronze: 0,
            repechage: 0, brom: 0,
            total: 0
        };

        if (count <= 1) return rounds;

        const effectiveMode = mode || 'single_elimination';

        if (effectiveMode === 'single_elimination') {
            rounds.gold = 1;
            rounds.silver = 1;
            rounds.bronze = 2;
            rounds.repechage = 0;
            rounds.brom = 0;

            if (count === 2) {
                rounds.final = 1;
                rounds.total = 1;
                return rounds;
            }

            let bracketSize = 4;
            while (bracketSize < count) bracketSize *= 2;
            const k = Math.round(Math.log2(bracketSize));

            const firstRoundMatches = count - bracketSize / 2;

            rounds.match1 = firstRoundMatches;
            for (let r = 2; r <= k - 1; r++) {
                rounds['match' + r] = bracketSize / Math.pow(2, r);
            }

            rounds.final = 1;
            rounds.total = count - 1;

            return rounds;
        }

        if (effectiveMode === 'double_elimination') {
            let bracketSize = 4;
            while (bracketSize < count) bracketSize *= 2;
            const k = Math.round(Math.log2(bracketSize));

            const winnersMatches = count - 1;
            const losersMatches = Math.max(0, count - 2);
            rounds.gold = 1;
            rounds.silver = 1;
            rounds.bronze = 2;
            rounds.repechage = Math.ceil(losersMatches / 2);
            rounds.brom = Math.floor(losersMatches / 2);

            const firstRoundMatches = count - bracketSize / 2;

            rounds.match1 = firstRoundMatches;
            for (let r = 2; r <= k - 1; r++) {
                rounds['match' + r] = bracketSize / Math.pow(2, r);
            }

            rounds.final = 1;
            rounds.total = winnersMatches + losersMatches;

            return rounds;
        }

        if (effectiveMode === 'round_robin') {
            const totalMatches = count * (count - 1) / 2;
            rounds.gold = 1;
            rounds.silver = 1;
            rounds.bronze = 2;
            rounds.repechage = 0;
            rounds.brom = 0;

            const totalRounds = count - 1;
            const matchesPerRound = Math.ceil(count / 2);

            for (let i = 1; i <= Math.min(totalRounds, 8); i++) {
                rounds['match' + i] = matchesPerRound;
            }

            rounds.final = 1;
            rounds.total = totalMatches;

            return rounds;
        }

        if (effectiveMode === 'pool_elimination') {
            const poolCount = Math.max(2, Math.ceil(count / 4));
            const poolSize = Math.ceil(count / poolCount);
            const poolMatches = poolCount * poolSize * (poolSize - 1) / 2;
            const elimRounds = Math.ceil(Math.log2(poolCount));
            const elimMatches = poolCount - 1;
            const repechageMatches = Math.ceil(poolCount / 2);

            rounds.gold = 1;
            rounds.silver = 1;
            rounds.bronze = 2;
            rounds.repechage = repechageMatches;
            rounds.brom = Math.floor(poolCount / 4);

            let matchIdx = 1;
            for (let p = 0; p < poolCount && matchIdx <= 8; p++) {
                rounds['match' + matchIdx] = poolSize * (poolSize - 1) / 2;
                matchIdx++;
            }
            for (let r = elimRounds; r >= 1 && matchIdx <= 8; r--) {
                const matchesInRound = Math.pow(2, r - 1);
                rounds['match' + matchIdx] = Math.min(matchesInRound, poolCount / 2);
                matchIdx++;
            }

            rounds.final = 1;
            rounds.total = poolMatches + elimMatches + repechageMatches + rounds.brom;

            return rounds;
        }

        return rounds;
    },

    async loadCompModeConfig() {
        if (!currentEventId) {
            this.compModeConfig = {};
            return;
        }
        const modeNameMap = {
            '单败淘汰赛': 'single_elimination',
            '双败淘汰赛': 'double_elimination',
            '单循环赛': 'round_robin',
            '分区循环赛': 'pool_elimination'
        };
        const resolveMode = (item) => {
            if (item.mode) return item.mode;
            if (item.categroy_mode_name && modeNameMap[item.categroy_mode_name]) return modeNameMap[item.categroy_mode_name];
            return 'single_elimination';
        };
        try {
            const syncResp = await fetch(`${API_BASE}/category-mode/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: currentEventId })
            });
            const syncData = await syncResp.json();
            if (syncData.success && syncData.data) {
                this.compModeConfig = {};
                syncData.data.forEach(item => {
                    this.compModeConfig[item.weight_class] = resolveMode(item);
                });
                return;
            }
        } catch (e) {
            console.warn('通过sync加载category_mode失败，尝试直接查询:', e);
        }

        try {
            const resp = await fetch(`${API_BASE}/category-mode?event_id=${currentEventId}`);
            const data = await resp.json();
            if (data.success && data.data) {
                this.compModeConfig = {};
                data.data.forEach(item => {
                    this.compModeConfig[item.weight_class] = resolveMode(item);
                });
            }
        } catch (e) {
            console.warn('加载竞赛方式配置失败:', e);
            this.compModeConfig = {};
        }
    },

    async saveCompModeConfig(weightClass, mode) {
        if (!currentEventId) return;
        try {
            const resp = await fetch(`${API_BASE}/jj-comp-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_id: currentEventId,
                    weight_class: weightClass,
                    comp_mode: mode
                })
            });
            const data = await resp.json();
            if (data.success) {
                this.compModeConfig[weightClass] = mode;
                try {
                    await fetch(`${API_BASE}/brackets/clear`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event_id: currentEventId, weight_class: weightClass })
                    });
                } catch (e) {}
            }
        } catch (e) {
            console.error('保存竞赛方式失败:', e);
        }
    },

    showCompModeConfigModal() {
        const existingModal = document.getElementById('jjCompModeModal');
        if (existingModal) existingModal.remove();

        const tbody = document.getElementById('autoArrangeTableBody');
        const rows = tbody ? tbody.querySelectorAll('tr') : [];
        if (rows.length === 0) {
            alert('暂无级别数据');
            return;
        }

        const classList = [];
        rows.forEach(tr => {
            const wcCell = tr.querySelector('td[data-col="weightClass"]');
            const countCell = tr.querySelector('td[data-col="count"]');
            if (!wcCell) return;
            const weightClass = wcCell.textContent.trim();
            const count = countCell ? parseInt(countCell.textContent || '0') : 0;
            classList.push({ weightClass, count });
        });

        const modal = document.createElement('div');
        modal.id = 'jjCompModeModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:9999;';

        let tableRows = classList.map((cls, idx) => {
            const currentMode = this.compModeConfig[cls.weightClass] || 'single_elimination';
            const options = this.COMP_MODES.map(m =>
                `<option value="${m.value}" ${currentMode === m.value ? 'selected' : ''}>${m.label}</option>`
            ).join('');
            return `<tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="text-align:left;min-width:120px;">${cls.weightClass}</td>
                <td style="text-align:center;">${cls.count}人</td>
                <td style="text-align:center;">
                    <select class="jj-comp-mode-select" data-weight-class="${cls.weightClass}" style="width:90px;text-align:center;border:1px solid #409EFF;border-radius:3px;padding:2px;font-size:12px;font-weight:bold;color:#303133;cursor:pointer;">
                        ${options}
                    </select>
                </td>
            </tr>`;
        }).join('');

        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:24px;min-width:600px;max-width:800px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:#303133;font-size:18px;">🥋 竞赛方式配置</h3>
                    <button onclick="document.getElementById('jjCompModeModal').remove()" style="border:none;background:none;font-size:24px;cursor:pointer;color:#909399;padding:0;line-height:1;">×</button>
                </div>
                <p style="color:#909399;font-size:13px;margin-bottom:16px;">为每个级别选择不同的竞赛方式，配置后将影响对阵图和场次计算</p>
                <div style="margin-bottom:12px;display:flex;gap:10px;">
                    <button onclick="JiuJitsuBrackets.batchSetCompMode('single_elimination')" style="padding:6px 12px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">全部设为单败淘汰</button>
                    <button onclick="JiuJitsuBrackets.batchSetCompMode('double_elimination')" style="padding:6px 12px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">全部设为双败淘汰</button>
                    <button onclick="JiuJitsuBrackets.batchSetCompMode('round_robin')" style="padding:6px 12px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">全部设为循环赛</button>
                </div>
                <div style="flex:1;overflow:auto;border:1px solid #ebeef5;border-radius:4px;">
                    <table id="jjCompModeTable" style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="background:linear-gradient(to right, #8B0000, #00008B);">
                                <th style="padding:6px 8px;text-align:center;font-weight:600;color:#fff;white-space:nowrap;position:relative;cursor:pointer;border:1px solid rgba(255,255,255,0.2);">序号</th>
                                <th style="padding:6px 8px;text-align:center;font-weight:600;color:#fff;white-space:nowrap;position:relative;cursor:pointer;border:1px solid rgba(255,255,255,0.2);">级别</th>
                                <th style="padding:6px 8px;text-align:center;font-weight:600;color:#fff;white-space:nowrap;position:relative;cursor:pointer;border:1px solid rgba(255,255,255,0.2);">人数</th>
                                <th style="padding:6px 8px;text-align:center;font-weight:600;color:#fff;white-space:nowrap;position:relative;cursor:pointer;border:1px solid rgba(255,255,255,0.2);">竞赛方式</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end;">
                    <button onclick="document.getElementById('jjCompModeModal').remove()" style="padding:10px 20px;border:1px solid #dcdfe6;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;color:#606266;">取消</button>
                    <button onclick="JiuJitsuBrackets.saveAllCompModes()" style="padding:10px 20px;background:#409EFF;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">💾 保存配置</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const compModeTable = document.getElementById('jjCompModeTable');
        if (compModeTable) {
            const tbodyEl = compModeTable.querySelector('tbody');
            if (tbodyEl) {
                tbodyEl.querySelectorAll('tr').forEach((tr, idx) => {
                    tr.querySelectorAll('td').forEach(td => {
                        td.style.border = '1px solid #dcdfe6';
                        td.style.padding = '6px 8px';
                        td.style.whiteSpace = 'nowrap';
                    });
                    if (idx % 2 === 0) {
                        tr.style.background = '#f0f7ed';
                    } else {
                        tr.style.background = '#e8f3e0';
                    }
                });
            }

            if (typeof ExcelFilter !== 'undefined') {
                ExcelFilter.init('jjCompModeTable', {
                    excludeColumns: [],
                    onFilterChange: function() {}
                });
            }
        }
    },

    batchSetCompMode(mode) {
        const selects = document.querySelectorAll('.jj-comp-mode-select');
        selects.forEach(sel => { sel.value = mode; });
    },

    async saveAllCompModes() {
        const selects = document.querySelectorAll('.jj-comp-mode-select');
        const saveData = [];
        selects.forEach(sel => {
            const weightClass = sel.dataset.weightClass;
            const mode = sel.value;
            saveData.push({ weight_class: weightClass, comp_mode: mode });
            this.compModeConfig[weightClass] = mode;
        });

        try {
            const resp = await fetch(`${API_BASE}/jj-comp-mode/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: currentEventId, data: saveData })
            });
            const data = await resp.json();
            if (data.success) {
                try {
                    await fetch(`${API_BASE}/brackets/clear-all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event_id: currentEventId })
                    });
                } catch (e) {}
                alert('✅ 竞赛方式配置已保存！对阵图已清除，请重新生成。');
                const modal = document.getElementById('jjCompModeModal');
                if (modal) modal.remove();
                if (typeof loadAutoArrangeData === 'function') {
                    loadAutoArrangeData();
                }
            } else {
                alert('保存失败: ' + (data.error || '未知错误'));
            }
        } catch (e) {
            alert('保存失败: ' + e.message);
        }
    },

    /**
     * 生成对阵图（仅生成 bracket_* 数据，不生成对阵表记录）
     *
     * 流程：检查已有数据确认 → 调用 POST /jj-brackets/generate → 刷新编排数据
     *
     * 注意：此操作不检查场地/单元/顺序编排状态，
     *       只需要完成抽签即可执行。
     */
    async generateJJBrackets() {
        if (!currentEventId) { alert('请先选择赛事'); return; }

        try {
            const res = await fetch(`${API_BASE}/jj-brackets/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...getEventParamObj(), comp_modes: this.compModeConfig })
            });
            const data = await res.json();
            if (data.success) {
                const result = data.data;
                let msg = '✅ 柔术对阵图生成完成！\n\n成功: ' + result.generated + ' 个级别';
                if (result.errors && result.errors.length > 0) {
                    msg += '\n\n警告:\n' + result.errors.join('\n');
                }
                if (result.results && result.results.length > 0) {
                    msg += '\n\n详情:\n' + result.results.join('\n');
                }
                alert(msg);

                if (typeof loadAutoArrangeData === 'function') {
                    loadAutoArrangeData();
                }
            } else {
                if (data.hasExistingData) {
                    try {
                        const checkRes = await fetch(`${API_BASE}/jj-brackets/clear`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ event_id: currentEventId, check_only: true })
                        });
                        const checkData = await checkRes.json();
                        
                        let confirmMsg = '已有对阵图数据，请先清除后再生成。';
                        if (checkData.success && checkData.hasMatchData) {
                            confirmMsg += `\n\n⚠️ 注意：原有对阵表数据（${checkData.matchCount}场）将会被清除！`;
                        }
                        confirmMsg += '\n\n是否立即清除所有对阵图和对阵表数据？';
                        
                        const shouldClear = confirm(confirmMsg);
                        if (shouldClear) {
                            try {
                                const clearRes = await fetch(`${API_BASE}/jj-brackets/clear`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ event_id: currentEventId, clear_bracket: true })
                                });
                                const clearData = await clearRes.json();
                                if (clearData.success) {
                                    alert('✅ 数据已清除，请重新点击生成对阵图');
                                    if (typeof loadAutoArrangeData === 'function') {
                                        loadAutoArrangeData();
                                    }
                                } else {
                                    alert('❌ 清除失败: ' + (clearData.error || '未知错误'));
                                }
                            } catch (e) {
                                alert('❌ 清除请求失败: ' + e.message);
                            }
                        }
                    } catch (e) {
                        alert('❌ 检查数据失败: ' + e.message);
                    }
                } else {
                    alert('❌ 生成失败: ' + (data.error || '未知错误'));
                }
            }
        } catch (e) {
            alert('❌ 生成请求失败: ' + e.message);
        }
    },

    /**
     * 生成对阵表（同步bracket数据 + 排序 + 分配场地号和场次号）
     *
     * 前置条件检查：
     *   1. 必须已完成抽签（有运动员数据）
     *   2. 所有级别必须已设置场地、单元、顺序（category_mode表）
     *
     * 后端完整流程（仿写跆拳道 reorderMatches）：
     *   1. 同步 bracket_match → jiu_jitsu_matchs（syncJJMatchesFromBracket）
     *   2. 排序（单元→场地→决赛优先→赛制类型→轮次→区域→级别顺序）
     *   3. 过滤空位比赛（BYE）
     *   4. 分配场地号和场次号（unitNum*1000+cnt 格式如 "1001", "2003"）
     *   5. 更新前序胜者标签（findPrevBracketMatchId → "XX胜者"/"XX负者"）
     *   6. 回写场次标签到 bracket_match.match_display_label
     */
    async assignMatchIds() {
        if (!currentEventId) { alert('请先选择赛事'); return; }

        const tbody = document.getElementById('autoArrangeTableBody');
        const rows = tbody ? tbody.querySelectorAll('tr') : [];
        if (rows.length === 0) { alert('暂无编排数据，请先添加运动员'); return; }

        const unassigned = [];
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 7) return;
            const weightClassTd = tr.querySelector('td[data-col="weightClass"]');
            const weightClass = weightClassTd ? weightClassTd.textContent.trim() : '';
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
            alert('⚠️ 以下级别未完成场地分配，请先完成编排设置：\n\n' + unassigned.join('\n'));
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/jj-brackets/generate-matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: currentEventId })
            });
            const data = await res.json();
            if (data.success) {
                const result = data.data;
                alert(`✅ 对阵表生成完成！\n\n已同步 ${result.syncCount} 个级别，分配 ${result.assigned} 场比赛的场次号和场地号`);
                if (typeof loadAutoArrangeData === 'function') {
                    loadAutoArrangeData();
                }
            } else {
                alert('❌ 生成对阵表失败: ' + (data.error || '未知错误'));
            }
        } catch (e) {
            alert('❌ 生成对阵表请求失败: ' + e.message);
        }
    },

    async onCompModeChange(weightClass, mode) {
        await this.saveCompModeConfig(weightClass, mode);
        if (typeof loadAutoArrangeData === 'function') {
            await loadAutoArrangeData();
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = JiuJitsuBrackets;
}
