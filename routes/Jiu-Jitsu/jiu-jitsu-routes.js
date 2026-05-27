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
            const { event_id, weight_class } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }

            const result = await generateJJBracketForEvent(db, manager, event_id, weight_class || null);
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

                const compA = a.jiu_jitsu_match_comp_mode || '';
                const compB = b.jiu_jitsu_match_comp_mode || '';

                const roundNumA = a.jiu_jitsu_match_round_num || 0;
                const roundNumB = b.jiu_jitsu_match_round_num || 0;
                const isFinalA = roundNumA >= 999 ? 1 : 0;
                const isFinalB = roundNumB >= 999 ? 1 : 0;
                if (isFinalA !== isFinalB) return isFinalA - isFinalB;

                const compTypeA = getCompTypeSortOrder(compA);
                const compTypeB = getCompTypeSortOrder(compB);
                if (compTypeA !== compTypeB) return compTypeA - compTypeB;

                if (isFinalA && isFinalB) {
                    const rnA = a.jiu_jitsu_match_round_name || '';
                    const rnB = b.jiu_jitsu_match_round_name || '';
                    const finalOrder = { 'Final': 1, 'R.Final': 2, 'D.Final': 3 };
                    const fA = finalOrder[rnA] || 9;
                    const fB = finalOrder[rnB] || 9;
                    if (fA !== fB) return fA - fB;
                }

                if (compA === 'double_elimination' && compB === 'double_elimination') {
                    const rnA = a.jiu_jitsu_match_round_name || '';
                    const rnB = b.jiu_jitsu_match_round_name || '';
                    const isWinnerA = rnA.match(/^1\/\d+$/) || rnA === 'D.Final' ? 0 : 1;
                    const isWinnerB = rnB.match(/^1\/\d+$/) || rnB === 'D.Final' ? 0 : 1;
                    if (isWinnerA !== isWinnerB) return isWinnerA - isWinnerB;
                }

                if (roundNumA !== roundNumB) return roundNumA - roundNumB;

                const zoneA = getZoneSortValue(a);
                const zoneB = getZoneSortValue(b);
                if (zoneA !== zoneB) return zoneA - zoneB;

                const orderA = parseFloat(sa.category_order) || 0;
                const orderB = parseFloat(sb.category_order) || 0;
                if (orderA !== orderB) return orderA - orderB;

                return (a.jiu_jitsu_match_round_num || 0) - (b.jiu_jitsu_match_round_num || 0);
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
                if (!isElimination) continue;

                const wc = m.jiu_jitsu_match_categroy;
                const firstRound = classFirstRound.get(wc) || 1;
                if (rn <= firstRound && rn < 999) continue;

                let bluePrevWinner = m.jiu_jitsu_blue_prev_winner || '';
                let redPrevWinner = m.jiu_jitsu_red_prev_winner_id || '';

                if (!m.jiu_jitsu_blue_athlete_name || !m.jiu_jitsu_blue_athlete_name.trim()) {
                    let prevBmId = findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'blue');
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

                if (!m.jiu_jitsu_red_athlete_name || !m.jiu_jitsu_red_athlete_name.trim()) {
                    let prevBmId = findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'red');
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
            const { event_id, weight_class } = req.body;
            if (!event_id || !weight_class) {
                return res.status(400).json({ success: false, error: '缺少必要参数' });
            }

            console.log('[jj-generate-single] 开始生成:', { event_id, weight_class });
            const result = await generateJJBracketForEvent(db, manager, event_id, weight_class);
            console.log('[jj-generate-single] 生成完成:', result);
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
                } else if (winner === '青方') {
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
                            } else if (winner === '青方' && opp2) {
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

            await db.run(
                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_scores = NULL, jiu_jitsu_winner = NULL, jiu_jitsu_win_method = NULL, jiu_jitsu_match_status = ? WHERE id = ?',
                ['未开始', id]
            );

            if (match.jiu_jitsu_bracket_match_id) {
                try {
                    const bm = await db.get('SELECT * FROM bracket_match WHERE id = ?', [match.jiu_jitsu_bracket_match_id]);
                    if (bm) {
                        await db.run(
                            'UPDATE bracket_match SET winner_id = NULL, status = ? WHERE id = ?',
                            ['pending', bm.id]
                        );

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
                                        delete nextOpp1.id;
                                        await db.run('UPDATE bracket_match SET opponent1 = ? WHERE id = ?', [JSON.stringify(nextOpp1), nextBm.id]);
                                    } else {
                                        let nextOpp2 = nextBm.opponent2 ? JSON.parse(nextBm.opponent2) : {};
                                        delete nextOpp2.id;
                                        await db.run('UPDATE bracket_match SET opponent2 = ? WHERE id = ?', [JSON.stringify(nextOpp2), nextBm.id]);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('重置bracket_match数据失败:', e.message);
                }
            }

            if (match.jiu_jitsu_match_venue && match.jiu_jitsu_match_id) {
                const venueLabel = (match.jiu_jitsu_match_venue || '') + (match.jiu_jitsu_match_id || '');
                const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';
                const nextMatches = await db.all(
                    'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND (jiu_jitsu_red_prev_winner_id = ? OR jiu_jitsu_blue_prev_winner = ?)',
                    [match.event_id, prevWinnerLabel, prevWinnerLabel]
                );
                for (const nm of nextMatches) {
                    if (nm.jiu_jitsu_red_prev_winner_id === prevWinnerLabel) {
                        await db.run(
                            'UPDATE jiu_jitsu_matchs SET jiu_jitsu_red_athlete_name = ?, jiu_jitsu_red_athlete_team = ?, jiu_jitsu_red_athlete_id = ? WHERE id = ?',
                            ['', '', null, nm.id]
                        );
                    }
                    if (nm.jiu_jitsu_blue_prev_winner === prevWinnerLabel) {
                        await db.run(
                            'UPDATE jiu_jitsu_matchs SET jiu_jitsu_blue_athlete_name = ?, jiu_jitsu_blue_athlete_team = ?, jiu_jitsu_blue_athlete_id = ? WHERE id = ?',
                            ['', '', null, nm.id]
                        );
                    }
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
            const { event_id, weight_class, clear_bracket } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }
            const shouldClearBracket = clear_bracket !== false;
            if (weight_class) {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
                    [event_id, weight_class]
                );
                if (shouldClearBracket) {
                    await clearJJBracketStageData(db, event_id, weight_class);
                }
            } else {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ?',
                    [event_id]
                );
                if (shouldClearBracket) {
                    const allStages = await db.all('SELECT category_id FROM bracket_stage WHERE event_id = ?', [event_id]);
                    for (const s of allStages) {
                        if (s.category_id) {
                            await clearJJBracketStageData(db, event_id, s.category_id);
                        }
                    }
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
