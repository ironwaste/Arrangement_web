let _poomsaeScheduleData = [];
let _poomsaeTable1Rows = [];
let _poomsaeTable2Rows = [];
let _poomsaeTable1FilterCol = -1;
let _poomsaeTable1FilterVal = '';
let _poomsaeTable2FilterCol = -1;
let _poomsaeTable2FilterVal = '';

async function loadPoomsaeMatches() {
    const body1 = document.getElementById('poomsaeMatchesTable1Body');
    const body2 = document.getElementById('poomsaeMatchesTable2Body');
    if (!body1 || !body2) return;
    body1.innerHTML = '';
    body2.innerHTML = '';
    _poomsaeTable1Rows = [];
    _poomsaeTable2Rows = [];
    _poomsaeScheduleData = [];

    if (!currentEventId) {
        body1.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#909399;padding:40px 0;">请先在「赛事列表」中选择一个赛事</td></tr>';
        body2.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#909399;padding:40px 0;">请先在「赛事列表」中选择一个赛事</td></tr>';
        return;
    }

    try {
        let url = `${API_BASE}/poomsae-schedule?event_id=${currentEventId}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (!data.success) {
            body1.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#f56c6c;padding:40px 0;">加载赛程数据失败</td></tr>';
            body2.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#f56c6c;padding:40px 0;">加载赛程数据失败</td></tr>';
            return;
        }

        _poomsaeScheduleData = data.data || [];

        if (_poomsaeScheduleData.length === 0) {
            body1.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#909399;padding:40px 0;"><div style="font-size:48px;margin-bottom:16px;">📅</div><div>暂无品势赛程数据</div><div style="font-size:12px;">请先在品势编排中生成赛程</div></td></tr>';
            body2.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#909399;padding:40px 0;"><div style="font-size:48px;margin-bottom:16px;">📅</div><div>暂无品势赛程数据</div><div style="font-size:12px;">请先在品势编排中生成赛程</div></td></tr>';
            return;
        }

        updatePoomsaeMatchVenueFilters(_poomsaeScheduleData);

        let filtered = _poomsaeScheduleData;

        let lastClassKey = '';
        let lastRound = -1;
        filtered.forEach(match => {
            const classKey = [match.poomsae_type, match.gender, match.group_class, match.weight_class].join('|');
            const matchRound = match.round || 1;
            const matchRoundLabel = match.round_label || '决赛';

            const needRoundSep = matchRound !== lastRound && lastRound !== -1;
            const needClassSep = classKey !== lastClassKey && lastClassKey !== '';

            if (needRoundSep || needClassSep) {
                const sepTr1 = document.createElement('tr');
                sepTr1.innerHTML = '<td colspan="14" style="padding:2px 0;background:#409eff;"></td>';
                _poomsaeTable1Rows.push(sepTr1);
                const sepTr2 = document.createElement('tr');
                sepTr2.innerHTML = '<td colspan="14" style="padding:2px 0;background:#409eff;"></td>';
                _poomsaeTable2Rows.push(sepTr2);
            }

            const statusLabel = match.status === 'done' ? '已完成' : (match.status === 'playing' ? '比赛中' : '待比赛');
            const statusClass = match.status === 'done' ? 'status-finished' : (match.status === 'playing' ? 'status-active' : 'status-pending');
            const accDisplay = match.accuracy_avg != null ? match.accuracy_avg.toFixed(2) : '-';
            const presDisplay = match.presentation_avg != null ? match.presentation_avg.toFixed(2) : '-';
            const totalDisplay = match.final_score != null ? match.final_score.toFixed(2) : '-';

            const rowHtml = `
                <td>${match.venue}</td>
                <td>${match.display_num}</td>
                <td>${matchRoundLabel}</td>
                <td>${match.poomsae_type}</td>
                <td>${match.gender}</td>
                <td>${match.group_class}</td>
                <td>${match.weight_class}</td>
                <td>${match.draw_no || '-'}</td>
                <td>${match.athlete_name}</td>
                <td style="text-align:left;">${match.athlete_unit || ''}</td>
                <td>${match.routine || ''}</td>
                <td onclick="openPoomsaeScoreModal(${match.id})" style="cursor:pointer;padding:3px 2px;overflow:visible;">
                    <div style="display:flex;gap:2px;justify-content:center;">
                        <div style="font-size:11px;padding:1px 4px;border:1px solid #e6a23c;border-radius:2px;background:#fdf6ec;color:#e6a23c;text-align:center;white-space:nowrap;">准 ${accDisplay}</div>
                        <div style="font-size:11px;padding:1px 4px;border:1px solid #67c23a;border-radius:2px;background:#f0f9eb;color:#67c23a;text-align:center;white-space:nowrap;">表 ${presDisplay}</div>
                    </div>
                </td>
                <td style="font-weight:bold;color:#409eff;font-size:13px;">${totalDisplay}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            `;

            const tr1 = document.createElement('tr');
            tr1.dataset.matchId = match.id;
            tr1.dataset.matchType = 'poomsae-schedule';
            tr1.innerHTML = rowHtml;
            _poomsaeTable1Rows.push(tr1);

            const tr2 = document.createElement('tr');
            tr2.dataset.matchId = match.id;
            tr2.dataset.matchType = 'poomsae-schedule';
            tr2.innerHTML = rowHtml;
            _poomsaeTable2Rows.push(tr2);

            lastClassKey = classKey;
            lastRound = matchRound;
        });

        renderPoomsaeTable(1);
        renderPoomsaeTable(2);

    } catch (e) {
        console.error('加载品势赛程失败:', e);
        body1.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#f56c6c;padding:40px 0;">加载赛程数据失败</td></tr>';
        body2.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#f56c6c;padding:40px 0;">加载赛程数据失败</td></tr>';
    }
}

function renderPoomsaeTable(tableNum) {
    const bodyId = tableNum === 1 ? 'poomsaeMatchesTable1Body' : 'poomsaeMatchesTable2Body';
    const rows = tableNum === 1 ? _poomsaeTable1Rows : _poomsaeTable2Rows;
    const filterCol = tableNum === 1 ? _poomsaeTable1FilterCol : _poomsaeTable2FilterCol;
    const filterVal = tableNum === 1 ? _poomsaeTable1FilterVal : _poomsaeTable2FilterVal;
    const venueSelectId = tableNum === 1 ? 'poomsaeMatchFilterVenue1' : 'poomsaeMatchFilterVenue2';
    const venueVal = document.getElementById(venueSelectId) ? document.getElementById(venueSelectId).value : '';

    const tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    let filteredRows = [...rows];

    if (venueVal) {
        filteredRows = filteredRows.filter(tr => {
            const td = tr.querySelectorAll('td')[0];
            return td && td.textContent.trim() === venueVal;
        });
    }

    if (filterCol >= 0 && filterVal !== '') {
        filteredRows = filteredRows.filter(tr => {
            const td = tr.querySelectorAll('td')[filterCol];
            return td && td.textContent.trim() === filterVal;
        });
    }

    if (filteredRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#909399;padding:40px 0;">无匹配数据</td></tr>';
        return;
    }

    filteredRows.forEach(tr => tbody.appendChild(tr.cloneNode(true)));
}

function handlePoomsaeFilterClick(e) {
    const arrow = e.target.closest('.filter-arrow');
    if (!arrow) return;
    e.stopPropagation();
    const th = arrow.closest('.filterable');
    if (!th) return;
    const tableNum = parseInt(th.getAttribute('data-table'));
    const col = parseInt(th.getAttribute('data-col'));

    closePoomsaeFilterMenu();

    const rows = tableNum === 1 ? _poomsaeTable1Rows : _poomsaeTable2Rows;

    const values = new Set();
    rows.forEach(tr => {
        const td = tr.querySelectorAll('td')[col];
        if (td) {
            const v = td.textContent.trim();
            if (v) values.add(v);
        }
    });

    const currentFilterCol = tableNum === 1 ? _poomsaeTable1FilterCol : _poomsaeTable2FilterCol;
    const currentFilterVal = tableNum === 1 ? _poomsaeTable1FilterVal : _poomsaeTable2FilterVal;

    const rect = arrow.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'poomsaeFilterMenu';
    menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.bottom + 'px;background:#fff;border:1px solid #dcdfe6;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:10000;min-width:120px;max-height:260px;overflow-y:auto;padding:4px 0;';

    const allItem = document.createElement('div');
    allItem.textContent = '全部';
    allItem.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;border-bottom:1px solid #f0f0f0;';
    if (currentFilterCol !== col || currentFilterVal === '') {
        allItem.style.color = '#409EFF';
        allItem.style.fontWeight = 'bold';
    }
    allItem.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
    allItem.addEventListener('mouseleave', function() { this.style.background = ''; });
    allItem.addEventListener('click', function(ev) {
        ev.stopPropagation();
        if (tableNum === 1) { _poomsaeTable1FilterCol = -1; _poomsaeTable1FilterVal = ''; }
        else { _poomsaeTable2FilterCol = -1; _poomsaeTable2FilterVal = ''; }
        const tableId = tableNum === 1 ? 'poomsaeMatchesTable1' : 'poomsaeMatchesTable2';
        document.querySelectorAll('#' + tableId + ' .filterable .filter-arrow').forEach(a => { a.textContent = '▼'; });
        arrow.textContent = '▼';
        closePoomsaeFilterMenu();
        renderPoomsaeTable(tableNum);
    });
    menu.appendChild(allItem);

    [...values].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(val => {
        const item = document.createElement('div');
        item.textContent = val;
        item.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;';
        if (currentFilterCol === col && currentFilterVal === val) {
            item.style.color = '#409EFF';
            item.style.fontWeight = 'bold';
        }
        item.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
        item.addEventListener('mouseleave', function() { this.style.background = ''; });
        item.addEventListener('click', function(ev) {
            ev.stopPropagation();
            if (tableNum === 1) { _poomsaeTable1FilterCol = col; _poomsaeTable1FilterVal = val; }
            else { _poomsaeTable2FilterCol = col; _poomsaeTable2FilterVal = val; }
            const tableId = tableNum === 1 ? 'poomsaeMatchesTable1' : 'poomsaeMatchesTable2';
            document.querySelectorAll('#' + tableId + ' .filterable .filter-arrow').forEach(a => { a.textContent = '▼'; });
            arrow.textContent = '✓';
            closePoomsaeFilterMenu();
            renderPoomsaeTable(tableNum);
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', closePoomsaeFilterMenu, { once: true });
    }, 0);
}

function closePoomsaeFilterMenu() {
    const m = document.getElementById('poomsaeFilterMenu');
    if (m) m.remove();
}

function resetPoomsaeMatchFilter() {
    const v1 = document.getElementById('poomsaeMatchFilterVenue1');
    const v2 = document.getElementById('poomsaeMatchFilterVenue2');
    if (v1) v1.value = '';
    if (v2) v2.value = '';
    _poomsaeTable1FilterCol = -1;
    _poomsaeTable1FilterVal = '';
    _poomsaeTable2FilterCol = -1;
    _poomsaeTable2FilterVal = '';
    document.querySelectorAll('#poomsaeMatchesTable1 .filterable .filter-arrow, #poomsaeMatchesTable2 .filterable .filter-arrow').forEach(a => { a.textContent = '▼'; });
    loadPoomsaeMatches();
}

function updatePoomsaeMatchVenueFilters(scheduleData) {
    const venues = new Set();
    scheduleData.forEach(m => venues.add(m.venue));
    const sortedVenues = Array.from(venues).sort();

    ['poomsaeMatchFilterVenue1', 'poomsaeMatchFilterVenue2'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">全部场地</option>';
        sortedVenues.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = '场地 ' + v;
            select.appendChild(opt);
        });
        select.value = currentVal;
    });
}

async function openPoomsaeScoreModal(matchId) {
    const match = _poomsaeScheduleData.find(m => m.id === matchId);
    if (!match) return;

    document.getElementById('poomsaeScoreMatchId').value = matchId;
    document.getElementById('poomsaeScoreAthleteName').textContent = match.athlete_name || '-';
    document.getElementById('poomsaeScoreAthleteUnit').textContent = match.athlete_unit || '-';
    document.getElementById('poomsaeScoreClass').textContent = (match.gender || '') + (match.group_class || '') + (match.weight_class || '');

    const globalJudgeCount = document.getElementById('poomsaeJudgeCount').value;
    document.getElementById('poomsaeScoreJudgeCount').value = globalJudgeCount;

    document.getElementById('poomsaeScoreSummary').style.display = 'none';

    try {
        const resp = await fetch(`${API_BASE}/poomsae-scores/${matchId}`);
        const result = await resp.json();
        const existingScores = result.success ? (result.data || []) : [];

        buildPoomsaeScoreForm(existingScores);
    } catch (e) {
        buildPoomsaeScoreForm([]);
    }

    document.getElementById('poomsaeScoreModal').style.display = 'flex';
}

function closePoomsaeScoreModal() {
    document.getElementById('poomsaeScoreModal').style.display = 'none';
}

function buildPoomsaeScoreForm(existingScores) {
    const judgeCount = parseInt(document.getElementById('poomsaeScoreJudgeCount').value);
    const tbody = document.getElementById('poomsaeScoreFormBody');
    tbody.innerHTML = '';

    for (let i = 1; i <= judgeCount; i++) {
        const existing = existingScores.find(s => s.judge_no === i);
        const acc = existing ? existing.accuracy : '';
        const pres = existing ? existing.presentation : '';
        const total = existing ? existing.total : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;font-weight:bold;">裁判${i}</td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">
                <input type="number" step="0.1" min="0" max="4" value="${acc}" data-judge="${i}" data-type="accuracy"
                    oninput="calcPoomsaeRowTotal(this)"
                    style="width:70px;padding:4px 6px;border:1px solid #dcdfe6;border-radius:3px;font-size:13px;text-align:center;">
            </td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">
                <input type="number" step="0.1" min="0" max="6" value="${pres}" data-judge="${i}" data-type="presentation"
                    oninput="calcPoomsaeRowTotal(this)"
                    style="width:70px;padding:4px 6px;border:1px solid #dcdfe6;border-radius:3px;font-size:13px;text-align:center;">
            </td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;font-weight:bold;" class="poomsae-row-total">${total ? total.toFixed(1) : '-'}</td>
        `;
        tbody.appendChild(tr);
    }

    calcPoomsaeFinalScore();
}

function calcPoomsaeRowTotal(input) {
    const tr = input.closest('tr');
    const accInput = tr.querySelector('input[data-type="accuracy"]');
    const presInput = tr.querySelector('input[data-type="presentation"]');
    const totalCell = tr.querySelector('.poomsae-row-total');

    const acc = parseFloat(accInput.value) || 0;
    const pres = parseFloat(presInput.value) || 0;

    if (acc < 0) accInput.value = 0;
    if (acc > 4) accInput.value = 4;
    if (pres < 0) presInput.value = 0;
    if (pres > 6) presInput.value = 6;

    const total = (parseFloat(accInput.value) || 0) + (parseFloat(presInput.value) || 0);
    totalCell.textContent = total > 0 ? total.toFixed(1) : '-';

    calcPoomsaeFinalScore();
}

function calcPoomsaeFinalScore() {
    const judgeCount = parseInt(document.getElementById('poomsaeScoreJudgeCount').value);
    const accList = [];
    const presList = [];
    const totals = [];

    for (let i = 1; i <= judgeCount; i++) {
        const accInput = document.querySelector(`input[data-judge="${i}"][data-type="accuracy"]`);
        const presInput = document.querySelector(`input[data-judge="${i}"][data-type="presentation"]`);
        if (accInput && presInput) {
            const acc = parseFloat(accInput.value) || 0;
            const pres = parseFloat(presInput.value) || 0;
            if (acc > 0 || pres > 0) {
                accList.push(acc);
                presList.push(pres);
                totals.push(acc + pres);
            }
        }
    }

    const accAvgEl = document.getElementById('poomsaeAccAvg');
    const presAvgEl = document.getElementById('poomsaePresAvg');
    const totalAvgEl = document.getElementById('poomsaeTotalAvg');
    const summaryDiv = document.getElementById('poomsaeScoreSummary');
    const maxEl = document.getElementById('poomsaeScoreMax');
    const minEl = document.getElementById('poomsaeScoreMin');
    const finalEl = document.getElementById('poomsaeScoreFinal');

    if (totals.length === 0) {
        accAvgEl.textContent = '-';
        presAvgEl.textContent = '-';
        totalAvgEl.textContent = '-';
        summaryDiv.style.display = 'none';
        return;
    }

    summaryDiv.style.display = '';

    function trimAvg(arr, jc) {
        if (arr.length === 0) return 0;
        if (jc <= 3 || arr.length <= 3) {
            return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
        }
        const sorted = [...arr].sort((a, b) => a - b);
        const trim = Math.floor((jc - 3) / 2);
        const middle = sorted.slice(trim, sorted.length - trim);
        return Math.round((middle.reduce((a, b) => a + b, 0) / middle.length) * 100) / 100;
    }

    const accAvg = trimAvg(accList, judgeCount);
    const presAvg = trimAvg(presList, judgeCount);
    const totalAvg = trimAvg(totals, judgeCount);

    accAvgEl.textContent = accAvg.toFixed(2);
    presAvgEl.textContent = presAvg.toFixed(2);
    totalAvgEl.textContent = totalAvg.toFixed(2);

    if (judgeCount <= 3) {
        maxEl.textContent = '-';
        minEl.textContent = '-';
    } else {
        const sorted = [...totals].sort((a, b) => a - b);
        maxEl.textContent = sorted[sorted.length - 1].toFixed(1);
        minEl.textContent = sorted[0].toFixed(1);
    }
    finalEl.textContent = totalAvg.toFixed(2);
}

async function savePoomsaeScore() {
    const matchId = document.getElementById('poomsaeScoreMatchId').value;
    const judgeCount = parseInt(document.getElementById('poomsaeScoreJudgeCount').value);

    const scores = [];
    for (let i = 1; i <= judgeCount; i++) {
        const accInput = document.querySelector(`input[data-judge="${i}"][data-type="accuracy"]`);
        const presInput = document.querySelector(`input[data-judge="${i}"][data-type="presentation"]`);
        if (accInput && presInput) {
            const acc = parseFloat(accInput.value) || 0;
            const pres = parseFloat(presInput.value) || 0;
            scores.push({ judge_no: i, accuracy: acc, presentation: pres });
        }
    }

    const allEmpty = scores.every(s => s.accuracy === 0 && s.presentation === 0);
    if (allEmpty) {
        alert('请至少填写一位裁判的评分');
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/poomsae-scores/${matchId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scores, judge_count: judgeCount })
        });
        const result = await resp.json();
        if (result.success) {
            alert(`评分保存成功！最终得分：${result.data.final_score.toFixed(2)}`);
            closePoomsaeScoreModal();
            loadPoomsaeMatches();
        } else {
            alert('保存失败：' + result.error);
        }
    } catch (e) {
        alert('保存失败：' + e.message);
    }
}

function showPoomsaePrintDialog() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const venueSelect = document.getElementById('poomsaePrintVenue');
    const venues = new Set();
    _poomsaeScheduleData.forEach(m => venues.add(m.venue));
    venueSelect.innerHTML = '<option value="">全部场地</option>';
    Array.from(venues).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = '场地 ' + v;
        venueSelect.appendChild(opt);
    });

    document.getElementById('poomsaePrintFrom').value = '';
    document.getElementById('poomsaePrintTo').value = '';
    document.getElementById('poomsaePrintDialog').style.display = 'flex';
}

function closePoomsaePrintDialog() {
    document.getElementById('poomsaePrintDialog').style.display = 'none';
}

function doPoomsaePrint() {
    const venue = document.getElementById('poomsaePrintVenue').value;
    const from = parseInt(document.getElementById('poomsaePrintFrom').value) || 0;
    const to = parseInt(document.getElementById('poomsaePrintTo').value) || 0;

    let data = [..._poomsaeScheduleData];
    if (venue) data = data.filter(m => m.venue === venue);
    if (from > 0) data = data.filter(m => m.display_num >= from);
    if (to > 0) data = data.filter(m => m.display_num <= to);

    if (data.length === 0) {
        alert('没有可打印的数据');
        return;
    }

    const venueGroups = new Map();
    data.forEach(m => {
        if (!venueGroups.has(m.venue)) venueGroups.set(m.venue, []);
        venueGroups.get(m.venue).push(m);
    });

    const eventName = currentEventName || '';
    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 品势赛程表</title>');
    d.write('<style>');
    d.write('@page { size: A4 portrait; margin: 12mm 8mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 0; margin: 0; font-size: 10pt; }');
    d.write('.print-header { text-align: center; padding: 8px 0 12px; border-bottom: 2px solid #000; margin-bottom: 12px; }');
    d.write('.print-header h1 { font-size: 18pt; font-weight: bold; letter-spacing: 4px; margin: 0 0 4px; }');
    d.write('.print-header h2 { font-size: 14pt; font-weight: bold; margin: 0; }');
    d.write('.venue-section { margin-bottom: 20px; }');
    d.write('.venue-title { font-size: 12pt; font-weight: bold; text-align: center; margin: 12px 0 6px; padding: 4px 0; border-bottom: 1px solid #333; }');
    d.write('table { width: 100%; border-collapse: collapse; }');
    d.write('th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; font-size: 9pt; white-space: nowrap; }');
    d.write('th { background: #f0f0f0; font-weight: bold; font-size: 9pt; }');
    d.write('.level-header td { background: #ecf5ff; font-weight: bold; text-align: left; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .venue-section { page-break-inside: auto; } }');
    d.write('</style></head><body>');

    const sortedVenues = [...venueGroups.keys()].sort();
    for (const v of sortedVenues) {
        const items = venueGroups.get(v);
        d.write('<div class="venue-section">');
        d.write('<div class="print-header"><h1>' + eventName + '</h1><h2>品势赛程表</h2></div>');
        d.write('<div class="venue-title">场地 ' + v + '</div>');
        d.write('<table>');
        d.write('<thead><tr><th>场次</th><th>轮次</th><th>品势类型</th><th>性别</th><th>组别</th><th>级别</th><th>签号</th><th>姓名</th><th>代表队</th><th>表演套路</th></tr></thead>');
        d.write('<tbody>');

        let lastClassKey = '';
        items.forEach(m => {
            const classKey = [m.poomsae_type, m.gender, m.group_class, m.weight_class].join('|');
            if (classKey !== lastClassKey) {
                d.write('<tr class="level-header"><td colspan="10">' + (m.round_label || '决赛') + ' - ' + m.poomsae_type + '品势 - ' + m.gender + m.group_class + m.weight_class + '</td></tr>');
                lastClassKey = classKey;
            }
            d.write('<tr>');
            d.write('<td>' + m.display_num + '</td>');
            d.write('<td>' + (m.round_label || '决赛') + '</td>');
            d.write('<td>' + m.poomsae_type + '</td>');
            d.write('<td>' + m.gender + '</td>');
            d.write('<td>' + m.group_class + '</td>');
            d.write('<td>' + m.weight_class + '</td>');
            d.write('<td>' + (m.draw_no || '-') + '</td>');
            d.write('<td>' + m.athlete_name + '</td>');
            d.write('<td>' + (m.athlete_unit || '') + '</td>');
            d.write('<td>' + (m.routine || '') + '</td>');
            d.write('</tr>');
        });

        d.write('</tbody></table>');
        d.write('</div>');
    }

    d.write('</body></html>');
    d.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);

    closePoomsaePrintDialog();
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('#poomsaeMatchesTable1 thead, #poomsaeMatchesTable2 thead').forEach(thead => {
        thead.addEventListener('click', handlePoomsaeFilterClick);
    });
});


