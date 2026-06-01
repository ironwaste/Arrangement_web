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

const FINAL_NAME_MAP = {
    'single_elimination': 'Final',
    'double_elimination': 'D.Final',
    'pool_elimination': 'R.Final'
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

function generateJJRoundRobinSchedule(n) {
    if (n === 2) {
        return [[{ seed1: 1, seed2: 2 }]];
    }
    if (n === 3) {
        return [
            [{ seed1: 2, seed2: 3 }],
            [{ seed1: 1, seed2: 3 }],
            [{ seed1: 1, seed2: 2 }]
        ];
    }
    if (n === 4) {
        return [
            [{ seed1: 1, seed2: 4 }, { seed1: 2, seed2: 3 }],
            [{ seed1: 1, seed2: 3 }, { seed1: 2, seed2: 4 }],
            [{ seed1: 1, seed2: 2 }, { seed1: 3, seed2: 4 }]
        ];
    }
    if (n === 5) {
        return [
            [{ seed1: 2, seed2: 3 }, { seed1: 4, seed2: 5 }],
            [{ seed1: 1, seed2: 3 }, { seed1: 2, seed2: 4 }],
            [{ seed1: 1, seed2: 5 }, { seed1: 3, seed2: 4 }],
            [{ seed1: 2, seed2: 5 }, { seed1: 1, seed2: 4 }],
            [{ seed1: 1, seed2: 2 }, { seed1: 3, seed2: 5 }]
        ];
    }
    return generateBergerSchedule(n);
}

function generateBergerSchedule(n) {
    const isOdd = n % 2 !== 0;
    const effectiveN = isOdd ? n + 1 : n;
    const rounds = [];
    const positions = [];
    for (let i = 1; i <= effectiveN; i++) positions.push(i);

    for (let r = 0; r < effectiveN - 1; r++) {
        const roundMatches = [];
        for (let i = 0; i < Math.floor(effectiveN / 2); i++) {
            const seed1 = positions[i];
            const seed2 = positions[effectiveN - 1 - i];
            if (seed1 <= n && seed2 <= n) {
                roundMatches.push({ seed1, seed2 });
            }
        }
        rounds.push(roundMatches);
        const last = positions[effectiveN - 1];
        for (let i = effectiveN - 1; i > 1; i--) {
            positions[i] = positions[i - 1];
        }
        positions[1] = last;
    }
    return rounds;
}

async function createJJRoundRobinBracketMatches(db, stageId, effectiveSeeding, participantList) {
    const n = effectiveSeeding.length;
    if (n < 2) return;

    await db.run('DELETE FROM bracket_match_game WHERE stage_id = ?', [stageId]);
    await db.run('DELETE FROM bracket_match WHERE stage_id = ?', [stageId]);
    await db.run('DELETE FROM bracket_round WHERE stage_id = ?', [stageId]);

    const groupRow = await db.get('SELECT id FROM bracket_group WHERE stage_id = ?', [stageId]);
    const groupId = groupRow ? groupRow.id : null;

    const seedingToParticipant = new Map();
    for (let i = 0; i < effectiveSeeding.length; i++) {
        const p = participantList.find(pp => pp.name === effectiveSeeding[i]);
        if (p) {
            seedingToParticipant.set(i + 1, p.id);
        }
    }

    const rrMatches = generateJJRoundRobinSchedule(n);

    let matchNumber = 1;
    for (let roundIdx = 0; roundIdx < rrMatches.length; roundIdx++) {
        let roundName;
        if (n === 2) {
            roundName = 'Final';
        } else {
            roundName = `R${roundIdx + 1}`;
        }

        const roundResult = await db.run(
            'INSERT INTO bracket_round (stage_id, group_id, name, number) VALUES (?, ?, ?, ?)',
            [stageId, groupId, roundName, roundIdx + 1]
        );
        const newRound = await db.get('SELECT LAST_INSERT_ID() as id');
        const roundId = newRound.id;

        for (const match of rrMatches[roundIdx]) {
            const opp1ParticipantId = seedingToParticipant.get(match.seed1);
            const opp2ParticipantId = seedingToParticipant.get(match.seed2);

            const opponent1 = opp1ParticipantId ? JSON.stringify({ id: opp1ParticipantId }) : null;
            const opponent2 = opp2ParticipantId ? JSON.stringify({ id: opp2ParticipantId }) : null;

            await db.run(
                'INSERT INTO bracket_match (stage_id, round_id, group_id, number, child_count, opponent1, opponent2, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [stageId, roundId, groupId, matchNumber, 0, opponent1, opponent2, 2]
            );
            matchNumber++;
        }
    }
}

async function clearJJBracketStageData(db, event_id, weightClass) {
    const stageRows = await db.all(
        'SELECT id FROM bracket_stage WHERE (event_id = ? AND category_id = ?) OR (tournament_id = ? AND name LIKE ?)',
        [event_id, weightClass, Number(event_id), weightClass + '%']
    );
    for (const row of stageRows) {
        const sid = row.id;
        try {
            await db.run('DELETE FROM bracket_match_game WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_match WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_round WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_group WHERE stage_id = ?', [sid]);
            await db.run('DELETE FROM bracket_stage WHERE id = ?', [sid]);
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
            },
        });

        const allStageIds = [];
        if (deStage?.id) {
            await db.run(
                'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
                [event_id, weightClass, categoryId ? Number(categoryId) : null, deStage.id]
            );
            allStageIds.push(deStage.id);
        }

        const otherStages = await db.all(
            'SELECT id FROM bracket_stage WHERE tournament_id = ? AND category_id IS NULL AND id != ?',
            [Number(event_id), deStage?.id || 0]
        );
        for (const s of otherStages) {
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

                if (isWinners) {
                    for (const round of rounds) {
                        let roundName;
                        if (round.number && totalRounds) {
                            if (round.number === totalRounds) roundName = 'D.Final';
                            else {
                                const d = Math.pow(2, totalRounds - round.number);
                                roundName = `1/${d}`;
                            }
                        }
                        if (roundName && round.name !== roundName) {
                            await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [roundName, round.id]);
                        }
                    }
                } else {
                    const losersRounds = rounds.length;
                    for (const round of rounds) {
                        let roundName;
                        if (round.number === losersRounds) {
                            roundName = 'Bro.m';
                        } else {
                            roundName = `Rep.${round.number}`;
                        }
                        if (roundName && round.name !== roundName) {
                            await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [roundName, round.id]);
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
                    athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1),
                    athlete_team: athlete.athlete_team || ''
                }), bracketName]
            );
        }

        matchCount = 0;
        for (const sid of allStageIds) {
            const m = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [sid]);
            matchCount += m.length;
        }

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

        await createJJRoundRobinBracketMatches(db, rrStage.id, effectiveSeeding, participantList);

        for (let i = 0; i < cleanSeeding.length; i++) {
            if (cleanSeeding[i] === null) continue;
            const p = participantList.find(pp => pp.name === cleanSeeding[i]);
            if (p) {
                const athlete = sortedAthletes[i] || {};
                await db.run(
                    'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
                    [JSON.stringify({
                        id: athlete.id != null ? athlete.id : null,
                        athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1),
                        athlete_team: athlete.athlete_team || ''
                    }), p.id]
                );
            }
        }

        const rrMatches = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [rrStage.id]);
        matchCount = rrMatches.length;

        stageId = String(rrStage.id);

    } else if (stageType === 'pool_elimination') {
        let upperSize, lowerSize;
        if (n === 5) { upperSize = 3; lowerSize = 2; }
        else if (n === 6) { upperSize = 3; lowerSize = 3; }
        else if (n === 7) { upperSize = 3; lowerSize = 4; }
        else {
            upperSize = Math.ceil(n / 2);
            lowerSize = n - upperSize;
        }

        const upperSeeding = cleanSeeding.slice(0, upperSize).filter(s => s !== null);
        const lowerSeeding = cleanSeeding.slice(upperSize, upperSize + lowerSize).filter(s => s !== null);

        const upperNum = upperSeeding.map((_, idx) => idx + 1);
        const lowerNum = lowerSeeding.map((_, idx) => upperSize + idx + 1);
        const combinedSeeding = [...upperSeeding, ...lowerSeeding];

        const divisionalStage = await manager.create.stage({
            tournamentId: Number(event_id),
            name: `${weightClass}_分区循环赛`,
            type: 'round_robin',
            seeding: combinedSeeding,
            settings: {
                groupCount: 2,
                manualOrdering: [upperNum, lowerNum],
            },
        });

        await db.run(
            'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
            [event_id, weightClass, categoryId ? Number(categoryId) : null, divisionalStage.id]
        );

        const participantList = await db.all(
            'SELECT id, name FROM bracket_participant WHERE tournament_id = ?',
            [Number(event_id)]
        );

        for (let i = 0; i < cleanSeeding.length; i++) {
            if (cleanSeeding[i] === null) continue;
            const p = participantList.find(pp => pp.name === cleanSeeding[i]);
            if (p) {
                const athlete = sortedAthletes[i] || {};
                await db.run(
                    'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
                    [JSON.stringify({
                        id: athlete.id != null ? athlete.id : null,
                        athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1),
                        athlete_team: athlete.athlete_team || '',
                        zone: i < upperSize ? 'upper' : 'lower'
                    }), p.id]
                );
            }
        }

        const poolMatches = await db.all(
            'SELECT id FROM bracket_match WHERE stage_id = ?',
            [divisionalStage.id]
        );
        let matchCount = poolMatches.length;

        const finalStage = await manager.create.stage({
            tournamentId: Number(event_id),
            name: `${weightClass}_决赛`,
            type: 'round_robin',
            settings: { groupCount: 1 },
            seeding: ['上区第一', '下区第一'],
        });

        await db.run(
            'UPDATE bracket_stage SET event_id = ?, category_id = ?, mode_category_id = ? WHERE id = ?',
            [event_id, weightClass, categoryId ? Number(categoryId) : null, finalStage.id]
        );

        const finalMatches = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [finalStage.id]);
        if (finalMatches && finalMatches.length > 0) {
            for (const match of finalMatches) {
                const existing = await db.get('SELECT id FROM bracket_match_game WHERE parent_id = ?', [match.id]);
                if (!existing) {
                    await db.run('INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)', [finalStage.id, match.id, 1]);
                    await db.run('UPDATE bracket_match SET child_count = 1 WHERE id = ?', [match.id]);
                }
            }
            matchCount += finalMatches.length;
        }

        const finalStageData = await manager.get.stageData(finalStage.id);
        if (finalStageData?.round?.length > 0) {
            for (const round of finalStageData.round) {
                if (round.name !== 'R.Final') {
                    await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', ['R.Final', round.id]);
                }
            }
        }

        stageId = `${divisionalStage.id},${finalStage.id}`;

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
                    athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1),
                    athlete_team: athlete.athlete_team || ''
                }), bracketName]
            );
        }

        const seMatches = await db.all('SELECT id FROM bracket_match WHERE stage_id = ?', [stage.id]);
        matchCount = seMatches.length;

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
            let roundNum;
            if (round === totalRounds) {
                roundName = mode === 'double_elimination' ? 'D.Final' : 'Final';
                roundNum = 999;
            } else {
                const denominator = Math.pow(2, totalRounds - round);
                roundName = `1/${denominator}`;
                roundNum = round;
            }

            for (let i = 0; i < matchesInRound; i++) {
                const red = seeded[2 * i];
                const blue = seeded[2 * i + 1];
                await db.run(
                    `INSERT INTO jiu_jitsu_matchs
                    (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                     jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                     jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                     jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                     jiu_jitsu_match_comp_mode, jiu_jitsu_match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        event_id, null, null, weightClass,
                        roundNum, roundName, totalRounds,
                        red ? red.athlete_id : null, red ? red.athlete_name : null, red ? red.athlete_team : null,
                        blue ? blue.athlete_id : null, blue ? blue.athlete_name : null, blue ? blue.athlete_team : null,
                        mode, (!red || !blue) ? 'bye' : '未开始'
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
                if (round === losersRounds) roundName = 'Bro.m';
                else roundName = `Rep.${round}`;
                for (let i = 0; i < matchesInRound; i++) {
                    await db.run(
                        `INSERT INTO jiu_jitsu_matchs
                        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                         jiu_jitsu_match_comp_mode, jiu_jitsu_match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [event_id, null, null, weightClass, totalRounds + round, roundName, totalRounds, mode, '未开始']
                    );
                    matchNum++;
                }
            }
        }

    } else if (mode === 'round_robin') {
        const schedule = generateJJRoundRobinSchedule(n);
        for (let r = 0; r < schedule.length; r++) {
            const roundName = n === 2 ? 'Final' : `R${r + 1}`;
            const roundNum = n === 2 ? 999 : (r + 1);
            for (let i = 0; i < schedule[r].length; i++) {
                const { seed1, seed2 } = schedule[r][i];
                const red = seed1 <= n ? sorted[seed1 - 1] : null;
                const blue = seed2 <= n ? sorted[seed2 - 1] : null;
                if (red && blue) {
                    await db.run(
                        `INSERT INTO jiu_jitsu_matchs
                        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                         jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                         jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                         jiu_jitsu_match_comp_mode, jiu_jitsu_match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            event_id, null, null, weightClass,
                            roundNum, roundName, schedule.length,
                            red.athlete_id, red.athlete_name, red.athlete_team,
                            blue.athlete_id, blue.athlete_name, blue.athlete_team,
                            mode, '未开始'
                        ]
                    );
                    matchNum++;
                }
            }
        }

    } else if (mode === 'pool_elimination') {
        let upperSize, lowerSize;
        if (n === 5) { upperSize = 3; lowerSize = 2; }
        else if (n === 6) { upperSize = 3; lowerSize = 3; }
        else if (n === 7) { upperSize = 3; lowerSize = 4; }
        else { upperSize = Math.ceil(n / 2); lowerSize = n - upperSize; }

        const upperAthletes = sorted.slice(0, upperSize);
        const lowerAthletes = sorted.slice(upperSize);

        const upperSchedule = generateJJRoundRobinSchedule(upperSize);
        const maxRounds = Math.max(upperSchedule.length, lowerSize >= 2 ? generateJJRoundRobinSchedule(lowerSize).length : 0);

        for (let r = 0; r < upperSchedule.length; r++) {
            const roundName = `R${r + 1}`;
            for (const match of upperSchedule[r]) {
                const red = match.seed1 <= upperSize ? upperAthletes[match.seed1 - 1] : null;
                const blue = match.seed2 <= upperSize ? upperAthletes[match.seed2 - 1] : null;
                if (red && blue) {
                    await db.run(
                        `INSERT INTO jiu_jitsu_matchs
                        (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                         jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                         jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                         jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                         jiu_jitsu_match_comp_mode, jiu_jitsu_match_zone, jiu_jitsu_match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            event_id, null, null, weightClass,
                            r + 1, roundName, maxRounds,
                            red.athlete_id, red.athlete_name, red.athlete_team,
                            blue.athlete_id, blue.athlete_name, blue.athlete_team,
                            mode, 'upper', '未开始'
                        ]
                    );
                    matchNum++;
                }
            }
        }

        if (lowerSize >= 2) {
            const lowerSchedule = generateJJRoundRobinSchedule(lowerSize);
            for (let r = 0; r < lowerSchedule.length; r++) {
                const roundName = `R${r + 1}`;
                for (const match of lowerSchedule[r]) {
                    const red = match.seed1 <= lowerSize ? lowerAthletes[match.seed1 - 1] : null;
                    const blue = match.seed2 <= lowerSize ? lowerAthletes[match.seed2 - 1] : null;
                    if (red && blue) {
                        await db.run(
                            `INSERT INTO jiu_jitsu_matchs
                            (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                             jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                             jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                             jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                             jiu_jitsu_match_comp_mode, jiu_jitsu_match_zone, jiu_jitsu_match_status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                event_id, null, null, weightClass,
                                r + 1, roundName, maxRounds,
                                red.athlete_id, red.athlete_name, red.athlete_team,
                                blue.athlete_id, blue.athlete_name, blue.athlete_team,
                                mode, 'lower', '未开始'
                            ]
                        );
                        matchNum++;
                    }
                }
            }
        }

        if (upperSize >= 2 && lowerSize >= 2) {
            await db.run(
                `INSERT INTO jiu_jitsu_matchs
                (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
                 jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
                 jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
                 jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
                 jiu_jitsu_match_comp_mode, jiu_jitsu_match_zone, jiu_jitsu_match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    event_id, null, null, weightClass,
                    999, 'R.Final', 999,
                    '上区第一', '',
                    '下区第一', '',
                    mode, 'final', '未开始'
                ]
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

async function syncJJMatchesFromBracket(db, event_id, weightClass, compMode) {
    const stageMapRows = await db.all(
        'SELECT id AS stage_id, type AS stage_type, name AS stage_name FROM bracket_stage WHERE event_id = ? AND category_id = ?',
        [event_id, weightClass]
    );

    if (!stageMapRows || stageMapRows.length === 0) return 0;

    let effectiveCompMode = compMode;
    if (!effectiveCompMode && stageMapRows.length > 0) {
        if (stageMapRows.length >= 2 && stageMapRows.some(r => r.stage_name && r.stage_name.includes('决赛'))) {
            effectiveCompMode = 'pool_elimination';
        } else {
            effectiveCompMode = stageMapRows[0].stage_type || 'single_elimination';
        }
    }

    const stageIds = stageMapRows.map(r => String(r.stage_id)).filter(Boolean);

    const nameUnitMap = new Map();
    const unitRows = await db.all(
        'SELECT id, athlete_name, athlete_team FROM athletes WHERE event_id = ? AND athlete_category = ? AND athlete_type = ?',
        [event_id, weightClass, 'jiu_jitsu']
    );
    unitRows.forEach(r => { nameUnitMap.set(r.id, r.athlete_team || ''); });

    const participants = await db.all(
        'SELECT id, name, custom_data FROM bracket_participant WHERE tournament_id = ?',
        [Number(event_id)]
    );

    const participantMap = new Map();
    participants.forEach(p => {
        let info = { name: p.name, id: null, athlete_draw_num: null, unit: '', zone: '' };
        try {
            if (p.custom_data) {
                const custom = JSON.parse(p.custom_data);
                info.id = custom.id;
                info.athlete_draw_num = custom.athlete_draw_num;
                info.unit = custom.athlete_team || nameUnitMap.get(custom.id) || '';
                info.zone = custom.zone || '';
            }
        } catch (e) {}
        const parenIdx = info.name.indexOf('(');
        if (parenIdx > 0) {
            info.name = info.name.substring(0, parenIdx);
        }
        participantMap.set(p.id, info);
    });

    let allBracketMatches = [];
    let maxRoundNumber = 0;

    const stageNameMap = new Map();
    stageMapRows.forEach(r => { stageNameMap.set(String(r.stage_id), r.stage_name || ''); });

    const stageGroupMap = new Map();
    for (const sid of stageIds) {
        const numSid = Number(sid);
        if (isNaN(numSid)) continue;
        const groupRows = await db.all(
            'SELECT id, number, name FROM bracket_group WHERE stage_id = ?',
            [numSid]
        );
        if (groupRows) {
            for (const g of groupRows) {
                stageGroupMap.set(g.id, { number: g.number, name: g.name || '' });
            }
        }
    }

    const stageFirstRoundMap = new Map();
    for (const sid of stageIds) {
        const numSid = Number(sid);
        if (isNaN(numSid)) continue;
        const roundRows = await db.all(
            'SELECT MIN(number) AS min_round FROM bracket_round WHERE stage_id = ?',
            [numSid]
        );
        if (roundRows && roundRows[0] && roundRows[0].min_round != null) {
            stageFirstRoundMap.set(numSid, roundRows[0].min_round);
        }
    }

    for (const sid of stageIds) {
        const numSid = Number(sid);
        if (isNaN(numSid)) continue;

        const bracketMatches = await db.all(
            `SELECT bm.id, bm.number, bm.opponent1, bm.opponent2, bm.status, bm.group_id,
                    br.number AS round_number, br.name AS round_name
             FROM bracket_match bm
             LEFT JOIN bracket_round br ON bm.round_id = br.id
             WHERE bm.stage_id = ?
             ORDER BY br.number, bm.number`,
            [numSid]
        );

        if (bracketMatches && bracketMatches.length > 0) {
            const stageName = stageNameMap.get(sid) || '';
            for (const bm of bracketMatches) {
                bm._stageName = stageName;
                bm._stageId = numSid;
                const groupInfo = bm.group_id ? stageGroupMap.get(bm.group_id) : null;
                if (groupInfo) {
                    bm._groupNumber = groupInfo.number;
                    bm._groupName = groupInfo.name;
                }
                if (bm.round_number && bm.round_number > maxRoundNumber) {
                    maxRoundNumber = bm.round_number;
                }
            }
            allBracketMatches = allBracketMatches.concat(bracketMatches);
        }
    }

    if (allBracketMatches.length === 0) return 0;

    const existingVenueMap = new Map();
    try {
        const existingRows = await db.all(
            'SELECT jiu_jitsu_bracket_match_id, jiu_jitsu_match_venue, jiu_jitsu_match_id FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
            [event_id, weightClass]
        );
        if (existingRows) {
            for (const r of existingRows) {
                if (r.jiu_jitsu_bracket_match_id != null && (r.jiu_jitsu_match_venue != null || r.jiu_jitsu_match_id != null)) {
                    existingVenueMap.set(String(r.jiu_jitsu_bracket_match_id), {
                        venue: r.jiu_jitsu_match_venue,
                        matchId: r.jiu_jitsu_match_id
                    });
                }
            }
        }
    } catch (e) {}

    const bmIdToRoundAndNum = new Map();
    const stageRoundNumToMatches = new Map();
    for (const bm of allBracketMatches) {
        bmIdToRoundAndNum.set(bm.id, { round: bm.round_number, number: bm.number, stageId: bm._stageId });
        const key = `${bm._stageId}|${bm.round_number}`;
        if (!stageRoundNumToMatches.has(key)) stageRoundNumToMatches.set(key, []);
        stageRoundNumToMatches.get(key).push(bm);
    }

    function findPrevBracketMatchIdForSync(currentBmId, side) {
        const info = bmIdToRoundAndNum.get(currentBmId);
        if (!info || !info.round || info.round <= 1) return null;
        const firstRound = stageFirstRoundMap.get(info.stageId) || 1;
        if (info.round <= firstRound) return null;
        const prevRound = info.round - 1;
        const prevRoundMatches = stageRoundNumToMatches.get(`${info.stageId}|${prevRound}`);
        if (!prevRoundMatches) return null;
        let prevNumber;
        if (side === 'red') {
            prevNumber = info.number * 2 - 1;
        } else {
            prevNumber = info.number * 2;
        }
        const prevMatch = prevRoundMatches.find(m => m.number === prevNumber);
        return prevMatch ? prevMatch.id : null;
    }

    function findPrevFromBracketDataForSync(currentBmId, side) {
        const bm = allBracketMatches.find(b => b.id === currentBmId);
        if (!bm) return null;
        const oppStr = side === 'red' ? bm.opponent1 : bm.opponent2;
        if (!oppStr) return null;
        try {
            const opp = typeof oppStr === 'string' ? JSON.parse(oppStr) : oppStr;
            if (opp && opp.id) {
                const prevBm = allBracketMatches.find(b => {
                    try {
                        const o1 = typeof b.opponent1 === 'string' ? JSON.parse(b.opponent1) : b.opponent1;
                        const o2 = typeof b.opponent2 === 'string' ? JSON.parse(b.opponent2) : b.opponent2;
                        return (o1 && o1.id === opp.id) || (o2 && o2.id === opp.id);
                    } catch (e) { return false; }
                });
                return prevBm ? prevBm.id : null;
            }
        } catch (e) {}
        return null;
    }

    function findPoolWinnerPrevMatchId(currentBmId, side) {
        const bm = allBracketMatches.find(b => b.id === currentBmId);
        if (!bm) return null;
        const oppStr = side === 'red' ? bm.opponent1 : bm.opponent2;
        if (!oppStr) return null;
        try {
            const opp = typeof oppStr === 'string' ? JSON.parse(oppStr) : oppStr;
            const oppName = opp?.name || '';
            if (!oppName) return null;

            const currentStageName = stageNameMap.get(String(bm._stageId)) || '';
            const isFinalStage = currentStageName.includes('决赛');

            let targetZone = '';
            if (oppName.includes('上区') || oppName.includes('Upper')) targetZone = 'upper';
            else if (oppName.includes('下区') || oppName.includes('Lower')) targetZone = 'lower';
            if (!targetZone && isFinalStage) return null;

            const divisionalStage = stageMapRows.find(r => {
                const sn = r.stage_name || '';
                return sn.includes('分区循环赛') || sn.includes('循环赛');
            });
            if (!divisionalStage) return null;

            const divisionalMatches = allBracketMatches.filter(b => b._stageId === divisionalStage.stage_id);
            if (divisionalMatches.length === 0) return null;

            let zoneMatches;
            if (targetZone === 'upper') {
                zoneMatches = divisionalMatches.filter(b => {
                    const gn = b._groupNumber;
                    if (gn === 1) return true;
                    const sn = b._stageName || '';
                    return sn.includes('上区');
                });
            } else {
                zoneMatches = divisionalMatches.filter(b => {
                    const gn = b._groupNumber;
                    if (gn === 2) return true;
                    const sn = b._stageName || '';
                    return sn.includes('下区');
                });
            }

            if (zoneMatches.length === 0) return null;

            let maxRound = 0;
            for (const zm of zoneMatches) {
                if (zm.round_number > maxRound) maxRound = zm.round_number;
            }
            const lastRoundMatches = zoneMatches.filter(zm => zm.round_number === maxRound);
            if (lastRoundMatches.length > 0) {
                return lastRoundMatches[0].id;
            }
            return null;
        } catch (e) {}
        return null;
    }

    let matchCount = 0;

    for (const bm of allBracketMatches) {
        let blueName = '', redName = '';
        let blueAthleteId = null, redAthleteId = null;
        let blueUnit = '', redUnit = '';
        let zone = '';
        let redOppName = '', blueOppName = '';

        try {
            if (bm.opponent1) {
                const opp1 = typeof bm.opponent1 === 'string' ? JSON.parse(bm.opponent1) : bm.opponent1;
                if (opp1 && opp1.id) {
                    const info = participantMap.get(opp1.id);
                    if (info) {
                        redName = info.name || '';
                        redAthleteId = info.id;
                        redUnit = info.unit || '';
                        zone = info.zone || '';
                    }
                }
                if (opp1 && opp1.id === null && opp1.name) {
                    redName = opp1.name;
                    redOppName = opp1.name;
                }
            }
        } catch (e) {}

        try {
            if (bm.opponent2) {
                const opp2 = typeof bm.opponent2 === 'string' ? JSON.parse(bm.opponent2) : bm.opponent2;
                if (opp2 && opp2.id) {
                    const info = participantMap.get(opp2.id);
                    if (info) {
                        blueName = info.name || '';
                        blueAthleteId = info.id;
                        blueUnit = info.unit || '';
                        if (!zone) zone = info.zone || '';
                    }
                }
                if (opp2 && opp2.id === null && opp2.name) {
                    blueName = opp2.name;
                    blueOppName = opp2.name;
                }
            }
        } catch (e) {}

        if (!zone && bm._groupNumber) {
            if (bm._groupNumber === 1) zone = 'upper';
            else if (bm._groupNumber === 2) zone = 'lower';
        }
        if (!zone && bm._stageName) {
            if (bm._stageName.includes('上区')) zone = 'upper';
            else if (bm._stageName.includes('下区')) zone = 'lower';
        }
        if (bm._stageName && bm._stageName.includes('决赛')) {
            zone = 'final';
        }

        const bracketStatus = bm.status;
        const isElimination = effectiveCompMode === 'single_elimination' || effectiveCompMode === 'double_elimination';
        const firstRound = stageFirstRoundMap.get(bm._stageId) || 1;
        const isFirstRound = bm.round_number <= firstRound;

        let matchStatus;
        if (bracketStatus === 4) {
            matchStatus = '已结束';
        } else if (bracketStatus === 3) {
            matchStatus = '进行中';
        } else if (isElimination && !isFirstRound && (!redName || !blueName)) {
            matchStatus = '未开始';
        } else if (!redName || !blueName) {
            const currentStageName = stageNameMap.get(String(bm._stageId)) || '';
            const isFinalStage = currentStageName.includes('决赛') || zone === 'final';
            const isPlaceholder = redOppName.includes('第一') || blueOppName.includes('第一');
            if (isFinalStage && isPlaceholder) {
                matchStatus = '未开始';
            } else if (isFinalStage) {
                matchStatus = '未开始';
            } else {
                matchStatus = 'bye';
            }
        } else {
            matchStatus = '未开始';
        }

        let roundNum = bm.round_number || 1;
        const rn = bm.round_name || '';
        if (rn === 'Final' || rn === 'D.Final' || rn === 'R.Final') {
            roundNum = 999;
        }

        let bluePrevBracketMatchId = null;
        let redPrevBracketMatchId = null;

        if (isElimination && !isFirstRound) {
            if (!redName) {
                redPrevBracketMatchId = findPrevBracketMatchIdForSync(bm.id, 'red');
                if (!redPrevBracketMatchId) {
                    redPrevBracketMatchId = findPrevFromBracketDataForSync(bm.id, 'red');
                }
            }
            if (!blueName) {
                bluePrevBracketMatchId = findPrevBracketMatchIdForSync(bm.id, 'blue');
                if (!bluePrevBracketMatchId) {
                    bluePrevBracketMatchId = findPrevFromBracketDataForSync(bm.id, 'blue');
                }
            }
        }

        if (!isElimination) {
            const currentStageName = stageNameMap.get(String(bm._stageId)) || '';
            if (currentStageName.includes('决赛')) {
                if (!redName || redName.includes('第一')) {
                    redPrevBracketMatchId = findPoolWinnerPrevMatchId(bm.id, 'red');
                    if (!redPrevBracketMatchId) {
                        redPrevBracketMatchId = findPrevFromBracketDataForSync(bm.id, 'red');
                    }
                }
                if (!blueName || blueName.includes('第一')) {
                    bluePrevBracketMatchId = findPoolWinnerPrevMatchId(bm.id, 'blue');
                    if (!bluePrevBracketMatchId) {
                        bluePrevBracketMatchId = findPrevFromBracketDataForSync(bm.id, 'blue');
                    }
                }
            }
        }

        const existingVenue = existingVenueMap.get(String(bm.id));
        const preservedVenue = existingVenue ? existingVenue.venue : null;
        const preservedMatchId = existingVenue ? existingVenue.matchId : null;

        await db.run(
            `INSERT INTO jiu_jitsu_matchs
            (event_id, jiu_jitsu_match_venue, jiu_jitsu_match_id, jiu_jitsu_match_categroy,
             jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_category_total_rounds,
             jiu_jitsu_bracket_match_id,
             jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_team,
             jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_team,
             jiu_jitsu_match_comp_mode, jiu_jitsu_match_zone,
             jiu_jitsu_blue_prev_bracket_match_id, jiu_jitsu_red_prev_bracket_match_id,
             jiu_jitsu_match_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                event_id, preservedVenue, preservedMatchId, weightClass,
                roundNum, rn, maxRoundNumber,
                bm.id,
                redAthleteId, redName, redUnit,
                blueAthleteId, blueName, blueUnit,
                effectiveCompMode || null, zone || null,
                bluePrevBracketMatchId, redPrevBracketMatchId,
                matchStatus
            ]
        );
        matchCount++;
    }

    return matchCount;
}

module.exports = {
    MODE_NAME_MAP,
    MODE_VALUE_MAP,
    FINAL_NAME_MAP,
    generateJJBracketForEvent,
    generateJJBracketForClass,
    generateJJMatchsFromBracketData,
    syncJJMatchesFromBracket,
    seedAthletes,
    getSeedingPositions,
    roundRobinSchedule,
    clearJJBracketStageData,
    generateJJSeedOrder,
    generateJJRoundRobinSchedule,
    generateBergerSchedule
};
