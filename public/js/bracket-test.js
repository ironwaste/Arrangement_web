let testImportedVenueData = null;

function calculateTestRounds(count, competitionMode) {
    if (count < 2) return { total: 0, rounds: [], roundNames: [], roundMatches: [], finalCount: 0, gold: 0, silver: 0, bronze: 0 };
    
    const mode = competitionMode || 'single_elimination';
    
    if (mode === 'round_robin' || mode === '5人循环赛-1') {
        const rounds = count - 1;
        const matchesPerRound = Math.floor(count / 2);
        const total = count * (count - 1) / 2;
        const roundNames = [];
        const roundMatches = [];
        for (let i = 1; i <= rounds; i++) {
            roundNames.push(`循环赛${i}`);
            roundMatches.push(matchesPerRound);
        }
        return { total, rounds: Array(rounds).fill(matchesPerRound), roundNames, roundMatches, finalCount: 0, gold: 1, silver: 1, bronze: count - 2, mode: '循环赛' };
    }
    
    if (mode === 'group_round_robin' || mode === '5人循环赛-2' || mode === '6人循环赛' || mode === '7人循环赛') {
        let upperSize, lowerSize;
        if (mode === '5人循环赛-2') { upperSize = 3; lowerSize = 2; }
        else if (mode === '6人循环赛') { upperSize = 3; lowerSize = 3; }
        else if (mode === '7人循环赛') { upperSize = 3; lowerSize = 4; }
        else { upperSize = Math.ceil(count / 2); lowerSize = Math.floor(count / 2); }
        
        const upperMatches = upperSize * (upperSize - 1) / 2;
        const lowerMatches = lowerSize * (lowerSize - 1) / 2;
        const finalMatches = 1;
        const total = upperMatches + lowerMatches + finalMatches;
        
        const upperRounds = upperSize > 1 ? upperSize - 1 : 0;
        const lowerRounds = lowerSize > 1 ? lowerSize - 1 : 0;
        const roundNames = [];
        const roundMatches = [];
        for (let i = 1; i <= upperRounds; i++) {
            roundNames.push(`循环赛${i}`);
            roundMatches.push(Math.floor(upperSize / 2));
        }
        for (let i = 1; i <= lowerRounds; i++) {
            roundNames.push(`循环赛${upperRounds + i}`);
            roundMatches.push(Math.floor(lowerSize / 2));
        }
        
        return { total, rounds: [], roundNames, roundMatches, finalCount: 1, finalName: '循环赛决赛', gold: 1, silver: 1, bronze: 2, mode: '分区循环赛', upperSize, lowerSize };
    }
    
    const targetSize = Math.pow(2, Math.ceil(Math.log2(count)));
    const totalRounds = Math.log2(targetSize);
    let total = targetSize - 1;
    const roundNames = [];
    const rounds = [];
    const roundMatches = [];
    
    for (let r = 1; r < totalRounds; r++) {
        roundNames.push(`淘汰赛${r}`);
        const matchesInRound = Math.pow(2, totalRounds - r);
        rounds.push(matchesInRound);
        roundMatches.push(matchesInRound);
    }
    
    return { total, rounds, roundNames, roundMatches, finalCount: 1, finalName: '淘汰赛决赛', gold: 1, silver: 1, bronze: 2, mode: '淘汰赛' };
}

function generateBergerRoundRobin(athletes) {
    const n = athletes.length;
    if (n < 2) return [];
    
    const pairs = [];
    const isOdd = n % 2 !== 0;
    
    let a = [];
    for (let i = 2; i <= n; i++) {
        a.push(i);
    }
    if (isOdd) a.push(0);
    
    const len = a.length;
    const b = [...a];
    for (const x of b) a.push(x);
    
    const sz = a.length;
    const lunciSum = isOdd ? n : n - 1;
    
    for (let lunci = 0; lunci < lunciSum; lunci++) {
        const firstOpponent = a[len - 1 - lunci];
        if (firstOpponent !== 0) {
            pairs.push({
                blue: athletes[0],
                red: athletes[firstOpponent - 1],
                roundNumber: lunci + 1
            });
        }
        
        for (let i = len; i < len + Math.floor(len / 2); i++) {
            const pk = i - lunci;
            const j = sz - 2 - (i - len) - lunci;
            const leftVal = a[pk];
            const rightVal = a[j];
            
            if (leftVal !== 0 && rightVal !== 0) {
                pairs.push({
                    blue: athletes[leftVal - 1],
                    red: athletes[rightVal - 1],
                    roundNumber: lunci + 1
                });
            }
        }
    }
    
    return pairs;
}

function generateDivisionalRoundRobin(athletes, upperSize) {
    const n = athletes.length;
    const lowerSize = n - upperSize;
    
    const upperAthletes = athletes.slice(0, upperSize);
    const lowerAthletes = athletes.slice(upperSize);
    
    const upperPairs = generateBergerRoundRobin(upperAthletes).map(p => ({
        ...p,
        group: '上区',
        roundType: `循环赛${p.roundNumber}`
    }));
    
    const upperRounds = upperSize > 1 ? upperSize - 1 : 0;
    
    const lowerPairs = lowerSize >= 2 
        ? generateBergerRoundRobin(lowerAthletes).map(p => ({
              ...p,
              group: '下区',
              roundType: `循环赛${upperRounds + p.roundNumber}`
          }))
        : [];
    
    const finalMatch = {
        blue: { name: '上区第一', unit: '', draw_no: 0, isPlaceholder: true },
        red: { name: '下区第一', unit: '', draw_no: 0, isPlaceholder: true },
        roundNumber: 999,
        group: '决赛',
        roundType: '循环赛决赛',
        isFinal: true
    };
    
    return { upperPairs, lowerPairs, finalMatch, upperAthletes, lowerAthletes };
}

function sortTestWeightClass(a, b) {
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

async function loadBracketTestPage() {
    const tbody = document.getElementById('testAutoArrangeTableBody');
    tbody.innerHTML = '';

    if (!currentEventId) {
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#909399;padding:40px;">请先在「赛事列表」中选择一个赛事</td></tr>';
        document.getElementById('testAutoArrangeTotalAthletes').textContent = '0';
        document.getElementById('testAutoArrangeTotalClasses').textContent = '0';
        document.getElementById('testAutoArrangeTotalMatches').textContent = '0';
        const pl = document.getElementById('testPendingClassList');
        if (pl) pl.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">请先选择赛事</div>';
        const pc = document.getElementById('testPendingCount');
        if (pc) pc.textContent = '0';
        return;
    }

    try {
        const athletesRes = await fetch(`${API_BASE}/athletes?${getEventParam()}`);
        const athletesData = await athletesRes.json();
        if (!athletesData.success) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#f56c6c;padding:40px;">加载运动员数据失败</td></tr>';
            return;
        }

        const athletes = athletesData.data || [];

        if (athletes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#909399;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">⚔️</div><div>暂无竞技编排数据</div><div style="font-size:12px;">请先添加运动员</div></td></tr>';
            document.getElementById('testAutoArrangeTotalAthletes').textContent = '0';
            document.getElementById('testAutoArrangeTotalClasses').textContent = '0';
            document.getElementById('testAutoArrangeTotalMatches').textContent = '0';
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

        let savedCompetitionModes = {};
        try {
            const modeRes = await fetch(`${API_BASE}/competition-modes?event_id=${currentEventId}`);
            const modeData = await modeRes.json();
            if (modeData.success && modeData.data) {
                modeData.data.forEach(m => { savedCompetitionModes[m.weight_class] = m.mode; });
            }
        } catch (e) { }

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
            const wc = a.weight_class || '未分级';
            if (!classMap.has(wc)) {
                classMap.set(wc, { name: wc, gender: a.gender, group_class: a.group_class, count: 0, athletes: [] });
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
            const compMode = savedCompetitionModes[cls.name] || null;
            const rounds = calculateTestRounds(count, compMode);
            const total = rounds.total || 0;
            totalMatches += total;
            return { ...cls, rounds, total };
        });

        if (testImportedVenueData) {
            classRounds.sort((a, b) => {
                const va = testImportedVenueData.get(a.name) || {};
                const vb = testImportedVenueData.get(b.name) || {};
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

        classRounds.sort((a, b) => {
            const vA = savedScheme[a.name] || (testImportedVenueData ? testImportedVenueData.get(a.name) : null);
            const vB = savedScheme[b.name] || (testImportedVenueData ? testImportedVenueData.get(b.name) : null);
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
            const roundsA = Math.ceil(Math.log2(a.count)) || 0;
            const roundsB = Math.ceil(Math.log2(b.count)) || 0;
            if (roundsA !== roundsB) return roundsB - roundsA;
            return sortTestWeightClass(a.name, b.name);
        });

        classRounds.forEach((cls, index) => {
            const venueInfo = savedScheme[cls.name] || (testImportedVenueData ? testImportedVenueData.get(cls.name) : null);
            const totalRounds = Math.ceil(Math.log2(cls.count)) || 0;
            const tr = document.createElement('tr');
            
            let finalCell = '';
            if (cls.rounds.finalCount > 0) {
                finalCell = `<td style="text-align:center;font-size:11px;"><div style="color:#e6a23c;font-weight:bold;font-size:10px;">${cls.rounds.finalName || '淘汰赛决赛'}</div><div>1</div></td>`;
            } else {
                finalCell = '<td style="text-align:center;color:#dcdfe6;">-</td>';
            }
            
            let roundCells = '';
            for (let r = 1; r <= 8; r++) {
                if (r <= cls.rounds.roundNames.length) {
                    roundCells += `<td style="text-align:center;font-size:11px;"><div style="color:#409eff;font-weight:bold;font-size:10px;">${cls.rounds.roundNames[r-1]}</div><div>${cls.rounds.roundMatches ? cls.rounds.roundMatches[r-1] : ''}</div></td>`;
                } else {
                    roundCells += '<td style="text-align:center;color:#dcdfe6;">-</td>';
                }
            }
            
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${totalRounds}</td>
                <td>${cls.total}</td>
                <td><input type="text" value="${venueInfo ? venueInfo.order : ''}" onchange="saveTestAutoArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td><input type="text" value="${venueInfo ? venueInfo.venue : ''}" onchange="saveTestAutoArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td><input type="text" value="${venueInfo ? venueInfo.unit : ''}" onchange="saveTestAutoArrangeSilent()" style="width:40px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"></td>
                <td style="text-align:left;min-width:120px;">${cls.name}</td>
                <td>${cls.count}</td>
                <td>${cls.total}</td>
                ${finalCell}
                ${roundCells}
                <td>${cls.rounds.gold}</td>
                <td>${cls.rounds.silver}</td>
                <td>${cls.rounds.bronze}</td>
                <td>${cls.rounds.repechage}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('testAutoArrangeTotalAthletes').textContent = totalAthletes;
        document.getElementById('testAutoArrangeTotalClasses').textContent = classes.length;
        document.getElementById('testAutoArrangeTotalMatches').textContent = totalMatches;

        renderTestClassSidebar(classRounds, arrangedClasses, savedScheme);
        renderTestVenueAllocation(classRounds, savedScheme);
        initTestVenueDropZone();
    } catch (e) {
        console.error('加载自动编排数据失败:', e);
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#f56c6c;padding:40px;">加载数据失败，请检查网络连接</td></tr>';
    }
}

function renderTestClassSidebar(classRounds, arrangedClasses, savedScheme) {
    const pendingList = document.getElementById('testPendingClassList');
    const pendingCountEl = document.getElementById('testPendingCount');

    if (!pendingList) return;

    const venueArranged = new Set();
    classRounds.forEach(cls => {
        const info = savedScheme[cls.name];
        if (info && info.venue && info.venue.trim()) {
            venueArranged.add(cls.name);
        }
    });

    const pending = classRounds.filter(cls => !venueArranged.has(cls.name));
    pending.sort((a, b) => sortTestWeightClass(a.name, b.name));

    pendingCountEl.textContent = pending.length;

    if (pending.length === 0) {
        pendingList.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">无待编排级别</div>';
    } else {
        pendingList.innerHTML = pending.map(cls =>
            `<div class="pending-class-item" draggable="true" data-class-name="${cls.name}" onclick="scrollToTestClassRow('${cls.name}')">
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
        });
    }
}

function scrollToTestClassRow(className) {
    const rows = document.querySelectorAll('#testAutoArrangeTableBody tr');
    rows.forEach(row => {
        row.style.background = '';
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7 && cells[6].textContent.trim() === className) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.background = '#ecf5ff';
            setTimeout(() => { row.style.background = ''; }, 2000);
        }
    });
}

let testCurrentVenueData = null;

function renderTestVenueAllocation(classRounds, savedScheme) {
    const container = document.getElementById('testVenueAllocationList');
    if (!container) return;

    const venueMap = new Map();
    classRounds.forEach(cls => {
        const info = savedScheme[cls.name] || (testImportedVenueData ? testImportedVenueData.get(cls.name) : null);
        const venue = info ? (info.venue || '').trim() : '';
        const unit = info ? (info.unit || '').trim() : '';
        const order = info ? (info.order || '').trim() : '';
        const key = venue || '未分配';
        if (!venueMap.has(key)) venueMap.set(key, []);
        venueMap.get(key).push({ name: cls.name, count: cls.count, unit, order, venue });
    });

    testCurrentVenueData = venueMap;

    const select = document.getElementById('testVenueFilter');
    if (select) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">全部</option>';
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const opt = document.createElement('option');
            opt.value = letter;
            opt.textContent = '场地 ' + letter;
            select.appendChild(opt);
        }
        select.value = currentVal;
    }

    renderTestVenueList(venueMap, select ? select.value : '');
}

function renderTestVenueList(venueMap, filter) {
    const container = document.getElementById('testVenueAllocationList');
    if (!container) return;

    const sortedKeys = Array.from(venueMap.keys()).sort();
    const assigned = sortedKeys.filter(k => k !== '未分配');
    const orderedKeys = assigned;

    if (orderedKeys.length === 0) {
        container.innerHTML = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">暂无场地分配</div>';
        return;
    }

    let html = '';
    orderedKeys.forEach(venue => {
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
        html += `<div class="venue-group-header">${venue === '未分配' ? '未分配' : venue + '场地'}</div>`;
        items.forEach(item => {
            const info = item.unit ? `单元${item.unit}` + (item.order ? ` 序${item.order}` : '') : '';
            html += `<div class="venue-class-item" draggable="true" data-class-name="${item.name}" onclick="scrollToTestClassRow('${item.name}')">
                <span>${item.name}</span>
                <span class="venue-info">${info || item.count + '人'}</span>
            </div>`;
        });
        if (!filter) {
            let venueClasses = items.length;
            let venueMatches = 0;
            items.forEach(item => {
                const r = calculateTestRounds(item.count);
                venueMatches += r.total || 0;
            });
            html += `<div class="venue-group-summary">
                <span>${venueClasses} 级别</span>
                <span>${venueMatches} 场</span>
            </div>`;
        }
        html += `</div>`;
    });

    if (!html) {
        html = '<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">该场地暂无级别</div>';
    } else {
        let totalClasses = 0;
        let totalMatches = 0;
        orderedKeys.forEach(venue => {
            if (filter && venue !== filter) return;
            const items = venueMap.get(venue);
            items.forEach(item => {
                totalClasses++;
                const r = calculateTestRounds(item.count);
                totalMatches += r.total || 0;
            });
        });
        html += `<div class="venue-summary">
            <span>📊 <strong>${totalClasses}</strong> 级别</span>
            <span>⚔️ <strong>${totalMatches}</strong> 场</span>
        </div>`;
    }

    container.innerHTML = html;
}

let testVenueDropInitialized = false;

function initTestVenueDropZone() {
    if (testVenueDropInitialized) return;
    testVenueDropInitialized = true;

    const container = document.getElementById('testVenueAllocationList');
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
        const dragSource = e.dataTransfer.getData('drag-source');
        if (!className) return;

        if (dragSource === 'venue') return;

        const select = document.getElementById('testVenueFilter');
        const selectedVenue = select ? select.value : '';
        const groupVenue = group ? group.dataset.venue : '';
        let targetVenue = groupVenue || selectedVenue;

        if (!targetVenue || targetVenue === '未分配') return;

        assignTestClassToVenue(className, targetVenue);
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

    const pendingList = document.getElementById('testPendingClassList');
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

            removeTestClassFromVenue(className);
        });
    }
}

function assignTestClassToVenue(className, venue) {
    const tbody = document.getElementById('testAutoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');

    let maxOrder = 0;
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('input');
        if (venueInput && venueInput.value.trim() === venue && orderInput) {
            const ord = parseFloat(orderInput.value) || 0;
            if (ord > maxOrder) maxOrder = ord;
        }
    });

    let found = false;
    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (cells[6].textContent.trim() === className) {
            const orderInput = cells[3].querySelector('input');
            const venueInput = cells[4].querySelector('input');
            const unitInput = cells[5].querySelector('input');
            if (venueInput) venueInput.value = venue;
            if (unitInput && !unitInput.value.trim()) unitInput.value = '1';
            if (orderInput) orderInput.value = String(maxOrder + 1);
            found = true;
        }
    });

    if (found) {
        saveTestAutoArrangeSilent().then(() => {
            loadBracketTestPage();
        });
    }
}

function removeTestClassFromVenue(className) {
    const tbody = document.getElementById('testAutoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    let found = false;

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        if (cells[6].textContent.trim() === className) {
            const orderInput = cells[3].querySelector('input');
            const venueInput = cells[4].querySelector('input');
            const unitInput = cells[5].querySelector('input');
            if (venueInput) venueInput.value = '';
            if (unitInput) unitInput.value = '';
            if (orderInput) orderInput.value = '';
            found = true;
        }
    });

    if (found) {
        saveTestAutoArrangeSilent().then(() => {
            loadBracketTestPage();
        });
    }
}

function filterTestVenueAllocation() {
    if (testCurrentVenueData) {
        const select = document.getElementById('testVenueFilter');
        renderTestVenueList(testCurrentVenueData, select ? select.value : '');
    }
}

function resetTestVenueFilter() {
    const select = document.getElementById('testVenueFilter');
    if (select) select.value = '';
    if (testCurrentVenueData) {
        renderTestVenueList(testCurrentVenueData, '');
    } else {
        loadBracketTestPage();
    }
}

async function saveTestAutoArrangeSilent() {
    const tbody = document.getElementById('testAutoArrangeTableBody');
    const rows = tbody.querySelectorAll('tr');
    const scheme = {};

    rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        const className = cells[6].textContent.trim();
        const orderInput = cells[3].querySelector('input');
        const venueInput = cells[4].querySelector('input');
        const unitInput = cells[5].querySelector('input');
        if (className && venueInput) {
            const venue = venueInput.value.trim();
            const unit = unitInput ? unitInput.value.trim() : '';
            const order = orderInput ? orderInput.value.trim() : '';
            if (venue) {
                scheme[className] = { venue, unit, order };
            }
        }
    });

    try {
        const dataArray = Object.entries(scheme).map(([weight_class, info]) => ({
            weight_class,
            category_venue: info.venue || '',
            category_date_num: info.unit || '',
            category_order: info.order || ''
        }));
        await fetch(`${API_BASE}/auto-arrange/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: dataArray })
        });
    } catch (e) {
        console.error('保存方案失败:', e);
    }
}

async function saveTestAutoArrange() {
    await saveTestAutoArrangeSilent();
    alert('保存成功！');
}

async function executeTestAutoArrange() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm('确定执行自动编排？将生成所有级别的对阵表。')) return;

    try {
        const resp = await apiPost('/auto-arrange/generate-bracket', { event_id: currentEventId });
        if (resp.success) {
            const d = resp.data;
            let msg = `编排完成！成功 ${d.generated} 个级别`;
            if (d.errors && d.errors.length > 0) {
                msg += `\n\n跳过：\n${d.errors.join('\n')}`;
            }
            alert(msg);
            loadBracketTestPage();
        } else {
            alert('编排失败: ' + resp.error);
        }
    } catch (e) {
        alert('编排异常: ' + e.message);
    }
}

async function clearTestArrange() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm('确定要清除所有编排数据吗？此操作将删除所有对阵表和比赛记录，不可恢复！')) return;

    try {
        const resp = await apiPost('/wrestling-arrange/clear', { event_id: currentEventId });
        if (resp.success) {
            alert('所有编排数据已清除');
            loadBracketTestPage();
        } else {
            alert('清除失败: ' + (resp.error || '未知错误'));
        }
    } catch (e) {
        alert('清除异常: ' + e.message);
    }
}

function switchToTestManualArrange() {
    const modal = document.getElementById('testManualArrangeModal');
    modal.style.display = 'block';
    loadTestManualWeightClassSelect();
}

function closeTestManualArrangeModal() {
    const modal = document.getElementById('testManualArrangeModal');
    modal.style.display = 'none';
}

async function loadTestManualWeightClassSelect() {
    const select = document.getElementById('testManualWeightClassSelect');
    select.innerHTML = '<option value="">选择级别</option>';

    if (!currentEventId) return;

    try {
        const resp = await apiGet('/weight-classes?' + getEventParam());
        if (resp.success && resp.data) {
            resp.data.forEach(cls => {
                select.innerHTML += `<option value="${cls}">${cls}</option>`;
            });
        }
    } catch (e) {
        console.error('加载级别列表失败:', e);
    }
}

async function loadTestManualArrangeData() {
    const cls = document.getElementById('testManualWeightClassSelect').value;
    const athletesList = document.getElementById('testManualAthletesList');
    const bracketContainer = document.getElementById('testManualBracketContainer');

    if (!cls) {
        athletesList.innerHTML = '<p style="color:#909399; text-align:center;">请先选择级别</p>';
        bracketContainer.innerHTML = '<p style="color:#909399; text-align:center;">请先选择级别</p>';
        return;
    }

    try {
        const resp = await apiGet(`/athletes?weight_class=${encodeURIComponent(cls)}&${getEventParam()}`);
        if (!resp.success) {
            athletesList.innerHTML = '<p style="color:#f56c6c; text-align:center;">加载失败</p>';
            return;
        }

        const athletes = resp.data || [];
        athletesList.innerHTML = athletes.map(a =>
            `<div class="athlete-item" draggable="true" data-athlete-id="${a.id}" data-athlete-name="${a.name}">
                <span>${a.name} (${a.unit || ''})</span>
                <span style="color:#909399;font-size:12px;">签号: ${a.draw_no || '-'}</span>
            </div>`
        ).join('');

        bracketContainer.innerHTML = '<p style="color:#909399; text-align:center;">点击「自动填充」生成对阵</p>';
    } catch (e) {
        athletesList.innerHTML = '<p style="color:#f56c6c; text-align:center;">加载异常</p>';
    }
}

async function autoFillTestManualArrange() {
    const cls = document.getElementById('testManualWeightClassSelect').value;
    if (!cls) { alert('请先选择级别'); return; }

    try {
        const drawResp = await apiPost('/athletes/draw', { event_id: currentEventId, weight_class: cls });
        if (!drawResp.success) { alert('抽签失败: ' + drawResp.error); return; }

        const genResp = await apiPost('/wrestling-arrange/generate', { event_id: currentEventId, weight_class: cls });
        if (!genResp.success) { alert('生成对阵失败: ' + genResp.error); return; }

        alert('自动填充成功！');
        loadTestManualArrangeData();
        loadBracketTestPage();
    } catch (e) {
        alert('自动填充异常: ' + e.message);
    }
}

async function saveTestManualArrange() {
    alert('手工编排已保存');
    closeTestManualArrangeModal();
    loadBracketTestPage();
}

function clearTestManualArrange() {
    const cls = document.getElementById('testManualWeightClassSelect').value;
    if (!cls) return;
    if (!confirm(`确定清空「${cls}」的编排？`)) return;

    apiPost('/athletes/clear-draw', { event_id: currentEventId, weight_class: cls }).then(() => {
        loadTestManualArrangeData();
        loadBracketTestPage();
    });
}

function handleTestArrangeImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    alert('导入功能：请使用竞技编排页面的导入功能');
    event.target.value = '';
}

function exportTestArrangeData() {
    alert('导出功能：请使用竞技编排页面的导出功能');
}

let competitionModeData = {};

function getRecommendedMode(count) {
    if (count === 2) return { mode: '单败淘汰', detail: '直接决赛' };
    if (count === 3 || count === 4) return { mode: '单循环赛', detail: `共${count * (count - 1) / 2}场` };
    if (count === 5) return { mode: '可选', detail: '5人循环赛-1 或 5人循环赛-2' };
    if (count === 6) return { mode: '分区循环赛', detail: '上3下3分区+决赛' };
    if (count === 7) return { mode: '分区循环赛', detail: '上3下4分区+决赛' };
    return { mode: '单败淘汰', detail: `淘汰赛，${Math.ceil(Math.log2(count))}轮` };
}

function getModeOptions(count) {
    const options = [];
    
    if (count === 2) {
        options.push({ value: 'single_elimination', label: '单败淘汰赛(决赛)', desc: '直接决赛' });
        options.push({ value: 'round_robin', label: '单循环赛(1场)', desc: '1场比赛' });
    } else if (count === 3) {
        options.push({ value: 'round_robin', label: '单循环赛(3场)', desc: '每人赛2场' });
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '半决赛+决赛' });
    } else if (count === 4) {
        options.push({ value: 'round_robin', label: '单循环赛(6场)', desc: '每人赛3场' });
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '半决赛+决赛' });
    } else if (count === 5) {
        options.push({ value: '5人循环赛-1', label: '5人循环赛-1(10场)', desc: '完整单循环，贝格尔算法' });
        options.push({ value: '5人循环赛-2', label: '5人循环赛-2(7场)', desc: '上3下2分区+决赛' });
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '淘汰赛制' });
    } else if (count === 6) {
        options.push({ value: '6人循环赛', label: '6人循环赛(10场)', desc: '上3下3分区+决赛' });
        options.push({ value: 'round_robin', label: '单循环赛(15场)', desc: '每人赛5场' });
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '淘汰赛制' });
    } else if (count === 7) {
        options.push({ value: '7人循环赛', label: '7人循环赛(13场)', desc: '上3下4分区+决赛' });
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '淘汰赛制' });
    } else {
        options.push({ value: 'single_elimination', label: '单败淘汰赛', desc: '输一场即淘汰' });
        if (count >= 8 && count <= 10) {
            options.push({ value: 'group_round_robin', label: '分区循环赛', desc: '分两组循环+决赛' });
        }
    }
    return options;
}

function getClassSortPriority(count) {
    if (count === 5) return 0;
    if (count >= 3 && count <= 4) return 1;
    if (count === 6 || count === 7) return 2;
    return 3;
}

async function showCompetitionModeConfig() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    
    try {
        const resp = await fetch(`${API_BASE}/athletes?${getEventParam()}`);
        const data = await resp.json();
        
        if (!data.success || !data.data || data.data.length === 0) { alert('暂无运动员数据'); return; }
        
        const classMap = new Map();
        data.data.forEach(a => {
            const wc = a.weight_class || '未分级';
            if (!classMap.has(wc)) classMap.set(wc, { name: wc, count: 0, athletes: [] });
            classMap.get(wc).count++;
            classMap.get(wc).athletes.push(a);
        });
        
        competitionModeData = {};
        try {
            const modeRes = await fetch(`${API_BASE}/competition-modes?event_id=${currentEventId}`);
            const modeData = await modeRes.json();
            if (modeData.success && modeData.data) {
                modeData.data.forEach(m => { competitionModeData[m.weight_class] = m.mode; });
            }
        } catch (e) {}
        
        const tbody = document.getElementById('competitionModeTableBody');
        tbody.innerHTML = '';
        
        let classes = Array.from(classMap.values());
        classes.sort((a, b) => {
            const pa = getClassSortPriority(a.count);
            const pb = getClassSortPriority(b.count);
            if (pa !== pb) return pa - pb;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        
        classes.forEach(cls => {
            const recommended = getRecommendedMode(cls.count);
            const options = getModeOptions(cls.count);
            const currentMode = competitionModeData[cls.name] || '';
            
            const tr = document.createElement('tr');
            tr.style.background = cls.count === 5 ? '#fdf6ec' : '';
            tr.innerHTML = `
                <td style="padding:10px;border:1px solid #dcdfe6;font-weight:${cls.count === 5 ? 'bold' : 'normal'};">${cls.name}${cls.count === 5 ? ' ⭐' : ''}</td>
                <td style="padding:10px;border:1px solid #dcdfe6;text-align:center;font-weight:bold;color:#409eff;">${cls.count}人</td>
                <td style="padding:10px;border:1px solid #dcdfe6;text-align:center;">
                    <span style="background:#f0f9eb;color:#67c23a;padding:2px 8px;border-radius:3px;font-size:12px;">${recommended.mode}</span>
                    <div style="font-size:11px;color:#909399;margin-top:2px;">${recommended.detail}</div>
                </td>
                <td style="padding:10px;border:1px solid #dcdfe6;text-align:center;">
                    <select data-class="${cls.name}" onchange="onCompetitionModeChange(this)" style="padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;min-width:160px;font-size:12px;">
                        <option value="">默认(${recommended.mode})</option>
                        ${options.map(o => `<option value="${o.value}" ${currentMode === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </td>
                <td style="padding:10px;border:1px solid #dcdfe6;text-align:center;">
                    <button onclick="showCompetitionModeDetail('${cls.name}', ${cls.count})" style="padding:4px 12px;border:1px solid #409eff;background:#ecf5ff;color:#409eff;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px;">详情</button>
                    <button onclick="showMatchScheduleForClass('${cls.name}')" style="padding:4px 12px;border:1px solid #67c23a;background:#f0f9eb;color:#67c23a;border-radius:4px;cursor:pointer;font-size:12px;">对阵表</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('competitionModeModal').style.display = 'block';
    } catch (e) {
        console.error('加载竞赛方式失败:', e);
        alert('加载数据失败');
    }
}

function onCompetitionModeChange(select) {
    const className = select.dataset.class;
    const mode = select.value;
    if (mode) {
        competitionModeData[className] = mode;
    } else {
        delete competitionModeData[className];
    }
}

function closeCompetitionModeModal() {
    document.getElementById('competitionModeModal').style.display = 'none';
}

async function showMatchScheduleForClass(weightClass) {
    try {
        const athletesRes = await fetch(`${API_BASE}/athletes?${getEventParam()}&weight_class=${encodeURIComponent(weightClass)}`);
        const athletesData = await athletesRes.json();
        
        if (!athletesData.success || !athletesData.data || athletesData.data.length === 0) {
            alert('该级别暂无运动员数据');
            return;
        }
        
        const athletes = athletesData.data;
        let mode = competitionModeData[weightClass] || null;
        
        if (!mode) {
            const count = athletes.length;
            if (count === 5) mode = '5人循环赛-1';
            else if (count === 6) mode = '6人循环赛';
            else if (count === 7) mode = '7人循环赛';
            else if (count >= 2 && count <= 4) mode = 'round_robin';
            else mode = 'single_elimination';
        }
        
        showMatchScheduleDetail(weightClass, athletes, mode);
    } catch (e) {
        console.error('加载对阵表失败:', e);
        alert('加载失败，请检查网络连接');
    }
}

async function saveCompetitionModes() {
    try {
        if (!currentEventId) { alert('请先选择赛事'); return; }
        
        const payload = [];
        for (const [weightClass, mode] of Object.entries(competitionModeData)) {
            payload.push({ event_id: currentEventId, weight_class: weightClass, mode: mode });
        }
        
        if (payload.length === 0) {
            alert('没有需要保存的配置，请先选择竞赛方式');
            return;
        }
        
        const resp = await fetch(`${API_BASE}/competition-modes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        
        if (result.success) {
            alert('保存成功！');
            closeCompetitionModeModal();
        } else {
            alert('保存失败：' + (result.message || '未知错误'));
        }
    } catch (e) {
        console.error('保存失败:', e);
        alert('保存失败，请检查网络连接');
    }
}

function showCompetitionModeDetail(className, count) {
    let html = `<h4 style="color:#303133;margin-bottom:15px;">${className} (${count}人)</h4>`;
    
    const modes = [];
    
    if (count === 2) {
        modes.push({ id: 'single_elimination', name: '单败淘汰赛(决赛)', matches: 1, desc: '签号1 vs 签号2，直接决赛' });
        modes.push({ id: 'round_robin', name: '单循环赛', matches: 1, desc: '签号1 vs 签号2，1场比赛' });
    } else if (count === 3) {
        modes.push({ id: 'round_robin', name: '单循环赛', matches: 3, desc: '循环赛1-3，每人赛2场，共3场（贝格尔算法）' });
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: 3, desc: '淘汰赛1(2场)+决赛(1场)，共3场' });
    } else if (count === 4) {
        modes.push({ id: 'round_robin', name: '单循环赛', matches: 6, desc: '循环赛1-3，每人赛3场，共6场（贝格尔算法）' });
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: 3, desc: '淘汰赛1(2场)+决赛(1场)，共3场' });
    } else if (count === 5) {
        modes.push({ id: '5人循环赛-1', name: '5人循环赛-1(完整单循环)', matches: 10, desc: '循环赛1-5，每人赛4场，共10场（贝格尔算法）✅推荐', highlight: true });
        modes.push({ id: '5人循环赛-2', name: '5人循环赛-2(分区循环)', matches: 7, desc: '上区3人(3场)+下区2人(1场)+决赛(1场)，共7场 ✅推荐', highlight: true });
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: 7, desc: '淘汰赛1-3，共7场' });
    } else if (count === 6) {
        modes.push({ id: '6人循环赛', name: '6人循环赛(分区)', matches: 10, desc: '上区3人(3场)+下区3人(3场)+决赛(1场)，共10场 ✅推荐', highlight: true });
        modes.push({ id: 'round_robin', name: '单循环赛', matches: 15, desc: '循环赛1-5，每人赛5场，共15场' });
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: 7, desc: '淘汰赛1-3，共7场' });
    } else if (count === 7) {
        modes.push({ id: '7人循环赛', name: '7人循环赛(分区)', matches: 13, desc: '上区3人(3场)+下区4人(6场)+决赛(1场)，共13场 ✅推荐', highlight: true });
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: 7, desc: '淘汰赛1-3，共7场' });
    } else {
        const rounds = Math.ceil(Math.log2(count));
        const totalMatches = Math.pow(2, rounds) - 1;
        modes.push({ id: 'single_elimination', name: '单败淘汰赛', matches: totalMatches, desc: `淘汰赛1-${rounds-1}+决赛，共${totalMatches}场` });
    }
    
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:15px;">';
    html += '<thead><tr style="background:#f5f7fa;"><th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">方式</th><th style="padding:8px;border:1px solid #dcdfe6;text-align:center;">场次</th><th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">说明</th></tr></thead><tbody>';
    
    modes.forEach(m => {
        html += `<tr style="${m.highlight ? 'background:#f0f9eb;' : ''}">
            <td style="padding:8px;border:1px solid #dcdfe6;font-weight:${m.highlight ? 'bold' : 'normal'};">${m.name}${m.highlight ? ' ⭐' : ''}</td>
            <td style="padding:8px;border:1px solid #dcdfe6;text-align:center;font-weight:bold;color:#409eff;">${m.matches}场</td>
            <td style="padding:8px;border:1px solid #dcdfe6;font-size:12px;color:#606266;">${m.desc}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    
    if (count >= 3 && count <= 7) {
        html += '<div style="background:#ecf5ff;border:1px solid #d9ecff;padding:12px;border-radius:4px;margin-top:15px;">';
        html += '<strong style="color:#409eff;">📋 贝格尔算法对阵示例：</strong><br>';
        
        const sampleAthletes = [];
        for (let i = 1; i <= Math.min(count, 5); i++) {
            sampleAthletes.push({ draw_no: i, name: `运动员${i}`, unit: `单位${i}` });
        }
        
        const pairs = generateBergerRoundRobin(sampleAthletes);
        let roundNum = 1;
        html += '<div style="margin-top:8px;max-height:200px;overflow-y:auto;">';
        pairs.slice(0, 8).forEach((p, idx) => {
            if (p.roundNumber > roundNum) { roundNum = p.roundNumber; }
            html += `<div style="font-size:11px;padding:3px 0;color:#606266;border-bottom:1px dashed #ebeef5;">
                <span style="background:#e6a23c;color:#fff;padding:1px 6px;border-radius:2px;margin-right:4px;">循环赛${p.roundNumber}</span>
                青方：#${p.blue.draw_no} ${p.blue.name} vs 红方：#${p.red.draw_no} ${p.red.name}
            </div>`;
        });
        if (pairs.length > 8) html += `<div style="font-size:11px;color:#909399;text-align:center;">... 共${pairs.length}场</div>`;
        html += '</div></div>';
    }
    
    document.getElementById('competitionModeDetailTitle').textContent = className + ' 竞赛详情';
    document.getElementById('competitionModeDetailContent').innerHTML = html;
    document.getElementById('competitionModeDetailModal').style.display = 'block';
}

function closeCompetitionModeDetail() {
    document.getElementById('competitionModeDetailModal').style.display = 'none';
}

// 点击弹窗外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('competitionModeModal');
    const detailModal = document.getElementById('competitionModeDetailModal');
    if (event.target === modal) {
        closeCompetitionModeModal();
    }
    if (event.target === detailModal) {
        closeCompetitionModeDetail();
    }
}

function generateMatchesByCompetitionMode(weightClass, athletes, mode) {
    const sortedAthletes = [...athletes].sort((a, b) => (a.draw_no || 0) - (b.draw_no || 0));
    const count = sortedAthletes.length;
    
    if (!mode || mode === 'single_elimination') {
        return generateEliminationMatches(weightClass, sortedAthletes);
    }
    
    if (mode === 'round_robin' || mode === '5人循环赛-1') {
        return generateRoundRobinMatches(weightClass, sortedAthletes, mode);
    }
    
    if (mode === '5人循环赛-2' || mode === '6人循环赛' || mode === '7人循环赛' || mode === 'group_round_robin') {
        return generateDivisionalMatches(weightClass, sortedAthletes, mode);
    }
    
    return generateEliminationMatches(weightClass, sortedAthletes);
}

function generateEliminationMatches(weightClass, athletes) {
    const count = athletes.length;
    if (count < 2) return [];
    
    const targetSize = Math.pow(2, Math.ceil(Math.log2(count)));
    const totalRounds = Math.log2(targetSize);
    const matches = [];
    let matchId = 1;
    
    for (let round = totalRounds; round >= 1; round--) {
        const matchesInRound = Math.pow(2, round - 1);
        const roundName = round === totalRounds ? '淘汰赛决赛' : `淘汰赛${totalRounds - round}`;
        
        for (let i = 0; i < matchesInRound; i++) {
            const blueIdx = (i * 2);
            const redIdx = (i * 2) + 1;
            
            let blueAthlete = null, redAthlete = null;
            
            if (round === totalRounds) {
                if (blueIdx < count) blueAthlete = athletes[blueIdx];
                if (redIdx < count) redAthlete = athletes[redIdx];
            }
            
            matches.push({
                id: matchId++,
                weight_class: weightClass,
                round: round,
                round_name: roundName,
                round_type: '淘汰赛',
                match_order: i + 1,
                blue_athlete_no: blueAthlete ? blueAthlete.athlete_no : null,
                blue_draw_no: blueAthlete ? blueAthlete.draw_no : null,
                blue_name: blueAthlete ? blueAthlete.name : null,
                blue_unit: blueAthlete ? (blueAthlete.unit || blueAthlete.team || blueAthlete.origin_unit) : null,
                red_athlete_no: redAthlete ? redAthlete.athlete_no : null,
                red_draw_no: redAthlete ? redAthlete.draw_no : null,
                red_name: redAthlete ? redAthlete.name : null,
                red_unit: redAthlete ? (redAthlete.unit || redAthlete.team || redAthlete.origin_unit) : null,
                venue: '',
                venue_no: matchId - 1,
                match_status: '待开始'
            });
        }
    }
    
    return matches;
}

function showMatchScheduleDetail(weightClass, athletes, mode) {
    const matches = generateMatchesByCompetitionMode(weightClass, athletes, mode);
    
    let html = `<h4 style="color:#303133;margin-bottom:15px;">${weightClass} 对阵表</h4>`;
    html += `<div style="background:#f5f7fa;padding:8px;border-radius:4px;margin-bottom:15px;font-size:12px;color:#606266;">`;
    html += `<strong>竞赛方式：</strong>${getModeDisplayName(mode)} | `;
    html += `<strong>人数：</strong>${athletes.length}人 | `;
    html += `<strong>总场次：</strong>${matches.length}场</div>`;
    
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:15px;">';
    html += '<thead><tr style="background:#409eff;color:#fff;">';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:center;width:40px;">序号</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:center;width:100px;">轮次</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">青方</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">代表队</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:center;width:40px;">vs</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">红方</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:left;">代表队</th>';
    html += '<th style="padding:8px;border:1px solid #dcdfe6;text-align:center;width:80px;">级别</th>';
    html += '</tr></thead><tbody>';
    
    matches.forEach((m, idx) => {
        const rowStyle = m.is_final_placeholder ? 'background:#fdf6ec;' : (idx % 2 === 0 ? 'background:#fafafa;' : '');
        html += `<tr style="${rowStyle}">`;
        html += `<td style="padding:8px;border:1px solid #dcdfe6;text-align:center;font-weight:bold;">${idx + 1}</td>`;
        html += `<td style="padding:8px;border:1px solid #dcdfe6;text-align:center;"><span style="background:#e6a23c;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;">${m.kyougi_match_round_name}</span></td>`;
        
        if (m.is_final_placeholder) {
            html += `<td style="padding:8px;border:1px solid #dcdfe6;">`;
            html += `<select id="final_blue_${m.id}" onchange="updateFinalAthlete('${m.id}', 'blue', this)" style="width:100%;padding:4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;">`;
            html += `<option value="">上区第一</option>`;
            if (m.upper_athletes) {
                m.upper_athletes.forEach(a => {
                    html += `<option value="${a.draw_no}|${a.name}|${a.unit || ''}">#${a.draw_no} ${a.name}</option>`;
                });
            }
            html += `</select></td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;" id="final_blue_unit_${m.id}">上区第一</td>`;
            
            html += `<td style="padding:8px;border:1px solid #dcdfe6;text-align:center;font-weight:bold;color:#e6a23c;">vs</td>`;
            
            html += `<td style="padding:8px;border:1px solid #dcdfe6;">`;
            html += `<select id="final_red_${m.id}" onchange="updateFinalAthlete('${m.id}', 'red', this)" style="width:100%;padding:4px;border:1px solid #dcdfe6;border-radius:3px;font-size:12px;">`;
            html += `<option value="">下区第一</option>`;
            if (m.lower_athletes) {
                m.lower_athletes.forEach(a => {
                    html += `<option value="${a.draw_no}|${a.name}|${a.unit || ''}">#${a.draw_no} ${a.name}</option>`;
                });
            }
            html += `</select></td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;" id="final_red_unit_${m.id}">下区第一</td>`;
        } else {
            const blueName = m.kyougi_blue_athlete_name ? `${m.kyougi_blue_athlete_name}` : '';
            const blueUnit = m.kyougi_blue_athlete_team || '';
            const redName = m.kyougi_red_athlete_name ? `${m.kyougi_red_athlete_name}` : '';
            const redUnit = m.kyougi_red_athlete_team || '';
            
            html += `<td style="padding:8px;border:1px solid #dcdfe6;color:${m.kyougi_blue_athlete_name ? '#303133' : '#909399'};">${blueName || '待定'}</td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;color:#909399;font-size:12px;">${blueUnit}</td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;text-align:center;font-weight:bold;color:#e6a23c;">vs</td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;color:${m.kyougi_red_athlete_name ? '#303133' : '#909399'};">${redName || '待定'}</td>`;
            html += `<td style="padding:8px;border:1px solid #dcdfe6;color:#909399;font-size:12px;">${redUnit}</td>`;
        }
        
        html += `<td style="padding:8px;border:1px solid #dcdfe6;text-align:center;font-size:12px;color:#606266;">${weightClass}</td>`;
        html += `</tr>`;
    });
    
    html += '</tbody></table>';
    
    if (matches.some(m => m.is_final_placeholder)) {
        html += '<div style="background:#ecf5ff;border:1px solid #d9ecff;padding:12px;border-radius:4px;margin-top:15px;">';
        html += '<strong style="color:#409eff;">💡 说明：</strong><br>';
        html += '<span style="font-size:12px;color:#606266;">决赛场次需要在上区循环赛和下区循环赛结束后，手动选择各区第一名进入决赛。选择运动员后代表队将自动更新。</span>';
        html += '</div>';
    }
    
    const modal = document.getElementById('matchScheduleDetailModal');
    if (!modal) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'matchScheduleDetailModal';
        modalDiv.className = 'modal';
        modalDiv.style.cssText = 'display:none;position:fixed;z-index:1000;left:0;top:0;width:100%;height:100%;background-color:rgba(0,0,0,0.5);';
        modalDiv.innerHTML = `
            <div style="background-color:#fefefe;margin:30px auto;padding:20px;border-radius:8px;width:90%;max-width:1000px;max-height:80vh;overflow-y:auto;position:relative;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #409eff;">
                    <h3 id="matchScheduleDetailTitle" style="margin:0;color:#303133;">对阵表详情</h3>
                    <button onclick="closeMatchScheduleDetail()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#909399;">&times;</button>
                </div>
                <div id="matchScheduleDetailContent" style="overflow-x:auto;"></div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }
    
    document.getElementById('matchScheduleDetailTitle').textContent = weightClass + ' - 对阵表详情';
    document.getElementById('matchScheduleDetailContent').innerHTML = html;
    document.getElementById('matchScheduleDetailModal').style.display = 'block';
}

function getModeDisplayName(mode) {
    const modeNames = {
        'single_elimination': '单败淘汰赛',
        'round_robin': '单循环赛',
        '5人循环赛-1': '5人循环赛-1(完整单循环)',
        '5人循环赛-2': '5人循环赛-2(分区循环)',
        '6人循环赛': '6人循环赛(分区)',
        '7人循环赛': '7人循环赛(分区)',
        'group_round_robin': '分区循环赛'
    };
    return modeNames[mode] || mode || '默认';
}

let finalSelections = {};

function updateFinalAthlete(matchId, side, select) {
    const value = select.value;
    if (!value) {
        const unitCell = document.getElementById(`final_${side}_unit_${matchId}`);
        if (unitCell) unitCell.textContent = side === 'blue' ? '上区第一' : '下区第一';
        return;
    }
    
    const [drawNo, name, unit] = value.split('|');
    
    if (!finalSelections[matchId]) {
        finalSelections[matchId] = { blue: null, red: null };
    }
    
    finalSelections[matchId][side] = { draw_no: parseInt(drawNo), name, unit };
    
    const unitCell = document.getElementById(`final_${side}_unit_${matchId}`);
    if (unitCell) unitCell.textContent = unit || '';
    
    console.log(`决赛 ${matchId} ${side === 'blue' ? '青方' : '红方'} 已选择: #${drawNo} ${name} (${unit})`);
}

function closeMatchScheduleDetail() {
    const modal = document.getElementById('matchScheduleDetailModal');
    if (modal) modal.style.display = 'none';
}

function generateRoundRobinMatches(weightClass, athletes, mode) {
    const count = athletes.length;
    if (count < 2) return [];
    
    const pairs = generateBergerRoundRobin(athletes);
    const matches = [];
    let matchId = 1;
    
    pairs.forEach((p, idx) => {
        const roundName = `循环赛${p.roundNumber}`;
        matches.push({
            id: matchId++,
            weight_class: weightClass,
            round: p.roundNumber,
            round_name: roundName,
            round_type: '循环赛',
            match_order: idx + 1,
            blue_athlete_no: p.blue.athlete_no || null,
            blue_draw_no: p.blue.draw_no || null,
            blue_name: p.blue.name || null,
            blue_unit: p.blue.unit || p.blue.team || p.blue.origin_unit || null,
            red_athlete_no: p.red.athlete_no || null,
            red_draw_no: p.red.draw_no || null,
            red_name: p.red.name || null,
            red_unit: p.red.unit || p.red.team || p.red.origin_unit || null,
            venue: '',
            venue_no: matchId - 1,
            match_status: '待开始'
        });
    });
    
    return matches;
}

function generateDivisionalMatches(weightClass, athletes, mode) {
    const count = athletes.length;
    if (count < 2) return [];
    
    let upperSize, lowerSize;
    if (mode === '5人循环赛-2') { upperSize = 3; lowerSize = 2; }
    else if (mode === '6人循环赛') { upperSize = 3; lowerSize = 3; }
    else if (mode === '7人循环赛') { upperSize = 3; lowerSize = 4; }
    else { 
        upperSize = Math.ceil(count / 2); 
        lowerSize = Math.floor(count / 2); 
    }
    
    const result = generateDivisionalRoundRobin(athletes, upperSize);
    const matches = [];
    let matchId = 1;
    
    result.upperPairs.forEach((p, idx) => {
        matches.push({
            id: matchId++,
            weight_class: weightClass,
            round: p.roundNumber,
            round_name: p.roundType,
            round_type: '循环赛',
            group: '上区',
            match_order: idx + 1,
            blue_athlete_no: p.blue.athlete_no || null,
            blue_draw_no: p.blue.draw_no || null,
            blue_name: p.blue.name || null,
            blue_unit: p.blue.unit || p.blue.team || p.blue.origin_unit || null,
            red_athlete_no: p.red.athlete_no || null,
            red_draw_no: p.red.draw_no || null,
            red_name: p.red.name || null,
            red_unit: p.red.unit || p.red.team || p.red.origin_unit || null,
            venue: '',
            venue_no: matchId - 1,
            match_status: '待开始'
        });
    });
    
    const upperRounds = upperSize > 1 ? upperSize - 1 : 0;
    result.lowerPairs.forEach((p, idx) => {
        matches.push({
            id: matchId++,
            weight_class: weightClass,
            round: upperRounds + p.roundNumber,
            round_name: p.roundType,
            round_type: '循环赛',
            group: '下区',
            match_order: idx + 1,
            blue_athlete_no: p.blue.athlete_no || null,
            blue_draw_no: p.blue.draw_no || null,
            blue_name: p.blue.name || null,
            blue_unit: p.blue.unit || p.blue.team || p.blue.origin_unit || null,
            red_athlete_no: p.red.athlete_no || null,
            red_draw_no: p.red.draw_no || null,
            red_name: p.red.name || null,
            red_unit: p.red.unit || p.red.team || p.red.origin_unit || null,
            venue: '',
            venue_no: matchId - 1,
            match_status: '待开始'
        });
    });
    
    if (result.finalMatch) {
        matches.push({
            id: matchId++,
            weight_class: weightClass,
            round: 999,
            round_name: '循环赛决赛',
            round_type: '决赛',
            group: '决赛',
            match_order: 1,
            blue_athlete_no: null,
            blue_draw_no: null,
            blue_name: null,
            blue_unit: null,
            red_athlete_no: null,
            red_draw_no: null,
            red_name: null,
            red_unit: null,
            is_final_placeholder: true,
            upper_athletes: result.upperAthletes,
            lower_athletes: result.lowerAthletes,
            venue: '',
            venue_no: matchId - 1,
            match_status: '待选择'
        });
    }
    
    return matches;
}

