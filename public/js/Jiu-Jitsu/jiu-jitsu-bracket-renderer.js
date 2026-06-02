/**
 * 柔术对阵图渲染器 (JJBracketRenderer)
 *
 * 职责：将后端返回的 jiu_jitsu_matchs 数据转换为 brackets-viewer 库所需的数据格式，
 *       并调用 bracketsViewer.render() 渲染对阵图到页面。
 *
 * 依赖：
 *   - window.bracketsViewer（brackets-viewer 库全局实例）
 *   - currentEventId（全局变量，当前赛事ID）
 *   - replaceByeText() / attachBracketDblClick()（全局工具函数）
 *
 * 核心数据转换流程：
 *   jiu_jitsu_matchs[] → 提取participants → 构建stages/groups/rounds/matches/matchGames
 *                        → bracketsViewer.render(bracketData) → DOM渲染
 *
 * 支持两种渲染模式：
 *   1. 独立页面模式 (renderXxx)：渲染到 #bracketDisplay 容器，用于单独查看某个级别的对阵图
 *   2. Section列表模式 (_renderXxxInSection)：渲染到指定容器内，用于一次性展示所有级别对阵图
 *
 * 各赛制渲染方法对应关系：
 *   - round_robin         → renderRoundRobin / _renderRoundRobinInSection
 *   - pool_elimination    → _renderPoolEliminationInline
 *   - single_elimination  → renderSingleElimination → _renderElimination
 *   - double_elimination  → renderDoubleElimination → _renderElimination(compMode='double')
 *
 * customRoundName 回调中的 groupType 值说明（来自 brackets-viewer 库）：
 *   'single_bracket'   单败淘汰赛
 *   'winner_bracket'   双败淘汰赛-胜者组
 *   'loser_bracket'    双败淘汰赛-败者组（铜牌赛，通过 info.groupType === 'loser-bracket' 判断）
 *   'final_group'      决赛场次
 *   'round-robin'      循环赛
 *
 * 双败淘汰赛赛制说明（使用两个独立 single_elimination stage 实现）：
 *   Stage 1 胜者组（single_elimination）：1/4 → 1/2 → Final（决赛，决出冠军）
 *   Stage 2 铜牌赛（single_elimination，可选）：仅 Bro.m 铜牌赛场次
 *   无 Grand Final，胜者组决赛冠军即为总冠军
 *   注意：不使用 brackets-viewer 的 double_elimination 类型（该类型有硬编码的完整败者组+Grand Final结构）
 */
const JJBracketRenderer = {

    _attachVenueLabels: function(container, jjMatches) {
        if (!container || !jjMatches || jjMatches.length === 0) return;
        const venueMap = new Map();
        for (const m of jjMatches) {
            const vn = (m.jiu_jitsu_match_venue !== null && m.jiu_jitsu_match_id !== null)
                ? (String(m.jiu_jitsu_match_venue) + String(m.jiu_jitsu_match_id)) : '';
            if (m.jiu_jitsu_bracket_match_id && vn) venueMap.set(String(m.jiu_jitsu_bracket_match_id), vn);
        }
        if (venueMap.size === 0) return;
        container.querySelectorAll('.match').forEach(matchEl => {
            const matchId = matchEl.getAttribute('data-match-id');
            const vn = venueMap.get(matchId);
            if (vn) {
                const labelEl = matchEl.querySelector('.opponents > span:first-child');
                if (labelEl) {
                    labelEl.textContent = vn;
                    if (/^[A-Z]\d{3,}$/.test(vn)) labelEl.classList.add('venue-highlight');
                }
            }
        });
    },

    /**
     * 渲染单循环赛对阵图（独立页面模式）
     * 将所有比赛放在一个 round_robin stage 中，支持显示排名表。
     *
     * @param {string} weightClass  级别名称（如 "70kg"）
     * @param {Array} jjMatches    该级别的 jiu_jitsu_matchs 记录数组
     */
    renderRoundRobin: async function(weightClass, jjMatches) {
        if (!jjMatches || jjMatches.length === 0) return;

        const participantMap = new Map();
        let pid = 1;
        const getPid = (name, team, drawNum) => {
            if (!name) return null;
            const key = name + '|' + (team || '');
            if (!participantMap.has(key)) {
                let displayName = name;
                if (drawNum != null && drawNum !== '') {
                    displayName = `${drawNum}. ${name}`;
                }
                participantMap.set(key, { 
                    id: pid++, 
                    name: team ? `${displayName} (${team})` : displayName,
                    drawNum: drawNum
                });
            }
            return participantMap.get(key).id;
        };

        jjMatches.forEach(m => {
            if (m.jiu_jitsu_blue_athlete_name) getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
            if (m.jiu_jitsu_red_athlete_name) getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
        });

        const participants = Array.from(participantMap.values());
        if (participants.length === 0) {
            document.getElementById('bracketDisplay').innerHTML = '<p style="text-align:center;color:#909399;padding:40px 0;">该级别暂无参赛者数据</p>';
            return;
        }

        const roundNums = [...new Set(jjMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n && n < 999))].sort((a, b) => a - b);
        const hasFinal = jjMatches.some(m => m.jiu_jitsu_match_round_num >= 999);
        const isFinal = jjMatches.length === 1 && hasFinal;
        const effectiveRoundCount = isFinal ? 1 : roundNums.length;
        const n = participants.length;

        const roundNumToId = new Map();
        if (isFinal) {
            roundNumToId.set(999, 1);
        } else {
            roundNums.forEach((rn, idx) => { roundNumToId.set(rn, idx + 1); });
        }

        const stageType = isFinal ? 'single_elimination' : 'round_robin';
        const stageSettings = isFinal
            ? { size: 2, manualOrdering: [[1, 2]] }
            : { size: n, groupCount: 1, seeding: participants.map(p => p.name) };

        const stages = [{ id: 1, tournament_id: Number(currentEventId), name: weightClass, type: stageType, number: 1, settings: stageSettings }];
        const groups = [{ id: 1, stage_id: 1, number: 1 }];

        const rounds = [];
        if (isFinal) {
            rounds.push({ id: 1, stage_id: 1, group_id: 1, number: 1, name: 'Final' });
        } else {
            for (let r = 1; r <= effectiveRoundCount; r++) {
                rounds.push({ id: r, stage_id: 1, group_id: 1, number: r, name: `R${r}` });
            }
        }

        const matches = [];
        const matchGames = [];
        jjMatches.forEach((m, idx) => {
            const redId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team) : null;
            const blueId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team) : null;

            let status = 2;
            if (m.jiu_jitsu_match_status === 'bye') status = 4;
            if (m.jiu_jitsu_match_status === '进行中') status = 3;
            if (m.jiu_jitsu_match_status === '已结束') status = 4;

            const opponent1 = redId ? { id: redId, score: 0 } : null;
            const opponent2 = blueId ? { id: blueId, score: 0 } : null;

            if (m.jiu_jitsu_match_status === '已结束') {
                if (m.jiu_jitsu_winner === '红方' && opponent1) opponent1.result = 'win';
                if (m.jiu_jitsu_winner === '蓝方' && opponent2) opponent2.result = 'win';
            }

            const rid = roundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
            matches.push({
                id: m.id || (idx + 1), stage_id: 1, group_id: 1,
                round_id: rid, number: idx + 1,
                child_count: 1, opponent1, opponent2, status
            });

            matchGames.push({
                id: idx + 1, stage_id: 1, parent_id: m.id || (idx + 1),
                number: 1, status,
                opponent1: opponent1 ? { ...opponent1 } : null,
                opponent2: opponent2 ? { ...opponent2 } : null
            });
        });

        const bracketData = { stages, groups, rounds, matches, matchGames, participants };

        document.getElementById('bracketDisplay').innerHTML = `
            <h3 style="margin-bottom:16px;">${weightClass} 单循环赛对阵图</h3>
            <div id="bracket-viewer-container" class="brackets-viewer" style="overflow-x:auto;padding:16px;background:#fff;border-radius:8px;"></div>
        `;

        await new Promise(resolve => setTimeout(resolve, 100));

        if (window.bracketsViewer) {
            try {
                await window.bracketsViewer.render(bracketData, {
                    selector: '#bracket-viewer-container',
                    clear: true,
                    showRankingTable: !isFinal,
                    participantOriginPlacement: 'none',
                    customRoundName: (info) => {
                        if (isFinal) return 'Final';
                        return `R${info.roundNumber}`;
                    }
                });
                requestAnimationFrame(() => { replaceByeText(document.getElementById('bracket-viewer-container')); });
                this._attachVenueLabels(document.getElementById('bracket-viewer-container'), jjMatches);
                attachBracketDblClick();
            } catch (err) {
                console.error('渲染循环赛对阵图失败:', err);
            }
        }
    },

    /**
     * 渲染单败淘汰赛对阵图（独立页面模式）→ 委托给 _renderElimination
     */
    renderSingleElimination: async function(weightClass, jjMatches) {
        return this._renderElimination(weightClass, jjMatches, 'single_elimination');
    },

    /**
     * 渲染双败淘汰赛对阵图（独立页面模式）→ 委托给 _renderElimination
     * customRoundName 中区分胜者组和败者组轮次命名
     */
    renderDoubleElimination: async function(weightClass, jjMatches) {
        return this._renderElimination(weightClass, jjMatches, 'double_elimination');
    },

    /**
     * Section列表模式入口：根据赛制分发到对应的 _renderXxxInSection 方法
     * 用于在同一个页面内展示多个级别的对阵图（每个级别一个section容器）
     *
     * @param {string|HTMLElement} selector  目标容器DOM元素或ID
     * @param {string} weightClass           级别名称
     * @param {Array} jjMatches              该级别 jiu_jitsu_matchs 记录
     * @param {string} compMode              竞赛方式标识
     */
    renderInSection: async function(selector, weightClass, jjMatches, compMode) {
        const container = typeof selector === 'string' ? document.getElementById(selector) : selector;
        if (!container || !jjMatches || jjMatches.length === 0) return;

        if (compMode === 'round_robin') {
            await this._renderRoundRobinInSection(container, weightClass, jjMatches);
        } else if (compMode === 'pool_elimination') {
            await this._renderPoolEliminationInline(container, weightClass, jjMatches);
        } else {
            await this._renderEliminationInSection(container, weightClass, jjMatches, compMode);
        }
    },

    /**
     * 淘汰赛（单败/双败）核心渲染方法（独立页面模式）
     * 将运动员映射为 brackets-viewer 的 participant/opponent 结构，
     * 根据 compMode 设置不同的 stage type 和 customRoundName。
     *
     * @param {string} weightClass  级别名称
     * @param {Array} jjMatches    jiu_jitsu_matchs 记录
     * @param {string} compMode    'single_elimination' | 'double_elimination'
     */
    _renderElimination: async function(weightClass, jjMatches, compMode) {
        const participantMap = new Map();
        let pid = 1;
        const getPid = (name, team, drawNum) => {
            if (!name || name === '上区第一' || name === '下区第一') return null;
            const key = name + '|' + (team || '');
            if (!participantMap.has(key)) {
                let displayName = name;
                if (drawNum != null && drawNum !== '') {
                    displayName = `${drawNum}. ${name}`;
                }
                participantMap.set(key, { 
                    id: pid++, 
                    name: team ? `${displayName} (${team})` : displayName,
                    drawNum: drawNum
                });
            }
            return participantMap.get(key).id;
        };

        jjMatches.forEach(m => {
            if (m.jiu_jitsu_blue_athlete_name) getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
            if (m.jiu_jitsu_red_athlete_name) getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
        });

        const participants = Array.from(participantMap.values());
        if (participants.length === 0) {
            document.getElementById('bracketDisplay').innerHTML = '<p style="text-align:center;color:#909399;padding:40px 0;">该级别暂无参赛者数据</p>';
            return;
        }

        const n = participants.length;
        const bSize = Math.pow(2, Math.ceil(Math.log2(n || 2)));

        const isBronzeMatch = (m) => {
            const rn = (m.jiu_jitsu_match_round_name || '').trim();
            return rn === 'Bro.m' || rn.includes('铜牌');
        };

        const buildOpponents = (m) => {
            const redId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
            const blueId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;

            let status = 2;
            if (m.jiu_jitsu_match_status === 'bye') status = 4;
            if (m.jiu_jitsu_match_status === '进行中') status = 3;
            if (m.jiu_jitsu_match_status === '已结束') status = 4;

            const opponent1 = redId ? { id: redId, score: 0 } : null;
            const opponent2 = blueId ? { id: blueId, score: 0 } : null;

            if (m.jiu_jitsu_match_status === '已结束') {
                if (m.jiu_jitsu_winner === '红方' && opponent1) opponent1.result = 'win';
                if (m.jiu_jitsu_winner === '蓝方' && opponent2) opponent2.result = 'win';
            }

            return { opponent1, opponent2, status };
        };

        let bracketData;

        if (compMode === 'double_elimination') {
            const winnerMatches = jjMatches.filter(m => !isBronzeMatch(m));
            const loserMatches = jjMatches.filter(m => isBronzeMatch(m));

            const winnerRoundNums = [...new Set(winnerMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n != null))].sort((a, b) => a - b);
            const winnerRoundsCount = winnerRoundNums.length || 1;

            const stages = [];
            const groups = [];
            const rounds = [];
            const matchData = [];
            const matchGames = [];

            let sid = 0, gid = 0, rid = 0, mid = 0;

            sid++;
            const wSid = sid;
            gid++;
            const wGid = gid;
            stages.push({ id: wSid, tournament_id: Number(currentEventId), name: weightClass + '_胜者组', type: 'single_elimination', number: wSid, settings: { size: bSize, manualOrdering: [generateJJSeedOrder(bSize)] } });
            groups.push({ id: wGid, stage_id: wSid, number: 1 });

            const winnerRoundNumToId = new Map();
            const winnerRoundNames = [];
            winnerRoundNums.forEach((rn, idx) => {
                rid++;
                winnerRoundNumToId.set(rn, rid);
                const rnStr = winnerMatches.find(m => m.jiu_jitsu_match_round_num === rn)?.jiu_jitsu_match_round_name || `Round ${idx + 1}`;
                winnerRoundNames.push(rnStr);
                rounds.push({ id: rid, stage_id: wSid, group_id: wGid, number: idx + 1, name: rnStr });
            });

            winnerMatches.forEach((m) => {
                mid++;
                const { opponent1, opponent2, status } = buildOpponents(m);
                const rrid = winnerRoundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
                matchData.push({
                    id: m.id || mid, stage_id: wSid, group_id: wGid,
                    round_id: rrid, number: mid,
                    child_count: 1, opponent1, opponent2, status
                });
                matchGames.push({
                    id: mid, stage_id: wSid, parent_id: m.id || mid,
                    number: 1, status,
                    opponent1: opponent1 ? { ...opponent1 } : null,
                    opponent2: opponent2 ? { ...opponent2 } : null
                });
            });

            if (loserMatches.length > 0) {
                sid++;
                const lSid = sid;
                gid++;
                const lGid = gid;
                const bronzeSize = Math.max(4, Math.pow(2, Math.ceil(Math.log2(loserMatches.length * 2))));
                stages.push({ id: lSid, tournament_id: Number(currentEventId), name: weightClass + '_铜牌赛', type: 'single_elimination', number: lSid, settings: { size: bronzeSize } });
                groups.push({ id: lGid, stage_id: lSid, number: 1 });

                rid++;
                const bronzeRid = rid;
                rounds.push({ id: bronzeRid, stage_id: lSid, group_id: lGid, number: 1, name: 'Bro.m' });

                loserMatches.forEach((m) => {
                    mid++;
                    const { opponent1, opponent2, status } = buildOpponents(m);
                    matchData.push({
                        id: m.id || mid, stage_id: lSid, group_id: lGid,
                        round_id: bronzeRid, number: mid,
                        child_count: 1, opponent1, opponent2, status
                    });
                    matchGames.push({
                        id: mid, stage_id: lSid, parent_id: m.id || mid,
                        number: 1, status,
                        opponent1: opponent1 ? { ...opponent1 } : null,
                        opponent2: opponent2 ? { ...opponent2 } : null
                    });
                });
            }

            bracketData = { stages, groups, rounds, matches: matchData, matchGames, participants };
        } else {
            const roundNums = [...new Set(jjMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n != null))].sort((a, b) => a - b);
            const roundNumToId = new Map();
            roundNums.forEach((rn, idx) => { roundNumToId.set(rn, idx + 1); });

            const stages = [{ id: 1, tournament_id: Number(currentEventId), name: weightClass, type: compMode, number: 1, settings: { size: bSize, manualOrdering: [generateJJSeedOrder(bSize)] } }];
            const groups = [{ id: 1, stage_id: 1, number: 1 }];

            const roundData = [];
            roundNums.forEach((rn, idx) => {
                const rnStr = jjMatches.find(m => m.jiu_jitsu_match_round_num === rn)?.jiu_jitsu_match_round_name || `Round ${idx + 1}`;
                roundData.push({ id: idx + 1, stage_id: 1, group_id: 1, number: idx + 1, name: rnStr });
            });

            const matchData = [];
            const matchGames = [];
            jjMatches.forEach((m, idx) => {
                const { opponent1, opponent2, status } = buildOpponents(m);
                const rid = roundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
                matchData.push({
                    id: m.id || (idx + 1), stage_id: 1, group_id: 1,
                    round_id: rid, number: idx + 1,
                    child_count: 1, opponent1, opponent2, status
                });
                matchGames.push({
                    id: idx + 1, stage_id: 1, parent_id: m.id || (idx + 1),
                    number: 1, status,
                    opponent1: opponent1 ? { ...opponent1 } : null,
                    opponent2: opponent2 ? { ...opponent2 } : null
                });
            });

            bracketData = { stages, groups, rounds: roundData, matches: matchData, matchGames, participants };
        }

        document.getElementById('bracketDisplay').innerHTML = `
            <h3 style="margin-bottom:16px;">${weightClass}${getStageTypeName(compMode)}对阵图</h3>
            <div id="bracket-viewer-container" class="brackets-viewer" style="overflow-x:auto;padding:16px;background:#fff;border-radius:8px;"></div>
        `;

        await new Promise(resolve => setTimeout(resolve, 100));

        if (window.bracketsViewer) {
            try {
                await window.bracketsViewer.render(bracketData, {
                    selector: '#bracket-viewer-container',
                    clear: true,
                    showRankingTable: false,
                    participantOriginPlacement: 'none',
                    customRoundName: (info) => {
                        const sn = info.stageName || '';
                        if (sn.includes('铜牌赛')) return 'Bro.m';
                        if (compMode !== 'double_elimination') {
                            const round = bracketData.rounds.find(r => r.id === info.roundNumber || r.number === info.roundNumber);
                            return round ? round.name : `Round ${info.roundNumber}`;
                        }
                        return undefined;
                    }
                });
                requestAnimationFrame(() => { replaceByeText(document.getElementById('bracket-viewer-container')); });
                this._attachVenueLabels(document.getElementById('bracket-viewer-container'), jjMatches);
                attachBracketDblClick();
            } catch (err) {
                console.error('渲染对阵图失败:', err);
            }
        }
    },

    /**
     * 循环赛 Section 列表渲染（嵌入模式）
     * 与 renderRoundRobin 逻辑相同，但渲染到指定的容器元素而非 #bracketDisplay
     */
    _renderRoundRobinInSection: async function(container, weightClass, jjMatches) {
        if (!window.bracketsViewer) return;
        const sectionId = 'jj-rr-' + weightClass.replace(/[^a-zA-Z0-9]/g, '');
        const div = document.createElement('div');
        div.id = sectionId;
        container.appendChild(div);

        const participantMap = new Map();
        let pid = 1;
        const getPid = (name, team, drawNum) => {
            if (!name) return null;
            const key = name + '|' + (team || '');
            if (!participantMap.has(key)) {
                let displayName = name;
                if (drawNum != null && drawNum !== '') {
                    displayName = `${drawNum}. ${name}`;
                }
                participantMap.set(key, { 
                    id: pid++, 
                    name: team ? `${displayName} (${team})` : displayName,
                    drawNum: drawNum
                });
            }
            return participantMap.get(key).id;
        };
        jjMatches.forEach(m => {
            if (m.jiu_jitsu_blue_athlete_name) getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
            if (m.jiu_jitsu_red_athlete_name) getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
        });
        const participants = Array.from(participantMap.values());
        if (participants.length === 0) return;

        const roundNums = [...new Set(jjMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n && n < 999))].sort((a, b) => a - b);
        const hasFinal = jjMatches.some(m => m.jiu_jitsu_match_round_num >= 999);
        const isFinal = jjMatches.length === 1 && hasFinal;
        const effectiveRoundCount = isFinal ? 1 : roundNums.length;
        const stageType = isFinal ? 'single_elimination' : 'round_robin';

        const roundNumToId = new Map();
        if (isFinal) {
            roundNumToId.set(999, 1);
        } else {
            roundNums.forEach((rn, idx) => { roundNumToId.set(rn, idx + 1); });
        }

        const stages = [{ id: 1, tournament_id: Number(currentEventId), name: weightClass, type: stageType, number: 1, settings: { size: participants.length, groupCount: 1 } }];
        const groups = [{ id: 1, stage_id: 1, number: 1 }];
        const rounds = [];
        if (isFinal) {
            rounds.push({ id: 1, stage_id: 1, group_id: 1, number: 1, name: 'Final' });
        } else {
            for (let r = 1; r <= effectiveRoundCount; r++) {
                rounds.push({ id: r, stage_id: 1, group_id: 1, number: r, name: `R${r}` });
            }
        }
        const matches = [];
        const matchGames = [];
        jjMatches.forEach((m, idx) => {
            const redId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
            const blueId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;
            let status = 2;
            if (m.jiu_jitsu_match_status === '已结束') status = 4;
            if (m.jiu_jitsu_match_status === '进行中') status = 3;
            const opponent1 = redId ? { id: redId, score: 0 } : null;
            const opponent2 = blueId ? { id: blueId, score: 0 } : null;
            const rid = roundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
            matches.push({ id: m.id || (idx + 1), stage_id: 1, group_id: 1, round_id: rid, number: idx + 1, child_count: 1, opponent1, opponent2, status });
            matchGames.push({ id: idx + 1, stage_id: 1, parent_id: m.id || (idx + 1), number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
        });

        try {
            await window.bracketsViewer.render({ stages, groups, rounds, matches, matchGames, participants }, {
                selector: '#' + sectionId, clear: true,
                showRankingTable: !isFinal, participantOriginPlacement: 'none',
                customRoundName: (info) => isFinal ? 'Final' : `R${info.roundNumber}`
            });
            this._attachVenueLabels(document.getElementById(sectionId), jjMatches);
        } catch (e) {
            console.warn(`渲染循环赛 ${weightClass} 失败:`, e);
        }
    },

    _renderPoolEliminationInline: async function(container, weightClass, jjMatches) {
        if (!window.bracketsViewer) return;
        const sectionId = 'jj-pe-' + weightClass.replace(/[^a-zA-Z0-9]/g, '');
        const div = document.createElement('div');
        div.id = sectionId;
        container.appendChild(div);

        const participantMap = new Map();
        let pid = 1;
        const getPid = (name, team, drawNum) => {
            if (!name || name === '上区第一' || name === '下区第一') return null;
            const key = name + '|' + (team || '');
            if (!participantMap.has(key)) {
                let displayName = name;
                if (drawNum != null && drawNum !== '') {
                    displayName = `${drawNum}. ${name}`;
                }
                participantMap.set(key, { 
                    id: pid++, 
                    name: team ? `${displayName} (${team})` : displayName,
                    drawNum: drawNum
                });
            }
            return participantMap.get(key).id;
        };
        jjMatches.forEach(m => {
            if (m.jiu_jitsu_blue_athlete_name) getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
            if (m.jiu_jitsu_red_athlete_name) getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
        });
        if (participantMap.size === 0) return;

        const upperMatches = jjMatches.filter(m => m.jiu_jitsu_match_zone === 'upper');
        const lowerMatches = jjMatches.filter(m => m.jiu_jitsu_match_zone === 'lower');
        const finalMatches = jjMatches.filter(m => m.jiu_jitsu_match_zone === 'final' || m.jiu_jitsu_match_round_name === 'R.Final');

        const upperFirstPid = pid++;
        participantMap.set('上区第一|', { id: upperFirstPid, name: '上区第一' });
        const lowerFirstPid = pid++;
        participantMap.set('下区第一|', { id: lowerFirstPid, name: '下区第一' });

        const participants = Array.from(participantMap.values());

        const stages = [];
        const groups = [];
        const rounds = [];
        const matches = [];
        const matchGames = [];
        let stageId = 0, groupId = 0, roundId = 0, matchId = 0;

        const sid = ++stageId;

        const upperPids = new Set();
        upperMatches.forEach(m => {
            const rId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
            const bId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;
            if (rId) upperPids.add(rId);
            if (bId) upperPids.add(bId);
        });
        const lowerPids = new Set();
        lowerMatches.forEach(m => {
            const rId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
            const bId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;
            if (rId) lowerPids.add(rId);
            if (bId) lowerPids.add(bId);
        });

        const totalSize = upperPids.size + lowerPids.size;
        const groupCount = finalMatches.length > 0 ? 3 : 2;
        stages.push({ id: sid, tournament_id: Number(currentEventId), name: `${weightClass}_分区循环赛`, type: 'round_robin', number: sid, settings: { size: totalSize, groupCount } });

        const addZoneGroup = (zoneMatches, zoneLabel) => {
            if (zoneMatches.length === 0) return;
            groupId++;
            const gid = groupId;
            const zRoundNums = [...new Set(zoneMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n && n < 999))].sort((a, b) => a - b);
            const zMaxRound = zRoundNums.length;

            groups.push({ id: gid, stage_id: sid, number: gid, name: zoneLabel });

            const roundNumToRid = new Map();
            const firstRoundId = roundId + 1;
            for (let r = 1; r <= zMaxRound; r++) {
                roundId++;
                roundNumToRid.set(zRoundNums[r - 1], roundId);
                rounds.push({ id: roundId, stage_id: sid, group_id: gid, number: r, name: `R${r}` });
            }

            zoneMatches.forEach(m => {
                const redId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
                const blueId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;
                let status = 2;
                if (m.jiu_jitsu_match_status === '已结束') status = 4;
                if (m.jiu_jitsu_match_status === '进行中') status = 3;
                const opponent1 = redId ? { id: redId, score: 0 } : null;
                const opponent2 = blueId ? { id: blueId, score: 0 } : null;
                if (m.jiu_jitsu_match_status === '已结束') {
                    if (m.jiu_jitsu_winner === '红方' && opponent1) opponent1.result = 'win';
                    if (m.jiu_jitsu_winner === '蓝方' && opponent2) opponent2.result = 'win';
                }
                matchId++;
                const rid = roundNumToRid.get(m.jiu_jitsu_match_round_num) || firstRoundId;
                matches.push({ id: m.id || matchId, stage_id: sid, group_id: gid, round_id: rid, number: matchId, child_count: 1, opponent1, opponent2, status });
                matchGames.push({ id: matchId, stage_id: sid, parent_id: m.id || matchId, number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
            });
        };

        addZoneGroup(upperMatches, '上区循环赛');
        addZoneGroup(lowerMatches, '下区循环赛');

        if (finalMatches.length > 0) {
            groupId++;
            const gid = groupId;
            roundId++;
            const rid = roundId;

            groups.push({ id: gid, stage_id: sid, number: gid, name: '分区循环赛决赛' });
            rounds.push({ id: rid, stage_id: sid, group_id: gid, number: 1, name: 'R.Final' });

            finalMatches.forEach(m => {
                let redId, blueId;
                if (m.jiu_jitsu_red_athlete_name && m.jiu_jitsu_red_athlete_name !== '上区第一' && m.jiu_jitsu_red_athlete_name !== '下区第一') {
                    redId = getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
                } else if (m.jiu_jitsu_red_athlete_name === '上区第一') {
                    redId = upperFirstPid;
                } else if (m.jiu_jitsu_red_athlete_name === '下区第一') {
                    redId = lowerFirstPid;
                }
                if (m.jiu_jitsu_blue_athlete_name && m.jiu_jitsu_blue_athlete_name !== '上区第一' && m.jiu_jitsu_blue_athlete_name !== '下区第一') {
                    blueId = getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
                } else if (m.jiu_jitsu_blue_athlete_name === '下区第一') {
                    blueId = lowerFirstPid;
                } else if (m.jiu_jitsu_blue_athlete_name === '上区第一') {
                    blueId = upperFirstPid;
                }
                let status = 2;
                if (m.jiu_jitsu_match_status === '已结束') status = 4;
                const opponent1 = redId ? { id: redId, score: 0 } : null;
                const opponent2 = blueId ? { id: blueId, score: 0 } : null;
                if (m.jiu_jitsu_match_status === '已结束') {
                    if (m.jiu_jitsu_winner === '红方' && opponent1) opponent1.result = 'win';
                    if (m.jiu_jitsu_winner === '蓝方' && opponent2) opponent2.result = 'win';
                }
                matchId++;
                matches.push({ id: m.id || matchId, stage_id: sid, group_id: gid, round_id: rid, number: matchId, child_count: 1, opponent1, opponent2, status });
                matchGames.push({ id: matchId, stage_id: sid, parent_id: m.id || matchId, number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
            });
        }

        try {
            await window.bracketsViewer.render({ stages, groups, rounds, matches, matchGames, participants }, {
                selector: '#' + sectionId, clear: true,
                showRankingTable: true, participantOriginPlacement: 'none',
                customRoundName: (info) => {
                    if (info.groupName === '分区循环赛决赛') return 'R.Final';
                    return `R${info.roundNumber}`;
                }
            });
            this._attachVenueLabels(document.getElementById(sectionId), jjMatches);
        } catch (e) {
            console.warn(`渲染分区循环赛 ${weightClass} 失败:`, e);
        }
    },

    /**
     * 与 _renderElimination 逻辑相同，但渲染到指定的容器元素
     */
    _renderEliminationInSection: async function(container, weightClass, jjMatches, compMode) {
        if (!window.bracketsViewer) return;
        const sectionId = 'jj-el-' + weightClass.replace(/[^a-zA-Z0-9]/g, '');
        const div = document.createElement('div');
        div.id = sectionId;
        container.appendChild(div);

        const participantMap = new Map();
        let pid = 1;
        const getPid = (name, team, drawNum) => {
            if (!name) return null;
            const key = name + '|' + (team || '');
            if (!participantMap.has(key)) {
                let displayName = name;
                if (drawNum != null && drawNum !== '') {
                    displayName = `${drawNum}. ${name}`;
                }
                participantMap.set(key, { 
                    id: pid++, 
                    name: team ? `${displayName} (${team})` : displayName,
                    drawNum: drawNum
                });
            }
            return participantMap.get(key).id;
        };
        jjMatches.forEach(m => {
            if (m.jiu_jitsu_blue_athlete_name) getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num);
            if (m.jiu_jitsu_red_athlete_name) getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num);
        });
        const participants = Array.from(participantMap.values());
        if (participants.length === 0) return;

        const n = participants.length;
        const bSize = Math.pow(2, Math.ceil(Math.log2(n || 2)));

        const isBronzeMatch = (m) => {
            const rn = (m.jiu_jitsu_match_round_name || '').trim();
            return rn === 'Bro.m' || rn.includes('铜牌');
        };

        const buildOpponents = (m) => {
            const redId = m.jiu_jitsu_red_athlete_name ? getPid(m.jiu_jitsu_red_athlete_name, m.jiu_jitsu_red_athlete_team, m.jiu_jitsu_red_athlete_draw_num) : null;
            const blueId = m.jiu_jitsu_blue_athlete_name ? getPid(m.jiu_jitsu_blue_athlete_name, m.jiu_jitsu_blue_athlete_team, m.jiu_jitsu_blue_athlete_draw_num) : null;
            let status = 2;
            if (m.jiu_jitsu_match_status === '已结束') status = 4;
            if (m.jiu_jitsu_match_status === '进行中') status = 3;
            const opponent1 = redId ? { id: redId, score: 0 } : null;
            const opponent2 = blueId ? { id: blueId, score: 0 } : null;
            if (m.jiu_jitsu_match_status === '已结束') {
                if (m.jiu_jitsu_winner === '红方' && opponent1) opponent1.result = 'win';
                if (m.jiu_jitsu_winner === '蓝方' && opponent2) opponent2.result = 'win';
            }
            return { opponent1, opponent2, status };
        };

        if (compMode === 'double_elimination') {
            const winnerMatches = jjMatches.filter(m => !isBronzeMatch(m));
            const loserMatches = jjMatches.filter(m => isBronzeMatch(m));

            let sid = 0, gid = 0, rid = 0, mid = 0;
            const stages = [];
            const groups = [];
            const rounds = [];
            const matches = [];
            const matchGames = [];

            sid++;
            const wSid = sid;
            gid++;
            const wGid = gid;
            stages.push({ id: wSid, tournament_id: Number(currentEventId), name: weightClass + '_胜者组', type: 'single_elimination', number: wSid, settings: { size: bSize, manualOrdering: [generateJJSeedOrder(bSize)] } });
            groups.push({ id: wGid, stage_id: wSid, number: 1 });

            const winnerRoundNums = [...new Set(winnerMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n != null))].sort((a, b) => a - b);
            const winnerRoundNumToId = new Map();
            winnerRoundNums.forEach((rn, idx) => {
                rid++;
                winnerRoundNumToId.set(rn, rid);
                const rnStr = winnerMatches.find(m => m.jiu_jitsu_match_round_num === rn)?.jiu_jitsu_match_round_name || `Round ${idx + 1}`;
                rounds.push({ id: rid, stage_id: wSid, group_id: wGid, number: idx + 1, name: rnStr });
            });

            winnerMatches.forEach((m) => {
                mid++;
                const { opponent1, opponent2, status } = buildOpponents(m);
                const rrid = winnerRoundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
                matches.push({ id: m.id || mid, stage_id: wSid, group_id: wGid, round_id: rrid, number: mid, child_count: 1, opponent1, opponent2, status });
                matchGames.push({ id: mid, stage_id: wSid, parent_id: m.id || mid, number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
            });

            if (loserMatches.length > 0) {
                sid++;
                const lSid = sid;
                gid++;
                const lGid = gid;
                const bronzeSize = Math.max(4, Math.pow(2, Math.ceil(Math.log2(loserMatches.length * 2))));
                stages.push({ id: lSid, tournament_id: Number(currentEventId), name: weightClass + '_铜牌赛', type: 'single_elimination', number: lSid, settings: { size: bronzeSize } });
                groups.push({ id: lGid, stage_id: lSid, number: 1 });

                rid++;
                const bronzeRid = rid;
                rounds.push({ id: bronzeRid, stage_id: lSid, group_id: lGid, number: 1, name: 'Bro.m' });

                loserMatches.forEach((m) => {
                    mid++;
                    const { opponent1, opponent2, status } = buildOpponents(m);
                    matches.push({ id: m.id || mid, stage_id: lSid, group_id: lGid, round_id: bronzeRid, number: mid, child_count: 1, opponent1, opponent2, status });
                    matchGames.push({ id: mid, stage_id: lSid, parent_id: m.id || mid, number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
                });
            }

            try {
                await window.bracketsViewer.render({ stages, groups, rounds, matches, matchGames, participants }, {
                    selector: '#' + sectionId, clear: true,
                    showRankingTable: false, participantOriginPlacement: 'none',
                    customRoundName: (info) => {
                        const sn = info.stageName || '';
                        if (sn.includes('铜牌赛')) return 'Bro.m';
                        return undefined;
                    }
                });
                this._attachVenueLabels(document.getElementById(sectionId), jjMatches);
            } catch (e) {
                console.warn(`渲染对阵图 ${weightClass} 失败:`, e);
            }
        } else {
            const stages = [{ id: 1, tournament_id: Number(currentEventId), name: weightClass, type: compMode, number: 1, settings: { size: bSize, manualOrdering: [generateJJSeedOrder(bSize)] } }];
            const groups = [{ id: 1, stage_id: 1, number: 1 }];

            const roundNums = [...new Set(jjMatches.map(m => m.jiu_jitsu_match_round_num).filter(n => n != null))].sort((a, b) => a - b);
            const roundNumToId = new Map();
            roundNums.forEach((rn, idx) => { roundNumToId.set(rn, idx + 1); });

            const rounds = [];
            roundNums.forEach((rn, idx) => {
                const rnStr = jjMatches.find(m => m.jiu_jitsu_match_round_num === rn)?.jiu_jitsu_match_round_name || `Round ${idx + 1}`;
                rounds.push({ id: idx + 1, stage_id: 1, group_id: 1, number: idx + 1, name: rnStr });
            });

            const matches = [];
            const matchGames = [];
            jjMatches.forEach((m, idx) => {
                const { opponent1, opponent2, status } = buildOpponents(m);
                const rid = roundNumToId.get(m.jiu_jitsu_match_round_num) || 1;
                matches.push({ id: m.id || (idx + 1), stage_id: 1, group_id: 1, round_id: rid, number: idx + 1, child_count: 1, opponent1, opponent2, status });
                matchGames.push({ id: idx + 1, stage_id: 1, parent_id: m.id || (idx + 1), number: 1, status, opponent1: opponent1 ? { ...opponent1 } : null, opponent2: opponent2 ? { ...opponent2 } : null });
            });

            try {
                await window.bracketsViewer.render({ stages, groups, rounds, matches, matchGames, participants }, {
                    selector: '#' + sectionId, clear: true,
                    showRankingTable: false, participantOriginPlacement: 'none',
                    customRoundName: (info) => {
                        const rd = rounds.find(r => r.id === info.roundNumber || r.number === info.roundNumber);
                        return rd ? rd.name : `Round ${info.roundNumber}`;
                    }
                });
                this._attachVenueLabels(document.getElementById(sectionId), jjMatches);
            } catch (e) {
                console.warn(`渲染对阵图 ${weightClass} 失败:`, e);
            }
        }
    }
};

if (typeof window !== 'undefined') {
    window.JJBracketRenderer = JJBracketRenderer;
}
