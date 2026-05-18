// 团体总分统计

let _allTeamScoreRows = [];
let _teamScoreFilterCol = -1;
let _teamScoreFilterVal = '';

async function loadTeamScores() {
    loadTeamScoresData();
    loadActiveRuleDisplay();
}

async function loadTeamScoresData() {
    const url = '/api/stats/team-scores';
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            console.error('加载团体总分失败:', result.error);
            return;
        }
        
        renderTeamScores(result.data);
        renderScoreStats(result.data);
    } catch (err) {
        console.error('加载团体总分错误:', err);
    }
}

function renderScoreStats(data) {
    if (!data || data.length === 0) {
        document.getElementById('scoreStats').innerHTML = '<div style="text-align: center; color: #909399; padding: 20px;">暂无数据</div>';
        return;
    }
    
    const totalGold = data.reduce((sum, d) => sum + (d.gold || 0), 0);
    const totalSilver = data.reduce((sum, d) => sum + (d.silver || 0), 0);
    const totalBronze = data.reduce((sum, d) => sum + (d.bronze || 0), 0);
    const totalScore = data.reduce((sum, d) => sum + (d.total_score || 0), 0);
    
    document.getElementById('scoreStats').innerHTML = `
        <div class="stat-card">
            <div class="stat-icon red">🥇</div>
            <div class="stat-info">
                <div class="stat-value">${totalGold}</div>
                <div class="stat-label">金牌总数</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon orange">🥈</div>
            <div class="stat-info">
                <div class="stat-value">${totalSilver}</div>
                <div class="stat-label">银牌总数</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon blue">🥉</div>
            <div class="stat-info">
                <div class="stat-value">${totalBronze}</div>
                <div class="stat-label">铜牌总数</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon green">🏆</div>
            <div class="stat-info">
                <div class="stat-value">${totalScore.toFixed(1)}</div>
                <div class="stat-label">总分</div>
            </div>
        </div>
    `;
}

function renderTeamScores(data) {
    const tbody = document.querySelector('#teamScoresTable tbody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #909399;">暂无数据</td></tr>';
        _allTeamScoreRows = [];
        return;
    }
    
    _allTeamScoreRows = data.map((item, index) => ({
        rank: index + 1,
        unit: item.unit || '',
        group_class: item.group_class || '',
        gold: item.gold || 0,
        silver: item.silver || 0,
        bronze: item.bronze || 0,
        fourth: item.fourth || 0,
        fifth: item.fifth || 0,
        total_score: (item.total_score || 0).toFixed(1),
        athlete_count: item.athlete_count || 0
    }));

    _renderFilteredTeamScores();
}

function _renderFilteredTeamScores() {
    const tbody = document.querySelector('#teamScoresTable tbody');
    tbody.innerHTML = '';

    let rows = [..._allTeamScoreRows];
    if (_teamScoreFilterCol >= 0 && _teamScoreFilterVal !== '') {
        rows = rows.filter(item => {
            const keys = ['rank', 'unit', 'group_class', 'gold', 'silver', 'bronze', 'fourth', 'fifth', 'total_score', 'athlete_count'];
            const val = String(item[keys[_teamScoreFilterCol]]);
            return val === _teamScoreFilterVal;
        });
    }

    rows.forEach(item => {
        const index = item.rank - 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong style="color: ${index < 3 ? '#f56c6c' : '#606266'};">${item.rank}</strong></td>
            <td><strong>${item.unit}</strong></td>
            <td>${item.group_class}</td>
            <td style="text-align: center;"><span style="color: #f56c6c; font-weight: bold;">${item.gold}</span></td>
            <td style="text-align: center;"><span style="color: #e6a23c; font-weight: bold;">${item.silver}</span></td>
            <td style="text-align: center;"><span style="color: #409EFF; font-weight: bold;">${item.bronze}</span></td>
            <td style="text-align: center;">${item.fourth}</td>
            <td style="text-align: center;">${item.fifth}</td>
            <td style="text-align: center;"><strong style="color: #67c23a; font-size: 16px;">${item.total_score}</strong></td>
            <td style="text-align: center;">${item.athlete_count}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportTeamScores() {
    downloadFile('/api/stats/all-results/export');
}

async function downloadResultBook() {
    try {
        const customSections = collectCustomSections();
        const resp = await fetch('/api/stats/result-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ custom_sections: customSections })
        });
        if (!resp.ok) { alert('下载失败'); return; }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disposition = resp.headers.get('Content-Disposition');
        let filename = '总成绩册.xlsx';
        if (disposition) {
            const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;\n]+)/i);
            if (match) filename = decodeURIComponent(match[1]);
        }
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        closeResultBookModal();
    } catch (err) {
        alert('下载失败: ' + err.message);
    }
}

let customSectionCount = 0;

function openResultBookModal() {
    document.getElementById('resultBookModal').style.display = 'flex';
    document.getElementById('customSections').innerHTML = '';
    customSectionCount = 0;
    addCustomSection('优秀运动队', 'grid');
    addCustomSection('体育道德风尚奖', 'grid');
    addCustomSection('男子品势最佳技术奖', 'pair');
    addCustomSection('女子品势最佳技术奖', 'pair');
    addCustomSection('男子竞技最佳技术奖', 'pair');
    addCustomSection('女子竞技最佳技术奖', 'pair');
    addCustomSection('优秀裁判员', 'grid');
    addCustomSection('优秀教练员', 'pair');
    addCustomSection('精英奖运动员', 'pair');
}

function closeResultBookModal() {
    document.getElementById('resultBookModal').style.display = 'none';
}

function addCustomSection(title, type) {
    customSectionCount++;
    const id = customSectionCount;
    const container = document.getElementById('customSections');
    const div = document.createElement('div');
    div.id = 'section_' + id;
    div.style.cssText = 'border:1px solid #dcdfe6;border-radius:6px;padding:12px;margin-bottom:10px;background:#fafafa;';
    
    const typeOptions = `
        <option value="grid" ${type === 'grid' ? 'selected' : ''}>名单网格（如：优秀运动队）</option>
        <option value="pair" ${type === 'pair' ? 'selected' : ''}>姓名+单位配对（如：最佳技术奖）</option>
    `;
    
    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="text" class="section-title" value="${title || ''}" placeholder="区块标题" style="flex:1;padding:6px 10px;border:1px solid #dcdfe6;border-radius:4px;font-size:13px;font-weight:bold;">
            <select class="section-type" onchange="onSectionTypeChange(${id})" style="padding:6px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">${typeOptions}</select>
            <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="removeCustomSection(${id})">✕</button>
        </div>
        <div class="section-content" id="section_content_${id}"></div>
        <div style="margin-top:6px;display:flex;gap:6px;">
            <button class="btn btn-default" style="padding:3px 8px;font-size:11px;" onclick="addSectionRow(${id})">➕ 添加行</button>
        </div>
    `;
    container.appendChild(div);
    
    if (type === 'grid') {
        addSectionGridRow(id);
    } else {
        addSectionPairRow(id);
    }
}

function onSectionTypeChange(id) {
    const section = document.getElementById('section_' + id);
    const type = section.querySelector('.section-type').value;
    const content = document.getElementById('section_content_' + id);
    content.innerHTML = '';
    if (type === 'grid') {
        addSectionGridRow(id);
    } else {
        addSectionPairRow(id);
    }
}

function addSectionGridRow(id) {
    const content = document.getElementById('section_content_' + id);
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.cssText = 'display:flex;gap:6px;margin-bottom:4px;align-items:center;';
    row.innerHTML = `
        <input type="text" placeholder="名称1" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="名称2" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="名称3" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="名称4" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="this.parentElement.remove()">✕</button>
    `;
    content.appendChild(row);
}

function addSectionPairRow(id) {
    const content = document.getElementById('section_content_' + id);
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.style.cssText = 'display:flex;gap:6px;margin-bottom:4px;align-items:center;';
    row.innerHTML = `
        <input type="text" placeholder="姓名" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="单位" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="姓名" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <input type="text" placeholder="单位" style="flex:1;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;">
        <button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="this.parentElement.remove()">✕</button>
    `;
    content.appendChild(row);
}

function addSectionRow(id) {
    const section = document.getElementById('section_' + id);
    const type = section.querySelector('.section-type').value;
    if (type === 'grid') {
        addSectionGridRow(id);
    } else {
        addSectionPairRow(id);
    }
}

function removeCustomSection(id) {
    const el = document.getElementById('section_' + id);
    if (el) el.remove();
}

function collectCustomSections() {
    const sections = [];
    const sectionEls = document.querySelectorAll('#customSections > div');
    sectionEls.forEach(el => {
        const title = el.querySelector('.section-title').value.trim();
        const type = el.querySelector('.section-type').value;
        if (!title) return;
        const items = [];
        if (type === 'grid') {
            const rows = el.querySelectorAll('.grid-row');
            rows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                const rowItems = [];
                inputs.forEach(inp => {
                    const v = inp.value.trim();
                    if (v) rowItems.push(v);
                });
                if (rowItems.length > 0) items.push(rowItems);
            });
        } else {
            const rows = el.querySelectorAll('.pair-row');
            rows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                const pairs = [];
                for (let i = 0; i < inputs.length; i += 2) {
                    const name = inputs[i] ? inputs[i].value.trim() : '';
                    const unit = inputs[i + 1] ? inputs[i + 1].value.trim() : '';
                    if (name || unit) pairs.push({ name, unit });
                }
                if (pairs.length > 0) items.push(pairs);
            });
        }
        if (items.length > 0) {
            sections.push({ title, type, items });
        }
    });
    return sections;
}

const rankLabels = ['第1名', '第2名', '第3名', '第4名', '第5名', '第6名', '第7名', '第8名'];
const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
const rankColors = ['#c6930a', '#757575', '#8d6e63', '#388e3c', '#607d8b', '#5c6bc0', '#ab47bc', '#ef6c00'];
const rankBgStyles = [
    'background:linear-gradient(135deg,#fff8e1,#ffe082);border:1px solid #ffd54f;',
    'background:linear-gradient(135deg,#f5f5f5,#e0e0e0);border:1px solid #bdbdbd;',
    'background:linear-gradient(135deg,#efebe9,#d7ccc8);border:1px solid #bcaaa4;',
    'background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border:1px solid #a5d6a7;',
    'background:linear-gradient(135deg,#eceff1,#cfd8dc);border:1px solid #b0bec5;',
    'background:linear-gradient(135deg,#e8eaf6,#c5cae9);border:1px solid #9fa8da;',
    'background:linear-gradient(135deg,#f3e5f5,#e1bee7);border:1px solid #ce93d8;',
    'background:linear-gradient(135deg,#fff3e0,#ffe0b2);border:1px solid #ffcc80;'
];
const rankLabelColors = ['#8d6e00', '#616161', '#6d4c41', '#2e7d32', '#546e7a', '#3949ab', '#7b1fa2', '#e65100'];

let currentRanks = [1, 2, 3, 3, 5, 5, 5, 5];
let currentRankScores = { 1: 9, 2: 7, 3: 5.5, 5: 2.5 };

const presetRules = {
    '1,2,3,3,5,5,5,5': { ranks: [1, 2, 3, 3, 5, 5, 5, 5], rank_scores: { 1: 9, 2: 7, 3: 5.5, 5: 2.5 } },
    '1-8': { ranks: [1, 2, 3, 4, 5, 6, 7, 8], rank_scores: { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 } },
    '1,2,3,4': { ranks: [1, 2, 3, 4], rank_scores: { 1: 9, 2: 7, 3: 5.5, 4: 4 } },
    '1,2,2,3,3,3': { ranks: [1, 2, 2, 3, 3, 3], rank_scores: { 1: 9, 2: 5, 3: 3 } }
};

function showRuleModal() {
    document.getElementById('ruleModal').style.display = 'flex';
    document.getElementById('ruleName').value = '';
    document.getElementById('rulePreset').value = '';
    currentRanks = [1, 2, 3, 3, 5, 5, 5, 5];
    currentRankScores = { 1: 9, 2: 7, 3: 5.5, 5: 2.5 };
    renderRuleUI();
    loadSavedRules();
}

function closeRuleModal() {
    document.getElementById('ruleModal').style.display = 'none';
}

function applyRulePreset() {
    const val = document.getElementById('rulePreset').value;
    if (!val) return;
    const preset = presetRules[val];
    if (preset) {
        currentRanks = [...preset.ranks];
        currentRankScores = { ...preset.rank_scores };
    }
    renderRuleUI();
}

function renderRuleUI() {
    const rankContainer = document.getElementById('rankPatternDisplay');
    const uniqueRanks = [...new Set(currentRanks)].sort((a, b) => a - b);
    rankContainer.innerHTML = currentRanks.map((r, i) => {
        const count = currentRanks.filter(x => x === r).length;
        return `<span style="display:inline-block;padding:4px 8px;margin:2px;border-radius:4px;${rankBgStyles[r - 1] || ''}color:${rankLabelColors[r - 1] || '#606266'};font-size:12px;font-weight:bold;">第${r}名</span>`;
    }).join('');

    const scoreContainer = document.getElementById('scoreInputs');
    scoreContainer.innerHTML = '';
    uniqueRanks.forEach(rank => {
        const count = currentRanks.filter(x => x === rank).length;
        const countText = count > 1 ? `（${count}人并列）` : '';
        scoreContainer.innerHTML += `
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;min-width:80px;color:${rankLabelColors[rank - 1] || '#606266'};">第${rank}名${countText}</span>
                <input type="number" step="0.5" value="${currentRankScores[rank] || 0}" onchange="updateRankScore(${rank}, this.value)" style="flex:1;padding:6px;border:1px solid #dcdfe6;border-radius:4px;font-size:13px;">
                <span style="font-size:11px;color:#909399;">分</span>
            </div>
        `;
    });
    updateRulePreview();
}

function updateRankScore(rank, value) {
    currentRankScores[rank] = parseFloat(value) || 0;
    updateRulePreview();
}

function addRankPosition() {
    const lastRank = currentRanks[currentRanks.length - 1] || 1;
    currentRanks.push(lastRank);
    if (!currentRankScores[lastRank]) currentRankScores[lastRank] = 0;
    renderRuleUI();
}

function removeRankPosition() {
    if (currentRanks.length > 1) {
        currentRanks.pop();
        const uniqueRanks = [...new Set(currentRanks)].sort((a, b) => a - b);
        Object.keys(currentRankScores).forEach(k => {
            if (!uniqueRanks.includes(parseInt(k))) delete currentRankScores[k];
        });
        renderRuleUI();
    }
}

function updateRulePreview() {
    const uniqueRanks = [...new Set(currentRanks)].sort((a, b) => a - b);
    const preview = uniqueRanks.map(r => {
        const count = currentRanks.filter(x => x === r).length;
        const countText = count > 1 ? `×${count}` : '';
        return `第${r}名${countText}:${currentRankScores[r] || 0}分`;
    }).join('，');
    document.getElementById('rulePreview').textContent = preview;
}

async function saveRule() {
    const ruleName = document.getElementById('ruleName').value.trim();
    if (!ruleName) { alert('请输入规则名称'); return; }
    if (currentRanks.length === 0) { alert('请设置至少一个名次'); return; }

    try {
        const resp = await fetch(API_BASE + '/score-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: null,
                rule_name: ruleName,
                rule_type: document.getElementById('rulePreset').value || 'custom',
                ranks: currentRanks,
                rank_scores: currentRankScores
            })
        });
        const data = await resp.json();
        if (data.success) {
            const rules = await (await fetch(API_BASE + '/score-rules')).json();
            if (rules.success && rules.data && rules.data.length > 0) {
                const latestRule = rules.data[0];
                await fetch(API_BASE + '/score-rules/' + latestRule.id + '/activate', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_id: null })
                });
            }
            closeRuleModal();
            loadTeamScoresData();
            loadActiveRuleDisplay();
        } else {
            alert('保存失败: ' + data.error);
        }
    } catch (err) {
        alert('请求失败: ' + err.message);
    }
}

async function loadSavedRules() {
    try {
        const resp = await fetch(API_BASE + '/score-rules');
        const data = await resp.json();
        if (!data.success) return;
        const container = document.getElementById('savedRulesList');
        if (!data.data || data.data.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#909399;padding:12px;">暂无保存的规则</div>';
            return;
        }
        container.innerHTML = data.data.map(r => {
            const ranks = r.ranks || [];
            const rankScores = r.rank_scores || {};
            const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
            const desc = uniqueRanks.map(rk => {
                const cnt = ranks.filter(x => x === rk).length;
                return `第${rk}名${cnt > 1 ? '×' + cnt : ''}:${rankScores[rk] || 0}分`;
            }).join(' ');
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border:1px solid #ebeef5;border-radius:4px;margin-bottom:6px;${r.is_active ? 'background:#f0f9eb;border-color:#67c23a;' : ''}">
                <div>
                    <span style="font-weight:bold;font-size:13px;">${r.rule_name}</span>
                    ${r.is_active ? '<span style="color:#67c23a;font-size:11px;margin-left:6px;">● 使用中</span>' : ''}
                    <div style="font-size:11px;color:#909399;margin-top:2px;">${desc}</div>
                </div>
                <div style="display:flex;gap:4px;">
                    ${!r.is_active ? `<button class="btn btn-primary" style="padding:4px 8px;font-size:11px;" onclick="activateRule(${r.id})">启用</button>` : ''}
                    <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="deleteRule(${r.id})">删除</button>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        console.error('加载规则失败:', err);
    }
}

async function activateRule(id) {
    try {
        await fetch(API_BASE + '/score-rules/' + id + '/activate', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: null })
        });
        loadSavedRules();
        loadTeamScoresData();
        loadActiveRuleDisplay();
    } catch (err) {
        alert('启用失败: ' + err.message);
    }
}

async function deleteRule(id) {
    if (!confirm('确定删除此规则？')) return;
    try {
        await fetch(API_BASE + '/score-rules/' + id, { method: 'DELETE' });
        loadSavedRules();
        loadTeamScoresData();
        loadActiveRuleDisplay();
    } catch (err) {
        alert('删除失败: ' + err.message);
    }
}

async function loadActiveRuleDisplay() {
    try {
        const resp = await fetch(API_BASE + '/score-rules');
        const data = await resp.json();
        if (!data.success || !data.data) return;
        const activeRule = data.data.find(r => r.is_active === 1);
        const container = document.querySelector('.card:nth-child(2) > div:nth-child(2)');
        if (!container) return;

        const ranks = activeRule ? (activeRule.ranks || []) : [1, 2, 3, 4, 5];
        const rankScores = activeRule ? (activeRule.rank_scores || {}) : { 1: 9, 2: 7, 3: 5.5, 4: 4, 5: 2 };
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);

        container.innerHTML = uniqueRanks.map(r => {
            const count = ranks.filter(x => x === r).length;
            const countText = count > 1 ? `×${count}` : '';
            return `
            <div style="${rankBgStyles[r - 1] || 'background:#f5f7fa;'} padding: 16px; border-radius: 8px; text-align: center;">
                <div style="color: ${rankLabelColors[r - 1] || '#606266'};">${rankIcons[r - 1] || r + '️⃣'} 第${r}名${countText}</div>
                <div style="font-size: 24px; font-weight: bold; color: ${rankColors[r - 1] || '#909399'}; margin-top: 8px;">${rankScores[r] || 0}分</div>
            </div>
        `}).join('');
    } catch (err) {
        console.error('加载规则显示失败:', err);
    }
}

function handleTeamScoreFilterClick(e) {
    const arrow = e.target.closest('.filter-arrow');
    if (!arrow) return;
    e.stopPropagation();
    const th = arrow.closest('.filterable');
    if (!th) return;
    const col = parseInt(th.getAttribute('data-col'));

    _closeTeamScoreFilterMenu();

    const values = new Set();
    _allTeamScoreRows.forEach(item => {
        const keys = ['rank', 'unit', 'group_class', 'gold', 'silver', 'bronze', 'fourth', 'fifth', 'total_score', 'athlete_count'];
        const v = String(item[keys[col]]);
        if (v) values.add(v);
    });

    const rect = arrow.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'teamScoreFilterMenu';
    menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.bottom + 'px;background:#fff;border:1px solid #dcdfe6;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:10000;min-width:120px;max-height:260px;overflow-y:auto;padding:4px 0;';

    const allItem = document.createElement('div');
    allItem.textContent = '全部';
    allItem.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;border-bottom:1px solid #f0f0f0;';
    if (_teamScoreFilterCol !== col || _teamScoreFilterVal === '') {
        allItem.style.color = '#409EFF';
        allItem.style.fontWeight = 'bold';
    }
    allItem.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
    allItem.addEventListener('mouseleave', function() { this.style.background = ''; });
    allItem.addEventListener('click', function(ev) {
        ev.stopPropagation();
        _teamScoreFilterCol = -1;
        _teamScoreFilterVal = '';
        document.querySelectorAll('#teamScoresTable .filterable').forEach(el => {
            const a = el.querySelector('.filter-arrow');
            if (a) a.textContent = '▼';
        });
        arrow.textContent = '▼';
        _closeTeamScoreFilterMenu();
        _renderFilteredTeamScores();
    });
    menu.appendChild(allItem);

    [...values].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(val => {
        const item = document.createElement('div');
        item.textContent = val;
        item.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;white-space:nowrap;';
        if (_teamScoreFilterCol === col && _teamScoreFilterVal === val) {
            item.style.color = '#409EFF';
            item.style.fontWeight = 'bold';
        }
        item.addEventListener('mouseenter', function() { this.style.background = '#ecf5ff'; });
        item.addEventListener('mouseleave', function() { this.style.background = ''; });
        item.addEventListener('click', function(ev) {
            ev.stopPropagation();
            _teamScoreFilterCol = col;
            _teamScoreFilterVal = val;
            document.querySelectorAll('#teamScoresTable .filterable').forEach(el => {
                const a = el.querySelector('.filter-arrow');
                if (a) a.textContent = '▼';
            });
            arrow.textContent = '✓';
            _closeTeamScoreFilterMenu();
            _renderFilteredTeamScores();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', _closeTeamScoreFilterMenu, { once: true });
    }, 0);
}

function _closeTeamScoreFilterMenu() {
    const m = document.getElementById('teamScoreFilterMenu');
    if (m) m.remove();
}

document.addEventListener('DOMContentLoaded', function() {
    const thead = document.querySelector('#teamScoresTable thead');
    if (thead) thead.addEventListener('click', handleTeamScoreFilterClick);
});
