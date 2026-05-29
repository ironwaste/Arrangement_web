/**
 * 竞技比赛对阵表路由，包含对阵查询、比分录入、Excel导出等
 */
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
  /* ==================== 对阵表查询 ==================== */
  router.get('/matches', async (req, res) => {
    try {
      const { weight_class, round, status, event_id, arranged_only } = req.query;
      const matches = await queryKyougiMatchs(db, { weight_class, round, status, event_id });

      const firstRoundMap = new Map();
      for (const m of matches) {
        if (!firstRoundMap.has(m.kyougi_match_categroy) || m.kyougi_match_round_num < firstRoundMap.get(m.kyougi_match_categroy)) {
          firstRoundMap.set(m.kyougi_match_categroy, m.kyougi_match_round_num);
        }
      }

      const filtered = matches.filter(m => {
        if (arranged_only === 'true' && (m.kyougi_match_venue === null || m.kyougi_match_id === null)) return false;
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

  /* ==================== 对阵表重置 ==================== */
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

  /* ==================== Excel 导出 ==================== */
  router.get('/matches/export-excel-template', async (req, res) => {
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

      const matchesRaw = await queryKyougiMatchs(db, { event_id });
      const matches = matchesRaw.filter(m => m.kyougi_match_venue !== null && m.kyougi_match_id !== null).map(toLegacyFormat);

      if (matches.length === 0) {
        return res.status(400).json({ success: false, error: '暂无对阵数据可导出' });
      }

      matches.sort((a, b) => {
        const vnA = (a.kyougi_match_venue !== null && a.kyougi_match_id !== null) ? (String(a.kyougi_match_venue) + String(a.kyougi_match_id)) : '';
        const vnB = (b.kyougi_match_venue !== null && b.kyougi_match_id !== null) ? (String(b.kyougi_match_venue) + String(b.kyougi_match_id)) : '';
        const numA = parseInt(vnA.replace(/^[A-Za-z]+/, '')) || 0;
        const numB = parseInt(vnB.replace(/^[A-Za-z]+/, '')) || 0;
        const letterA = vnA.replace(/[0-9]+$/, '');
        const letterB = vnB.replace(/[0-9]+$/, '');
        if (letterA !== letterB) return letterA.localeCompare(letterB);
        if (numA !== numB) return numA - numB;
        return (a.kyougi_match_round_num || 0) - (b.kyougi_match_round_num || 0);
      });

      const venueGroups = {};
      for (const m of matches) {
        const letter = (m.kyougi_match_venue || '').charAt(0) || 'A';
        if (!venueGroups[letter]) venueGroups[letter] = { min: null, max: null };
        const venueNo = (m.kyougi_match_venue !== null && m.kyougi_match_id !== null) ? (String(m.kyougi_match_venue) + String(m.kyougi_match_id)) : '';
        const num = parseInt(String(venueNo).replace(/^[A-Za-z]+/, '')) || 0;
        if (!venueGroups[letter].min || num < venueGroups[letter].min) venueGroups[letter].min = num;
        if (!venueGroups[letter].max || num > venueGroups[letter].max) venueGroups[letter].max = num;
      }
      const venueRangeStr = Object.keys(venueGroups).sort().map(letter => {
        const g = venueGroups[letter];
        return `${letter}${g.min}-${letter}${g.max}`;
      }).join(' ');

      const workbook = new ExcelJS.Workbook();
      workbook.creator = '跆拳道编排系统';

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
        { col: 4, val: '青方姓名', align: centerAlign },
        { col: 5, val: '代表队', align: centerAlign },
        { col: 7, val: '红方姓名', align: centerAlign },
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

      let rowNum = 10;
      for (const m of matches) {
        const row = ws.getRow(rowNum);
        row.height = 12.3;

        const venueNo = (m.kyougi_match_venue !== null && m.kyougi_match_id !== null) ? (String(m.kyougi_match_venue) + String(m.kyougi_match_id)) : '';
        const roundName = formatRoundNameForTemplate(m.kyougi_match_round_name || '', m.kyougi_match_round_num, m.kyougi_match_category_total_rounds);
        const blueName = m.kyougi_blue_athlete_name || m.kyougi_blue_prev_winner || '-';
        const blueUnit = m.kyougi_blue_athlete_team || '';
        const redName = m.kyougi_red_athlete_name || m.kyougi_red_prev_winner_id || '-';
        const redUnit = m.kyougi_red_athlete_team || '';
        const wc = m.kyougi_match_categroy || '';
        const isFinal = roundName === 'Final' || roundName === '决赛';

        const dataCells = [
          { col: 1, val: venueNo, align: centerAlign },
          { col: 3, val: roundName, align: centerAlign },
          { col: 4, val: blueName, align: { vertical: 'middle' } },
          { col: 5, val: blueUnit, align: { vertical: 'middle' } },
          { col: 6, val: '-VS-', align: centerAlign },
          { col: 7, val: redName, align: { vertical: 'middle' } },
          { col: 8, val: redUnit, align: { vertical: 'middle' } },
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
      console.error('GET /matches/export-excel-template 错误:', err.message);
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

      const unitMatchCounters = new Map();

      for (const [key, group] of unitGroups) {
        const { venue, unit, classes } = group;
        const unitNum = parseInt(unit) || 1;

        if (!unitMatchCounters.has(key)) {
          unitMatchCounters.set(key, 0);
        }

        classes.sort((a, b) => a.order - b.order);

        for (let index = 0; index < classes.length; index++) {
          const cls = classes[index];

          try {
            const matches = await queryKyougiMatchs(db, {
              weight_class: cls.weight_class,
              event_id
            });

            for (const match of matches) {
              const cnt = unitMatchCounters.get(key) + 1;
              unitMatchCounters.set(key, cnt);
              const matchId = String(unitNum * 1000 + cnt);
              await db.run(
                'UPDATE taekwondo_kyougi_matchs SET kyougi_match_venue = ?, kyougi_match_id = ? WHERE id = ?',
                [venue, matchId, match.id]
              );
              updatedCount++;
            }
          } catch (e) {
            console.error(`更新 ${cls.weight_class} 场次失败:`, e.message);
          }
        }
      }

      res.json({
        success: true,
        updated: updatedCount,
        message: `成功设置 ${updatedCount} 场比赛的场次号`
      });

    } catch (err) {
      console.error('POST /matches/assign-venue-numbers 错误:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

function formatRoundNameForTemplate(kyougi_match_round_name, kyougi_match_round_num, kyougi_match_category_total_rounds) {
  if (kyougi_match_round_name && kyougi_match_round_name.trim()) {
    const rn = kyougi_match_round_name.trim();
    if (rn === '决赛' || rn === 'Final') return 'Final';
    if (rn === '半决赛' || rn === '1/2') return '1/2';
    const m = rn.match(/1\/(\d+)/);
    if (m) return `1/${m[1]}`;
    if (rn.match(/^1\/\d+决赛$/)) {
      return rn.replace('决赛', '');
    }
    return rn;
  }
  if (kyougi_match_round_num && kyougi_match_category_total_rounds) {
    if (kyougi_match_round_num === kyougi_match_category_total_rounds) return 'Final';
    const d = Math.pow(2, kyougi_match_category_total_rounds - kyougi_match_round_num);
    if (d === 2) return '1/2';
    return `1/${d}`;
  }
  return '';
}
