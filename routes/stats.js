/**
 * 统计与导出路由，包含团体总分、奖牌榜、名次公告、成绩汇总等统计与Excel导出
 */
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { getFinishedKyougiMatchs, toLegacyFormat } = require('./kyougiMatchHelpers');

module.exports = (db) => {

  /* ==================== 团体总分统计 ==================== */
  router.get('/stats/team-scores', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let unitSql = 'SELECT DISTINCT athlete_team, athlete_age_group FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      let rankScores = { 1: 9, 2: 7, 3: 5.5, 4: 4, 5: 2 };

      const unitScores = {};

      for (const u of units) {
        unitScores[u.unit] = {
          unit: u.unit,
          group_class: u.group_class || '',
          gold: 0,
          silver: 0,
          bronze: 0,
          fourth: 0,
          fifth: 0,
          total_score: 0,
          athlete_count: 0
        };
      }

      let countSql = 'SELECT athlete_team as unit, COUNT(*) as count FROM athletes WHERE 1=1';
      const countParams = [];
      if (event_id) {
        countSql += ' AND event_id = ?';
        countParams.push(event_id);
      }
      countSql += ' GROUP BY unit';
      const counts = await db.all(countSql, countParams);
      for (const c of counts) {
        if (unitScores[c.unit]) unitScores[c.unit].athlete_count = c.count;
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];

        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        if (goldUnit && unitScores[goldUnit]) unitScores[goldUnit].gold++;

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        if (silverUnit && unitScores[silverUnit]) unitScores[silverUnit].silver++;

        const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 1);
        for (const semi of semiMatches) {
          const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
          if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].bronze++;
        }

        if (finalMatch.kyougi_match_category_total_rounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 2);
          for (const quarter of quarterMatches) {
            const loserUnit = quarter.kyougi_winner === '青方' ? quarter.kyougi_red_athlete_team : quarter.kyougi_blue_athlete_team;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fourth++;
          }
        }

        if (finalMatch.kyougi_match_category_total_rounds >= 4) {
          const eighthMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 3);
          for (const eighth of eighthMatches) {
            const loserUnit = eighth.kyougi_winner === '青方' ? eighth.kyougi_red_athlete_team : eighth.kyougi_blue_athlete_team;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fifth++;
          }
        }
      }

      for (const unit in unitScores) {
        const s = unitScores[unit];
        s.total_score = s.gold * (rankScores[1] || 0) + s.silver * (rankScores[2] || 0) + s.bronze * (rankScores[3] || 0) + s.fourth * (rankScores[4] || 0) + s.fifth * (rankScores[5] || 0);
      }

      const result = Object.values(unitScores).sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('团体总分统计错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 奖牌榜统计 ==================== */
  router.get('/stats/medals', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let unitSql = 'SELECT DISTINCT athlete_team FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      const unitMedals = {};
      for (const u of units) {
        unitMedals[u.unit] = { unit: u.unit, gold: 0, silver: 0, bronze: 0 };
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        if (goldUnit && unitMedals[goldUnit]) unitMedals[goldUnit].gold++;

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        if (silverUnit && unitMedals[silverUnit]) unitMedals[silverUnit].silver++;

        const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 1);
        for (const semi of semiMatches) {
          const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
          if (loserUnit && unitMedals[loserUnit]) unitMedals[loserUnit].bronze++;
        }
      }

      const result = Object.values(unitMedals).sort((a, b) => {
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('奖牌榜统计错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 冠军列表 ==================== */
  router.get('/stats/champions', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      const champions = [];

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const goldName = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_name : finalMatch.kyougi_red_athlete_name;
        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        const silverName = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_name : finalMatch.kyougi_blue_athlete_name;
        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;

        const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 1);
        const bronzeNames = [];
        const bronzeUnits = [];
        for (const semi of semiMatches) {
          const loserName = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_name : semi.kyougi_blue_athlete_name;
          const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
          if (loserName) bronzeNames.push(loserName);
          if (loserUnit) bronzeUnits.push(loserUnit);
        }

        champions.push({
          weight_class: weightClass,
          gold_name: goldName,
          gold_unit: goldUnit,
          silver_name: silverName,
          silver_unit: silverUnit,
          bronze_names: bronzeNames.join(', '),
          bronze_units: bronzeUnits.join(', ')
        });
      }

      res.json({ success: true, data: champions });
    } catch (err) {
      console.error('冠军列表统计错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 团体总分导出 ==================== */
  router.get('/stats/team-scores/export', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let rankScores = { 1: 9, 2: 7, 3: 5.5, 4: 4, 5: 2 };

      let unitSql = 'SELECT DISTINCT athlete_team FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      const unitScores = {};
      for (const u of units) {
        unitScores[u.unit] = { unit: u.unit, gold: 0, silver: 0, bronze: 0, fourth: 0, fifth: 0, total_score: 0, athlete_count: 0 };
      }

      let countSql = 'SELECT athlete_team as unit, COUNT(*) as count FROM athletes WHERE 1=1';
      const countParams = [];
      if (event_id) {
        countSql += ' AND event_id = ?';
        countParams.push(event_id);
      }
      countSql += ' GROUP BY unit';
      const counts = await db.all(countSql, countParams);
      for (const c of counts) {
        if (unitScores[c.unit]) unitScores[c.unit].athlete_count = c.count;
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        if (goldUnit && unitScores[goldUnit]) unitScores[goldUnit].gold++;

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        if (silverUnit && unitScores[silverUnit]) unitScores[silverUnit].silver++;

        const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 1);
        for (const semi of semiMatches) {
          const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
          if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].bronze++;
        }

        if (finalMatch.kyougi_match_category_total_rounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 2);
          for (const quarter of quarterMatches) {
            const loserUnit = quarter.kyougi_winner === '青方' ? quarter.kyougi_red_athlete_team : quarter.kyougi_blue_athlete_team;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fourth++;
          }
        }

        if (finalMatch.kyougi_match_category_total_rounds >= 4) {
          const eighthMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 3);
          for (const eighth of eighthMatches) {
            const loserUnit = eighth.kyougi_winner === '青方' ? eighth.kyougi_red_athlete_team : eighth.kyougi_blue_athlete_team;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fifth++;
          }
        }
      }

      for (const unit in unitScores) {
        const s = unitScores[unit];
        s.total_score = s.gold * (rankScores[1] || 0) + s.silver * (rankScores[2] || 0) + s.bronze * (rankScores[3] || 0) + s.fourth * (rankScores[4] || 0) + s.fifth * (rankScores[5] || 0);
      }

      const result = Object.values(unitScores).sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('团体总分');

      worksheet.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '金牌', key: 'gold', width: 10 },
        { header: '银牌', key: 'silver', width: 10 },
        { header: '铜牌', key: 'bronze', width: 10 },
        { header: '第四名', key: 'fourth', width: 10 },
        { header: '第五名', key: 'fifth', width: 10 },
        { header: '总分', key: 'total_score', width: 12 },
        { header: '参赛人数', key: 'athlete_count', width: 12 }
      ];

      result.forEach((item, index) => {
        worksheet.addRow({
          rank: index + 1,
          unit: item.unit,
          gold: item.gold,
          silver: item.silver,
          bronze: item.bronze,
          fourth: item.fourth,
          fifth: item.fifth,
          total_score: item.total_score,
          athlete_count: item.athlete_count
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=团体总分统计.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('导出团体总分错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 奖牌榜导出 ==================== */
  router.get('/stats/medals/export', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let athleteSql = 'SELECT id, athlete_team, athlete_gender, athlete_category FROM athletes WHERE 1=1';
      const athleteParams = [];
      if (event_id) {
        athleteSql += ' AND event_id = ?';
        athleteParams.push(event_id);
      }
      const athletes = await db.all(athleteSql, athleteParams);

      const athleteGenderMap = {};
      for (const a of athletes) {
        athleteGenderMap[a.id] = { gender: a.athlete_gender, unit: a.athlete_team };
      }

      let unitSql = 'SELECT DISTINCT athlete_team FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      const unitMedals = {};
      for (const u of units) {
        unitMedals[u.unit] = { unit: u.unit, gold: 0, silver: 0, bronze: 0, maleGold: 0, maleSilver: 0, maleBronze: 0, femaleGold: 0, femaleSilver: 0, femaleBronze: 0 };
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        const goldAthleteId = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_id : finalMatch.kyougi_red_athlete_id;
        const goldGender = goldAthleteId && athleteGenderMap[goldAthleteId] ? athleteGenderMap[goldAthleteId].gender : null;
        if (goldUnit && unitMedals[goldUnit]) {
          unitMedals[goldUnit].gold++;
          if (goldGender === '男') unitMedals[goldUnit].maleGold++;
          else if (goldGender === '女') unitMedals[goldUnit].femaleGold++;
        }

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        const silverAthleteId = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_id : finalMatch.kyougi_blue_athlete_id;
        const silverGender = silverAthleteId && athleteGenderMap[silverAthleteId] ? athleteGenderMap[silverAthleteId].gender : null;
        if (silverUnit && unitMedals[silverUnit]) {
          unitMedals[silverUnit].silver++;
          if (silverGender === '男') unitMedals[silverUnit].maleSilver++;
          else if (silverGender === '女') unitMedals[silverUnit].femaleSilver++;
        }

        const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds - 1);
        for (const semi of semiMatches) {
          const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
          const loserAthleteId = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_id : semi.kyougi_blue_athlete_id;
          const loserGender = loserAthleteId && athleteGenderMap[loserAthleteId] ? athleteGenderMap[loserAthleteId].gender : null;
          if (loserUnit && unitMedals[loserUnit]) {
            unitMedals[loserUnit].bronze++;
            if (loserGender === '男') unitMedals[loserUnit].maleBronze++;
            else if (loserGender === '女') unitMedals[loserUnit].femaleBronze++;
          }
        }
      }

      const result = Object.values(unitMedals).sort((a, b) => {
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      let eventName = '跆拳道比赛';
      try {
        const eventRow = await db.get('SELECT event_name FROM events WHERE event_id = ? ORDER BY event_id DESC LIMIT 1', event_id || null);
        if (eventRow && eventRow.event_name) eventName = eventRow.event_name;
      } catch(e) {}

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('奖牌榜', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
        }
      });

      const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const borderAll = { style: 'thin' };
      const borderStyle = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
      const titleFont = { name: '宋体', size: 16, bold: true };
      const subtitleFont = { name: '宋体', size: 12, bold: true };
      const headerFont = { name: '宋体', size: 10, bold: true };
      const dataFont = { name: '宋体', size: 10 };

      for (let c = 1; c <= 16; c++) {
        ws.getColumn(c).width = c === 1 ? 2 : c === 3 ? 14 : 6;
      }

      ws.mergeCells(1, 1, 1, 16);
      ws.getCell(1, 1).value = eventName;
      ws.getCell(1, 1).font = titleFont;
      ws.getCell(1, 1).alignment = centerAlign;
      ws.getRow(1).height = 30;

      ws.mergeCells(2, 1, 2, 16);
      ws.getCell(2, 1).value = '奖牌榜';
      ws.getCell(2, 1).font = subtitleFont;
      ws.getCell(2, 1).alignment = centerAlign;
      ws.getRow(2).height = 24;

      ws.getRow(3).height = 8;
      ws.getRow(4).height = 20;
      ws.mergeCells(4, 1, 4, 2);
      ws.getCell(4, 1).value = '场馆';
      ws.getCell(4, 1).font = dataFont;
      ws.getCell(4, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      ws.mergeCells(4, 13, 4, 14);
      ws.getCell(4, 13).value = '日期';
      ws.getCell(4, 13).font = dataFont;
      ws.getCell(4, 13).alignment = { horizontal: 'right', vertical: 'middle' };

      ws.getRow(5).height = 8;
      ws.getRow(6).height = 8;

      ws.getRow(7).height = 20;
      ws.mergeCells(7, 2, 7, 3);
      ws.getCell(7, 2).value = '汇总';
      ws.getCell(7, 2).font = headerFont;
      ws.getCell(7, 2).alignment = centerAlign;
      ws.getCell(7, 2).border = borderStyle;
      ws.getCell(7, 3).border = borderStyle;

      ws.getRow(8).height = 20;
      ws.mergeCells(8, 2, 10, 2);
      ws.getCell(8, 2).value = '名次';
      ws.getCell(8, 2).font = headerFont;
      ws.getCell(8, 2).alignment = centerAlign;
      ws.getCell(8, 2).border = borderStyle;

      ws.mergeCells(8, 3, 10, 3);
      ws.getCell(8, 3).value = '代表队';
      ws.getCell(8, 3).font = headerFont;
      ws.getCell(8, 3).alignment = centerAlign;
      ws.getCell(8, 3).border = borderStyle;

      ws.mergeCells(8, 4, 8, 7);
      ws.getCell(8, 4).value = '汇总';
      ws.getCell(8, 4).font = headerFont;
      ws.getCell(8, 4).alignment = centerAlign;
      ws.getCell(8, 4).border = borderStyle;
      for (let c = 5; c <= 7; c++) ws.getCell(8, c).border = borderStyle;

      ws.mergeCells(8, 8, 8, 11);
      ws.getCell(8, 8).value = '男子';
      ws.getCell(8, 8).font = headerFont;
      ws.getCell(8, 8).alignment = centerAlign;
      ws.getCell(8, 8).border = borderStyle;
      for (let c = 9; c <= 11; c++) ws.getCell(8, c).border = borderStyle;

      ws.mergeCells(8, 12, 8, 15);
      ws.getCell(8, 12).value = '女子';
      ws.getCell(8, 12).font = headerFont;
      ws.getCell(8, 12).alignment = centerAlign;
      ws.getCell(8, 12).border = borderStyle;
      for (let c = 13; c <= 15; c++) ws.getCell(8, c).border = borderStyle;

      ws.getRow(9).height = 20;
      const colHeaders9 = [
        { col: 4, val: '金' }, { col: 5, val: '银' }, { col: 6, val: '铜' },
        { col: 8, val: '金' }, { col: 9, val: '银' }, { col: 10, val: '铜' },
        { col: 12, val: '金' }, { col: 13, val: '银' }, { col: 14, val: '铜' }
      ];
      for (const h of colHeaders9) {
        ws.getCell(9, h.col).value = h.val;
        ws.getCell(9, h.col).font = headerFont;
        ws.getCell(9, h.col).alignment = centerAlign;
        ws.getCell(9, h.col).border = borderStyle;
      }

      ws.mergeCells(9, 7, 10, 7);
      ws.getCell(9, 7).value = '汇总';
      ws.getCell(9, 7).font = headerFont;
      ws.getCell(9, 7).alignment = centerAlign;
      ws.getCell(9, 7).border = borderStyle;
      ws.getCell(10, 7).border = borderStyle;

      ws.mergeCells(9, 11, 10, 11);
      ws.getCell(9, 11).value = '汇总';
      ws.getCell(9, 11).font = headerFont;
      ws.getCell(9, 11).alignment = centerAlign;
      ws.getCell(9, 11).border = borderStyle;
      ws.getCell(10, 11).border = borderStyle;

      ws.mergeCells(9, 15, 10, 15);
      ws.getCell(9, 15).value = '汇总';
      ws.getCell(9, 15).font = headerFont;
      ws.getCell(9, 15).alignment = centerAlign;
      ws.getCell(9, 15).border = borderStyle;
      ws.getCell(10, 15).border = borderStyle;

      ws.getRow(10).height = 20;
      const colHeaders10 = [
        { col: 4, val: '金' }, { col: 5, val: '银' }, { col: 6, val: '铜' },
        { col: 8, val: '金' }, { col: 9, val: '银' }, { col: 10, val: '铜' },
        { col: 12, val: '金' }, { col: 13, val: '银' }, { col: 14, val: '铜' }
      ];
      for (const h of colHeaders10) {
        ws.getCell(10, h.col).value = h.val;
        ws.getCell(10, h.col).font = headerFont;
        ws.getCell(10, h.col).alignment = centerAlign;
        ws.getCell(10, h.col).border = borderStyle;
      }

      for (let c = 1; c <= 16; c++) {
        for (let r = 8; r <= 10; r++) {
          ws.getCell(r, c).border = borderStyle;
        }
      }

      let dataRow = 11;
      for (let i = 0; i < result.length; i++) {
        const item = result[i];
        const row = dataRow + i;
        ws.getRow(row).height = 20;

        ws.getCell(row, 2).value = i + 1;
        ws.getCell(row, 2).font = dataFont;
        ws.getCell(row, 2).alignment = centerAlign;
        ws.getCell(row, 2).border = borderStyle;

        ws.getCell(row, 3).value = item.unit;
        ws.getCell(row, 3).font = dataFont;
        ws.getCell(row, 3).alignment = centerAlign;
        ws.getCell(row, 3).border = borderStyle;

        ws.getCell(row, 4).value = item.gold;
        ws.getCell(row, 4).font = dataFont;
        ws.getCell(row, 4).alignment = centerAlign;
        ws.getCell(row, 4).border = borderStyle;

        ws.getCell(row, 5).value = item.silver;
        ws.getCell(row, 5).font = dataFont;
        ws.getCell(row, 5).alignment = centerAlign;
        ws.getCell(row, 5).border = borderStyle;

        ws.getCell(row, 6).value = item.bronze;
        ws.getCell(row, 6).font = dataFont;
        ws.getCell(row, 6).alignment = centerAlign;
        ws.getCell(row, 6).border = borderStyle;

        const totalAll = item.gold + item.silver + item.bronze;
        ws.getCell(row, 7).value = totalAll;
        ws.getCell(row, 7).font = dataFont;
        ws.getCell(row, 7).alignment = centerAlign;
        ws.getCell(row, 7).border = borderStyle;

        ws.getCell(row, 8).value = item.maleGold;
        ws.getCell(row, 8).font = dataFont;
        ws.getCell(row, 8).alignment = centerAlign;
        ws.getCell(row, 8).border = borderStyle;

        ws.getCell(row, 9).value = item.maleSilver;
        ws.getCell(row, 9).font = dataFont;
        ws.getCell(row, 9).alignment = centerAlign;
        ws.getCell(row, 9).border = borderStyle;

        ws.getCell(row, 10).value = item.maleBronze;
        ws.getCell(row, 10).font = dataFont;
        ws.getCell(row, 10).alignment = centerAlign;
        ws.getCell(row, 10).border = borderStyle;

        const maleTotal = item.maleGold + item.maleSilver + item.maleBronze;
        ws.getCell(row, 11).value = maleTotal;
        ws.getCell(row, 11).font = dataFont;
        ws.getCell(row, 11).alignment = centerAlign;
        ws.getCell(row, 11).border = borderStyle;

        ws.getCell(row, 12).value = item.femaleGold;
        ws.getCell(row, 12).font = dataFont;
        ws.getCell(row, 12).alignment = centerAlign;
        ws.getCell(row, 12).border = borderStyle;

        ws.getCell(row, 13).value = item.femaleSilver;
        ws.getCell(row, 13).font = dataFont;
        ws.getCell(row, 13).alignment = centerAlign;
        ws.getCell(row, 13).border = borderStyle;

        ws.getCell(row, 14).value = item.femaleBronze;
        ws.getCell(row, 14).font = dataFont;
        ws.getCell(row, 14).alignment = centerAlign;
        ws.getCell(row, 14).border = borderStyle;

        const femaleTotal = item.femaleGold + item.femaleSilver + item.femaleBronze;
        ws.getCell(row, 15).value = femaleTotal;
        ws.getCell(row, 15).font = dataFont;
        ws.getCell(row, 15).alignment = centerAlign;
        ws.getCell(row, 15).border = borderStyle;

        ws.getCell(row, 1).border = borderStyle;
        ws.getCell(row, 16).border = borderStyle;
      }

      const totalRow = dataRow + result.length;
      ws.getRow(totalRow).height = 20;
      ws.mergeCells(totalRow, 1, totalRow, 2);
      ws.getCell(totalRow, 2).value = '总计';
      ws.getCell(totalRow, 2).font = headerFont;
      ws.getCell(totalRow, 2).alignment = centerAlign;
      ws.getCell(totalRow, 2).border = borderStyle;
      ws.getCell(totalRow, 1).border = borderStyle;

      ws.getCell(totalRow, 3).border = borderStyle;

      const sumCols = [4,5,6,7,8,9,10,11,12,13,14,15];
      for (const c of sumCols) {
        let sum = 0;
        for (const item of result) {
          if (c === 4) sum += item.gold;
          else if (c === 5) sum += item.silver;
          else if (c === 6) sum += item.bronze;
          else if (c === 7) sum += item.gold + item.silver + item.bronze;
          else if (c === 8) sum += item.maleGold;
          else if (c === 9) sum += item.maleSilver;
          else if (c === 10) sum += item.maleBronze;
          else if (c === 11) sum += item.maleGold + item.maleSilver + item.maleBronze;
          else if (c === 12) sum += item.femaleGold;
          else if (c === 13) sum += item.femaleSilver;
          else if (c === 14) sum += item.femaleBronze;
          else if (c === 15) sum += item.femaleGold + item.femaleSilver + item.femaleBronze;
        }
        ws.getCell(totalRow, c).value = sum;
        ws.getCell(totalRow, c).font = headerFont;
        ws.getCell(totalRow, c).alignment = centerAlign;
        ws.getCell(totalRow, c).border = borderStyle;
      }
      ws.getCell(totalRow, 16).border = borderStyle;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('奖牌榜.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('导出奖牌榜错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 名次公告 ==================== */
  router.get('/stats/rank-announcement', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let unitSql = 'SELECT DISTINCT athlete_team FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      const unitRanks = {};
      for (const u of units) {
        unitRanks[u.unit] = { unit: u.unit, rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0, rank6: 0, rank7: 0, rank8: 0, total: 0 };
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const totalRounds = finalMatch.kyougi_match_category_total_rounds;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        if (goldUnit && unitRanks[goldUnit]) unitRanks[goldUnit].rank1++;

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        if (silverUnit && unitRanks[silverUnit]) unitRanks[silverUnit].rank2++;

        if (totalRounds >= 2) {
          const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 1);
          for (const semi of semiMatches) {
            const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank3++;
          }
        }

        if (totalRounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 2);
          for (const quarter of quarterMatches) {
            const loserUnit = quarter.kyougi_winner === '青方' ? quarter.kyougi_red_athlete_team : quarter.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank4++;
          }
        }

        if (totalRounds >= 4) {
          const r5Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 3);
          for (const r5 of r5Matches) {
            const loserUnit = r5.kyougi_winner === '青方' ? r5.kyougi_red_athlete_team : r5.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank5++;
          }
        }

        if (totalRounds >= 5) {
          const r6Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 4);
          for (const r6 of r6Matches) {
            const loserUnit = r6.kyougi_winner === '青方' ? r6.kyougi_red_athlete_team : r6.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank6++;
          }
        }

        if (totalRounds >= 6) {
          const r7Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 5);
          for (const r7 of r7Matches) {
            const loserUnit = r7.kyougi_winner === '青方' ? r7.kyougi_red_athlete_team : r7.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank7++;
          }
        }

        if (totalRounds >= 7) {
          const r8Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 6);
          for (const r8 of r8Matches) {
            const loserUnit = r8.kyougi_winner === '青方' ? r8.kyougi_red_athlete_team : r8.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank8++;
          }
        }
      }

      const result = Object.values(unitRanks).map(item => {
        item.total = item.rank1 + item.rank2 + item.rank3 + item.rank4 + item.rank5 + item.rank6 + item.rank7 + item.rank8;
        return item;
      }).sort((a, b) => {
        if (b.rank1 !== a.rank1) return b.rank1 - a.rank1;
        if (b.rank2 !== a.rank2) return b.rank2 - a.rank2;
        if (b.rank3 !== a.rank3) return b.rank3 - a.rank3;
        return b.total - a.total;
      });

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('名次公告统计错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/stats/rank-announcement/export', async (req, res) => {
    try {
      const { event_id } = req.query;

      const matches = await getFinishedKyougiMatchs(db, event_id || null);

      let unitSql = 'SELECT DISTINCT athlete_team FROM athletes WHERE 1=1';
      const unitParams = [];
      if (event_id) {
        unitSql += ' AND event_id = ?';
        unitParams.push(event_id);
      }
      const units = await db.all(unitSql, unitParams);

      const unitRanks = {};
      for (const u of units) {
        unitRanks[u.unit] = { unit: u.unit, rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0, rank6: 0, rank7: 0, rank8: 0, total: 0 };
      }

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const totalRounds = finalMatch.kyougi_match_category_total_rounds;

        const goldUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_team : finalMatch.kyougi_red_athlete_team;
        if (goldUnit && unitRanks[goldUnit]) unitRanks[goldUnit].rank1++;

        const silverUnit = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_team : finalMatch.kyougi_blue_athlete_team;
        if (silverUnit && unitRanks[silverUnit]) unitRanks[silverUnit].rank2++;

        if (totalRounds >= 2) {
          const semiMatches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 1);
          for (const semi of semiMatches) {
            const loserUnit = semi.kyougi_winner === '青方' ? semi.kyougi_red_athlete_team : semi.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank3++;
          }
        }

        if (totalRounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 2);
          for (const quarter of quarterMatches) {
            const loserUnit = quarter.kyougi_winner === '青方' ? quarter.kyougi_red_athlete_team : quarter.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank4++;
          }
        }

        if (totalRounds >= 4) {
          const r5Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 3);
          for (const r5 of r5Matches) {
            const loserUnit = r5.kyougi_winner === '青方' ? r5.kyougi_red_athlete_team : r5.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank5++;
          }
        }

        if (totalRounds >= 5) {
          const r6Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 4);
          for (const r6 of r6Matches) {
            const loserUnit = r6.kyougi_winner === '青方' ? r6.kyougi_red_athlete_team : r6.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank6++;
          }
        }

        if (totalRounds >= 6) {
          const r7Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 5);
          for (const r7 of r7Matches) {
            const loserUnit = r7.kyougi_winner === '青方' ? r7.kyougi_red_athlete_team : r7.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank7++;
          }
        }

        if (totalRounds >= 7) {
          const r8Matches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - 6);
          for (const r8 of r8Matches) {
            const loserUnit = r8.kyougi_winner === '青方' ? r8.kyougi_red_athlete_team : r8.kyougi_blue_athlete_team;
            if (loserUnit && unitRanks[loserUnit]) unitRanks[loserUnit].rank8++;
          }
        }
      }

      const result = Object.values(unitRanks).map(item => {
        item.total = item.rank1 + item.rank2 + item.rank3 + item.rank4 + item.rank5 + item.rank6 + item.rank7 + item.rank8;
        return item;
      }).sort((a, b) => {
        if (b.rank1 !== a.rank1) return b.rank1 - a.rank1;
        if (b.rank2 !== a.rank2) return b.rank2 - a.rank2;
        if (b.rank3 !== a.rank3) return b.rank3 - a.rank3;
        return b.total - a.total;
      });

      let eventName = '跆拳道比赛';
      try {
        const eventRow = await db.get('SELECT event_name FROM events WHERE event_id = ? ORDER BY event_id DESC LIMIT 1', event_id || null);
        if (eventRow && eventRow.event_name) eventName = eventRow.event_name;
      } catch(e) {}

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('汇总', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
        }
      });

      const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const borderAll = { style: 'thin' };
      const borderStyle = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
      const titleFont = { name: '宋体', size: 16, bold: true };
      const subtitleFont = { name: '宋体', size: 12, bold: true };
      const headerFont = { name: '宋体', size: 10, bold: true };
      const dataFont = { name: '宋体', size: 10 };

      for (let c = 1; c <= 11; c++) {
        ws.getColumn(c).width = c === 2 ? 14 : 6;
      }

      ws.mergeCells(1, 1, 1, 11);
      ws.getCell(1, 1).value = eventName;
      ws.getCell(1, 1).font = titleFont;
      ws.getCell(1, 1).alignment = centerAlign;
      ws.getRow(1).height = 30;

      ws.mergeCells(2, 1, 2, 11);
      ws.getCell(2, 1).value = '名次公告';
      ws.getCell(2, 1).font = subtitleFont;
      ws.getCell(2, 1).alignment = centerAlign;
      ws.getRow(2).height = 24;

      ws.getRow(3).height = 8;
      ws.getRow(4).height = 20;
      ws.mergeCells(4, 1, 4, 2);
      ws.getCell(4, 1).value = '场馆';
      ws.getCell(4, 1).font = dataFont;
      ws.getCell(4, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      ws.mergeCells(4, 9, 4, 10);
      ws.getCell(4, 9).value = '日期';
      ws.getCell(4, 9).font = dataFont;
      ws.getCell(4, 9).alignment = { horizontal: 'right', vertical: 'middle' };

      ws.getRow(5).height = 8;
      ws.getRow(6).height = 8;

      ws.getRow(7).height = 20;
      ws.mergeCells(7, 3, 7, 9);
      ws.getCell(7, 3).value = '名次累计';
      ws.getCell(7, 3).font = headerFont;
      ws.getCell(7, 3).alignment = centerAlign;
      ws.getCell(7, 3).border = borderStyle;
      for (let c = 4; c <= 9; c++) ws.getCell(7, c).border = borderStyle;

      ws.getRow(8).height = 20;
      const headerRow8 = [
        { col: 1, val: '名次' }, { col: 2, val: '代表队' },
        { col: 3, val: '金' }, { col: 4, val: '银' }, { col: 5, val: '铜' },
        { col: 6, val: 4 }, { col: 7, val: 5 }, { col: 8, val: 6 },
        { col: 9, val: 7 }, { col: 10, val: 8 }, { col: 11, val: '总计' }
      ];

      ws.mergeCells(8, 1, 9, 1);
      ws.getCell(8, 1).value = '名次';
      ws.getCell(8, 1).font = headerFont;
      ws.getCell(8, 1).alignment = centerAlign;
      ws.getCell(8, 1).border = borderStyle;
      ws.getCell(9, 1).border = borderStyle;

      ws.mergeCells(8, 2, 9, 2);
      ws.getCell(8, 2).value = '代表队';
      ws.getCell(8, 2).font = headerFont;
      ws.getCell(8, 2).alignment = centerAlign;
      ws.getCell(8, 2).border = borderStyle;
      ws.getCell(9, 2).border = borderStyle;

      ws.mergeCells(8, 3, 8, 9);
      ws.getCell(8, 3).value = '名次累计';
      ws.getCell(8, 3).font = headerFont;
      ws.getCell(8, 3).alignment = centerAlign;
      ws.getCell(8, 3).border = borderStyle;
      for (let c = 4; c <= 9; c++) ws.getCell(8, c).border = borderStyle;

      ws.mergeCells(8, 11, 9, 11);
      ws.getCell(8, 11).value = '总计';
      ws.getCell(8, 11).font = headerFont;
      ws.getCell(8, 11).alignment = centerAlign;
      ws.getCell(8, 11).border = borderStyle;
      ws.getCell(9, 11).border = borderStyle;

      ws.getRow(9).height = 20;
      const subHeaders = [
        { col: 3, val: '金' }, { col: 4, val: '银' }, { col: 5, val: '铜' },
        { col: 6, val: 4 }, { col: 7, val: 5 }, { col: 8, val: 6 },
        { col: 9, val: 7 }, { col: 10, val: 8 }
      ];
      for (const h of subHeaders) {
        ws.getCell(9, h.col).value = h.val;
        ws.getCell(9, h.col).font = headerFont;
        ws.getCell(9, h.col).alignment = centerAlign;
        ws.getCell(9, h.col).border = borderStyle;
      }

      for (let c = 1; c <= 11; c++) {
        for (let r = 8; r <= 9; r++) {
          ws.getCell(r, c).border = borderStyle;
        }
      }

      let dataRow = 10;
      for (let i = 0; i < result.length; i++) {
        const item = result[i];
        const row = dataRow + i;
        ws.getRow(row).height = 20;

        ws.getCell(row, 1).value = i + 1;
        ws.getCell(row, 1).font = dataFont;
        ws.getCell(row, 1).alignment = centerAlign;
        ws.getCell(row, 1).border = borderStyle;

        ws.getCell(row, 2).value = item.unit;
        ws.getCell(row, 2).font = dataFont;
        ws.getCell(row, 2).alignment = centerAlign;
        ws.getCell(row, 2).border = borderStyle;

        const rankFields = ['rank1','rank2','rank3','rank4','rank5','rank6','rank7','rank8'];
        for (let ri = 0; ri < rankFields.length; ri++) {
          const val = item[rankFields[ri]];
          ws.getCell(row, 3 + ri).value = val > 0 ? val : '';
          ws.getCell(row, 3 + ri).font = dataFont;
          ws.getCell(row, 3 + ri).alignment = centerAlign;
          ws.getCell(row, 3 + ri).border = borderStyle;
        }

        ws.getCell(row, 11).value = item.total > 0 ? item.total : '';
        ws.getCell(row, 11).font = dataFont;
        ws.getCell(row, 11).alignment = centerAlign;
        ws.getCell(row, 11).border = borderStyle;
      }

      const totalRow = dataRow + result.length;
      ws.getRow(totalRow).height = 20;
      ws.mergeCells(totalRow, 1, totalRow, 2);
      ws.getCell(totalRow, 1).value = '总计';
      ws.getCell(totalRow, 1).font = headerFont;
      ws.getCell(totalRow, 1).alignment = centerAlign;
      ws.getCell(totalRow, 1).border = borderStyle;
      ws.getCell(totalRow, 2).border = borderStyle;

      for (let c = 3; c <= 11; c++) {
        let sum = 0;
        for (const item of result) {
          if (c <= 10) {
            const rankFields = ['rank1','rank2','rank3','rank4','rank5','rank6','rank7','rank8'];
            sum += item[rankFields[c - 3]] || 0;
          } else {
            sum += item.total || 0;
          }
        }
        ws.getCell(totalRow, c).value = sum > 0 ? sum : '';
        ws.getCell(totalRow, c).font = headerFont;
        ws.getCell(totalRow, c).alignment = centerAlign;
        ws.getCell(totalRow, c).border = borderStyle;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('名次公告.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('导出名次公告错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 成绩汇总导出 ==================== */
  router.get('/stats/all-results/export', async (req, res) => {
    try {
      const athletes = await db.all('SELECT a.*, e.event_name as event_name FROM athletes a LEFT JOIN events e ON a.event_id = e.event_id ORDER BY a.athlete_gender DESC, a.athlete_age_group, a.athlete_category, a.athlete_draw_num');

      const matches = await getFinishedKyougiMatchs(db, null);

      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.kyougi_match_categroy]) matchesByClass[m.kyougi_match_categroy] = [];
        matchesByClass[m.kyougi_match_categroy].push(m);
      }

      const athleteRankMap = {};
      for (const weightClass in matchesByClass) {
        const classMatches = matchesByClass[weightClass];
        const finalMatch = classMatches.find(m => m.kyougi_match_round_num === m.kyougi_match_category_total_rounds);
        if (!finalMatch) continue;

        const totalRounds = finalMatch.kyougi_match_category_total_rounds;

        const goldId = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_blue_athlete_id : finalMatch.kyougi_red_athlete_id;
        if (goldId) athleteRankMap[goldId] = 1;

        const silverId = finalMatch.kyougi_winner === '青方' ? finalMatch.kyougi_red_athlete_id : finalMatch.kyougi_blue_athlete_id;
        if (silverId) athleteRankMap[silverId] = 2;

        for (let offset = 1; offset <= 2 && offset < totalRounds; offset++) {
          const roundMatches = classMatches.filter(m => m.kyougi_match_round_num === totalRounds - offset);
          const rank = Math.pow(2, offset) + 1;
          for (const match of roundMatches) {
            const loserId = match.kyougi_winner === '青方' ? match.kyougi_red_athlete_id : match.kyougi_blue_athlete_id;
            if (loserId) athleteRankMap[loserId] = rank;
          }
        }
      }

      let eventName = '跆拳道比赛';
      if (athletes.length > 0 && athletes[0].event_name) eventName = athletes[0].event_name;

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('汇总', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
        }
      });

      const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const borderAll = { style: 'thin' };
      const borderStyle = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
      const titleFont = { name: '宋体', size: 16, bold: true };
      const subtitleFont = { name: '宋体', size: 12, bold: true };
      const headerFont = { name: '宋体', size: 10, bold: true };
      const dataFont = { name: '宋体', size: 10 };

      ws.getColumn(1).width = 6;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 20;
      ws.getColumn(4).width = 6;
      ws.getColumn(5).width = 10;
      ws.getColumn(6).width = 6;
      ws.getColumn(7).width = 14;
      ws.getColumn(8).width = 10;
      ws.getColumn(9).width = 6;
      ws.getColumn(10).width = 8;
      ws.getColumn(11).width = 8;

      ws.mergeCells(1, 1, 1, 11);
      ws.getCell(1, 1).value = eventName;
      ws.getCell(1, 1).font = titleFont;
      ws.getCell(1, 1).alignment = centerAlign;
      ws.getRow(1).height = 30;

      ws.mergeCells(2, 1, 2, 11);
      ws.getCell(2, 1).value = '成绩汇总';
      ws.getCell(2, 1).font = subtitleFont;
      ws.getCell(2, 1).alignment = centerAlign;
      ws.getRow(2).height = 24;

      ws.getRow(3).height = 8;
      ws.getRow(4).height = 20;
      ws.mergeCells(4, 1, 4, 2);
      ws.getCell(4, 1).value = '场馆';
      ws.getCell(4, 1).font = dataFont;
      ws.getCell(4, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      ws.mergeCells(4, 9, 4, 10);
      ws.getCell(4, 9).value = '日期';
      ws.getCell(4, 9).font = dataFont;
      ws.getCell(4, 9).alignment = { horizontal: 'right', vertical: 'middle' };

      ws.getRow(5).height = 8;

      ws.getRow(6).height = 20;
      const headers = ['序号', '级别', '组别', '名次', '姓名', '性别', '代表队', '运动员号', '签号', '得分', '备注'];
      for (let i = 0; i < headers.length; i++) {
        const cell = ws.getCell(6, i + 1);
        cell.value = headers[i];
        cell.font = headerFont;
        cell.alignment = centerAlign;
        cell.border = borderStyle;
      }

      let seq = 1;
      for (const a of athletes) {
        const row = 6 + seq;
        ws.getRow(row).height = 20;

        const rank = athleteRankMap[a.id] || 0;
        const groupClass = a.athlete_age_group || '';
        const groupType = (a.athlete_gender === '男' ? '男子' : '女子') + groupClass + (groupClass.endsWith('组') ? '' : '组');

        const rowData = [
          seq,
          a.athlete_category || '',
          groupType,
          rank,
          a.athlete_name || '',
          a.athlete_gender || '',
          a.athlete_team || '',
          a.athlete_id || '',
          a.athlete_draw_num || '',
          0,
          ''
        ];

        for (let i = 0; i < rowData.length; i++) {
          const cell = ws.getCell(row, i + 1);
          cell.value = rowData[i];
          cell.font = dataFont;
          cell.alignment = centerAlign;
          cell.border = borderStyle;
        }

        seq++;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('所有成绩.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('导出所有成绩错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== Excel 模板下载 ==================== */
  router.get('/templates/team-score', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('团体总分');
      ws.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '金牌', key: 'gold', width: 10 },
        { header: '银牌', key: 'silver', width: 10 },
        { header: '铜牌', key: 'bronze', width: 10 },
        { header: '第四名', key: 'fourth', width: 10 },
        { header: '第五名', key: 'fifth', width: 10 },
        { header: '总分', key: 'total_score', width: 12 },
        { header: '参赛人数', key: 'athlete_count', width: 12 }
      ];
      ws.addRow({ rank: 1, unit: '示例单位A', gold: 3, silver: 2, bronze: 1, fourth: 1, fifth: 0, total_score: 56, athlete_count: 10 });
      ws.addRow({ rank: 2, unit: '示例单位B', gold: 2, silver: 3, bronze: 2, fourth: 0, fifth: 1, total_score: 50, athlete_count: 8 });
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('团体总分表模板.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/templates/medal', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('奖牌榜');
      ws.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '金牌', key: 'gold', width: 10 },
        { header: '银牌', key: 'silver', width: 10 },
        { header: '铜牌', key: 'bronze', width: 10 },
        { header: '总计', key: 'total', width: 10 }
      ];
      ws.addRow({ rank: 1, unit: '示例单位A', gold: 3, silver: 2, bronze: 1, total: 6 });
      ws.addRow({ rank: 2, unit: '示例单位B', gold: 2, silver: 3, bronze: 2, total: 7 });
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('奖牌统计表模板.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/templates/result-summary', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('成绩汇总');
      ws.columns = [
        { header: '级别', key: 'weight_class', width: 15 },
        { header: '冠军', key: 'gold_name', width: 12 },
        { header: '冠军单位', key: 'gold_unit', width: 15 },
        { header: '亚军', key: 'silver_name', width: 12 },
        { header: '亚军单位', key: 'silver_unit', width: 15 },
        { header: '季军', key: 'bronze_names', width: 12 },
        { header: '季军单位', key: 'bronze_units', width: 15 }
      ];
      ws.addRow({ weight_class: '男子32KG', gold_name: '张三', gold_unit: '示例单位A', silver_name: '李四', silver_unit: '示例单位B', bronze_names: '王五', bronze_units: '示例单位C' });
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('成绩汇总表模板.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/templates/champion', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('冠军汇总');
      ws.columns = [
        { header: '级别', key: 'weight_class', width: 15 },
        { header: '冠军姓名', key: 'champion_name', width: 12 },
        { header: '冠军单位', key: 'champion_unit', width: 15 },
        { header: '亚军姓名', key: 'runner_up_name', width: 12 },
        { header: '亚军单位', key: 'runner_up_unit', width: 15 },
        { header: '季军姓名', key: 'third_name', width: 12 },
        { header: '季军单位', key: 'third_unit', width: 15 }
      ];
      ws.addRow({ weight_class: '男子32KG', champion_name: '张三', champion_unit: '示例单位A', runner_up_name: '李四', runner_up_unit: '示例单位B', third_name: '王五', third_unit: '示例单位C' });
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('冠军汇总表模板.xlsx'));
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
