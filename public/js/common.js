/**
 * 跆拳道编排系统 - 公共工具函数模块
 * 包含全局配置、API调用封装、认证管理、页面导航等通用功能
 */

// API基础地址配置
const API_BASE = 'http://localhost:3000/api';

// 全局状态变量 - 当前选中的赛事信息（存储在localStorage中持久化）
let currentEventId = localStorage.getItem('currentEventId') ? parseInt(localStorage.getItem('currentEventId')) : 0;
let currentEventName = localStorage.getItem('currentEventName') || '';
let currentEventType = localStorage.getItem('currentEventType') || 'taekwondo_kyougi';

// 对阵图库CSS样式缓存（用于打印功能）
window.bracketCssText = '';
fetch('/lib/brackets-viewer.min.css').then(r => r.text()).then(t => { window.bracketCssText = t; }).catch(() => {});

/**
 * 全局fetch拦截器 - 自动添加认证Token和处理401未授权
 * 对所有/api/开头的请求自动附加Authorization头
 */
(function() {
    const _origFetch = window.fetch;
    window.fetch = function(url, options) {
        options = options || {};
        if (typeof url === 'string' && (url.startsWith(API_BASE) || url.startsWith('/api/'))) {
            options.headers = options.headers || {};
            const token = localStorage.getItem('auth_token');
            if (token) {
                if (options.headers instanceof Headers) {
                    options.headers.set('Authorization', 'Bearer ' + token);
                } else {
                    options.headers['Authorization'] = 'Bearer ' + token;
                }
            }
        }
        return _origFetch.call(this, url, options).then(function(resp) {
            // 处理认证过期，自动清除token并跳转到登录页
            if (resp.status === 401 && typeof url === 'string' && (url.startsWith(API_BASE) || url.startsWith('/api/'))) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_username');
                showLoginModal();
            }
            return resp;
        });
    };
})();

/**
 * 获取当前用户的认证Token
 * @returns {string} - JWT Token字符串
 */
function getToken() {
    return localStorage.getItem('auth_token') || '';
}

/**
 * 设置用户认证Token
 * @param {string} token - JWT Token字符串
 */
function setToken(token) {
    localStorage.setItem('auth_token', token);
}

/**
 * 清除用户认证Token和用户名
 */
function removeToken() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
}

/**
 * 检查用户是否已登录
 * @returns {boolean} - 是否已登录
 */
function isLoggedIn() {
    return !!getToken();
}

/**
 * 验证Token是否有效
 * @returns {boolean} - Token是否有效
 */
async function checkAuth() {
    if (!getToken()) return false;
    try {
        const resp = await fetch(API_BASE + '/check-auth', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        if (resp.ok) {
            const data = await resp.json();
            return data.success;
        }
        removeToken();
        return false;
    } catch (e) {
        return false;
    }
}

/**
 * 显示登录弹窗
 */
function showLoginModal() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('active');
}

/**
 * 隐藏登录弹窗
 */
function hideLoginModal() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('active');
}

/**
 * 处理用户登录请求
 * 向服务器发送用户名密码，获取Token并存储
 */
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');

    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const resp = await fetch(API_BASE + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json();
        if (data.success) {
            setToken(data.token);
            localStorage.setItem('auth_username', data.username);
            hideLoginModal();
            errorEl.style.display = 'none';
            document.getElementById('loginPassword').value = '';
            updateUserInfo();
            // 登录成功后刷新所有页面模块
            if (typeof safeCall === 'function') {
                var fns = ['loadDashboard', 'loadEvents', 'loadAthletes', 'loadWeighinData', 'loadWeighinTolerance', 'loadAutoArrangeData', 'loadBracketClassList', 'loadBracketTestPage', 'loadMatches', 'loadTeamScores', 'loadMedalBoard', 'loadPoomsaeArrangeData', 'loadPoomsaeMatches'];
                fns.forEach(function(fn) { safeCall(fn); });
            }
        } else {
            errorEl.textContent = data.error || '登录失败';
            errorEl.style.display = 'block';
        }
    } catch (e) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.style.display = 'block';
    }
}

/**
 * 处理用户退出登录
 */
function handleLogout() {
    removeToken();
    updateUserInfo();
    showLoginModal();
}

/**
 * 更新页面上显示的当前登录用户信息
 */
function updateUserInfo() {
    const username = localStorage.getItem('auth_username') || '';
    const userSpan = document.getElementById('headerUsername');
    if (userSpan) userSpan.textContent = username || '未登录';
}

/**
 * 获取当前赛事ID的URL参数格式
 * @returns {string} - 格式如 "event_id=1"
 */
function getEventParam() {
    return currentEventId ? `event_id=${currentEventId}` : '';
}

/**
 * 获取当前赛事ID的对象格式
 * @returns {object} - 格式如 { event_id: 1 }
 */
function getEventParamObj() {
    return currentEventId ? { event_id: currentEventId } : {};
}

/**
 * 更新页面顶部显示的当前赛事徽章
 */
function updateEventBadge() {
    const badge = document.getElementById('currentEventBadge');
    const nameSpan = document.getElementById('currentEventBadgeName');
    if (!badge || !nameSpan) return;
    if (currentEventId && currentEventName) {
        badge.style.display = 'inline-flex';
        nameSpan.textContent = currentEventName;
    } else {
        badge.style.display = 'none';
        nameSpan.textContent = '未选择赛事';
    }
}

/**
 * 根据赛事类型更新编排菜单显示
 * 摔跤赛事显示摔跤编排，跆拳道显示跆拳道编排
 */
function updateArrangeMenu() {
    const menuBrackets = document.getElementById('menuBrackets');
    const menuBracketTest = document.getElementById('menuBracketTest');
    if (!menuBrackets || !menuBracketTest) return;

    if (currentEventType === 'wrestling') {
        menuBrackets.style.display = 'none';
        menuBracketTest.style.display = '';
    } else {
        menuBrackets.style.display = '';
        menuBracketTest.style.display = 'none';
    }
}

/**
 * 页面导航函数
 * 根据面板ID跳转到对应页面，并进行必要的验证
 * @param {string} panelId - 面板ID（如 'athletes', 'brackets', 'matches' 等）
 */
function showPanel(panelId) {
    const needEventValidation = ['athletes', 'weighin', 'brackets', 'bracketDetail', 'matches', 'teamScores', 'medalBoard', 'poomsae'];

    // 需要赛事的页面必须先选择赛事
    if (needEventValidation.includes(panelId) && !currentEventId) {
        alert('⚠️ 未选择赛事，请先进行赛事选择！');
        return;
    }

    const urlMap = {
        'dashboard': '/',
        'events': '/events',
        'athletes': '/athletes',
        'weighin': '/weighin',
        'brackets': '/brackets',
        'bracketDetail': '/bracket-detail',
        'bracketTest': '/bracket-test',
        'matches': '/matches',
        'teamScores': '/team-scores',
        'medalBoard': '/medal-board',
        'poomsae': '/poomsae'
    };
    const url = urlMap[panelId];
    if (url) {
        location.href = url;
    }
}

// 侧边栏折叠状态
let sidebarCollapsed = false;

/**
 * 切换侧边栏展开/折叠状态
 */
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('sidebar-collapsed', sidebarCollapsed);
    
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = sidebarCollapsed ? '☰ 显示菜单' : '☰ 隐藏菜单';
    }
}

/**
 * API GET请求封装
 * 自动添加认证Token，处理401错误
 * @param {string} path - API路径（如 '/athletes'）
 * @returns {Promise<object>} - 返回 { success, data } 格式的响应
 */
async function apiGet(path) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(API_BASE + path, { headers });
    if (resp.status === 401) {
        removeToken();
        showLoginModal();
        throw new Error('认证已过期，请重新登录');
    }
    return await resp.json();
}

/**
 * API POST请求封装
 * 自动添加认证Token和Content-Type头，处理401错误
 * @param {string} path - API路径
 * @param {object} data - 要发送的数据
 * @returns {Promise<object>} - 返回 { success, data } 格式的响应
 */
async function apiPost(path, data) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(API_BASE + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });
    if (resp.status === 401) {
        removeToken();
        showLoginModal();
        throw new Error('认证已过期，请重新登录');
    }
    return await resp.json();
}

/**
 * API PUT请求封装
 * 自动添加认证Token和Content-Type头，处理401错误
 * @param {string} path - API路径
 * @param {object} data - 要发送的数据
 * @returns {Promise<object>} - 返回 { success, data } 格式的响应
 */
async function apiPut(path, data) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(API_BASE + path, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data)
    });
    if (resp.status === 401) {
        removeToken();
        showLoginModal();
        throw new Error('认证已过期，请重新登录');
    }
    return await resp.json();
}

/**
 * API DELETE请求封装
 * 自动添加认证Token，处理401错误
 * @param {string} path - API路径
 * @returns {Promise<object>} - 返回 { success, data } 格式的响应
 */
async function apiDelete(path) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(API_BASE + path, {
        method: 'DELETE',
        headers
    });
    if (resp.status === 401) {
        removeToken();
        showLoginModal();
        throw new Error('认证已过期，请重新登录');
    }
    return await resp.json();
}

/**
 * 文件下载封装
 * 处理带认证的文件下载请求
 * @param {string} url - 文件下载URL
 */
async function downloadFile(url) {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
        const resp = await fetch(url, { headers });
        if (resp.status === 401) {
            removeToken();
            showLoginModal();
            alert('认证已过期，请重新登录');
            return;
        }
        const blob = await resp.blob();
        const contentDisposition = resp.headers.get('Content-Disposition');
        let filename = 'download';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;\n]+)/i);
            if (match) filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
        }
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.error('下载失败:', e);
        alert('下载失败: ' + e.message);
    }
}

// 全局状态变量 - 当前选中的级别和所有级别列表
let selectedClass = '';
let allWeightClasses = [];
let currentAthleteType = '';

/**
 * 格式化轮次名称
 * 将中文轮次名转换为标准格式（如 "决赛" -> "Final", "半决赛" -> "1/2"）
 * @param {string} name - 原始轮次名称
 * @returns {string} - 格式化后的轮次名称
 */
function formatRoundName(name) {
    if (!name) return '';
    if (name === '决赛' || name === 'Final') return 'Final';
    if (name === '半决赛') return '1/2';
    const m = name.match(/(\d+)\/(\d+)决赛?/);
    if (m) return m[1] + '/' + m[2];
    return name;
}

/**
 * 加载仪表盘数据
 * 获取运动员数量、比赛数量等统计信息并更新页面
 */
async function loadDashboard() {
    if (!currentEventId) return;
    try {
        const athletes = await apiGet('/athletes?' + getEventParam());
        const el = document.getElementById('totalAthletes');
        if (el) el.textContent = athletes.data ? athletes.data.length : 0;
    } catch (e) {}
    try {
        const matches = await apiGet('/matches?' + getEventParam());
        const total = document.getElementById('totalMatches');
        const active = document.getElementById('activeMatches');
        const pending = document.getElementById('pendingMatches');
        if (matches.data) {
            if (total) total.textContent = matches.data.length;
            if (active) active.textContent = matches.data.filter(m => m.match_status === '进行中').length;
            if (pending) pending.textContent = matches.data.filter(m => m.match_status === '未开始').length;
        }
    } catch (e) {}
    try {
        const events = await apiGet('/events');
        const info = document.getElementById('currentEventInfo');
        if (info && events.data) {
            const ev = events.data.find(e => e.id === currentEventId);
            if (ev) {
                info.innerHTML = '<div style="padding:16px;"><h3 style="margin-bottom:8px;">' + ev.name + '</h3><p style="color:#909399;">状态: ' + ev.status + '</p></div>';
            }
        }
    } catch (e) {}
}

/**
 * 下载团体总分模板
 */
function downloadTeamScoreTemplate() {
    downloadFile(API_BASE + '/templates/team-score');
}

/**
 * 下载奖牌模板
 */
function downloadMedalTemplate() {
    downloadFile(API_BASE + '/templates/medal');
}

/**
 * 下载成绩汇总模板
 */
function downloadResultSummaryTemplate() {
    downloadFile(API_BASE + '/templates/result-summary');
}

/**
 * 下载冠军模板
 */
function downloadChampionTemplate() {
    downloadFile(API_BASE + '/templates/champion');
}

/**
 * 加载赛事列表到指定的select元素
 * @param {string} selectId - select元素的ID
 */
async function loadEventsIntoSelect(selectId) {
    try {
        const response = await fetch('/api/events');
        const result = await response.json();
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // 保留第一个选项（通常是"全部赛事"）
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);
        
        if (result.success && result.data) {
            for (const event of result.data) {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = event.name;
                if (event.id === currentEventId) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
        }
    } catch (err) {
        console.error('加载赛事列表失败:', err);
    }
}

/**
 * 安全调用函数
 * 检查函数是否存在后再调用，避免报错
 * @param {string} fnName - 函数名称
 */
function safeCall(fnName) {
    if (typeof window[fnName] === 'function') {
        window[fnName]();
    }
}

/**
 * 级别选择器工具类
 * 提供级别过滤、HTML生成等功能
 */
const WeightClassSelector = {
    /**
     * 获取可用的级别列表
     * @param {array} athletesList - 运动员列表
     * @param {string} ageGroup - 年龄组过滤条件
     * @param {string} gender - 性别过滤条件
     * @param {string} athleteType - 运动员类型（默认 taekwondo_kyougi）
     * @returns {array} - 去重并排序后的级别列表
     */
    getAvailableClasses(athletesList, ageGroup, gender, athleteType = 'taekwondo_kyougi') {
        const filtered = athletesList.filter(a => {
            const matchAgeGroup = !ageGroup || (a.athlete_age_group || '') === ageGroup;
            const matchGender = a.athlete_gender === gender;
            const matchType = (a.athlete_type || 'taekwondo_kyougi') === athleteType;
            return matchAgeGroup && matchGender && matchType;
        });
        return [...new Set(filtered.map(a => a.athlete_category).filter(Boolean))].sort();
    },

    /**
     * 生成级别选择的HTML select元素
     * @param {string} selectId - select元素ID
     * @param {string} currentClass - 当前选中的级别
     * @param {array} availableClasses - 可用级别列表
     * @param {string} extraAttrs - 额外的HTML属性
     * @param {boolean} isUnqualified - 是否为不合格状态（影响样式）
     * @returns {string} - HTML字符串
     */
    generateSelectHtml(selectId, currentClass, availableClasses, extraAttrs = '', isUnqualified = false) {
        const baseStyle = isUnqualified
            ? 'padding:3px 6px;font-size:12px;border:1px solid #f56c6c;border-radius:4px;max-width:140px;background-color:#f56c6c;color:#fff;'
            : 'padding:3px 6px;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;max-width:140px;';

        let html = `<select id="${selectId}" style="${baseStyle}" ${extraAttrs}>`;
        availableClasses.forEach(cls => {
            const selected = cls === currentClass ? 'selected' : '';
            html += `<option value="${cls}" ${selected}>${cls}</option>`;
        });
        html += '</select>';
        return html;
    },

    /**
     * 生成带确认按钮的级别选择器
     * @param {string} selectId - select元素ID
     * @param {string} currentClass - 当前选中的级别
     * @param {array} availableClasses - 可用级别列表
     * @param {string} buttonOnClick - 按钮点击事件处理函数
     * @param {string} extraAttrs - 额外的HTML属性
     * @param {boolean} isUnqualified - 是否为不合格状态
     * @returns {string} - HTML字符串
     */
    generateSelectWithButton(selectId, currentClass, availableClasses, buttonOnClick, extraAttrs = '', isUnqualified = false) {
        const selectHtml = this.generateSelectHtml(selectId, currentClass, availableClasses, extraAttrs, isUnqualified);
        const buttonHtml = `<button class="btn btn-primary" onclick="${buttonOnClick}" style="padding:3px 8px;font-size:11px;margin-left:4px;">✓</button>`;
        return selectHtml + buttonHtml;
    }
};

// 模块导出（用于Node.js环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports.WeightClassSelector = WeightClassSelector;
}