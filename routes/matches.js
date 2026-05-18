const express = require('express');
const router = express.Router();
const {
  insertKyougiMatch,
  updateKyougiMatchScore,
  resetKyougiMatch,
  updateKyougiMatchBlue,
  updateKyougiMatchRed,
  batchUpdateKyougiMatch,
  deleteKyougiMatchsByEvent,
  deleteAllKyougiMatchs,
  getKyougiMatchById,
  queryKyougiMatchs,
  findNextMatchesByPrevWinner,
  toLegacyFormat,
  TABLE
} = require('./kyougiMatchHelpers');

module.exports = (db) => {
  router.get('/matches', async (req, res) => {
    try {
      const { weight_class, round, status, event_id } = req.query;
      const matches = await queryKyougiMatchs(db, { weight_class, round, status, event_id });

      const firstRoundMap = new Map();
      for (const m of matches) {
        if (!firstRoundMap.has(m.kyougi_match_categroy) || m.kyougi_match_round_num < firstRoundMap.get(m.kyougi_match_categroy)) {
          firstRoundMap.set(m.kyougi_match_categroy, m.kyougi_match_round_num);
        }
      }

      const filtered = matches.filter(m => {
        const firstRound = firstRoundMap.get(m.kyougi_match_categroy);
        if (m.kyougi_match_round_num === firstRound) {
          const blue = (m.kyougi_blue_athlete_name || '').trim();
          const red = (m.kyougi_red_athlete_name || '').trim();
          if (!blue || !red) return false;
        }
        return true;
      });

      const legacyData = filtered.map(toLegacyFormat);
      res.json({ success: true, data: legacyData });
    } catch (err) {
      console.error('GET /matches 错误:', err.message, err.stack);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/matches/reset', async (req, res) => {
    try {
      const { event_id } = req.body;
      if (event_id) {
        await deleteKyougiMatchsByEvent(db, event_id);
      } else {
        await deleteAllKyougiMatchs(db);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/matches/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const match = await getKyougiMatchById(db, id);
      if (!match) {
        return res.status(404).json({ success: false, error: '比赛不存在' });
      }
      res.json({ success: true, data: toLegacyFormat(match) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/matches/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        blue_score, red_score, winner, win_method,
        match_status
      } = req.body;

      await updateKyougiMatchScore(db, id, {
        blue_score, red_score, winner, win_method, match_status
      });

      if (winner && match_status === '已结束') {
        const match = await getKyougiMatchById(db, id);
        if (match) {
          let winnerName = '';
          let winnerUnit = '';
          let winnerAthleteId = null;
          let winnerParticipantId = null;

          if (winner === '青方') {
            winnerName = match.kyougi_blue_athlete_name || '';
            winnerUnit = match.kyougi_blue_athlete_team || '';
            winnerAthleteId = match.kyougi_blue_athlete_id || null;
          } else if (winner === '红方') {
            winnerName = match.kyougi_red_athlete_name || '';
            winnerUnit = match.kyougi_red_athlete_team || '';
            winnerAthleteId = match.kyougi_red_athlete_id || null;
          }

          if (winnerName && match.kyougi_match_venue) {
            const venueLabel = (match.kyougi_match_venue || '') + (match.kyougi_match_id || '');
            const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';

            const nextMatches = await findNextMatchesByPrevWinner(db, match.event_id, prevWinnerLabel);

            for (const nm of nextMatches) {
              if (nm.kyougi_blue_prev_winner === prevWinnerLabel) {
                await updateKyougiMatchBlue(db, nm.id, {
                  blue_name: winnerName,
                  blue_unit: winnerUnit,
                  blue_athlete_id: winnerAthleteId
                });
              }
              if (nm.kyougi_red_prev_winner_id === prevWinnerLabel) {
                await updateKyougiMatchRed(db, nm.id, {
                  red_name: winnerName,
                  red_unit: winnerUnit,
                  red_athlete_id: winnerAthleteId
                });
              }
            }
          }

          if (match.kyougi_bracket_match_id) {
            try {
              const bm = await db.prepare('SELECT * FROM bracket_match WHERE id = ?').get(match.kyougi_bracket_match_id);
              if (bm) {
                let opp1 = bm.opponent1 ? JSON.parse(bm.opponent1) : null;
                let opp2 = bm.opponent2 ? JSON.parse(bm.opponent2) : null;

                if (winner === '青方' && opp1) {
                  winnerParticipantId = opp1.id;
                  opp1.result = 'win';
                  await db.prepare('UPDATE bracket_match SET opponent1 = ?, winner_id = ?, status = ? WHERE id = ?')
                    .run(JSON.stringify(opp1), opp1.id, '0.0', bm.id);
                } else if (winner === '红方' && opp2) {
                  winnerParticipantId = opp2.id;
                  opp2.result = 'win';
                  await db.prepare('UPDATE bracket_match SET opponent2 = ?, winner_id = ?, status = ? WHERE id = ?')
                    .run(JSON.stringify(opp2), opp2.id, '0.0', bm.id);
                }

                if (winnerParticipantId) {
                  const currentRound = await db.prepare('SELECT number FROM bracket_round WHERE id = ?').get(bm.round_id);
                  const nextRound = await db.prepare('SELECT id FROM bracket_round WHERE stage_id = ? AND number = ?').get(bm.stage_id, currentRound.number + 1);

                  if (nextRound) {
                    const nextMatchNumber = Math.ceil(bm.number / 2);
                    const nextBm = await db.prepare('SELECT * FROM bracket_match WHERE stage_id = ? AND round_id = ? AND number = ?').get(bm.stage_id, nextRound.id, nextMatchNumber);

                    if (nextBm) {
                      const isOdd = bm.number % 2 === 1;
                      if (isOdd) {
                        let nextOpp1 = nextBm.opponent1 ? JSON.parse(nextBm.opponent1) : {};
                        nextOpp1.id = winnerParticipantId;
                        await db.prepare('UPDATE bracket_match SET opponent1 = ? WHERE id = ?')
                          .run(JSON.stringify(nextOpp1), nextBm.id);
                      } else {
                        let nextOpp2 = nextBm.opponent2 ? JSON.parse(nextBm.opponent2) : {};
                        nextOpp2.id = winnerParticipantId;
                        await db.prepare('UPDATE bracket_match SET opponent2 = ? WHERE id = ?')
                          .run(JSON.stringify(nextOpp2), nextBm.id);
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
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/matches/:id/reset', async (req, res) => {
    try {
      const { id } = req.params;
      const match = await getKyougiMatchById(db, id);
      if (!match) { return res.status(404).json({ success: false, error: '比赛不存在' }); }

      await resetKyougiMatch(db, id);

      if (match.kyougi_bracket_match_id) {
        try {
          const bm = await db.prepare('SELECT * FROM bracket_match WHERE id = ?').get(match.kyougi_bracket_match_id);
          if (bm) {
            let opp1 = bm.opponent1 ? JSON.parse(bm.opponent1) : null;
            let opp2 = bm.opponent2 ? JSON.parse(bm.opponent2) : null;
            if (opp1) { delete opp1.result; }
            if (opp2) { delete opp2.result; }
            await db.prepare('UPDATE bracket_match SET opponent1 = ?, opponent2 = ?, winner_id = NULL, status = ? WHERE id = ?')
              .run(opp1 ? JSON.stringify(opp1) : null, opp2 ? JSON.stringify(opp2) : null, '2.0', bm.id);

            const currentRound = await db.prepare('SELECT number FROM bracket_round WHERE id = ?').get(bm.round_id);
            const nextRound = await db.prepare('SELECT id FROM bracket_round WHERE stage_id = ? AND number = ?').get(bm.stage_id, currentRound.number + 1);

            if (nextRound) {
              const nextMatchNumber = Math.ceil(bm.number / 2);
              const nextBm = await db.prepare('SELECT * FROM bracket_match WHERE stage_id = ? AND round_id = ? AND number = ?').get(bm.stage_id, nextRound.id, nextMatchNumber);

              if (nextBm) {
                const isOdd = bm.number % 2 === 1;
                if (isOdd) {
                  let nextOpp1 = nextBm.opponent1 ? JSON.parse(nextBm.opponent1) : {};
                  nextOpp1.id = null;
                  await db.prepare('UPDATE bracket_match SET opponent1 = ? WHERE id = ?')
                    .run(JSON.stringify(nextOpp1), nextBm.id);
                } else {
                  let nextOpp2 = nextBm.opponent2 ? JSON.parse(nextBm.opponent2) : {};
                  nextOpp2.id = null;
                  await db.prepare('UPDATE bracket_match SET opponent2 = ? WHERE id = ?')
                    .run(JSON.stringify(nextOpp2), nextBm.id);
                }
              }
            }
          }
        } catch (e) {
          console.warn('重置bracket_match数据失败:', e.message);
        }
      }

      if (match.kyougi_match_venue) {
        const venueLabel = (match.kyougi_match_venue || '') + (match.kyougi_match_id || '');
        const prevWinnerLabel = venueLabel ? (venueLabel + '胜者') : '';
        const nextMatches = await findNextMatchesByPrevWinner(db, match.event_id, prevWinnerLabel);
        for (const nm of nextMatches) {
          if (nm.kyougi_blue_prev_winner === prevWinnerLabel) {
            await updateKyougiMatchBlue(db, nm.id, {
              blue_name: '', blue_unit: '', blue_athlete_id: null
            });
          }
          if (nm.kyougi_red_prev_winner_id === prevWinnerLabel) {
            await updateKyougiMatchRed(db, nm.id, {
              red_name: '', red_unit: '', red_athlete_id: null
            });
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/matches/batch', async (req, res) => {
    try {
      const { matches } = req.body;
      if (!Array.isArray(matches)) {
        return res.status(400).json({ success: false, error: '数据格式错误' });
      }

      for (const m of matches) {
        await batchUpdateKyougiMatch(db, m);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/matches/assign-venue-numbers', async (req, res) => {
    try {
      const { event_id, data } = req.body;
      if (!event_id || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ success: false, error: '参数错误' });
      }

      let updatedCount = 0;

      const unitGroups = new Map();
      data.forEach(item => {
        const { weight_class, venue, unit, order } = item;
        if (!weight_class || !unit || !order) return;

        const unitKey = `${venue}_${unit}`;
        if (!unitGroups.has(unitKey)) {
          unitGroups.set(unitKey, { venue, unit, classes: [] });
        }
        unitGroups.get(unitKey).classes.push({ weight_class, order: parseInt(order) });
      });

      for (const [key, group] of unitGroups) {
        const { venue, unit, classes } = group;

        classes.sort((a, b) => a.order - b.order);

        classes.forEach((cls, index) => {
          const seqNo = String(index + 1).padStart(3, '0');
          const venueNo = `${venue}${unit}${seqNo}`;

          (async () => {
            try {
              const matches = await queryKyougiMatchs(db, {
                weight_class: cls.weight_class,
                event_id
              });

              for (const match of matches) {
                await db.execute(
                  'UPDATE kyougi_match SET kyougi_match_venue = ?, venue_no = ? WHERE id = ?',
                  [venue, venueNo, match.id]
                );
                updatedCount++;
              }
            } catch (e) {
              console.error(`更新 ${cls.weight_class} 场次失败:`, e.message);
            }
          })();
        });
      }

      setTimeout(() => {
        res.json({
          success: true,
          updated: updatedCount,
          message: `成功设置 ${updatedCount} 场比赛的场次号`
        });
      }, 200);

    } catch (err) {
      console.error('POST /matches/assign-venue-numbers 错误:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
