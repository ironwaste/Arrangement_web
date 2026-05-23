const express = require('express');
const router = express.Router();

const {
    MODE_NAME_MAP,
    MODE_VALUE_MAP,
    generateJJBracketForEvent,
    clearJJBracketStageData
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

    router.post('/jj-brackets/assign-match-ids', async (req, res) => {
        try {
            const { event_id } = req.body;
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

            const matches = await db.all(
                'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ?',
                [eventIdNum]
            );

            if (matches.length === 0) {
                return res.json({ success: false, error: '尚未生成对阵图，请先生成对阵图' });
            }

            function getJJRoundSortKey(m) {
                const rn = m.jiu_jitsu_match_round_name || '';
                const roundNum = m.jiu_jitsu_match_round_num || 1;
                const totalRounds = m.jiu_jitsu_match_category_total_rounds || 1;
                if (rn.includes('败者组') || rn.includes('复活') || rn.startsWith('rep')) {
                    return 2;
                }
                if (rn === 'Final' || rn === '决赛' || rn.includes('Final')) {
                    return 3;
                }
                if (roundNum > totalRounds) {
                    return 2;
                }
                return 1;
            }

            function getJJRoundDenominator(m) {
                const rn = m.jiu_jitsu_match_round_name || '';
                if (rn === 'Final' || rn === '决赛') return 1;
                const m1 = rn.match(/1\/(\d+)/);
                if (m1) return parseInt(m1[1]);
                return 999;
            }

            matches.sort((a, b) => {
                const sa = schemeMap.get(a.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };
                const sb = schemeMap.get(b.jiu_jitsu_match_categroy) || { category_venue: '', category_date_num: '', category_order: '' };

                const unitA = parseFloat(sa.category_date_num) || 0;
                const unitB = parseFloat(sb.category_date_num) || 0;
                if (unitA !== unitB) return unitA - unitB;

                const venueCmp = (sa.category_venue || '').localeCompare(sb.category_venue || '');
                if (venueCmp !== 0) return venueCmp;

                const orderA = parseFloat(sa.category_order) || 0;
                const orderB = parseFloat(sb.category_order) || 0;
                if (orderA !== orderB) return orderA - orderB;

                const sortKeyA = getJJRoundSortKey(a);
                const sortKeyB = getJJRoundSortKey(b);
                if (sortKeyA !== sortKeyB) return sortKeyA - sortKeyB;

                const denomA = getJJRoundDenominator(a);
                const denomB = getJJRoundDenominator(b);
                if (denomA !== denomB) return denomB - denomA;

                return (a.jiu_jitsu_match_round_num || 0) - (b.jiu_jitsu_match_round_num || 0);
            });

            const venueUnitMatchCounters = new Map();
            let assigned = 0;

            await db.run(
                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_venue = NULL, jiu_jitsu_match_id = NULL WHERE event_id = ?',
                [eventIdNum]
            );

            for (const m of matches) {
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
                `SELECT bm.id, bm.number, bm.stage_id, br.number AS round_number
                 FROM bracket_match bm
                 LEFT JOIN bracket_round br ON bm.round_id = br.id`
            );
            for (const bm of allBracketMatches) {
                bmIdToRoundAndNum.set(bm.id, { round: bm.round_number, number: bm.number, stageId: bm.stage_id });
                const key = `${bm.stage_id}|${bm.round_number}`;
                if (!stageRoundNumToMatches.has(key)) stageRoundNumToMatches.set(key, []);
                stageRoundNumToMatches.get(key).push(bm);
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

            for (const m of updatedMatches) {
                const wc = m.jiu_jitsu_match_categroy;
                const firstRound = classFirstRound.get(wc) || 1;
                const rn = m.jiu_jitsu_match_round_num || 1;
                if (rn <= firstRound) continue;

                let bluePrevWinner = m.jiu_jitsu_blue_prev_winner || '';
                let redPrevWinner = m.jiu_jitsu_red_prev_winner_id || '';

                if (!m.jiu_jitsu_blue_athlete_name || !m.jiu_jitsu_blue_athlete_name.trim()) {
                    const prevBmId = findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'blue');
                    if (prevBmId) {
                        const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
                        if (prevLabel) {
                            bluePrevWinner = prevLabel + '胜者';
                        }
                    }
                } else {
                    bluePrevWinner = '';
                }

                if (!m.jiu_jitsu_red_athlete_name || !m.jiu_jitsu_red_athlete_name.trim()) {
                    const prevBmId = findPrevBracketMatchId(m.jiu_jitsu_bracket_match_id, 'red');
                    if (prevBmId) {
                        const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
                        if (prevLabel) {
                            redPrevWinner = prevLabel + '胜者';
                        }
                    }
                } else {
                    redPrevWinner = '';
                }

                await db.run(
                    'UPDATE jiu_jitsu_matchs SET jiu_jitsu_blue_prev_winner = ?, jiu_jitsu_red_prev_winner_id = ? WHERE id = ?',
                    [bluePrevWinner, redPrevWinner, m.id]
                );
            }

            res.json({ success: true, data: { assigned, totalMatches: matches.length } });
        } catch (err) {
            console.error('分配场次号失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.put('/jj-brackets/matches/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { blue_score, red_score, winner, win_method, match_status } = req.body;

            const match = await db.get('SELECT * FROM jiu_jitsu_matchs WHERE id = ?', [id]);
            if (!match) {
                return res.status(404).json({ success: false, error: '比赛不存在' });
            }

            const scoresStr = `${blue_score || 0}:${red_score || 0}`;
            await db.run(
                `UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_scores = ?, jiu_jitsu_winner = ?, jiu_jitsu_win_method = ?, jiu_jitsu_match_status = ? WHERE id = ?`,
                [scoresStr, winner || null, win_method || null, match_status || '未开始', id]
            );

            if (winner && match_status === '已结束' && match.jiu_jitsu_match_venue && match.jiu_jitsu_match_id) {
                const venueLabel = (match.jiu_jitsu_match_venue || '') + (match.jiu_jitsu_match_id || '');
                const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';

                let winnerName = '';
                let winnerUnit = '';
                if (winner === '青方') {
                    winnerName = match.jiu_jitsu_blue_athlete_name || '';
                    winnerUnit = match.jiu_jitsu_blue_athlete_team || '';
                } else if (winner === '红方') {
                    winnerName = match.jiu_jitsu_red_athlete_name || '';
                    winnerUnit = match.jiu_jitsu_red_athlete_team || '';
                }

                if (winnerName) {
                    const nextMatches = await db.all(
                        'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND (jiu_jitsu_blue_prev_winner = ? OR jiu_jitsu_red_prev_winner_id = ?)',
                        [match.event_id, prevWinnerLabel, prevWinnerLabel]
                    );
                    for (const nm of nextMatches) {
                        if (nm.jiu_jitsu_blue_prev_winner === prevWinnerLabel) {
                            await db.run(
                                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_blue_athlete_name = ?, jiu_jitsu_blue_athlete_team = ? WHERE id = ?',
                                [winnerName, winnerUnit, nm.id]
                            );
                        }
                        if (nm.jiu_jitsu_red_prev_winner_id === prevWinnerLabel) {
                            await db.run(
                                'UPDATE jiu_jitsu_matchs SET jiu_jitsu_red_athlete_name = ?, jiu_jitsu_red_athlete_team = ? WHERE id = ?',
                                [winnerName, winnerUnit, nm.id]
                            );
                        }
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

            if (match.jiu_jitsu_match_venue && match.jiu_jitsu_match_id) {
                const venueLabel = (match.jiu_jitsu_match_venue || '') + (match.jiu_jitsu_match_id || '');
                const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';
                const nextMatches = await db.all(
                    'SELECT * FROM jiu_jitsu_matchs WHERE event_id = ? AND (jiu_jitsu_blue_prev_winner = ? OR jiu_jitsu_red_prev_winner_id = ?)',
                    [match.event_id, prevWinnerLabel, prevWinnerLabel]
                );
                for (const nm of nextMatches) {
                    if (nm.jiu_jitsu_blue_prev_winner === prevWinnerLabel) {
                        await db.run(
                            'UPDATE jiu_jitsu_matchs SET jiu_jitsu_blue_athlete_name = ?, jiu_jitsu_blue_athlete_team = ? WHERE id = ?',
                            ['', '', nm.id]
                        );
                    }
                    if (nm.jiu_jitsu_red_prev_winner_id === prevWinnerLabel) {
                        await db.run(
                            'UPDATE jiu_jitsu_matchs SET jiu_jitsu_red_athlete_name = ?, jiu_jitsu_red_athlete_team = ? WHERE id = ?',
                            ['', '', nm.id]
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
