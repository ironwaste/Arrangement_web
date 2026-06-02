const express = require('express');
const router = express.Router();

const {
    MODE_NAME_MAP,
    MODE_VALUE_MAP,
    generateJJBracketForEvent,
    clearJJBracketStageData,
    syncJJMatchesFromBracket
} = require('./jiu-jitsu-bracket-helpers');

module.exports = (db, manager) => {

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
            const { event_id, weight_class, force } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }

            const eventIdNum = Number(event_id);

            if (weight_class) {
                if (!force) {
                    const categoryRow = await db.get(
                        'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?',
                        [eventIdNum, weight_class]
                    );
                    const categoryId = categoryRow ? categoryRow.category_id : null;

                    const existingData = await db.get(
                        'SELECT COUNT(*) as count FROM bracket_stage WHERE event_id = ? AND category_id = ?',
                        [eventIdNum, categoryId]
                    );
                    if (existingData && existingData.count > 0) {
                        return res.json({
                            success: false,
                            error: '该级别已有对阵图数据，请先清除后再生成。',
                            hasExistingData: true,
                            weight_class: weight_class
                        });
                    }
                }
            } else {
                const athletes = await db.all(
                    'SELECT DISTINCT athlete_category FROM athletes WHERE event_id = ? AND athlete_type = ?',
                    [eventIdNum, 'jiu_jitsu']
                );
                const allClasses = athletes.map(a => a.athlete_category).filter(Boolean);

                const existingStages = await db.all(
                    'SELECT DISTINCT cm.weight_class FROM bracket_stage bs JOIN category_mode cm ON bs.category_id = cm.category_id WHERE bs.event_id = ?',
                    [eventIdNum]
                );
                const existingClasses = existingStages.map(s => s.weight_class).filter(Boolean);

                const allExist = allClasses.length > 0 && allClasses.every(cls => existingClasses.includes(cls));

                if (allExist && !force) {
                    return res.json({
                        success: false,
                        error: '所有级别对阵图已经存在，如需重新生成，请点击清除全部级别对阵图',
                        allLevelsExist: true,
                        existingClasses: allClasses,
                        totalClasses: allClasses.length
                    });
                }

                const classesToGenerate = force ? allClasses : allClasses.filter(cls => !existingClasses.includes(cls));

                if (classesToGenerate.length === 0) {
                    return res.json({
                        success: true,
                        data: { generated: 0, skipped: allClasses.length, errors: [], results: ['所有级别对阵图已存在，无需生成'] }
                    });
                }

                req.body.classes_to_generate = classesToGenerate;
            }

            const result = await generateJJBracketForEvent(db, manager, event_id, weight_class || null, req.body.classes_to_generate);

            if (result && result.generated > 0) {
                if (weight_class) {
                    await db.run(
                        'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
                        [eventIdNum, weight_class]
                    );
                    await syncJJMatchesFromBracket(db, eventIdNum, weight_class);
                } else {
                    const stageMapRows = await db.all(
                        'SELECT DISTINCT cm.weight_class FROM bracket_stage bs JOIN category_mode cm ON bs.category_id = cm.category_id WHERE bs.event_id = ?',
                        [eventIdNum]
                    );
                    const classes = stageMapRows.map(r => r.weight_class).filter(Boolean);
                    await db.run('DELETE FROM jiu_jitsu_matchs WHERE event_id = ?', [eventIdNum]);
                    for (const wc of classes) {
                        try {
                            await syncJJMatchesFromBracket(db, eventIdNum, wc);
                        } catch (e) {
                            console.warn(`同步 ${wc} 失败:`, e.message);
                        }
                    }
                }
            }

            res.json({ success: true, data: result });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/generate-matches', async (req, res) => {
        try {
            const { event_id, weight_class } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }
            const eventIdNum = Number(event_id);

            const schemeRows = await db.all(
                'SELECT weight_class, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?',
                [eventIdNum]
            );
            const schemeMap = new Map();
            schemeRows.forEach(r => {
                if (r.weight_class) schemeMap.set(r.weight_class, r);
            });

            const unassigned = [];
            for (const [wc, scheme] of schemeMap) {
                if (!scheme.category_venue || !scheme.category_date_num) {
                    unassigned.push(wc);
                }
            }
            if (unassigned.length > 0) {
                return res.json({ success: false, error: '以下级别未完成场地分配：\n' + unassigned.join('\n') });
            }

            let classes = [];
            if (weight_class) {
                classes = [weight_class];
            } else {
                const stageMapRows = await db.all(
                    'SELECT DISTINCT category_id FROM bracket_stage WHERE event_id = ?',
                    [eventIdNum]
                );
                classes = stageMapRows.map(r => r.category_id).filter(Boolean);
            }

            if (classes.length === 0) {
                return res.json({ success: false, error: '尚未生成对阵图，请先生成对阵图' });
            }

            if (weight_class) {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
                    [eventIdNum, weight_class]
                );
            } else {
                await db.run('DELETE FROM jiu_jitsu_matchs WHERE event_id = ?', [eventIdNum]);
            }

            let syncCount = 0;
            const errors = [];
            for (const wc of classes) {
                try {
                    const matchCount = await syncJJMatchesFromBracket(db, eventIdNum, wc);
                    if (matchCount > 0) syncCount++;
                } catch (err) {
                    errors.push(`${wc}: ${err.message}`);
                }
            }

            if (syncCount === 0) {
                return res.json({ success: false, error: '同步对阵数据失败，无有效对阵图数据' });
            }

            const matches = await db.all(
                'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ?',
                [eventIdNum]
            );

            function getCompTypeSortOrder(compMode) {
                if (compMode === 'single_elimination') return 1;
                if (compMode === 'round_robin') return 2;
                if (compMode === 'pool_elimination') return 3;
                if (compMode === 'double_elimination') return 4;
                return 1;
            }

            function getZoneSortValue(m) {
                const zone = m.jiu_jitsu_match_zone || '';
                if (zone === 'upper') return 1;
                if (zone === 'lower') return 2;
                if (zone === 'final') return 3;
                return 0;
            }

            matches.sort((a, b) => {
                const sa = schemeMap.get(a.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };
                const sb = schemeMap.get(b.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };

                const unitA = parseFloat(sa.category_date_num) || 0;
                const unitB = parseFloat(sb.category_date_num) || 0;
                if (unitA !== unitB) return unitA - unitB;

                const venueCmp = (sa.category_venue || '').localeCompare(sb.category_venue || '');
                if (venueCmp !== 0) return venueCmp;

                const roundNumA = a.jiu_jitsu_match_round_num || 0;
                const roundNumB = b.jiu_jitsu_match_round_num || 0;
                const isFinalA = roundNumA >= 999 ? 1 : 0;
                const isFinalB = roundNumB >= 999 ? 1 : 0;
                if (isFinalA !== isFinalB) return isFinalA - isFinalB;

                if (roundNumA !== roundNumB) return roundNumA - roundNumB;

                const orderA = parseFloat(sa.category_order) || 0;
                const orderB = parseFloat(sb.category_order) || 0;
                if (orderA !== orderB) return orderA - orderB;

                const zoneA = getZoneSortValue(a);
                const zoneB = getZoneSortValue(b);
                if (zoneA !== zoneB) return zoneA - zoneB;

                return (a.jiu_jitsu_bracket_match_id || 0) - (b.jiu_jitsu_bracket_match_id || 0);
            });

            const byeMatchIds = new Set();
            const nonByeMatches = matches.filter(m => {
                const compMode = m.jiu_jitsu_match_comp_mode || '';
                const isElimination = compMode === 'single_elimination' || compMode === 'double_elimination';
                if (isElimination) {
                    const blue = (m.jiu_jitsu_blue_athlete_name || '').trim();
                    const red = (m.jiu_jitsu_red_athlete_name || '').trim();
                    const bluePrevBmId = m.jiu_jitsu_blue_prev_bracket_match_id;
                    const redPrevBmId = m.jiu_jitsu_red_prev_bracket_match_id;
                    if (!blue && !red && !bluePrevBmId && !redPrevBmId) {
                        byeMatchIds.add(m.id);
                        return false;
                    }
                    if ((!blue && !bluePrevBmId) || (!red && !redPrevBmId)) {
                        byeMatchIds.add(m.id);
                        return false;
                    }
                }
                return true;
            });

            const venueUnitMatchCounters = new Map();
            let assigned = 0;

            await db.run(
                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_venue = NULL, jiu_jitsu_match_id = NULL WHERE event_id = ?',
                [eventIdNum]
            );

            for (const m of nonByeMatches) {
                const scheme = schemeMap.get(m.jiu_jitsu_match_categroy);
                const venue = scheme ? scheme.category_venue : null;
                const unitNum = scheme ? (parseInt(scheme.category_date_num) || 1) : 1;

                const key = `${venue}|${unitNum}`;
                if (!venueUnitMatchCounters.has(key)) {
                    venueUnitMatchCounters.set(key, 0);
                }
                const cnt = venueUnitMatchCounters.get(key) + 1;
                venueUnitMatchCounters.set(key, cnt);
                const matchId = String(unitNum * 1000 + cnt);
                await db.run(
                    'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_id = ?, jiu_jitsu_match_venue = ? WHERE id = ?',
                    [matchId, venue, m.id]
                );
                assigned++;
            }

            for (const id of byeMatchIds) {
                await db.run(
                    'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_venue = NULL, jiu_jitsu_match_id = NULL WHERE id = ?',
                    [id]
                );
            }

            const updatedMatches = await db.all(
                'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_id IS NOT NULL',
                [eventIdNum]
            );

            const classFirstRound = new Map();
            for (const m of updatedMatches) {
                const wc = m.jiu_jitsu_match_categroy;
                const rn = m.jiu_jitsu_match_round_num || 1;
                const totalRounds = m.jiu_jitsu_match_category_total_rounds || 1;
                if (rn <= totalRounds) {
                    if (!classFirstRound.has(wc) || rn < classFirstRound.get(wc)) {
                        classFirstRound.set(wc, rn);
                    }
                }
            }

            const bracketMatchIdToDisplayLabel = new Map();
            for (const m of updatedMatches) {
                if (m.jiu_jitsu_bracket_match_id && m.jiu_jitsu_match_id) {
                    const displayLabel = (m.jiu_jitsu_match_venue || '') + String(m.jiu_jitsu_match_id);
                    bracketMatchIdToDisplayLabel.set(m.jiu_jitsu_bracket_match_id, displayLabel);
                }
            }

            const bmIdToRoundAndNum = new Map();
            const stageRoundNumToMatches = new Map();
            const allBracketMatches = await db.all(
                `SELECT bm.id, bm.number, bm.stage_id, bm.opponent1, bm.opponent2, br.number AS round_number,
                        bs.name AS stage_name
                 FROM bracket_match bm
                 LEFT JOIN bracket_round br ON bm.round_id = br.id
                 LEFT JOIN bracket_stage bs ON bm.stage_id = bs.id`
            );
            const bmIdToStageName = new Map();
            for (const bm of allBracketMatches) {
                bmIdToRoundAndNum.set(bm.id, { round: bm.round_number, number: bm.number, stageId: bm.stage_id });
                const key = `${bm.stage_id}|${bm.round_number}`;
                if (!stageRoundNumToMatches.has(key)) stageRoundNumToMatches.set(key, []);
                stageRoundNumToMatches.get(key).push(bm);
                if (bm.stage_name) bmIdToStageName.set(bm.id, bm.stage_name);
            }

            function findPrevBracketMatchId(currentBmId, side) {
                const info = bmIdToRoundAndNum.get(currentBmId);
                if (!info || !info.round || info.round <= 1) return null;
                const prevRound = info.round - 1;
                const prevRoundMatches = stageRoundNumToMatches.get(`${info.stageId}|${prevRound}`);
                if (!prevRoundMatches) return null;
                let prevNumber;
                if (side === 'blue') {
                    prevNumber = info.number * 2 - 1;
                } else {
                    prevNumber = info.number * 2;
                }
                const prevMatch = prevRoundMatches.find(m => m.number === prevNumber);
                return prevMatch ? prevMatch.id : null;
            }

            function findPrevFromBracketData(currentBmId, side) {
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

            function isLoserBracketMatch(bmId) {
                const stageName = bmIdToStageName.get(bmId) || '';
                return stageName.includes('败者');
            }

            function isPrevFromWinnerBracket(prevBmId) {
                const stageName = bmIdToStageName.get(prevBmId) || '';
                return !stageName.includes('败者');
            }

            for (const m of updatedMatches) {
                const compMode = m.jiu_jitsu_match_comp_mode || '';
                const rn = m.jiu_jitsu_match_round_num || 1;
                const isElimination = compMode === 'single_elimination' || compMode === 'double_elimination';
                const isDependentMatch = !isElimination && (
                    (m.jiu_jitsu_blue_prev_bracket_match_id || m.jiu_jitsu_red_prev_bracket_match_id) ||
                    ((m.jiu_jitsu_blue_athlete_name || '').includes('第一') || (m.jiu_jitsu_red_athlete_name || '').includes('第一'))
                );
                if (!isElimination && !isDependentMatch) continue;

                const wc = m.jiu_jitsu_match_categroy;
                const firstRound = classFirstRound.get(wc) || 1;
                if (isElimination && rn <= firstRound && rn < 999) continue;

                let bluePrevWinner = m.jiu_jitsu_blue_prev_winner || '';
                let redPrevWinner = m.jiu_jitsu_red_prev_winner_id || '';

                if (!m.jiu_jitsu_blue_athlete_name || !m.jiu_jitsu_blue_athlete_name.trim() || (m.jiu_jitsu_blue_athlete_name || '').includes('第一')) {
                    let prevBmId = m.jiu_jitsu_blue_prev_bracket_match_id || findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'blue');
                    if (!prevBmId) {
                        prevBmId = findPrevFromBracketData(m.jiu_jitsu_bracket_match_id, 'blue');
                    }
                    if (prevBmId) {
                        const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
                        if (prevLabel) {
                            if (compMode === 'double_elimination' && isLoserBracketMatch(m.jiu_jitsu_bracket_match_id) && isPrevFromWinnerBracket(prevBmId)) {
                                bluePrevWinner = prevLabel + '负者';
                            } else {
                                bluePrevWinner = prevLabel + '胜者';
                            }
                        }
                    }
                } else {
                    bluePrevWinner = '';
                }

                if (!m.jiu_jitsu_red_athlete_name || !m.jiu_jitsu_red_athlete_name.trim() || (m.jiu_jitsu_red_athlete_name || '').includes('第一')) {
                    let prevBmId = m.jiu_jitsu_red_prev_bracket_match_id || findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'red');
                    if (!prevBmId) {
                        prevBmId = findPrevFromBracketData(m.jiu_jitsu_bracket_match_id, 'red');
                    }
                    if (prevBmId) {
                        const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
                        if (prevLabel) {
                            if (compMode === 'double_elimination' && isLoserBracketMatch(m.jiu_jitsu_bracket_match_id) && isPrevFromWinnerBracket(prevBmId)) {
                                redPrevWinner = prevLabel + '负者';
                            } else {
                                redPrevWinner = prevLabel + '胜者';
                            }
                        }
                    }
                } else {
                    redPrevWinner = '';
                }

                await db.run(
                    'UPDATE jiu_jitsu_matchs SET jiu_jitsu_red_prev_winner_id = ?, jiu_jitsu_blue_prev_winner = ? WHERE id = ?',
                    [redPrevWinner, bluePrevWinner, m.id]
                );
            }

            for (const [bmId, displayLabel] of bracketMatchIdToDisplayLabel) {
                await db.run(
                    'UPDATE bracket_match SET match_display_label = ? WHERE id = ?',
                    [displayLabel, bmId]
                );
            }

            res.json({ success: true, data: { assigned, totalMatches: matches.length, syncCount, errors } });
        } catch (err) {
            console.error('生成对阵表失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/generate-single', async (req, res) => {
        try {
            const { event_id, weight_class, force } = req.body;
            if (!event_id || !weight_class) {
                return res.status(400).json({ success: false, error: '缺少必要参数' });
            }

            const eventIdNum = Number(event_id);

            if (!force) {
                const categoryRow = await db.get(
                    'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?',
                    [eventIdNum, weight_class]
                );
                const categoryId = categoryRow ? categoryRow.category_id : null;

                const existingData = await db.get(
                    'SELECT COUNT(*) as count FROM bracket_stage WHERE event_id = ? AND category_id = ?',
                    [eventIdNum, categoryId]
                );
                if (existingData && existingData.count > 0) {
                    return res.json({
                        success: false,
                        error: '已有对阵图数据，请先清除后再生成。清除将删除该赛事所有对阵表数据！',
                        hasExistingData: true
                    });
                }
            }

            console.log('[jj-generate-single] 开始生成:', { event_id, weight_class });
            const result = await generateJJBracketForEvent(db, manager, event_id, weight_class);
            console.log('[jj-generate-single] 生成完成:', result);

            if (result && result.generated > 0) {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
                    [eventIdNum, weight_class]
                );
                await syncJJMatchesFromBracket(db, eventIdNum, weight_class);
            }

            res.json({ success: true, data: result });
        } catch (err) {
            console.error('[jj-generate-single] 生成失败:', err.message);
            console.error(err.stack);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/jj-brackets/classes', async (req, res) => {
        try {
            const { event_id } = req.query;
            if (!event_id) {
                return res.json({ success: true, data: [] });
            }
            const rows = await db.all(
                'SELECT DISTINCT jiu_jitsu_match_categroy AS class_name FROM jiu_jitsu_matchs WHERE event_id = ?',
                [Number(event_id)]
            );
            res.json({ success: true, data: rows.map(r => r.class_name).filter(Boolean) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/jj-brackets/matches', async (req, res) => {
        try {
            const { event_id, weight_class } = req.query;
            if (!event_id) {
                return res.json({ success: true, data: [] });
            }
            let sql = 'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ?';
            const params = [Number(event_id)];
            if (weight_class) {
                sql += ' AND jiu_jitsu_match_categroy = ?';
                params.push(weight_class);
            }
            sql += ' ORDER BY jiu_jitsu_match_round_num, jiu_jitsu_match_id';
            const rows = await db.all(sql, params);
            res.json({ success: true, data: rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.put('/jj-brackets/matches/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { blue_score, red_score, winner, win_method, match_status,
                    blue_athlete_name, blue_athlete_team, red_athlete_name, red_athlete_team } = req.body;

            const match = await db.get('SELECT * FROM jiu_jitsu_matchs WHERE id = ?', [id]);
            if (!match) {
                return res.status(404).json({ success: false, error: '比赛不存在' });
            }

            if (blue_athlete_name !== undefined || red_athlete_name !== undefined) {
                const updates = [];
                const params = [];
                if (blue_athlete_name !== undefined) {
                    updates.push('jiu_jitsu_blue_athlete_name = ?');
                    params.push(blue_athlete_name);
                }
                if (blue_athlete_team !== undefined) {
                    updates.push('jiu_jitsu_blue_athlete_team = ?');
                    params.push(blue_athlete_team);
                }
                if (red_athlete_name !== undefined) {
                    updates.push('jiu_jitsu_red_athlete_name = ?');
                    params.push(red_athlete_name);
                }
                if (red_athlete_team !== undefined) {
                    updates.push('jiu_jitsu_red_athlete_team = ?');
                    params.push(red_athlete_team);
                }
                if (updates.length > 0) {
                    params.push(id);
                    await db.run(
                        `UPDATE jiu_jitsu_matchs SET ${updates.join(', ')} WHERE id = ?`,
                        params
                    );
                }

                if (match.jiu_jitsu_bracket_match_id) {
                    try {
                        const bm = await db.get('SELECT * FROM bracket_match WHERE id = ?', [match.jiu_jitsu_bracket_match_id]);
                        if (bm) {
                            if (blue_athlete_name !== undefined && blue_athlete_name && blue_athlete_name !== '上区第一' && blue_athlete_name !== '下区第一') {
                                let opp2 = bm.opponent2 ? JSON.parse(bm.opponent2) : {};
                                const bp = await db.all(
                                    'SELECT id FROM bracket_participant WHERE tournament_id = ? AND name = ?',
                                    [match.event_id, blue_athlete_name]
                                );
                                if (bp.length > 0) opp2.id = bp[0].id;
                                opp2.name = blue_athlete_name;
                                await db.run('UPDATE bracket_match SET opponent2 = ? WHERE id = ?', [JSON.stringify(opp2), bm.id]);
                            } else if (blue_athlete_name === '上区第一' || blue_athlete_name === '下区第一') {
                                let opp2 = bm.opponent2 ? JSON.parse(bm.opponent2) : {};
                                delete opp2.id;
                                opp2.name = blue_athlete_name;
                                await db.run('UPDATE bracket_match SET opponent2 = ? WHERE id = ?', [JSON.stringify(opp2), bm.id]);
                            }

                            if (red_athlete_name !== undefined && red_athlete_name && red_athlete_name !== '上区第一' && red_athlete_name !== '下区第一') {
                                let opp1 = bm.opponent1 ? JSON.parse(bm.opponent1) : {};
                                const rp = await db.all(
                                    'SELECT id FROM bracket_participant WHERE tournament_id = ? AND name = ?',
                                    [match.event_id, red_athlete_name]
                                );
                                if (rp.length > 0) opp1.id = rp[0].id;
                                opp1.name = red_athlete_name;
                                await db.run('UPDATE bracket_match SET opponent1 = ? WHERE id = ?', [JSON.stringify(opp1), bm.id]);
                            } else if (red_athlete_name === '上区第一' || red_athlete_name === '下区第一') {
                                let opp1 = bm.opponent1 ? JSON.parse(bm.opponent1) : {};
                                delete opp1.id;
                                opp1.name = red_athlete_name;
                                await db.run('UPDATE bracket_match SET opponent1 = ? WHERE id = ?', [JSON.stringify(opp1), bm.id]);
                            }
                        }
                    } catch (e) {
                        console.warn('同步bracket_match运动员失败:', e.message);
                    }
                }
            }

            if (blue_score !== undefined || red_score !== undefined || winner !== undefined || match_status !== undefined) {
                const scoresStr = `${blue_score || 0}:${red_score || 0}`;
                await db.run(
                    `UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_scores = ?, jiu_jitsu_winner = ?, jiu_jitsu_win_method = ?, jiu_jitsu_match_status = ? WHERE id = ?`,
                    [scoresStr, winner || null, win_method || null, match_status || '未开始', id]
                );
            }

            if (winner && match_status === '已结束' && match.jiu_jitsu_match_venue && match.jiu_jitsu_match_id) {
                const venueLabel = (match.jiu_jitsu_match_venue || '') + (match.jiu_jitsu_match_id || '');
                const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';

                let winnerName = '';
                let winnerUnit = '';
                let winnerAthleteId = '';
                if (winner === '红方') {
                    winnerName = match.jiu_jitsu_red_athlete_name || '';
                    winnerUnit = match.jiu_jitsu_red_athlete_team || '';
                    winnerAthleteId = match.jiu_jitsu_red_athlete_id || '';
                } else if (winner === '蓝方') {
                    winnerName = match.jiu_jitsu_blue_athlete_name || '';
                    winnerUnit = match.jiu_jitsu_blue_athlete_team || '';
                    winnerAthleteId = match.jiu_jitsu_blue_athlete_id || '';
                }

                if (winnerName) {
                    const nextMatches = await db.all(
                        'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND (jiu_jitsu_red_prev_winner_id = ? OR jiu_jitsu_blue_prev_winner = ?)',
                        [match.event_id, prevWinnerLabel, prevWinnerLabel]
                    );
                    for (const nm of nextMatches) {
                        if (nm.jiu_jitsu_red_prev_winner_id === prevWinnerLabel) {
                            await db.run(
                                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_red_athlete_name = ?, jiu_jitsu_red_athlete_team = ?, jiu_jitsu_red_athlete_id = ? WHERE id = ?',
                                [winnerName, winnerUnit, winnerAthleteId, nm.id]
                            );
                        }
                        if (nm.jiu_jitsu_blue_prev_winner === prevWinnerLabel) {
                            await db.run(
                                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_blue_athlete_name = ?, jiu_jitsu_blue_athlete_team = ?, jiu_jitsu_blue_athlete_id = ? WHERE id = ?',
                                [winnerName, winnerUnit, winnerAthleteId, nm.id]
                            );
                        }
                    }
                }

                if (match.jiu_jitsu_bracket_match_id) {
                    try {
                        const bm = await db.get('SELECT * FROM bracket_match WHERE id = ?', [match.jiu_jitsu_bracket_match_id]);
                        if (bm) {
                            let opp1 = bm.opponent1 ? JSON.parse(bm.opponent1) : null;
                            let opp2 = bm.opponent2 ? JSON.parse(bm.opponent2) : null;
                            let winnerParticipantId = null;

                            if (winner === '红方' && opp1) {
                                winnerParticipantId = opp1.id;
                                opp1.result = 'win';
                                await db.run(
                                    'UPDATE bracket_match SET opponent1 = ?, winner_id = ?, status = ? WHERE id = ?',
                                    [JSON.stringify(opp1), opp1.id, '0.0', bm.id]
                                );
                            } else if (winner === '蓝方' && opp2) {
                                winnerParticipantId = opp2.id;
                                opp2.result = 'win';
                                await db.run(
                                    'UPDATE bracket_match SET opponent2 = ?, winner_id = ?, status = ? WHERE id = ?',
                                    [JSON.stringify(opp2), opp2.id, '0.0', bm.id]
                                );
                            }

                            if (winnerParticipantId) {
                                const currentRound = await db.get('SELECT number FROM bracket_round WHERE id = ?', [bm.round_id]);
                                if (currentRound) {
                                    const nextRound = await db.get('SELECT id FROM bracket_round WHERE stage_id = ? AND number = ?', [bm.stage_id, currentRound.number + 1]);
                                    if (nextRound) {
                                        const nextMatchNumber = Math.ceil(bm.number / 2);
                                        const nextBm = await db.get('SELECT * FROM bracket_match WHERE stage_id = ? AND round_id = ? AND number = ?', [bm.stage_id, nextRound.id, nextMatchNumber]);
                                        if (nextBm) {
                                            const isOdd = bm.number % 2 === 1;
                                            if (isOdd) {
                                                let nextOpp1 = nextBm.opponent1 ? JSON.parse(nextBm.opponent1) : {};
                                                nextOpp1.id = winnerParticipantId;
                                                await db.run('UPDATE bracket_match SET opponent1 = ? WHERE id = ?', [JSON.stringify(nextOpp1), nextBm.id]);
                                            } else {
                                                let nextOpp2 = nextBm.opponent2 ? JSON.parse(nextBm.opponent2) : {};
                                                nextOpp2.id = winnerParticipantId;
                                                await db.run('UPDATE bracket_match SET opponent2 = ? WHERE id = ?', [JSON.stringify(nextOpp2), nextBm.id]);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('同步bracket_match数据失败:', e.message);
                    }
                }
            }

            res.json({ success: true });
        } catch (err) {
            console.error('PUT /jj-brackets/matches/:id 错误:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/matches/:id/reset', async (req, res) => {
        try {
            const { id } = req.params;
            const match = await db.get('SELECT * FROM jiu_jitsu_matchs WHERE id = ?', [id]);
            if (!match) {
                return res.status(404).json({ success: false, error: '比赛不存在' });
            }

            const eventId = match.event_id;

            await db.run('DELETE FROM jiu_jitsu_matchs WHERE event_id = ?', [eventId]);

            const allStages = await db.all('SELECT category_id FROM bracket_stage WHERE event_id = ?', [eventId]);
            for (const s of allStages) {
                if (s.category_id) {
                    await clearJJBracketStageData(db, eventId, s.category_id);
                }
            }

            res.json({ success: true });
        } catch (err) {
            console.error('POST /jj-brackets/matches/:id/reset 错误:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/clear', async (req, res) => {
        try {
            const { event_id, weight_class, clear_bracket, check_only } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }

            const eventIdNum = Number(event_id);

            if (check_only) {
                let checkSql = 'SELECT COUNT(*) as count FROM bracket_stage WHERE event_id = ?';
                const checkParams = [eventIdNum];
                if (weight_class) {
                    checkSql += ' AND category_id = ?';
                    checkParams.push(weight_class);
                }
                const bracketCount = await db.get(checkSql, checkParams);

                const matchCheckSql = 'SELECT COUNT(*) as count FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_id IS NOT NULL AND jiu_jitsu_match_venue IS NOT NULL';
                const matchCount = await db.get(matchCheckSql, [eventIdNum]);

                return res.json({
                    success: true,
                    hasBracketData: bracketCount && bracketCount.count > 0,
                    hasMatchData: matchCount && matchCount.count > 0,
                    matchCount: matchCount ? matchCount.count : 0
                });
            }

            const shouldClearBracket = clear_bracket !== false;
            
            await db.run(
                'DELETE FROM jiu_jitsu_matchs WHERE event_id = ?',
                [eventIdNum]
            );

            if (weight_class) {
                if (shouldClearBracket) {
                    await clearJJBracketStageData(db, eventIdNum, weight_class);
                }
            } else {
                if (shouldClearBracket) {
                    const allStages = await db.all('SELECT category_id FROM bracket_stage WHERE event_id = ?', [eventIdNum]);
                    for (const s of allStages) {
                        if (s.category_id) {
                            await clearJJBracketStageData(db, eventIdNum, s.category_id);
                        }
                    }
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/jj-matches/export-excel-template', async (req, res) => {
        try {
            const ExcelJS = require('exceljs');
            const { event_id } = req.query;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少赛事ID' });
            }

            const eventRow = await db.get('SELECT event_name, event_date FROM events WHERE event_id = ?', [event_id]);
            if (!eventRow) {
                return res.status(404).json({ success: false, error: '赛事不存在' });
            }
            const eventName = eventRow.event_name || '比赛';
            const eventDate = eventRow.event_date || '';
            const fileName = `${eventName}${eventDate}`;

            const schemeRows = await db.all(
                'SELECT weight_class, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?',
                [Number(event_id)]
            );
            const schemeMap = new Map();
            schemeRows.forEach(r => {
                if (r.weight_class) schemeMap.set(r.weight_class, r);
            });

            const matches = await db.all(
                'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_venue IS NOT NULL AND jiu_jitsu_match_id IS NOT NULL',
                [Number(event_id)]
            );

            if (matches.length === 0) {
                return res.status(400).json({ success: false, error: '暂无对阵数据可导出' });
            }

            function getZoneSortValue(m) {
                const zone = m.jiu_jitsu_match_zone || '';
                if (zone === 'upper') return 1;
                if (zone === 'lower') return 2;
                if (zone === 'final') return 3;
                return 0;
            }

            matches.sort((a, b) => {
                const sa = schemeMap.get(a.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };
                const sb = schemeMap.get(b.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };

                const unitA = parseFloat(sa.category_date_num) || 0;
                const unitB = parseFloat(sb.category_date_num) || 0;
                if (unitA !== unitB) return unitA - unitB;

                const venueCmp = (sa.category_venue || '').localeCompare(sb.category_venue || '');
                if (venueCmp !== 0) return venueCmp;

                const roundNumA = a.jiu_jitsu_match_round_num || 0;
                const roundNumB = b.jiu_jitsu_match_round_num || 0;
                const isFinalA = roundNumA >= 999 ? 1 : 0;
                const isFinalB = roundNumB >= 999 ? 1 : 0;
                if (isFinalA !== isFinalB) return isFinalA - isFinalB;

                if (roundNumA !== roundNumB) return roundNumA - roundNumB;

                const orderA = parseFloat(sa.category_order) || 0;
                const orderB = parseFloat(sb.category_order) || 0;
                if (orderA !== orderB) return orderA - orderB;

                const zoneA = getZoneSortValue(a);
                const zoneB = getZoneSortValue(b);
                if (zoneA !== zoneB) return zoneA - zoneB;

                return (a.jiu_jitsu_bracket_match_id || 0) - (b.jiu_jitsu_bracket_match_id || 0);
            });

            const venueGroups = {};
            for (const m of matches) {
                const letter = (m.jiu_jitsu_match_venue || '').charAt(0) || 'A';
                if (!venueGroups[letter]) venueGroups[letter] = { min: null, max: null };
                const venueNo = (m.jiu_jitsu_match_venue || '') + String(m.jiu_jitsu_match_id || '');
                const num = parseInt(String(venueNo).replace(/^[A-Za-z]+/, '')) || 0;
                if (!venueGroups[letter].min || num < venueGroups[letter].min) venueGroups[letter].min = num;
                if (!venueGroups[letter].max || num > venueGroups[letter].max) venueGroups[letter].max = num;
            }
            const venueRangeStr = Object.keys(venueGroups).sort().map(letter => {
                const g = venueGroups[letter];
                return `${letter}${g.min}-${letter}${g.max}`;
            }).join(' ');

            const workbook = new ExcelJS.Workbook();
            workbook.creator = '柔术编排系统';

            const ws = workbook.addWorksheet('对阵表', {
                properties: { defaultRowHeight: 15 },
                pageSetup: {
                    paperSize: 9,
                    orientation: 'portrait',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0,
                    showGridLines: false,
                    horizontalCentered: true,
                    printTitlesRow: '1:9'
                }
            });
            ws.pageSetup.margins = { left: 0.7, right: 0.7, top: 0.65, bottom: 0.83, header: 0.21, footer: 0.35 };

            const colWidths = [6.78, 6.78, 6.55, 9.78, 10, 4.78, 9.78, 10, 10.33, 7.55];
            colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

            const titleFont = { name: 'Microsoft YaHei UI', size: 11, bold: true };
            const dateFont = { name: 'Microsoft YaHei UI', size: 9, bold: true };
            const infoFont = { name: 'Microsoft YaHei UI', size: 7 };
            const headerFont = { name: 'Microsoft YaHei UI', size: 7 };
            const dataFont = { name: 'Microsoft YaHei UI', size: 7 };
            const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
            const leftAlign = { horizontal: 'left', vertical: 'middle' };
            const thinBottom = { bottom: { style: 'thin', color: { indexed: 64 } } };

            ws.getRow(1).height = 28.5;
            ws.getCell(1, 1).value = eventName;
            ws.getCell(1, 1).font = titleFont;
            ws.getCell(1, 1).alignment = centerAlign;
            ws.mergeCells(1, 1, 1, 10);

            ws.getRow(2).height = 12;
            ws.getCell(2, 1).value = `${eventDate} 对阵表`;
            ws.getCell(2, 1).font = dateFont;
            ws.getCell(2, 1).alignment = centerAlign;
            ws.mergeCells(2, 1, 2, 10);

            ws.getRow(3).height = 5;

            ws.getRow(4).height = 15;
            ws.getCell(4, 1).value = '场地：';
            ws.getCell(4, 1).font = infoFont;
            ws.getCell(4, 1).alignment = { vertical: 'middle' };
            ws.getCell(4, 9).value = '时间：';
            ws.getCell(4, 9).font = infoFont;
            ws.getCell(4, 9).alignment = leftAlign;

            ws.getRow(5).height = 15;
            ws.getCell(5, 1).value = `场次：${venueRangeStr}`;
            ws.getCell(5, 1).font = infoFont;
            ws.getCell(5, 1).alignment = { vertical: 'middle' };
            ws.getCell(5, 9).value = `日期：${eventDate}`;
            ws.getCell(5, 9).font = infoFont;
            ws.getCell(5, 9).alignment = leftAlign;

            ws.getRow(6).height = 5;
            ws.getRow(7).height = 10;

            const headers = [
                { col: 1, val: '场次', align: centerAlign },
                { col: 3, val: '轮次', align: centerAlign },
                { col: 4, val: '红方姓名', align: centerAlign },
                { col: 5, val: '代表队', align: centerAlign },
                { col: 7, val: '蓝方姓名', align: centerAlign },
                { col: 8, val: '代表队', align: centerAlign },
                { col: 9, val: '级别', align: centerAlign },
                { col: 10, val: '备注', align: { vertical: 'middle', wrapText: true } }
            ];
            ws.getRow(8).height = 15;
            for (const h of headers) {
                const cell = ws.getCell(8, h.col);
                cell.value = h.val;
                cell.font = headerFont;
                cell.alignment = h.align;
                cell.border = thinBottom;
            }

            ws.getRow(9).height = 5;

            function formatRoundName(roundName, roundNum, totalRounds) {
                if (roundName && roundName.trim()) {
                    const rn = roundName.trim();
                    if (rn === '决赛' || rn === 'Final') return 'Final';
                    if (rn === '半决赛' || rn === '1/2') return '1/2';
                    const m = rn.match(/1\/(\d+)/);
                    if (m) return `1/${m[1]}`;
                    if (rn.match(/^1\/\d+决赛$/)) {
                        return rn.replace('决赛', '');
                    }
                    return rn;
                }
                if (roundNum && totalRounds) {
                    if (roundNum >= 999) return 'Final';
                    if (roundNum === totalRounds) return 'Final';
                    const d = Math.pow(2, totalRounds - roundNum);
                    if (d === 2) return '1/2';
                    return `1/${d}`;
                }
                return '';
            }

            let rowNum = 10;
            for (const m of matches) {
                const row = ws.getRow(rowNum);
                row.height = 12.3;

                const venueNo = (m.jiu_jitsu_match_venue || '') + String(m.jiu_jitsu_match_id || '');
                const roundName = formatRoundName(m.jiu_jitsu_match_round_name || '', m.jiu_jitsu_match_round_num, m.jiu_jitsu_match_category_total_rounds);
                const redName = m.jiu_jitsu_red_athlete_name || m.jiu_jitsu_red_prev_winner_id || '-';
                const redUnit = m.jiu_jitsu_red_athlete_team || '';
                const blueName = m.jiu_jitsu_blue_athlete_name || m.jiu_jitsu_blue_prev_winner || '-';
                const blueUnit = m.jiu_jitsu_blue_athlete_team || '';
                const wc = m.jiu_jitsu_match_categroy || '';
                const isFinal = roundName === 'Final' || roundName === '决赛';

                const dataCells = [
                    { col: 1, val: venueNo, align: centerAlign },
                    { col: 3, val: roundName, align: centerAlign },
                    { col: 4, val: redName, align: { vertical: 'middle' } },
                    { col: 5, val: redUnit, align: { vertical: 'middle' } },
                    { col: 6, val: '-VS-', align: centerAlign },
                    { col: 7, val: blueName, align: { vertical: 'middle' } },
                    { col: 8, val: blueUnit, align: { vertical: 'middle' } },
                    { col: 9, val: wc, align: { vertical: 'middle' } }
                ];
                if (isFinal) {
                    dataCells.push({ col: 10, val: '决赛', align: { vertical: 'middle' } });
                }

                for (const dc of dataCells) {
                    const cell = row.getCell(dc.col);
                    cell.value = dc.val;
                    cell.font = dataFont;
                    cell.alignment = dc.align;
                }

                rowNum++;
            }

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName + '.xlsx')}`);
            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            console.error('GET /jj-matches/export-excel-template 错误:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
