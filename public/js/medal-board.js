// 奖牌榜

async function loadMedalBoard() {
    loadMedalBoardData();
    loadRankAnnouncementData();
    loadChampionsData();
}

async function loadMedalBoardData() {
    const url = '/api/stats/medals';
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            console.error('加载奖牌榜失败:', result.error);
            return;
        }
        
        renderMedalBoard(result.data);
        renderMedalStats(result.data);
    } catch (err) {
        console.error('加载奖牌榜错误:', err);
    }
}

async function loadChampionsData() {
    const url = '/api/stats/champions';
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            console.error('加载冠军列表失败:', result.error);
            return;
        }
        
        renderChampions(result.data);
    } catch (err) {
        console.error('加载冠军列表错误:', err);
    }
}

function renderMedalStats(data) {
    if (!data || data.length === 0) {
        document.getElementById('medalStats').innerHTML = '<div style="text-align: center; color: #909399; padding: 20px;">暂无数据</div>';
        return;
    }
    
    const totalGold = data.reduce((sum, d) => sum + (d.gold || 0), 0);
    const totalSilver = data.reduce((sum, d) => sum + (d.silver || 0), 0);
    const totalBronze = data.reduce((sum, d) => sum + (d.bronze || 0), 0);
    const totalUnits = data.length;
    
    document.getElementById('medalStats').innerHTML = `
        <div class="stat-card">
            <div class="stat-icon red">🥇</div>
            <div class="stat-info">
                <div class="stat-value">${totalGold}</div>
                <div class="stat-label">金牌</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon orange">🥈</div>
            <div class="stat-info">
                <div class="stat-value">${totalSilver}</div>
                <div class="stat-label">银牌</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon blue">🥉</div>
            <div class="stat-info">
                <div class="stat-value">${totalBronze}</div>
                <div class="stat-label">铜牌</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon green">🏢</div>
            <div class="stat-info">
                <div class="stat-value">${totalUnits}</div>
                <div class="stat-label">获奖单位</div>
            </div>
        </div>
    `;
}

function renderMedalBoard(data) {
    const tbody = document.querySelector('#medalBoardTable tbody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #909399;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, index) => `
        <tr>
            <td><strong style="color: ${index < 3 ? '#f56c6c' : '#606266'};">${index + 1}</strong></td>
            <td><strong>${item.unit}</strong></td>
            <td style="text-align: center;"><span style="color: #f56c6c; font-weight: bold; font-size: 16px;">${item.gold || 0}</span></td>
            <td style="text-align: center;"><span style="color: #e6a23c; font-weight: bold; font-size: 16px;">${item.silver || 0}</span></td>
            <td style="text-align: center;"><span style="color: #409EFF; font-weight: bold; font-size: 16px;">${item.bronze || 0}</span></td>
            <td style="text-align: center;"><strong>${(item.gold || 0) + (item.silver || 0) + (item.bronze || 0)}</strong></td>
        </tr>
    `).join('');
}

function renderChampions(data) {
    const tbody = document.querySelector('#championsTable tbody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #909399;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => `
        <tr>
            <td><strong>${item.weight_class}</strong></td>
            <td><span style="color: #f56c6c; font-weight: bold;">${item.gold_name || '-'}</span></td>
            <td>${item.gold_unit || '-'}</td>
            <td><span style="color: #e6a23c; font-weight: bold;">${item.silver_name || '-'}</span></td>
            <td>${item.silver_unit || '-'}</td>
            <td><span style="color: #409EFF; font-weight: bold;">${item.bronze_names || '-'}</span></td>
            <td>${item.bronze_units || '-'}</td>
        </tr>
    `).join('');
}

function exportMedalBoard() {
    downloadFile('/api/stats/medals/export');
}

async function loadRankAnnouncementData() {
    try {
        const response = await fetch('/api/stats/rank-announcement');
        const result = await response.json();
        if (!result.success) {
            console.error('加载名次公告失败:', result.error);
            return;
        }
        renderRankAnnouncement(result.data);
    } catch (err) {
        console.error('加载名次公告错误:', err);
    }
}

function renderRankAnnouncement(data) {
    const tbody = document.querySelector('#rankAnnouncementTable tbody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #909399;">暂无数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.map((item, index) => `
        <tr>
            <td><strong style="color: ${index < 3 ? '#f56c6c' : '#606266'};">${index + 1}</strong></td>
            <td><strong>${item.unit}</strong></td>
            <td style="text-align: center;"><span style="color: #f56c6c; font-weight: bold;">${item.rank1 || ''}</span></td>
            <td style="text-align: center;"><span style="color: #e6a23c; font-weight: bold;">${item.rank2 || ''}</span></td>
            <td style="text-align: center;"><span style="color: #409EFF; font-weight: bold;">${item.rank3 || ''}</span></td>
            <td style="text-align: center;">${item.rank4 || ''}</td>
            <td style="text-align: center;">${item.rank5 || ''}</td>
            <td style="text-align: center;">${item.rank6 || ''}</td>
            <td style="text-align: center;">${item.rank7 || ''}</td>
            <td style="text-align: center;">${item.rank8 || ''}</td>
            <td style="text-align: center;"><strong>${item.total || ''}</strong></td>
        </tr>
    `).join('');
}

function exportRankAnnouncement() {
    downloadFile('/api/stats/rank-announcement/export');
}
