const express = require('express');
const router = express.Router();

const {
    MODE_NAME_MAP,
    MODE_VALUE_MAP,
    generateJJBracketForEvent
} = require('./jiu-jitsu-bracket-helpers');

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
            const { event_id, weight_class } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }

            const result = await generateJJBracketForEvent(db, event_id, weight_class || null);
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
                'SELECT id, jiu_jitsu_match_categroy, jiu_jitsu_match_round_num, jiu_jitsu_match_round_name, jiu_jitsu_match_id FROM jiu_jitsu_matchs WHERE event_id = ? ORDER BY jiu_jitsu_match_categroy, jiu_jitsu_match_round_num, id',
                [eventIdNum]
            );

            if (matches.length === 0) {
                return res.json({ success: false, error: '尚未生成对阵图，请先生成对阵图' });
            }

            const classOrder = [];
            const classSet = new Set();
            schemeRows.forEach(r => {
                if (r.weight_class && r.category_venue && r.category_date_num) {
                    if (!classSet.has(r.weight_class)) {
                        classSet.add(r.weight_class);
                        classOrder.push(r.weight_class);
                    }
                }
            });

            const classMatches = new Map();
            for (const wc of classOrder) {
                classMatches.set(wc, matches.filter(m => m.jiu_jitsu_match_categroy === wc));
            }
            for (const m of matches) {
                if (!classMatches.has(m.jiu_jitsu_match_categroy)) {
                    classMatches.set(m.jiu_jitsu_match_categroy, matches.filter(mm => mm.jiu_jitsu_match_categroy === m.jiu_jitsu_match_categroy));
                }
            }

            let globalMatchNum = 1;
            let assigned = 0;

            for (const [wc, wcMatches] of classMatches) {
                const scheme = schemeMap.get(wc);
                const venue = scheme ? scheme.category_venue : null;

                for (const m of wcMatches) {
                    const matchId = String(globalMatchNum).padStart(3, '0');
                    await db.run(
                        'UPDATE jiu_jitsu_matchs SET jiu_jitsu_match_id = ?, jiu_jitsu_match_venue = ? WHERE id = ?',
                        [matchId, venue, m.id]
                    );
                    globalMatchNum++;
                    assigned++;
                }
            }

            res.json({ success: true, data: { assigned, totalMatches: matches.length } });
        } catch (err) {
            console.error('分配场次号失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/jj-brackets/clear', async (req, res) => {
        try {
            const { event_id, weight_class } = req.body;
            if (!event_id) {
                return res.status(400).json({ success: false, error: '缺少event_id参数' });
            }
            if (weight_class) {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ? AND jiu_jitsu_match_categroy = ?',
                    [event_id, weight_class]
                );
            } else {
                await db.run(
                    'DELETE FROM jiu_jitsu_matchs WHERE event_id = ?',
                    [event_id]
                );
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
