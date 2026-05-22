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

async function generateJJBracketForEvent(db, event_id, weight_class) {
    const athletes = await db.all(
        'SELECT * FROM athletes WHERE event_id = ? AND athlete_type = ?',
        [event_id, 'jiu_jitsu']
    );

    if (athletes.length === 0) {
        return { generated: 0, errors: ['没有运动员数据'], results: [] };
    }

    const categoryModes = await db.all(
        'SELECT weight_class, mode, categroy_mode_name FROM category_mode WHERE event_id = ?',
        [event_id]
    );
    const modeMap = {};
    categoryModes.forEach(cm => {
        modeMap[cm.weight_class] = cm.mode || MODE_VALUE_MAP[cm.categroy_mode_name] || 'single_elimination';
    });

    const classMap = new Map();
    athletes.forEach(a => {
        const wc = a.athlete_category || '未分级';
        if (!classMap.has(wc)) {
            classMap.set(wc, []);
        }
        classMap.get(wc).push(a);
    });

    if (weight_class) {
        const classAthletes = classMap.get(weight_class);
        if (!classAthletes || classAthletes.length === 0) {
            return { generated: 0, errors: [`${weight_class}: 没有运动员数据`], results: [] };
        }
        await db.run(
            'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
            [event_id, weight_class]
        );

        const mode = modeMap[weight_class] || 'single_elimination';
        const count = classAthletes.length;
        let matchNum = 1;

        if (count < 2) {
            return { generated: 0, errors: [`${weight_class}: 仅${count}人，跳过`], results: [] };
        }

        if (mode === 'single_elimination') {
            matchNum = await generateSingleElimination(db, event_id, weight_class, classAthletes, matchNum);
        } else if (mode === 'double_elimination') {
            matchNum = await generateDoubleElimination(db, event_id, weight_class, classAthletes, matchNum);
        } else if (mode === 'round_robin') {
            matchNum = await generateRoundRobin(db, event_id, weight_class, classAthletes, matchNum);
        } else if (mode === 'pool_elimination') {
            matchNum = await generatePoolElimination(db, event_id, weight_class, classAthletes, matchNum);
        }

        const totalMatches = matchNum - 1;
        return {
            generated: 1,
            errors: [],
            results: [`${weight_class}: ${count}人, ${MODE_NAME_MAP[mode] || mode}, ${totalMatches}场`]
        };
    }

    await db.run(
        'DELETE FROM jiu_jitsu_matchs WHERE event_id = ?',
        [event_id]
    );

    let generated = 0;
    const errors = [];
    const results = [];

    for (const [wc, classAthletes] of classMap) {
        try {
            const mode = modeMap[wc] || 'single_elimination';
            const count = classAthletes.length;

            if (count < 2) {
                results.push(`${wc}: 仅${count}人，跳过`);
                continue;
            }

            let matchNum = 1;

            if (mode === 'single_elimination') {
                matchNum = await generateSingleElimination(db, event_id, wc, classAthletes, matchNum);
            } else if (mode === 'double_elimination') {
                matchNum = await generateDoubleElimination(db, event_id, wc, classAthletes, matchNum);
            } else if (mode === 'round_robin') {
                matchNum = await generateRoundRobin(db, event_id, wc, classAthletes, matchNum);
            } else if (mode === 'pool_elimination') {
                matchNum = await generatePoolElimination(db, event_id, wc, classAthletes, matchNum);
            }

            generated++;
            const totalMatches = matchNum - 1;
            results.push(`${wc}: ${count}人, ${MODE_NAME_MAP[mode] || mode}, ${totalMatches}场`);
        } catch (err) {
            errors.push(`${wc}: ${err.message}`);
        }
    }

    return { generated, errors, results };
}

async function generateSingleElimination(db, event_id, weightClass, classAthletes, matchNumStart) {
    const count = classAthletes.length;
    let bracketSize = 2;
    while (bracketSize < count) bracketSize *= 2;
    const totalRounds = Math.round(Math.log2(bracketSize));

    const seeded = seedAthletes(classAthletes, bracketSize);
    let matchNum = matchNumStart;

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

            await db.run(
                `INSERT INTO jiu_jitsu_matchs 
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                 jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                 jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    event_id, null, null, weightClass,
                    totalRounds - round + 1, roundName, totalRounds,
                    blue ? blue.athlete_id : null,
                    blue ? blue.athlete_name : null,
                    blue ? blue.athlete_team : null,
                    red ? red.athlete_id : null,
                    red ? red.athlete_name : null,
                    red ? red.athlete_team : null,
                    (!blue || !red) ? 'bye' : '未开始'
                ]
            );
            matchNum++;
        }
    }

    return matchNum;
}

async function generateDoubleElimination(db, event_id, weightClass, classAthletes, matchNumStart) {
    const count = classAthletes.length;
    let bracketSize = 2;
    while (bracketSize < count) bracketSize *= 2;
    const totalRounds = Math.round(Math.log2(bracketSize));

    const seeded = seedAthletes(classAthletes, bracketSize);
    let matchNum = matchNumStart;

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

            await db.run(
                `INSERT INTO jiu_jitsu_matchs 
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                 jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                 jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    event_id, null, null, weightClass,
                    totalRounds - round + 1, roundName, totalRounds,
                    blue ? blue.athlete_id : null,
                    blue ? blue.athlete_name : null,
                    blue ? blue.athlete_team : null,
                    red ? red.athlete_id : null,
                    red ? red.athlete_name : null,
                    red ? red.athlete_team : null,
                    (!blue || !red) ? 'bye' : '未开始'
                ]
            );
            matchNum++;
        }
    }

    for (let round = 1; round <= totalRounds - 1; round++) {
        const matchesInRound = Math.pow(2, totalRounds - round - 1);
        for (let i = 0; i < matchesInRound; i++) {
            await db.run(
                `INSERT INTO jiu_jitsu_matchs 
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [event_id, null, null, weightClass, round, `败者组第${round}轮`, totalRounds, '未开始']
            );
            matchNum++;
        }
    }

    await db.run(
        `INSERT INTO jiu_jitsu_matchs 
        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
         jiu_jitsu_match_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event_id, null, null, weightClass, totalRounds + 1, 'Rep.（复活赛第一轮）', totalRounds, '未开始']
    );
    matchNum++;
    await db.run(
        `INSERT INTO jiu_jitsu_matchs 
        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
         jiu_jitsu_match_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event_id, null, null, weightClass, totalRounds + 2, 'Bro.m（复活赛第二轮）', totalRounds, '未开始']
    );
    matchNum++;

    return matchNum;
}

async function generateRoundRobin(db, event_id, weightClass, classAthletes, matchNumStart) {
    const count = classAthletes.length;
    const sorted = [...classAthletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));
    let matchNum = matchNumStart;

    const schedule = roundRobinSchedule(count);
    for (let r = 0; r < schedule.length; r++) {
        for (let i = 0; i < schedule[r].length; i++) {
            const [p1, p2] = schedule[r][i];
            const blue = p1 < count ? sorted[p1] : null;
            const red = p2 < count ? sorted[p2] : null;
            if (blue && red) {
                await db.run(
                    `INSERT INTO jiu_jitsu_matchs 
                    (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                     jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                     jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                     jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                     jiu_jitsu_match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        event_id, null, null, weightClass,
                        r + 1, `赛${r + 1}`, schedule.length,
                        blue.athlete_id, blue.athlete_name, blue.athlete_team,
                        red.athlete_id, red.athlete_name, red.athlete_team,
                        '未开始'
                    ]
                );
                matchNum++;
            }
        }
    }

    return matchNum;
}

async function generatePoolElimination(db, event_id, weightClass, classAthletes, matchNumStart) {
    const count = classAthletes.length;
    const poolCount = Math.max(2, Math.ceil(count / 4));
    const sorted = [...classAthletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

    const pools = [];
    for (let i = 0; i < poolCount; i++) {
        pools.push([]);
    }
    sorted.forEach((a, idx) => {
        pools[idx % poolCount].push(a);
    });

    let matchNum = matchNumStart;

    for (let poolIdx = 0; poolIdx < pools.length; poolIdx++) {
        const pool = pools[poolIdx];
        for (let i = 0; i < pool.length; i++) {
            for (let j = i + 1; j < pool.length; j++) {
                await db.run(
                    `INSERT INTO jiu_jitsu_matchs 
                    (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                     jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                     jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                     jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                     jiu_jitsu_match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        event_id, null, null, weightClass,
                        1, `赛${poolIdx + 1}（小组赛）`, poolCount + Math.ceil(Math.log2(poolCount)),
                        pool[i].athlete_id, pool[i].athlete_name, pool[i].athlete_team,
                        pool[j].athlete_id, pool[j].athlete_name, pool[j].athlete_team,
                        '未开始'
                    ]
                );
                matchNum++;
            }
        }
    }

    const elimRounds = Math.ceil(Math.log2(poolCount));
    for (let r = 1; r <= elimRounds; r++) {
        const matchesInRound = Math.pow(2, elimRounds - r);
        const roundName = r === elimRounds ? 'Final' : `赛${poolCount + r}（淘汰赛）`;
        for (let i = 0; i < matchesInRound; i++) {
            await db.run(
                `INSERT INTO jiu_jitsu_matchs 
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [event_id, null, null, weightClass, r + 1, roundName, poolCount + elimRounds, '未开始']
            );
            matchNum++;
        }
    }

    await db.run(
        `INSERT INTO jiu_jitsu_matchs 
        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
         jiu_jitsu_match_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event_id, null, null, weightClass, elimRounds + 2, 'Rep.（复活赛第一轮）', poolCount + elimRounds, '未开始']
    );
    matchNum++;
    await db.run(
        `INSERT INTO jiu_jitsu_matchs 
        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
         jiu_jitsu_match_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event_id, null, null, weightClass, elimRounds + 3, 'Bro.m（复活赛第二轮）', poolCount + elimRounds, '未开始']
    );
    matchNum++;

    return matchNum;
}

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

module.exports = {
    MODE_NAME_MAP,
    MODE_VALUE_MAP,
    generateJJBracketForEvent,
    generateSingleElimination,
    generateDoubleElimination,
    generateRoundRobin,
    generatePoolElimination,
    seedAthletes,
    getSeedingPositions,
    roundRobinSchedule
};
