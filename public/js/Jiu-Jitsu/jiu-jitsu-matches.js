let _allMatchRows = [];
let _filterState = { left: { col: -1, val: '' }, right: { col: -1, val: '' } };
let _jjAthletesByClass = {};

function parseJJScores(scoresStr) {
    if (!scoresStr) return { blue_score: 0, red_score: 0 };
    const parts = String(scoresStr).split(':');
    return {
        blue_score: parseInt(parts[0]) || 0,
        red_score: parseInt(parts[1]) || 0
    };
}

async function loadMatches() {
    const leftBody = document.getElementById('matchesTableLeftBody');
    const rightBody = document.getElementById('matchesTableRightBody');
    if (!leftBody || !rightBody) return;
    leftBody.innerHTML = '';
    rightBody.innerHTML = '';
    _allMatchRows = [];

    if (!currentEventId) {
        const el1 = document.getElementById('totalMatches'); if (el1) el1.textContent = '0';
        const el2 = document.getElementById('activeMatches'); if (el2) el2.textContent = '0';
        const el3 = document.getElementById('pendingMatches'); if (el3) el3.textContent = '0';
        leftBody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: #909399; padding: 40px 0;">请先在「赛事列表」中选择一个赛事</td></tr>';
        return;
    }

    let matchesData = [];

    try {
        const jjParams = currentEventId ? `event_id=${currentEventId}` : '';
        const resp = await apiGet('/jj-brackets/matches?' + jjParams);
        if (resp.success && resp.data) {
            matchesData = resp.data.filter(m => {
                if (m.jiu_jitsu_match_venue === null || m.jiu_jitsu_match_id === null) return false;
                if (m.jiu_jitsu_match_status === 'bye') return false;
                return true;
            }).map(m => {
                const scores = parseJJScores(m.jiu_jitsu_match_scores);
                const venueStr = m.jiu_jitsu_match_venue || '';
                return {
                    id: m.id,
                    event_id: m.event_id,
                    weight_class: m.jiu_jitsu_match_categroy,
                    round: m.jiu_jitsu_match_round_num,
                    round_name: m.jiu_jitsu_match_round_name,
                    total_rounds: m.jiu_jitsu_match_category_total_rounds,
                    bracket_match_id: m.jiu_jitsu_bracket_match_id,
                    match_id: m.jiu_jitsu_match_id,
                    red_athlete_id: m.jiu_jitsu_red_athlete_id,
                    red_name: m.jiu_jitsu_red_athlete_name,
                    red_unit: m.jiu_jitsu_red_athlete_team,
                    red_prev_winner: m.jiu_jitsu_red_prev_winner_id,
                    red_score: scores.red_score,
                    blue_athlete_id: m.jiu_jitsu_blue_athlete_id,
                    blue_name: m.jiu_jitsu_blue_athlete_name,
                    blue_unit: m.jiu_jitsu_blue_athlete_team,
                    blue_prev_winner: m.jiu_jitsu_blue_prev_winner,
                    blue_score: scores.blue_score,
                    match_status: m.jiu_jitsu_match_status,
                    win_method: m.jiu_jitsu_win_method,
                    winner: m.jiu_jitsu_winner,
                    comp_mode: m.jiu_jitsu_match_comp_mode || '',
                    zone: m.jiu_jitsu_match_zone || '',
                    venue_no: (m.jiu_jitsu_match_venue !== null && m.jiu_jitsu_match_id !== null)
                        ? (String(m.jiu_jitsu_match_venue) + String(m.jiu_jitsu_match_id))
                        : '',
                    venue: venueStr.charAt(0) || ''
                };
            });
        }
    } catch (e) { console.error('加载jj-brackets/matches失败:', e); }

    const rFinalClasses = new Set();
    matchesData.forEach(m => {
        if (m.round_name === 'R.Final' || m.zone === 'final') {
            rFinalClasses.add(m.weight_class);
        }
    });
    if (rFinalClasses.size > 0) {
        try {
            const athResp = await apiGet('/athletes?event_id=' + currentEventId + '&athlete_type=jiu_jitsu');
            if (athResp.success && athResp.data) {
                _jjAthletesByClass = {};
                athResp.data.forEach(a => {
                    const wc = a.athlete_category || '';
                    if (!rFinalClasses.has(wc)) return;
                    if (!_jjAthletesByClass[wc]) _jjAthletesByClass[wc] = [];
                    _jjAthletesByClass[wc].push({
                        id: a.athlete_id,
                        name: a.athlete_name || '',
                        team: a.athlete_team || '',
                        draw_num: a.athlete_draw_num || 0
                    });
                });
                for (const wc of rFinalClasses) {
                    if (_jjAthletesByClass[wc]) {
                        _jjAthletesByClass[wc].sort((a, b) => (a.draw_num || 0) - (b.draw_num || 0));
                    }
                }
            }
        } catch (e) { console.warn('加载运动员数据失败:', e); }
    }

    let active = 0, pending = 0;

    const sortedMatches = [...matchesData].sort((a, b) => {
        const venueA = a.venue || (a.venue_no || '').charAt(0) || '';
        const venueB = b.venue || (b.venue_no || '').charAt(0) || '';
        if (venueA !== venueB) return venueA.localeCompare(venueB);
        const matchIdA = parseInt(a.match_id) || 0;
        const matchIdB = parseInt(b.match_id) || 0;
        return matchIdA - matchIdB;
    });

    sortedMatches.forEach(m => {
        const mWeightClass = m.weight_class;
        const venueLetter = m.venue || (m.venue_no || '').charAt(0) || '';
        const matchNo = m.match_id || '';
        const mMatchStatus = m.match_status;
        const statusClass = mMatchStatus === '未开始' ? 'status-pending' : mMatchStatus === '进行中' ? 'status-active' : 'status-finished';
        const blueScore = m.blue_score != null ? m.blue_score : '';
        const redScore = m.red_score != null ? m.red_score : '';

        const mRoundName = m.round_name;
        const mZone = m.zone || '';
        const isRFinal = mRoundName === 'R.Final' || mZone === 'final';
        const tr = document.createElement('tr');
        tr.dataset.matchId = m.id;
        tr.dataset.matchType = 'match';

        if (isRFinal) {
            const athletes = _jjAthletesByClass[mWeightClass] || [];
            const upperAthletes = [];
            const lowerAthletes = [];
            athletes.forEach(a => {
                upperAthletes.push(a);
                lowerAthletes.push(a);
            });
            const redOptions = upperAthletes.map(a =>
                `<option value="${a.name}|${a.team}" ${m.red_name === a.name ? 'selected' : ''}>#${a.draw_num} ${a.name}</option>`
            ).join('');
            const blueOptions = lowerAthletes.map(a =>
                `<option value="${a.name}|${a.team}" ${m.blue_name === a.name ? 'selected' : ''}>#${a.draw_num} ${a.name}</option>`
            ).join('');
            const redSelected = m.red_name && m.red_name !== '上区第一';
            const blueSelected = m.blue_name && m.blue_name !== '下区第一';

            tr.innerHTML = `
                <td data-col="venueLetter">${venueLetter}</td>
                <td data-col="matchNo">${matchNo}</td>
                <td data-col="roundName">${formatRoundName(mRoundName || '')}</td>
                <td data-col="redName" style="color:#F56C6C;"><select onchange="onJJFinalSelect(this, 'red', ${m.id})" style="width:100%;padding:2px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;color:#F56C6C;"><option value="" ${!redSelected ? 'selected' : ''}>上区第一</option>${redOptions}</select></td>
                <td data-col="redUnit" style="color:#F56C6C;font-size:12px;" id="jj_red_team_${m.id}">${redSelected ? (m.red_unit || '') : ''}</td>
                <td data-col="vs" style="color:#909399;font-weight:bold;">VS</td>
                <td data-col="blueName" style="color:#409EFF;"><select onchange="onJJFinalSelect(this, 'blue', ${m.id})" style="width:100%;padding:2px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;color:#409EFF;"><option value="" ${!blueSelected ? 'selected' : ''}>下区第一</option>${blueOptions}</select></td>
                <td data-col="blueUnit" style="color:#409EFF;font-size:12px;" id="jj_blue_team_${m.id}">${blueSelected ? (m.blue_unit || '') : ''}</td>
                <td data-col="weightClass">${mWeightClass || ''}</td>
                <td data-col="status" ondblclick="openScoreModal(this)"><span class="status-badge ${statusClass}">${mMatchStatus || ''}</span></td>
                <td data-col="score">${blueScore !== '' && redScore !== '' ? (blueScore + ':' + redScore) : ''}</td>
                <td data-col="winMethod">${m.win_method || ''}</td>
                <td data-col="winner" style="${m.winner === '蓝方' ? 'color:#409EFF;' : (m.winner === '红方' ? 'color:#F56C6C;' : '')}">${m.winner || ''}</td>
            `;
        } else {
            const mRedName = m.red_name;
            const mBlueName = m.blue_name;
            const mRedPrevWinner = m.red_prev_winner;
            const mBluePrevWinner = m.blue_prev_winner;
            const mRedUnit = m.red_unit;
            const mBlueUnit = m.blue_unit;
            const mWinMethod = m.win_method;
            const mWinner = m.winner;
            const blueDisplay = mBlueName || mBluePrevWinner || '-';
            const redDisplay = mRedName || mRedPrevWinner || '-';
            tr.innerHTML = `
                <td data-col="venueLetter">${venueLetter}</td>
                <td data-col="matchNo">${matchNo}</td>
                <td data-col="roundName">${formatRoundName(mRoundName || '')}</td>
                <td data-col="redName" style="color:#F56C6C;">${redDisplay}</td>
                <td data-col="redUnit" style="color:#F56C6C;">${mRedUnit || '-'}</td>
                <td data-col="vs" style="color:#909399;font-weight:bold;">VS</td>
                <td data-col="blueName" style="color:#409EFF;">${blueDisplay}</td>
                <td data-col="blueUnit" style="color:#409EFF;">${mBlueUnit || '-'}</td>
                <td data-col="weightClass">${mWeightClass || ''}</td>
                <td data-col="status" ondblclick="openScoreModal(this)"><span class="status-badge ${statusClass}">${mMatchStatus || ''}</span></td>
                <td data-col="score">${blueScore !== '' && redScore !== '' ? (blueScore + ':' + redScore) : ''}</td>
                <td data-col="winMethod">${mWinMethod || ''}</td>
                <td data-col="winner" style="${mWinner === '蓝方' ? 'color:#409EFF;' : (mWinner === '红方' ? 'color:#F56C6C;' : '')}">${mWinner || ''}</td>
            `;
        }
        _allMatchRows.push(tr);
        if (mMatchStatus === '进行中') active++;
        if (mMatchStatus === '未开始') pending++;
    });

    renderFilteredRows();

    const total = matchesData.length;
    const el4 = document.getElementById('totalMatches'); if (el4) el4.textContent = total;
    const el5 = document.getElementById('activeMatches'); if (el5) el5.textContent = active;
    const el6 = document.getElementById('pendingMatches'); if (el6) el6.textContent = pending;

    if (typeof ExcelFilter !== 'undefined') {
        const leftTable = document.getElementById('matchesTableLeft');
        const rightTable = document.getElementById('matchesTableRight');

        [leftTable, rightTable].forEach(table => {
            if (table) {
                const thead = table.querySelector('thead');
                if (thead) {
                    thead.style.cssText = 'position:sticky;top:0;z-index:10;background:linear-gradient(to right,#8B0000,#00008B);';
                    const headers = thead.querySelectorAll('th');
                    headers.forEach(th => {
                        th.style.cssText = th.getAttribute('style') + ';position:sticky;top:0;z-index:10;background:transparent;';
                    });
                }

                ExcelFilter.init(table.id, {
                    excludeColumns: [5, 10, 11]
                });
            }
        });

        initMatchesColumnVisibility();
        initMatchesColumnSelection();
        initMatchesContextMenu();
    }
}

function onJJFinalSelect(select, side, matchId) {
    const value = select.value;
    const teamCell = document.getElementById(`jj_${side}_team_${matchId}`);
    if (!value) {
        if (teamCell) teamCell.textContent = '';
        const updateData = {};
        if (side === 'blue') {
            updateData.blue_athlete_name = '上区第一';
            updateData.blue_athlete_team = '';
        } else {
            updateData.red_athlete_name = '下区第一';
            updateData.red_athlete_team = '';
        }
        fetch(API_BASE + '/jj-brackets/matches/' + matchId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        }).then(() => {
            if (typeof refreshBracketDisplay === 'function') refreshBracketDisplay();
        }).catch(e => console.error('更新决赛选手失败:', e));
        return;
    }
    const parts = value.split('|');
    const name = parts[0] || '';
    const team = parts[1] || '';
    if (teamCell) teamCell.textContent = team;

    const updateData = {};
    if (side === 'blue') {
        updateData.blue_athlete_name = name;
        updateData.blue_athlete_team = team;
    } else {
        updateData.red_athlete_name = name;
        updateData.red_athlete_team = team;
    }
    fetch(API_BASE + '/jj-brackets/matches/' + matchId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    }).then(() => {
        if (typeof refreshBracketDisplay === 'function') refreshBracketDisplay();
    }).catch(e => console.error('更新决赛选手失败:', e));
}

function renderFilteredRows() {
    const leftBody = document.getElementById('matchesTableLeftBody');
    const rightBody = document.getElementById('matchesTableRightBody');
    if (!leftBody || !rightBody) return;
    leftBody.innerHTML = '';
    rightBody.innerHTML = '';

    let leftRows = [..._allMatchRows];
    if (_filterState.left.col >= 0 && _filterState.left.val !== '') {
        leftRows = leftRows.filter(tr => {
            const td = tr.querySelectorAll('td')[_filterState.left.col];
            return td && td.textContent.trim() === _filterState.left.val;
        });
    }

    let rightRows = [..._allMatchRows];
    if (_filterState.right.col >= 0 && _filterState.right.val !== '') {
        rightRows = rightRows.filter(tr => {
            const td = tr.querySelectorAll('td')[_filterState.right.col];
            return td && td.textContent.trim() === _filterState.right.val;
        });
    }

    leftRows.forEach((tr) => {
        leftBody.appendChild(tr);
    });
    rightRows.forEach((tr) => {
        rightBody.appendChild(tr.cloneNode(true));
    });
}

function handleFilterClick(e) {
    const arrow = e.target.closest('.filter-arrow');
    if (!arrow) return;
    e.stopPropagation();
    const th = arrow.closest('.filterable');
    if (!th) return;
    const col = parseInt(th.getAttribute('data-col'));

    const table = th.closest('table');
    const side = (table && table.id === 'matchesTableRight') ? 'right' : 'left';
    const filter = _filterState[side];

    closeFilterMenu();

    const values = new Set();
    _allMatchRows.forEach(tr => {
        const td = tr.querySelectorAll('td')[col];
        if (td) {
            const v = td.textContent.trim();
            if (v) values.add(v);
        }
    });

    const rect = arrow.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'filterMenu';
    menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.bottom + 'px;background:#fff;border:1px solid #dcdfe6;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:10000;min-width:120px;max-height:260px;overflow-y:auto;padding:4px 0;';

    const allItem = document.createElement('div');
    allItem.textContent = '全部';
    allItem.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;border-bottom:1px solid #f0f0f0;';
    if (filter.col !== col || filter.val === '') {
        allItem.style.color = '#409EFF';
        allItem.style.fontWeight = 'bold';
    }
    allItem.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
    allItem.addEventListener('mouseleave', function() { this.style.background = ''; });
    allItem.addEventListener('click', function(ev) {
        ev.stopPropagation();
        _filterState[side] = { col: -1, val: '' };
        table.querySelectorAll('.filterable').forEach(el => {
            const a = el.querySelector('.filter-arrow');
            if (a) a.textContent = '▼';
        });
        arrow.textContent = '▼';
        closeFilterMenu();
        renderFilteredRows();
    });
    menu.appendChild(allItem);

    [...values].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(val => {
        const item = document.createElement('div');
        item.textContent = val;
        item.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;';
        if (filter.col === col && filter.val === val) {
            item.style.color = '#409EFF';
            item.style.fontWeight = 'bold';
        }
        item.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
        item.addEventListener('mouseleave', function() { this.style.background = ''; });
        item.addEventListener('click', function(ev) {
            ev.stopPropagation();
            _filterState[side] = { col: col, val: val };
            table.querySelectorAll('.filterable').forEach(el => {
                const a = el.querySelector('.filter-arrow');
                if (a) a.textContent = '▼';
            });
            arrow.textContent = '✓';
            closeFilterMenu();
            renderFilteredRows();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', closeFilterMenu, { once: true });
    }, 0);
}

function closeFilterMenu() {
    const m = document.getElementById('filterMenu');
    if (m) m.remove();
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.matches-split-table thead').forEach(thead => {
        thead.addEventListener('click', handleFilterClick);
    });
});

async function resetMatchFilter() {
    if (!confirm('确定要清空所有比赛数据吗？此操作不可恢复！')) return;
    try {
        if (currentEventId) {
            const clearResp = await apiPost('/jj-brackets/clear', { event_id: currentEventId, clear_bracket: false });
            if (!clearResp.success) {
                alert('清除编排数据失败：' + (clearResp.error || '未知错误'));
                return;
            }
        }
        _filterState = { left: { col: -1, val: '' }, right: { col: -1, val: '' } };
        document.querySelectorAll('.filterable').forEach(el => {
            const a = el.querySelector('.filter-arrow');
            if (a) a.textContent = '▼';
        });
        loadMatches();
    } catch (e) {
        alert('请求失败: ' + e.message);
    }
}

function getMatchesColumns() {
    return [
        { key: 'venueLetter', label: '场地' },
        { key: 'matchNo', label: '场次' },
        { key: 'roundName', label: '轮次' },
        { key: 'redName', label: '红方姓名' },
        { key: 'redUnit', label: '红方代表队' },
        { key: 'vs', label: 'VS' },
        { key: 'blueName', label: '蓝方姓名' },
        { key: 'blueUnit', label: '蓝方代表队' },
        { key: 'weightClass', label: '级别' },
        { key: 'status', label: '状态' },
        { key: 'score', label: '比分' },
        { key: 'winMethod', label: '获胜方式' },
        { key: 'winner', label: '胜方' }
    ];
}

let matchesSelectedColumns = [];
let matchesActiveContextMenu = null;

function getMatchesColumnVisibility() {
    const saved = localStorage.getItem('jj_matches_column_visibility');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
        }
    }
    return {};
}

function saveMatchesColumnVisibility(visibility) {
    localStorage.setItem('jj_matches_column_visibility', JSON.stringify(visibility));
}

function initMatchesColumnVisibility() {
    const visibility = getMatchesColumnVisibility();
    applyMatchesColumnVisibility(visibility);
}

function applyMatchesColumnVisibility(visibility) {
    ['matchesTableLeft', 'matchesTableRight'].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        getMatchesColumns().forEach(col => {
            const isVisible = visibility[col.key] !== false;
            table.querySelectorAll(`th[data-col="${col.key}"]`).forEach(th => {
                th.style.display = isVisible ? '' : 'none';
            });
            table.querySelectorAll(`td[data-col="${col.key}"]`).forEach(td => {
                td.style.display = isVisible ? '' : 'none';
            });
        });
    });
}

function initMatchesColumnSelection() {
    ['matchesTableLeft', 'matchesTableRight'].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        table.addEventListener('click', function(e) {
            const th = e.target.closest('th');
            if (th && th.dataset.col && th.dataset.col !== 'vs') {
                selectMatchesColumn(th.dataset.col, e.shiftKey);
            } else if (!e.target.closest('.excel-filter-icon')) {
                clearMatchesColumnSelection();
            }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearMatchesColumnSelection();
            closeMatchesContextMenu();
        }
    });
}

function selectMatchesColumn(columnKey, isShift) {
    if (isShift && matchesSelectedColumns.length > 0) {
        const lastSelected = matchesSelectedColumns[matchesSelectedColumns.length - 1];
        const lastIndex = getMatchesColumns().findIndex(col => col.key === lastSelected);
        const currentIndex = getMatchesColumns().findIndex(col => col.key === columnKey);

        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        for (let i = start; i <= end; i++) {
            if (!matchesSelectedColumns.includes(getMatchesColumns()[i].key)) {
                matchesSelectedColumns.push(getMatchesColumns()[i].key);
            }
        }
    } else {
        const idx = matchesSelectedColumns.indexOf(columnKey);
        if (idx > -1) {
            matchesSelectedColumns.splice(idx, 1);
        } else {
            matchesSelectedColumns.push(columnKey);
        }
    }

    updateMatchesColumnSelectionUI();
}

function clearMatchesColumnSelection() {
    matchesSelectedColumns = [];
    updateMatchesColumnSelectionUI();
}

function updateMatchesColumnSelectionUI() {
    ['matchesTableLeft', 'matchesTableRight'].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        table.querySelectorAll('th').forEach(th => {
            if (matchesSelectedColumns.includes(th.dataset.col)) {
                th.style.background = '#c6e2ff';
                th.style.color = '#0050b3';
            } else {
                th.style.background = '';
                th.style.color = '';
            }
        });

        table.querySelectorAll('td').forEach(td => {
            if (matchesSelectedColumns.includes(td.dataset.col)) {
                td.style.background = '#e6f4ff';
            } else {
                td.style.background = '';
            }
        });
    });
}

function initMatchesContextMenu() {
    document.addEventListener('contextmenu', function(e) {
        const th = e.target.closest('th');
        if (th && th.dataset.col) {
            e.preventDefault();
            showMatchesContextMenu(e.clientX, e.clientY, th.dataset.col);
        }
    });

    document.addEventListener('click', handleMatchesContextMenuOutsideClick);
}

function showMatchesContextMenu(x, y, columnKey) {
    closeMatchesContextMenu();
    matchesActiveContextMenu = columnKey;

    const menu = document.createElement('div');
    menu.id = 'matchesContextMenu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#fff;border:1px solid #dcdfe6;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:10000;min-width:140px;padding:4px 0;`;

    const items = [
        { label: '隐藏此列', action: () => hideMatchesColumn(columnKey) },
        { label: '隐藏选中列', action: hideMatchesSelectedColumns, disabled: matchesSelectedColumns.length === 0 },
        { label: '显示此列', action: () => showMatchesColumn(columnKey) },
        { label: '显示所有列', action: showAllMatchesColumns }
    ];

    items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.label;
        div.style.cssText = `padding:7px 14px;cursor:${item.disabled ? 'not-allowed' : 'pointer'};font-size:12px;white-space:nowrap;${item.disabled ? 'color:#c0c4cc;' : ''}`;
        if (!item.disabled) {
            div.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
            div.addEventListener('mouseleave', function() { this.style.background = ''; });
            div.addEventListener('click', function() {
                item.action();
                closeMatchesContextMenu();
            });
        }
        menu.appendChild(div);
    });

    document.body.appendChild(menu);
}

function closeMatchesContextMenu() {
    const m = document.getElementById('matchesContextMenu');
    if (m) m.remove();
    matchesActiveContextMenu = null;
}

function handleMatchesContextMenuOutsideClick(e) {
    if (matchesActiveContextMenu && !e.target.closest('#matchesContextMenu')) {
        closeMatchesContextMenu();
    }
}

function hideMatchesColumn(columnKey) {
    const visibility = getMatchesColumnVisibility();
    visibility[columnKey] = false;
    saveMatchesColumnVisibility(visibility);
    applyMatchesColumnVisibility(visibility);
}

function hideMatchesSelectedColumns() {
    const visibility = getMatchesColumnVisibility();
    matchesSelectedColumns.forEach(key => { visibility[key] = false; });
    saveMatchesColumnVisibility(visibility);
    applyMatchesColumnVisibility(visibility);
    clearMatchesColumnSelection();
}

function showMatchesColumn(columnKey) {
    const visibility = getMatchesColumnVisibility();
    delete visibility[columnKey];
    saveMatchesColumnVisibility(visibility);
    applyMatchesColumnVisibility(visibility);
}

function showAllMatchesColumns() {
    saveMatchesColumnVisibility({});
    applyMatchesColumnVisibility({});
}

function exportMatchesExcelTemplate() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    downloadFile(`${API_BASE}/jj-matches/export-excel-template?event_id=${currentEventId}`);
}

function openScoreModal(td) {
    const tr = td.closest('tr');
    if (!tr) return;

    const cells = tr.querySelectorAll('td');
    const redName = cells[3] ? cells[3].textContent.trim() : '';
    const redUnit = cells[4] ? cells[4].textContent.trim() : '';
    const blueName = cells[6] ? cells[6].textContent.trim() : '';
    const blueUnit = cells[7] ? cells[7].textContent.trim() : '';

    document.getElementById('scoreRedName').textContent = redName || '红方';
    document.getElementById('scoreRedUnit').textContent = redUnit || '';
    document.getElementById('scoreBlueName').textContent = blueName || '蓝方';
    document.getElementById('scoreBlueUnit').textContent = blueUnit || '';

    const matchType = tr.dataset.matchType || '';
    const matchId = tr.dataset.matchId || '';
    const displayNum = tr.dataset.displayNum || '';

    document.getElementById('scoreMatchType').value = matchType;
    document.getElementById('scoreMatchId').value = matchId;
    document.getElementById('scoreDisplayNum').value = displayNum;

    const scoreCell = cells[10];
    if (scoreCell) {
        const scoreText = scoreCell.textContent.trim();
        if (scoreText && scoreText.includes(':')) {
            const parts = scoreText.split(':');
            document.getElementById('scoreBlueScore').value = parts[0] || '';
            document.getElementById('scoreRedScore').value = parts[1] || '';
        } else {
            document.getElementById('scoreBlueScore').value = '';
            document.getElementById('scoreRedScore').value = '';
        }
    }

    const winnerCell = cells[12];
    const winnerText = winnerCell ? winnerCell.textContent.trim() : '';
    document.getElementById('scoreWinner').value = winnerText === '红方' || winnerText === '蓝方' ? winnerText : '';
    selectWinner(winnerText === '红方' || winnerText === '蓝方' ? winnerText : '');

    const methodCell = cells[11];
    const methodText = methodCell ? methodCell.textContent.trim() : '';
    document.getElementById('scoreWinMethod').value = methodText || '';

    document.getElementById('scoreModal').classList.add('active');
}

function closeScoreModal() {
    document.getElementById('scoreModal').classList.remove('active');
}

function selectWinner(side) {
    document.getElementById('scoreWinner').value = side || '';
    const red = document.getElementById('winnerRed');
    const blue = document.getElementById('winnerBlue');
    if (side === '红方') {
        red.style.background = '#F56C6C';
        red.style.color = '#fff';
        red.style.borderColor = '#F56C6C';
        blue.style.background = '#fff';
        blue.style.color = '#409EFF';
        blue.style.borderColor = '#dcdfe6';
    } else if (side === '蓝方') {
        blue.style.background = '#409EFF';
        blue.style.color = '#fff';
        blue.style.borderColor = '#409EFF';
        red.style.background = '#fff';
        red.style.color = '#F56C6C';
        red.style.borderColor = '#dcdfe6';
    } else {
        red.style.background = '#fff';
        red.style.color = '#F56C6C';
        red.style.borderColor = '#dcdfe6';
        blue.style.background = '#fff';
        blue.style.color = '#409EFF';
        blue.style.borderColor = '#dcdfe6';
    }
}

async function resetScore() {
    const matchType = document.getElementById('scoreMatchType').value;
    const matchId = document.getElementById('scoreMatchId').value;

    if (matchType === 'match' && matchId) {
        if (!confirm('确定要重置吗？该赛事的所有对阵表数据将被清除！')) return;
        try {
            const resp = await fetch(API_BASE + '/jj-brackets/matches/' + matchId + '/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await resp.json();
            if (data.success) {
                closeScoreModal();
                loadMatches();
            } else {
                alert('重置失败: ' + data.error);
            }
        } catch (err) {
            alert('请求失败: ' + err.message);
        }
    }
}

async function saveScore() {
    const blueScore = document.getElementById('scoreBlueScore').value;
    const redScore = document.getElementById('scoreRedScore').value;
    const winner = document.getElementById('scoreWinner').value;
    const winMethod = document.getElementById('scoreWinMethod').value;
    const matchType = document.getElementById('scoreMatchType').value;
    const matchId = document.getElementById('scoreMatchId').value;

    if (!winner) { alert('请选择获胜方'); return; }

    if (matchType === 'match' && matchId) {
        try {
            const resp = await fetch(API_BASE + '/jj-brackets/matches/' + matchId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blue_score: parseInt(blueScore) || 0,
                    red_score: parseInt(redScore) || 0,
                    winner: winner,
                    win_method: winMethod || null,
                    match_status: '已结束'
                })
            });
            const data = await resp.json();
            if (data.success) {
                closeScoreModal();
                loadMatches();
            } else {
                alert('保存失败: ' + data.error);
            }
        } catch (err) {
            alert('请求失败: ' + err.message);
        }
    }
}

function showPrintDialog() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const venueSelect = document.getElementById('printVenue');
    if (venueSelect) {
        venueSelect.innerHTML = '<option value="">全部场地</option>';
        const venues = new Set();
        _allMatchRows.forEach(tr => {
            const td = tr.querySelector('td[data-col="venueLetter"]');
            if (td && td.textContent.trim()) venues.add(td.textContent.trim());
        });
        [...venues].sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v + '场地';
            venueSelect.appendChild(opt);
        });
    }

    document.getElementById('printDialog').style.display = 'flex';
}

function closePrintDialog() {
    document.getElementById('printDialog').style.display = 'none';
}

function doPrint() {
    const venue = document.getElementById('printVenue').value;
    const from = parseInt(document.getElementById('printFrom').value) || 0;
    const to = parseInt(document.getElementById('printTo').value) || 99999;

    closePrintDialog();
    printMatchScheduleWithData(_allMatchRows, venue, from, to);
}

function printMatchScheduleWithData(rows, venueFilter, fromMatch, toMatch) {
    const filtered = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        const venueLetter = cells[0] ? cells[0].textContent.trim() : '';
        const matchNo = cells[1] ? cells[1].textContent.trim() : '';
        const matchNum = parseInt(matchNo) || 0;

        if (venueFilter && venueLetter !== venueFilter) return;
        if (fromMatch && matchNum < fromMatch) return;
        if (toMatch < 99999 && matchNum > toMatch) return;

        filtered.push({
            venueLetter,
            matchNo,
            round: cells[2] ? cells[2].textContent.trim() : '',
            red: cells[3] ? cells[3].textContent.trim() : '',
            redUnit: cells[4] ? cells[4].textContent.trim() : '',
            blue: cells[6] ? cells[6].textContent.trim() : '',
            blueUnit: cells[7] ? cells[7].textContent.trim() : '',
            weightClass: cells[8] ? cells[8].textContent.trim() : ''
        });
    });

    if (filtered.length === 0) {
        alert('没有可打印的比赛数据');
        return;
    }

    const eventName = currentEventName || '';
    const venueGroups = new Map();
    filtered.forEach(item => {
        const key = item.venueLetter;
        if (!venueGroups.has(key)) venueGroups.set(key, []);
        venueGroups.get(key).push(item);
    });

    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 柔术对阵表</title>');
    d.write('<style>');
    d.write('@page { size: A4 portrait; margin: 12mm 8mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 0; margin: 0; font-size: 10pt; }');
    d.write('.print-header { text-align: center; padding: 8px 0 12px; border-bottom: 2px solid #000; margin-bottom: 12px; }');
    d.write('.print-header h1 { font-size: 18pt; font-weight: bold; letter-spacing: 4px; margin: 0 0 4px; }');
    d.write('.print-header h2 { font-size: 14pt; font-weight: bold; margin: 0; }');
    d.write('.venue-section { margin-bottom: 20px; }');
    d.write('.venue-title { font-size: 12pt; font-weight: bold; text-align: center; margin: 12px 0 6px; padding: 4px 0; border-bottom: 1px solid #333; position: relative; }');
    d.write('.venue-logo { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 28px; }');
    d.write('table { width: 100%; border-collapse: collapse; }');
    d.write('th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; font-size: 9pt; white-space: nowrap; }');
    d.write('th { background: #f0f0f0; font-weight: bold; font-size: 9pt; }');
    d.write('.blue-col { color: #1565C0; }');
    d.write('.red-col { color: #C62828; }');
    d.write('.vs-col { color: #666; font-weight: bold; }');
    d.write('.name-col { text-align: left; }');
    d.write('tr { page-break-inside: avoid; break-inside: avoid; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }');
    d.write('</style></head><body>');

    const sortedVenues = [...venueGroups.keys()].sort();
    for (const venue of sortedVenues) {
        const items = venueGroups.get(venue);
        d.write('<div class="venue-section">');
        d.write('<div class="print-header"><h1>' + eventName + '</h1><h2>柔术对阵表</h2></div>');
        d.write('<div class="venue-title"><img class="venue-logo" src="' + window.location.origin + '/images/logo.png">' + venue + '场地</div>');
        d.write('<table>');
        d.write('<thead><tr><th>场次</th><th>轮次</th><th class="red-col">红方</th><th>代表队</th><th>VS</th><th class="blue-col">蓝方</th><th>代表队</th><th>级别</th></tr></thead>');
        d.write('<tbody>');
        items.forEach(item => {
            d.write('<tr>');
            d.write('<td>' + item.matchNo + '</td>');
            d.write('<td>' + item.round + '</td>');
            d.write('<td class="red-col name-col">' + item.red + '</td>');
            d.write('<td>' + item.redUnit + '</td>');
            d.write('<td class="vs-col">VS</td>');
            d.write('<td class="blue-col name-col">' + item.blue + '</td>');
            d.write('<td>' + item.blueUnit + '</td>');
            d.write('<td>' + item.weightClass + '</td>');
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
