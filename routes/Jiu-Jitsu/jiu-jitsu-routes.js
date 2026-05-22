const express = require('express');
const router = express.Router();

const MODE_NAME_MAP = {
    'single_elimination': '单败淘汰赛',
    'double_elimination': '双败淘汰赛',
    'round_robin': '单循环赛',
    'pool_elimination': '分区循环赛'
};

const MODE_VALUE_MAP = {
    '单败淘汰赛': 'single_elimination',
    '双败淘汰赛': 'double_elimination',
    '单循环赛': 'round_robin',
    '分区循环赛': 'pool_elimination'
};

module.exports = (db) => {

    router.get('/jj-comp-mode', async (req, res) => {
        try {
            const { event_id } = req.query;
            if (!event_id) {
                return res.json({ success: true, data: [] });
            }
            const rows = await db.all(
                'SELECT category_id as id, event_id, weight_class, mode as comp_mode, categroy_mode_name, categroy_count FROM category_mode WHERE event_id = ?',
                [event_id]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-comp-mode', async (req, res) => {
        try {
            const { event_id, weight_class, comp_mode } = req.body;
            if (!event_id || !weight_class) {
                return res.status(400).json({ success: false, error: '缺少必要参数' });
            }
            const mode = comp_mode || 'single_elimination';
            const modeName = MODE_NAME_MAP[mode] || '单败淘汰赛';

            const existing = await db.get(
                'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?',
                [event_id, weight_class]
            );

            if (existing) {
                await db.run(
                    'UPDATE category_mode SET mode = ?, categroy_mode_name = ?, mode_name = ? WHERE category_id = ?',
                    [mode, modeName, modeName, existing.category_id]
                );
            } else {
                await db.run(
                    'INSERT INTO category_mode (event_id, weight_class, mode, categroy_mode_name, mode_name) VALUES (?, ?, ?, ?, ?)',
                    [event_id, weight_class, mode, modeName, modeName]
                );
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-comp-mode/batch', async (req, res) => {
        try {
            const { event_id, data } = req.body;
            if (!event_id || !data || !Array.isArray(data)) {
                return res.status(400).json({ success: false, error: '缺少必要参数' });
            }

            for (const item of data) {
                const mode = item.comp_mode || 'single_elimination';
                const modeName = MODE_NAME_MAP[mode] || '单败淘汰赛';

                const existing = await db.get(
                    'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?',
                    [event_id, item.weight_class]
                );

                if (existing) {
                    await db.run(
                        'UPDATE category_mode SET mode = ?, categroy_mode_name = ?, mode_name = ? WHERE category_id = ?',
                        [mode, modeName, modeName, existing.category_id]
                    );
                } else {
                    await db.run(
                        'INSERT INTO category_mode (event_id, weight_class, mode, categroy_mode_name, mode_name) VALUES (?, ?, ?, ?, ?)',
                        [event_id, item.weight_class, mode, modeName, modeName]
                    );
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/generate', async (req, res) => {
        try {
            const { event_id } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }

            const athletes = await db.all(
                'SELECT * FROM athletes WHERE event_id = ?',
                [event_id]
            );

            if (athletes.length === 0) {
                return res.json({ success: true, data: { generated: 0, errors: ['没有运动员数据'], results: [] } });
            }

            const categoryModes = await db.all(
                'SELECT weight_class, mode, categroy_mode_name, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?',
                [event_id]
            );
            const modeMap = {};
            const venueMap = {};
            categoryModes.forEach(cm => {
                modeMap[cm.weight_class] = cm.mode || MODE_VALUE_MAP[cm.categroy_mode_name] || 'single_elimination';
                venueMap[cm.weight_class] = {
                    venue: cm.category_venue || '',
                    unit: cm.category_date_num || '',
                    order: cm.category_order || 0
                };
            });

            const classMap = new Map();
            athletes.forEach(a => {
                const wc = a.athlete_category || '未分级';
                if (!classMap.has(wc)) {
                    classMap.set(wc, []);
                }
                classMap.get(wc).push(a);
            });

            await db.run(
                'DELETE FROM jiu_jitsu_matchs WHERE event_id = ?',
                [event_id]
            );

            let generated = 0;
            const errors = [];
            const results = [];
            const allMatches = [];

            for (const [weightClass, classAthletes] of classMap) {
                try {
                    const mode = modeMap[weightClass] || 'single_elimination';
                    const count = classAthletes.length;

                    if (count < 2) {
                        results.push(`${weightClass}: 仅${count}人，跳过`);
                        continue;
                    }

                    const venueInfo = venueMap[weightClass] || {};

                    if (mode === 'single_elimination') {
                        buildSingleElimination(allMatches, weightClass, classAthletes, venueInfo);
                    } else if (mode === 'double_elimination') {
                        buildDoubleElimination(allMatches, weightClass, classAthletes, venueInfo);
                    } else if (mode === 'round_robin') {
                        buildRoundRobin(allMatches, weightClass, classAthletes, venueInfo);
                    } else if (mode === 'pool_elimination') {
                        buildPoolElimination(allMatches, weightClass, classAthletes, venueInfo);
                    }

                    generated++;
                } catch (err) {
                    errors.push(`${weightClass}: ${err.message}`);
                }
            }

            const roundOrder = { '赛1': 1, '赛2': 2, '赛3': 3, '赛4': 4, '赛5': 5, '赛6': 6, '赛7': 7, '赛8': 8 };
            allMatches.sort((a, b) => {
                const aRoundKey = getRoundSortKey(a.round_name);
                const bRoundKey = getRoundSortKey(b.round_name);
                if (aRoundKey !== bRoundKey) return aRoundKey - bRoundKey;
                if (a.venue !== b.venue) return (a.venue || '').localeCompare(b.venue || '', 'zh-CN');
                if (a.unit !== b.unit) return String(a.unit || '').localeCompare(String(b.unit || ''), 'zh-CN');
                return (a.order || 0) - (b.order || 0);
            });

            let matchNum = 1;
            for (const m of allMatches) {
                const matchId = String(matchNum).padStart(3, '0');
                await db.run(
                    `INSERT INTO jiu_jitsu_matchs 
                    (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                     jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                     jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                     jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                     jiu_jitsu_match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        event_id, m.venue || '', matchId, m.weight_class,
                        m.round_num, m.round_name, m.total_rounds,
                        m.blue_id, m.blue_name, m.blue_team,
                        m.red_id, m.red_name, m.red_team,
                        m.status
                    ]
                );
                matchNum++;
            }

            const totalMatches = matchNum - 1;
            results.push(`共生成 ${totalMatches} 场比赛`);

            res.json({ success: true, data: { generated, errors, results } });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    function getRoundSortKey(roundName) {
        if (!roundName) return 100;
        if (roundName === 'Final' || roundName.startsWith('Final')) return 50;
        if (roundName.startsWith('Rep.')) return 60;
        if (roundName.startsWith('Bro.m')) return 70;
        const match = roundName.match(/赛(\d+)/);
        if (match) return parseInt(match[1]);
        return 100;
    }

    function buildSingleElimination(matches, weightClass, classAthletes, venueInfo) {
        const count = classAthletes.length;
        let bracketSize = 2;
        while (bracketSize < count) bracketSize *= 2;
        const totalRounds = Math.round(Math.log2(bracketSize));
        const seeded = seedAthletes(classAthletes, bracketSize);

        for (let round = totalRounds; round >= 1; round--) {
            const matchesInRound = Math.pow(2, round - 1);
            let roundName;
            if (round === 1) roundName = 'Final';
            else roundName = `赛${totalRounds - round + 1}`;

            for (let i = 0; i < matchesInRound; i++) {
                const blueIdx = 2 * i;
                const redIdx = 2 * i + 1;
                const blue = seeded[blueIdx];
                const red = seeded[redIdx];

                matches.push({
                    weight_class: weightClass,
                    round_num: totalRounds - round + 1,
                    round_name: roundName,
                    total_rounds: totalRounds,
                    blue_id: blue ? blue.athlete_id : null,
                    blue_name: blue ? blue.athlete_name : null,
                    blue_team: blue ? blue.athlete_team : null,
                    red_id: red ? red.athlete_id : null,
                    red_name: red ? red.athlete_name : null,
                    red_team: red ? red.athlete_team : null,
                    status: (!blue || !red) ? 'bye' : '未开始',
                    venue: venueInfo.venue || '',
                    unit: venueInfo.unit || '',
                    order: venueInfo.order || 0
                });
            }
        }
    }

    function buildDoubleElimination(matches, weightClass, classAthletes, venueInfo) {
        const count = classAthletes.length;
        let bracketSize = 2;
        while (bracketSize < count) bracketSize *= 2;
        const totalRounds = Math.round(Math.log2(bracketSize));
        const seeded = seedAthletes(classAthletes, bracketSize);

        for (let round = totalRounds; round >= 1; round--) {
            const matchesInRound = Math.pow(2, round - 1);
            let roundName;
            if (round === 1) roundName = 'Final（胜者组）';
            else roundName = `赛${totalRounds - round + 1}（胜者组）`;

            for (let i = 0; i < matchesInRound; i++) {
                const blueIdx = 2 * i;
                const redIdx = 2 * i + 1;
                const blue = seeded[blueIdx];
                const red = seeded[redIdx];

                matches.push({
                    weight_class: weightClass,
                    round_num: totalRounds - round + 1,
                    round_name: roundName,
                    total_rounds: totalRounds,
                    blue_id: blue ? blue.athlete_id : null,
                    blue_name: blue ? blue.athlete_name : null,
                    blue_team: blue ? blue.athlete_team : null,
                    red_id: red ? red.athlete_id : null,
                    red_name: red ? red.athlete_name : null,
                    red_team: red ? red.athlete_team : null,
                    status: (!blue || !red) ? 'bye' : '未开始',
                    venue: venueInfo.venue || '',
                    unit: venueInfo.unit || '',
                    order: venueInfo.order || 0
                });
            }
        }

        for (let round = 1; round <= totalRounds - 1; round++) {
            const matchesInRound = Math.pow(2, totalRounds - round - 1);
            for (let i = 0; i < matchesInRound; i++) {
                matches.push({
                    weight_class: weightClass,
                    round_num: round,
                    round_name: `败者组第${round}轮`,
                    total_rounds: totalRounds,
                    blue_id: null, blue_name: null, blue_team: null,
                    red_id: null, red_name: null, red_team: null,
                    status: '未开始',
                    venue: venueInfo.venue || '',
                    unit: venueInfo.unit || '',
                    order: venueInfo.order || 0
                });
            }
        }

        matches.push({
            weight_class: weightClass,
            round_num: totalRounds + 1,
            round_name: 'Rep.（复活赛第一轮）',
            total_rounds: totalRounds,
            blue_id: null, blue_name: null, blue_team: null,
            red_id: null, red_name: null, red_team: null,
            status: '未开始',
            venue: venueInfo.venue || '',
            unit: venueInfo.unit || '',
            order: venueInfo.order || 0
        });
        matches.push({
            weight_class: weightClass,
            round_num: totalRounds + 2,
            round_name: 'Bro.m（复活赛第二轮）',
            total_rounds: totalRounds,
            blue_id: null, blue_name: null, blue_team: null,
            red_id: null, red_name: null, red_team: null,
            status: '未开始',
            venue: venueInfo.venue || '',
            unit: venueInfo.unit || '',
            order: venueInfo.order || 0
        });
    }

    function buildRoundRobin(matches, weightClass, classAthletes, venueInfo) {
        const count = classAthletes.length;
        const sorted = [...classAthletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));
        const schedule = roundRobinSchedule(count);

        for (let r = 0; r < schedule.length; r++) {
            for (let i = 0; i < schedule[r].length; i++) {
                const [p1, p2] = schedule[r][i];
                const blue = p1 < count ? sorted[p1] : null;
                const red = p2 < count ? sorted[p2] : null;
                if (blue && red) {
                    matches.push({
                        weight_class: weightClass,
                        round_num: r + 1,
                        round_name: `赛${r + 1}`,
                        total_rounds: schedule.length,
                        blue_id: blue.athlete_id, blue_name: blue.athlete_name, blue_team: blue.athlete_team,
                        red_id: red.athlete_id, red_name: red.athlete_name, red_team: red.athlete_team,
                        status: '未开始',
                        venue: venueInfo.venue || '',
                        unit: venueInfo.unit || '',
                        order: venueInfo.order || 0
                    });
                }
            }
        }
    }

    function buildPoolElimination(matches, weightClass, classAthletes, venueInfo) {
        const count = classAthletes.length;
        const poolCount = Math.max(2, Math.ceil(count / 4));
        const sorted = [...classAthletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

        const pools = [];
        for (let i = 0; i < poolCount; i++) pools.push([]);
        sorted.forEach((a, idx) => { pools[idx % poolCount].push(a); });

        for (let poolIdx = 0; poolIdx < pools.length; poolIdx++) {
            const pool = pools[poolIdx];
            for (let i = 0; i < pool.length; i++) {
                for (let j = i + 1; j < pool.length; j++) {
                    matches.push({
                        weight_class: weightClass,
                        round_num: 1,
                        round_name: `赛${poolIdx + 1}（小组赛）`,
                        total_rounds: poolCount + Math.ceil(Math.log2(poolCount)),
                        blue_id: pool[i].athlete_id, blue_name: pool[i].athlete_name, blue_team: pool[i].athlete_team,
                        red_id: pool[j].athlete_id, red_name: pool[j].athlete_name, red_team: pool[j].athlete_team,
                        status: '未开始',
                        venue: venueInfo.venue || '',
                        unit: venueInfo.unit || '',
                        order: venueInfo.order || 0
                    });
                }
            }
        }

        const elimRounds = Math.ceil(Math.log2(poolCount));
        for (let r = 1; r <= elimRounds; r++) {
            const matchesInRound = Math.pow(2, elimRounds - r);
            const roundName = r === elimRounds ? 'Final' : `赛${poolCount + r}（淘汰赛）`;
            for (let i = 0; i < matchesInRound; i++) {
                matches.push({
                    weight_class: weightClass,
                    round_num: r + 1,
                    round_name: roundName,
                    total_rounds: poolCount + elimRounds,
                    blue_id: null, blue_name: null, blue_team: null,
                    red_id: null, red_name: null, red_team: null,
                    status: '未开始',
                    venue: venueInfo.venue || '',
                    unit: venueInfo.unit || '',
                    order: venueInfo.order || 0
                });
            }
        }

        matches.push({
            weight_class: weightClass,
            round_num: elimRounds + 2,
            round_name: 'Rep.（复活赛第一轮）',
            total_rounds: poolCount + elimRounds,
            blue_id: null, blue_name: null, blue_team: null,
            red_id: null, red_name: null, red_team: null,
            status: '未开始',
            venue: venueInfo.venue || '',
            unit: venueInfo.unit || '',
            order: venueInfo.order || 0
        });
        matches.push({
            weight_class: weightClass,
            round_num: elimRounds + 3,
            round_name: 'Bro.m（复活赛第二轮）',
            total_rounds: poolCount + elimRounds,
            blue_id: null, blue_name: null, blue_team: null,
            red_id: null, red_name: null, red_team: null,
            status: '未开始',
            venue: venueInfo.venue || '',
            unit: venueInfo.unit || '',
            order: venueInfo.order || 0
        });
    }

    return router;
};

function seedAthletes(athletes, bracketSize) {
    const seeded = new Array(bracketSize).fill(null);
    const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));
    const positions = getSeedingPositions(bracketSize);
    for (let i = 0; i < Math.min(sorted.length, positions.length); i++) {
        seeded[positions[i]] = sorted[i];
    }
    return seeded;
}

function getSeedingPositions(size) {
    if (size === 2) return [0, 1];
    if (size === 4) return [0, 3, 1, 2];
    if (size === 8) return [0, 7, 3, 4, 1, 6, 2, 5];
    if (size === 16) return [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];
    const half = getSeedingPositions(size / 2);
    const result = [];
    for (let i = 0; i < half.length; i++) {
        result.push(half[i]);
        result.push(size - 1 - half[i]);
    }
    return result;
}

function roundRobinSchedule(n) {
    const adjusted = n % 2 !== 0 ? n + 1 : n;
    const rounds = [];
    const teams = Array.from({ length: adjusted }, (_, i) => i);
    const half = adjusted / 2;

    for (let r = 0; r < adjusted - 1; r++) {
        const round = [];
        for (let i = 0; i < half; i++) {
            const home = teams[i];
            const away = teams[adjusted - 1 - i];
            if (home < n && away < n) {
                round.push([home, away]);
            }
        }
        rounds.push(round);
        teams.splice(1, 0, teams.pop());
    }
    return rounds;
}
