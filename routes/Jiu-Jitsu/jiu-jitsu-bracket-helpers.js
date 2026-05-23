const { createBergenRoundRobinMatches } = require('../autoScheduler');

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

function generateJJSeedOrder(size) {
    if (size <= 1) return [1];
    let pairs = [[1, 2]];
    let currentSize = 2;
    while (currentSize < size) {
        const nextSize = currentSize * 2;
        const nextPairs = [];
        for (const [a, b] of pairs) {
            nextPairs.push([a, nextSize + 1 - a]);
            nextPairs.push([nextSize + 1 - b, b]);
        }
        pairs = nextPairs;
        currentSize = nextSize;
    }
    return pairs.flat();
}

async function clearJJBracketStageData(db, event_id, weightClass) {
    const stageRows = await db.all(
        'SELECT id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
        [event_id, weightClass]
    );
    for (const row of stageRows) {
        const sid = row.id;
        try {
            const matchRows = await db.all('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?', [sid]);
            const pIds = new Set();
            for (const m of matchRows) {
                if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch (e) {} }
                if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch (e) {} }
            }
            await db.run('DELETE FROM bracket_match_game WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_match WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_round WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_group WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_stage WHERE id = ?', [sid]);
            for (const pid of pIds) {
                await db.run('DELETE FROM bracket_participant WHERE id = ?', [pid]);
            }
        } catch (e) {
            console.log('删除柔术bracket stage:', sid, e.message);
        }
    }
}

async function generateJJBracketForEvent(db, manager, event_id, weight_class) {
    const athletes = await db.all(
        'SELECT * FROM athletes WHERE event_id = ? AND athlete_type = ? ORDER BY athlete_category, athlete_draw_num',
        [event_id, 'jiu_jitsu']
    );

    if (athletes.length === 0) {
        return { generated: 0, errors: ['没有运动员数据'], results: [] };
    }

    const categoryModes = await db.all(
        'SELECT weight_class, mode, categroy_mode_name, category_id FROM category_mode WHERE event_id = ?',
        [event_id]
    );
    const modeMap = {};
    const categoryIdMap = {};
    categoryModes.forEach(cm => {
        modeMap[cm.weight_class] = cm.mode || MODE_VALUE_MAP[cm.categroy_mode_name] || 'single_elimination';
        if (cm.category_id) categoryIdMap[cm.weight_class] = cm.category_id;
    });

    const classMap = new Map();
    athletes.forEach(a => {
        const wc = a.athlete_category || '未分级';
        if (!classMap.has(wc)) classMap.set(wc, []);
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
        await clearJJBracketStageData(db, event_id, weight_class);

        const mode = modeMap[weight_class] || 'single_elimination';
        const count = classAthletes.length;

        if (count < 2) {
            return { generated: 0, errors: [`${weight_class}: 仅${count}人，跳过`], results: [] };
        }

        const result = await generateJJBracketForClass(db, manager, weight_class, classAthletes, event_id, mode, categoryIdMap[weight_class]);

        const totalMatches = result.matchCount || 0;
        return {
            generated: 1,
            errors: [],
            results: [`${weight_class}: ${count}人, ${MODE_NAME_MAP[mode] || mode}, ${totalMatches}场`]
        };
    }

    await db.run('DELETE FROM jiu_jitsu_matchs WHERE event_id = ?', [event_id]);
    for (const [wc] of classMap) {
        await clearJJBracketStageData(db, event_id, wc);
    }

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

            const result = await generateJJBracketForClass(db, manager, wc, classAthletes, event_id, mode, categoryIdMap[wc]);

            generated++;
            const totalMatches = result.matchCount || 0;
            results.push(`${wc}: ${count}人, ${MODE_NAME_MAP[mode] || mode}, ${totalMatches}场`);
        } catch (err) {
            errors.push(`${wc}: ${err.message}`);
        }
    }

    return { generated, errors, results };
}

async function generateJJBracketForClass(db, manager, weightClass, athletes, event_id, mode, categoryId) {
    const sortedAthletes = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

    const nameCount = {};
    sortedAthletes.forEach(a => {
        const baseName = (a.athlete_name || '').trim();
        if (!baseName) return;
        if (nameCount[baseName] === undefined) nameCount[baseName] = 1;
        else nameCount[baseName]++;
    });

    const cleanSeeding = sortedAthletes.map(a => {
        const baseName = (a.athlete_name || '').trim();
        if (!baseName) return null;
        if (nameCount[baseName] > 1) {
            const unit = (a.athlete_team || '').trim();
            return unit ? `${baseName}(${unit})` : `${baseName}(${nameCount[baseName]})`;
        }
        return baseName;
    });

    const n = cleanSeeding.filter(s => s !== null).length;
    if (n < 2) throw new Error('有效运动员不足2人');

    let stageId = '';
    let stageType = mode || 'single_elimination';
    let matchCount = 0;

    if (stageType === 'double_elimination') {
        const targetSize = Math.pow(2, Math.ceil(Math.log2(n)));
        const seedOrder = generateJJSeedOrder(targetSize);

        for (let i = n; i < targetSize; i++) cleanSeeding.push(null);

        const deStage = await manager.create.stage({
            tournamentId: Number(event_id),
            name: weightClass,
            type: 'double_elimination',
            seeding: cleanSeeding,
            settings: {
                manualOrdering: [seedOrder],
                grandFinal: 'simple',
            },
        });

        const allStageIds = [];
        const deStages = await db.all(
            'SELECT id FROM bracket_stage WHERE tournament_id = ? AND category_id IS NULL',
            [Number(event_id)]
        );
        for (const s of deStages) {
            await db.run(
                'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
                [event_id, weightClass, categoryId ? Number(categoryId) : null, s.id]
            );
            allStageIds.push(s.id);
        }

        for (const sid of allStageIds) {
            const matches = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [sid]);
            for (const match of matches) {
                const existing = await db.get('SELECT id FROM bracket_match_game WHERE parent_id = ?', [match.id]);
                if (!existing) {
                    await db.run('INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)', [sid, match.id, 1]);
                    await db.run('UPDATE bracket_match SET child_count = 1 WHERE id = ?', [match.id]);
                }
            }
        }

        for (const sid of allStageIds) {
            const stageData = await manager.get.stageData(sid);
            if (stageData?.stage?.[0]) {
                const s = stageData.stage[0];
                const size = s.settings?.size || stageData.participant?.length || 4;
                const totalRounds = Math.log2(Math.pow(2, Math.ceil(Math.log2(size))));
                const rounds = stageData.round || [];
                const stageInfo = await db.get('SELECT id, name FROM bracket_stage WHERE id = ?', [sid]);
                const isWinners = stageInfo && stageInfo.name && !stageInfo.name.includes('败者');
                for (const round of rounds) {
                    let roundName;
                    if (round.number && totalRounds) {
                        if (round.number === totalRounds) roundName = 'Final';
                        else {
                            const d = Math.pow(2, totalRounds - round.number);
                            roundName = `1/${d}`;
                        }
                    }
                    if (roundName) {
                        const suffix = isWinners ? roundName + '（胜者组）' : roundName + '（败者组）';
                        if (round.name !== suffix) {
                            await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [suffix, round.id]);
                        }
                    }
                }
            }
        }

        for (let i = 0; i < sortedAthletes.length; i++) {
            const athlete = sortedAthletes[i] || {};
            const bracketName = cleanSeeding[i];
            if (!bracketName) continue;
            await db.run(
                'UPDATE bracket_participant SET custom_data = ? WHERE name = ?',
                [JSON.stringify({
                    id: athlete.id != null ? athlete.id : null,
                    athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
                }), bracketName]
            );
        }

        matchCount = await generateJJMatchsFromBracketData(db, event_id, weightClass, sortedAthletes, cleanSeeding, 'double_elimination');

        stageId = allStageIds.join(',');

    } else if (stageType === 'round_robin') {
        const effectiveSeeding = cleanSeeding.filter(s => s !== null);

        const rrStage = await manager.create.stage({
            tournamentId: Number(event_id),
            name: weightClass,
            type: 'round_robin',
            seeding: effectiveSeeding,
            settings: { size: n, groupCount: 1 },
        });

        await db.run(
            'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
            [event_id, weightClass, categoryId ? Number(categoryId) : null, rrStage.id]
        );

        const participantList = await db.all(
            'SELECT id, name FROM bracket_participant WHERE tournament_id = ?',
            [Number(event_id)]
        );

        await createBergenRoundRobinMatches(db, rrStage.id, effectiveSeeding, participantList);

        for (let i = 0; i < cleanSeeding.length; i++) {
            if (cleanSeeding[i] === null) continue;
            const p = participantList.find(pp => pp.name === cleanSeeding[i]);
            if (p) {
                const athlete = sortedAthletes[i] || {};
                await db.run(
                    'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
                    [JSON.stringify({
                        id: athlete.id != null ? athlete.id : null,
                        athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
                    }), p.id]
                );
            }
        }

        matchCount = await generateJJMatchsFromBracketData(db, event_id, weightClass, sortedAthletes, cleanSeeding, 'round_robin');

        stageId = String(rrStage.id);

    } else if (stageType === 'pool_elimination') {
        const poolCount = Math.max(2, Math.ceil(n / 4));
        const poolSize = Math.ceil(n / poolCount);

        const poolStages = [];
        for (let pi = 0; pi < poolCount; pi++) {
            const poolAthletesRaw = cleanSeeding.slice(pi * poolSize, (pi + 1) * poolSize);
            const poolAthletes = poolAthletesRaw.filter(s => s !== null);

            if (poolAthletes.length < 2) continue;

            const poolStage = await manager.create.stage({
                tournamentId: Number(event_id),
                name: `${weightClass}_小组${pi + 1}`,
                type: 'round_robin',
                seeding: poolAthletes,
                settings: { size: poolAthletes.length, groupCount: 1 },
            });

            await db.run(
                'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
                [event_id, weightClass, categoryId ? Number(categoryId) : null, poolStage.id]
            );

            const participantList = await db.all(
                'SELECT id, name FROM bracket_participant WHERE tournament_id = ?',
                [Number(event_id)]
            );

            await createBergenRoundRobinMatches(db, poolStage.id, poolAthletes, participantList);

            for (let i = 0; i < poolAthletesRaw.length; i++) {
                if (poolAthletesRaw[i] === null) continue;
                const p = participantList.find(pp => pp.name === poolAthletesRaw[i]);
                if (p) {
                    const origIdx = pi * poolSize + i;
                    const athlete = sortedAthletes[origIdx] || {};
                    await db.run(
                        'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
                        [JSON.stringify({
                            id: athlete.id != null ? athlete.id : null,
                            athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (origIdx + 1),
                            pool: pi + 1
                        }), p.id]
                    );
                }
            }

            poolStages.push(poolStage.id);
        }

        matchCount = await generateJJMatchsFromBracketData(db, event_id, weightClass, sortedAthletes, cleanSeeding, 'pool_elimination');

        stageId = poolStages.join(',');

    } else {
        const targetSize = Math.pow(2, Math.ceil(Math.log2(n)));
        const seedOrder = generateJJSeedOrder(targetSize);

        for (let i = n; i < targetSize; i++) cleanSeeding.push(null);

        const stage = await manager.create.stage({
            tournamentId: Number(event_id),
            name: weightClass,
            type: 'single_elimination',
            seeding: cleanSeeding,
            settings: {
                manualOrdering: [seedOrder],
            },
        });

        await db.run(
            'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
            [event_id, weightClass, categoryId ? Number(categoryId) : null, stage.id]
        );

        const matches = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [stage.id]);
        for (const match of matches) {
            const existing = await db.get('SELECT id FROM bracket_match_game WHERE parent_id = ?', [match.id]);
            if (!existing) {
                await db.run('INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)', [stage.id, match.id, 1]);
                await db.run('UPDATE bracket_match SET child_count = 1 WHERE id = ?', [match.id]);
            }
        }

        const stageData = await manager.get.stageData(stage.id);
        if (stageData?.stage?.[0]) {
            const s = stageData.stage[0];
            const size = s.settings?.size || stageData.participant?.length || 4;
            const totalRounds = Math.log2(Math.pow(2, Math.ceil(Math.log2(size))));
            const rounds = stageData.round || [];
            for (const round of rounds) {
                let roundName;
                if (round.number && totalRounds) {
                    if (round.number === totalRounds) roundName = 'Final';
                    else {
                        const d = Math.pow(2, totalRounds - round.number);
                        roundName = `1/${d}`;
                    }
                }
                if (roundName && round.name !== roundName) {
                    await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [roundName, round.id]);
                }
            }
        }

        for (let i = 0; i < sortedAthletes.length; i++) {
            const athlete = sortedAthletes[i] || {};
            const bracketName = cleanSeeding[i];
            if (!bracketName) continue;
            await db.run(
                'UPDATE bracket_participant SET custom_data = ? WHERE name = ?',
                [JSON.stringify({
                    id: athlete.id != null ? athlete.id : null,
                    athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
                }), bracketName]
            );
        }

        matchCount = await generateJJMatchsFromBracketData(db, event_id, weightClass, sortedAthletes, cleanSeeding, 'single_elimination');

        stageId = String(stage.id);
    }

    return { stageId, stageType, matchCount };
}

async function generateJJMatchsFromBracketData(db, event_id, weightClass, athletes, cleanSeeding, mode) {
    const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));
    const n = sorted.length;
    let matchNum = 0;

    if (mode === 'single_elimination' || mode === 'double_elimination') {
        let bracketSize = 2;
        while (bracketSize < n) bracketSize *= 2;
        const totalRounds = Math.round(Math.log2(bracketSize));
        const seeded = seedAthletes(sorted, bracketSize);

        for (let round = 1; round <= totalRounds; round++) {
            const matchesInRound = Math.pow(2, totalRounds - round);
            let roundName;
            if (round === totalRounds) roundName = 'Final';
            else {
                const denominator = Math.pow(2, totalRounds - round);
                roundName = `1/${denominator}`;
            }
            if (mode === 'double_elimination') {
                roundName = roundName + '（胜者组）';
            }

            for (let i = 0; i < matchesInRound; i++) {
                const blue = seeded[2 * i];
                const red = seeded[2 * i + 1];
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
                        round, roundName, totalRounds,
                        blue ? blue.athlete_id : null, blue ? blue.athlete_name : null, blue ? blue.athlete_team : null,
                        red ? red.athlete_id : null, red ? red.athlete_name : null, red ? red.athlete_team : null,
                        (!blue || !red) ? 'bye' : '未开始'
                    ]
                );
                matchNum++;
            }
        }

        if (mode === 'double_elimination') {
            const losersRounds = totalRounds - 1;
            for (let round = 1; round <= losersRounds; round++) {
                const matchesInRound = Math.pow(2, losersRounds - round);
                let roundName;
                if (round === losersRounds) roundName = 'Final（败者组）';
                else {
                    const denominator = Math.pow(2, losersRounds - round);
                    roundName = `1/${denominator}（败者组）`;
                }
                for (let i = 0; i < matchesInRound; i++) {
                    await db.run(
                        `INSERT INTO jiu_jitsu_matchs 
                        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                         jiu_jitsu_match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [event_id, null, null, weightClass, totalRounds + round, roundName, totalRounds, '未开始']
                    );
                    matchNum++;
                }
            }
        }

    } else if (mode === 'round_robin') {
        const schedule = roundRobinSchedule(n);
        for (let r = 0; r < schedule.length; r++) {
            for (let i = 0; i < schedule[r].length; i++) {
                const [p1, p2] = schedule[r][i];
                const blue = p1 < n ? sorted[p1] : null;
                const red = p2 < n ? sorted[p2] : null;
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
                            r + 1, `R${r + 1}`, schedule.length,
                            blue.athlete_id, blue.athlete_name, blue.athlete_team,
                            red.athlete_id, red.athlete_name, red.athlete_team,
                            '未开始'
                        ]
                    );
                    matchNum++;
                }
            }
        }

    } else if (mode === 'pool_elimination') {
        const poolCount = Math.max(2, Math.ceil(n / 4));
        const pools = [];
        for (let i = 0; i < poolCount; i++) pools.push([]);
        sorted.forEach((a, idx) => { pools[idx % poolCount].push(a); });

        for (let poolIdx = 0; poolIdx < pools.length; poolIdx++) {
            const pool = pools[poolIdx];
            const poolRounds = pool.length - 1;
            const poolSchedule = roundRobinSchedule(pool.length);
            for (let r = 0; r < poolSchedule.length; r++) {
                for (let i = 0; i < poolSchedule[r].length; i++) {
                    const [p1, p2] = poolSchedule[r][i];
                    const blue = p1 < pool.length ? pool[p1] : null;
                    const red = p2 < pool.length ? pool[p2] : null;
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
                                r + 1, `R${r + 1}`, poolRounds,
                                blue.athlete_id, blue.athlete_name, blue.athlete_team,
                                red.athlete_id, red.athlete_name, red.athlete_team,
                                '未开始'
                            ]
                        );
                        matchNum++;
                    }
                }
            }
        }

        const elimRounds = Math.ceil(Math.log2(poolCount));
        for (let r = 1; r <= elimRounds; r++) {
            const matchesInRound = Math.pow(2, elimRounds - r);
            let roundName;
            if (r === elimRounds) roundName = 'Final';
            else {
                const denominator = Math.pow(2, elimRounds - r);
                roundName = `1/${denominator}`;
            }
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
        const repRounds = Math.max(1, elimRounds - 1);
        for (let r = 1; r <= repRounds; r++) {
            let roundName;
            if (r === repRounds) roundName = 'Final（败者组）';
            else {
                const denominator = Math.pow(2, repRounds - r);
                roundName = `1/${denominator}（败者组）`;
            }
            await db.run(
                `INSERT INTO jiu_jitsu_matchs 
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy, 
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [event_id, null, null, weightClass, elimRounds + 1 + r, roundName, poolCount + elimRounds, '未开始']
            );
            matchNum++;
        }
    }

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
    generateJJBracketForClass,
    generateJJMatchsFromBracketData,
    seedAthletes,
    getSeedingPositions,
    roundRobinSchedule,
    clearJJBracketStageData,
    generateJJSeedOrder
};
