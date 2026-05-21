const express = require('express');
const router = express.Router();
const {
  generateStandardSeedOrder,
  generateRoundRobinMatches,
  generateDivisionalRoundRobin,
  getRoundName,
  generateBracketForClass
} = require('./autoScheduler');
const {
  insertKyougiMatch,
  deleteKyougiMatchsByEvent,
  deleteKyougiMatchsByClass,
  deleteKyougiMatchsByAthletes,
  queryKyougiMatchs,
  getFinishedKyougiMatchs,
  updateKyougiMatchVenue,
  clearKyougiMatchVenue,
  updateKyougiMatchPrevWinners,
  toLegacyFormat
} = require('./kyougiMatchHelpers');

module.exports = (db, bracketsManager) => {
  const manager = bracketsManager;

  function calcEventStatus(event, now) {
    const regStart = event.reg_start ? new Date(event.reg_start) : null;
    const regEnd = event.reg_end ? new Date(event.reg_end) : null;
    const compStart = event.comp_start ? new Date(event.comp_start) : null;
    const compEnd = event.comp_end ? new Date(event.comp_end) : null;

    if (compEnd && now > compEnd) return '已结束';
    if (compStart && now >= compStart) return '进行中';
    if (regStart && now >= regStart && (!regEnd || now <= regEnd)) return '报名中';
    return '准备中';
  }

  router.get('/events', async (req, res) => {
    try {
      const events = await db.all('SELECT * FROM events ORDER BY created_at DESC');
      const now = new Date();
      const updated = events.map(e => {
        e.id = e.event_id;
        e.name = e.event_name;
        e.venue = e.event_venue;
        e.status = calcEventStatus(e, now);
        e.event_status = e.status;
        return e;
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/events', async (req, res) => {
    try {
      const { name, venue, event_date, reg_start, reg_end, comp_start, comp_end, event_type } = req.body;
      const now = new Date();
      const status = calcEventStatus({ reg_start, reg_end, comp_start, comp_end }, now);
      const result = await db.run(
        'INSERT INTO events (event_name, event_venue, event_date, reg_start, reg_end, comp_start, comp_end, event_status, event_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, venue, event_date || null, reg_start || null, reg_end || null, comp_start || null, comp_end || null, status, event_type || 'taekwondo']
      );
      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, venue, event_date, reg_start, reg_end, comp_start, comp_end, event_type } = req.body;
      
      const existingEvent = await db.get('SELECT event_type FROM events WHERE event_id = ?', [id]);
      if (existingEvent && existingEvent.event_type !== event_type) {
        const athleteCount = await db.get('SELECT COUNT(*) as count FROM athletes WHERE event_id = ?', [id]);
        if (athleteCount && athleteCount.count > 0) {
          return res.status(400).json({ success: false, error: '该赛事已有运动员，无法更改赛事类型，请先清除运动员' });
        }
      }
      
      const now = new Date();
      const status = calcEventStatus({ reg_start, reg_end, comp_start, comp_end }, now);
      await db.run(
        'UPDATE events SET event_name = ?, event_venue = ?, event_date = ?, reg_start = ?, reg_end = ?, comp_start = ?, comp_end = ?, event_status = ?, event_type = ? WHERE event_id = ?',
        [name, venue, event_date || null, reg_start || null, reg_end || null, comp_start || null, comp_end || null, status, event_type || 'taekwondo', id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const eventId = Number(id);

      const athletes = await db.all('SELECT id FROM athletes WHERE event_id = ?', [eventId]);
      const athleteIds = athletes.map(a => a.id);

      const weightClasses = await db.all('SELECT DISTINCT athlete_category FROM athletes WHERE event_id = ?', [eventId]);
      const wcList = weightClasses.map(w => w.weight_class);

      try {
        await db.run('DELETE FROM poomsae_scores WHERE event_id = ?', [eventId]);
      } catch (e) {
        try {
          await db.run('DELETE FROM poomsae_scores WHERE group_id IN (SELECT id FROM poomsae_groups WHERE event_id = ?)', [eventId]);
        } catch (e2) {
          console.log('删除品势成绩:', e2.message);
        }
      }

      const stageRows = await db.all('SELECT id FROM bracket_stage WHERE event_id = ?', [eventId]);
      for (const stageRow of stageRows) {
        if (stageRow.id) {
          const oldSid = stageRow.id;
          try {
            const matchRows = await db.prepare('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?').all(Number(oldSid));
            const pIds = new Set();
            for (const m of matchRows) {
              if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch(e) {} }
              if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch(e) {} }
            }
            await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_group WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_stage WHERE id = ?').run(Number(oldSid));
            for (const pid of pIds) { await db.prepare('DELETE FROM bracket_participant WHERE id = ?').run(pid); }
          } catch (e) {
            console.log('清除旧stage:', oldSid, e.message);
          }
        }
      }
      await db.prepare('DELETE FROM bracket_participant WHERE tournament_id = ?').run(eventId);

      if (athleteIds.length > 0) {
        await deleteKyougiMatchsByAthletes(db, athleteIds);
      }
      await deleteKyougiMatchsByEvent(db, eventId);

      await db.run('DELETE FROM poomsae_matchs WHERE event_id = ?', [eventId]);
      await db.run('DELETE FROM poomsae_groups WHERE event_id = ?', [eventId]);
      await db.run('DELETE FROM athletes_poomsae WHERE event_id = ?', [eventId]);

      await db.run('DELETE FROM category_mode WHERE event_id = ?', [eventId]);

      await db.run('DELETE FROM athletes_weighing WHERE event_id = ?', [eventId]);

      await db.run('DELETE FROM athletes WHERE event_id = ?', [eventId]);

      await db.run('DELETE FROM events WHERE event_id = ?', [eventId]);

      res.json({ success: true });
    } catch (err) {
      console.error('删除赛事失败:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/events/current', async (req, res) => {
    try {
      const event = await db.get('SELECT * FROM events WHERE event_status != "已结束" ORDER BY created_at DESC LIMIT 1');
      if (event) {
        event.id = event.event_id;
        event.name = event.event_name;
        event.venue = event.event_venue;
        event.status = event.event_status;
      }
      res.json({ success: true, data: event });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/events/:id/select', async (req, res) => {
    try {
      const { id } = req.params;
      const event = await db.get('SELECT * FROM events WHERE event_id = ?', [id]);
      if (!event) {
        return res.status(404).json({ success: false, error: '赛事不存在' });
      }
      await db.run('UPDATE events SET event_status = "准备中" WHERE event_status = "进行中"');
      await db.run('UPDATE events SET event_status = "进行中" WHERE event_id = ?', [id]);
      event.id = event.event_id;
      event.name = event.event_name;
      event.venue = event.event_venue;
      event.status = event.event_status;
      res.json({ success: true, data: event });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  async function syncMatchesFromBracket(weightClass, event_id) {
    const stageMapRow = await db.get(
      'SELECT id AS stage_id, type AS stage_type FROM bracket_stage WHERE event_id = ? AND category_id = ?',
      [event_id, weightClass]
    );

    if (!stageMapRow || !stageMapRow.stage_id) return;

    const stageIds = String(stageMapRow.stage_id).split(',').map(s => s.trim()).filter(Boolean);
    const stageType = stageMapRow.stage_type || 'single_elimination';
    const isDivisional = stageType === 'divisional_round_robin';

    const nameUnitMap = new Map();
    const unitRows = await db.prepare('SELECT id, athlete_name, athlete_team FROM athletes WHERE event_id = ? AND athlete_category = ?').all(event_id, weightClass);
      unitRows.forEach(r => { nameUnitMap.set(r.id, r.athlete_team || ''); });

    const participants = await db.prepare(
      'SELECT id, name, custom_data FROM bracket_participant WHERE tournament_id = ?'
    ).all(Number(event_id));

    const participantMap = new Map();
    participants.forEach(p => {
      let info = { name: p.name, id: null, athlete_draw_num: null, unit: '' };
      try {
        if (p.custom_data) {
          const custom = JSON.parse(p.custom_data);
          info.id = custom.id;
          info.athlete_draw_num = custom.athlete_draw_num;
          info.unit = nameUnitMap.get(custom.id) || '';
        }
      } catch (e) {}
      const parenIdx = info.name.indexOf('(');
      if (parenIdx > 0) {
        info.name = info.name.substring(0, parenIdx);
      }
      participantMap.set(p.id, info);
    });

    let scheme = {};
    try {
      const schemeRow = await db.prepare(
        'SELECT category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ? AND weight_class = ?'
      ).get(event_id, weightClass);
      if (schemeRow) {
        scheme = {
          category_venue: schemeRow.category_venue || '',
          category_date_num: schemeRow.category_date_num != null ? String(schemeRow.category_date_num) : '',
          category_order: schemeRow.category_order != null ? String(schemeRow.category_order) : ''
        };
      }
    } catch (e) {}

    let allBracketMatches = [];
    let maxRoundNumber = 0;

    for (const sid of stageIds) {
      const numSid = Number(sid);
      if (isNaN(numSid)) continue;

      const stageInfo = await db.prepare('SELECT id, name, settings FROM bracket_stage WHERE id = ?').get(numSid);
      if (!stageInfo) continue;

      const bracketMatches = await db.prepare(
        `SELECT bm.id, bm.number, bm.opponent1, bm.opponent2, bm.status,
                br.number AS round_number, br.name AS round_name,
                ? AS stage_id
         FROM bracket_match bm
         LEFT JOIN bracket_round br ON bm.round_id = br.id
         WHERE bm.stage_id = ?
         ORDER BY br.number, bm.number`
      ).all(numSid, numSid);

      if (bracketMatches && bracketMatches.length > 0) {
        for (const bm of bracketMatches) {
          if (bm.round_number && bm.round_number > maxRoundNumber) {
            maxRoundNumber = bm.round_number;
          }
        }
        allBracketMatches = allBracketMatches.concat(bracketMatches);
      }
    }

    if (allBracketMatches.length === 0) return;

    const venueVal = scheme.category_venue || '';
    const unitVal = scheme.category_date_num || '';

    let matchOrderInClass = 0;

    for (const bm of allBracketMatches) {
      matchOrderInClass++;

      let blueName = '', redName = '';
      let blueAthleteId = null, redAthleteId = null;
      let blueDrawNo = null, redDrawNo = null;
      let blueUnit = '', redUnit = '';

      try {
        if (bm.opponent1) {
          const opp1 = typeof bm.opponent1 === 'string' ? JSON.parse(bm.opponent1) : bm.opponent1;
          if (opp1 && opp1.id) {
            const info = participantMap.get(opp1.id);
            if (info) {
              blueName = info.name || '';
              blueAthleteId = info.id;
              blueDrawNo = info.athlete_draw_num;
              blueUnit = info.unit || '';
            }
          }
        }
      } catch (e) {}

      try {
        if (bm.opponent2) {
          const opp2 = typeof bm.opponent2 === 'string' ? JSON.parse(bm.opponent2) : bm.opponent2;
          if (opp2 && opp2.id) {
            const info = participantMap.get(opp2.id);
            if (info) {
              redName = info.name || '';
              redAthleteId = info.id;
              redDrawNo = info.athlete_draw_num;
              redUnit = info.unit || '';
            }
          }
        }
      } catch (e) {}

      const bracketStatus = bm.status;
      let matchStatus, winner;
      if (bracketStatus === 4) {
        matchStatus = '已结束';
        if (blueName && !redName) {
          winner = '青方';
        } else if (redName && !blueName) {
          winner = '红方';
        } else {
          winner = '待定';
        }
      } else if (bracketStatus === 3) {
        matchStatus = '进行中';
        winner = '无';
      } else {
        matchStatus = '未开始';
        winner = '无';
      }

      const venueNo = venueVal;

      await insertKyougiMatch(db, {
        event_id: event_id ?? null,
        weight_class: weightClass,
        round: bm.round_number ?? 1,
        total_rounds: maxRoundNumber,
        venue_no: venueNo,
        kyougi_match_id: null,
        blue_athlete_id: blueAthleteId ?? null,
        blue_name: blueName,
        blue_unit: blueUnit,
        red_athlete_id: redAthleteId ?? null,
        red_name: redName,
        red_unit: redUnit,
        winner: winner,
        match_status: matchStatus,
        round_name: bm.round_name ?? '',
        bracket_match_id: bm.id
      });
    }

    if (isDivisional) {
      matchOrderInClass++;
      const finalRound = maxRoundNumber + 1;
      const venueNo = venueVal;
      await insertKyougiMatch(db, {
        event_id: event_id ?? null,
        weight_class: weightClass,
        round: finalRound,
        total_rounds: finalRound,
        venue_no: venueNo,
        kyougi_match_id: null,
        blue_name: '上区第一',
        blue_unit: '',
        red_name: '下区第一',
        red_unit: '',
        winner: '无',
        match_status: '未开始',
        round_name: '决赛'
      });
    }
  }

  async function reorderMatches(event_id) {
    const allMatchesRaw = await queryKyougiMatchs(db, { event_id });
    const allMatches = allMatchesRaw.map(toLegacyFormat);

    if (!allMatches || allMatches.length === 0) return;

    const schemeRows = await db.prepare(
      'SELECT weight_class, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?'
    ).all(event_id);

    const schemeMap = new Map();
    schemeRows.forEach(r => {
      if (r.weight_class) {
        schemeMap.set(r.weight_class, {
          category_venue: r.category_venue || '',
          category_date_num: r.category_date_num != null ? String(r.category_date_num) : '',
          category_order: r.category_order != null ? String(r.category_order) : ''
        });
      }
    });

    const drawNumRows = await db.prepare(
      'SELECT id, athlete_draw_num FROM athletes WHERE event_id = ?'
    ).all(event_id);
    const drawNumMap = new Map();
    drawNumRows.forEach(r => {
      if (r.athlete_draw_num != null) {
        drawNumMap.set(String(r.id), r.athlete_draw_num);
      }
    });

    function parseRoundDenominator(roundName) {
      if (!roundName) return 999;
      if (roundName === 'Final' || roundName === '决赛') return 1;
      const m = roundName.match(/1\/(\d+)/);
      if (m) return parseInt(m[1]);
      return 999;
    }

    function getMinDrawNum(match) {
      const blueDraw = drawNumMap.get(String(match.blue_athlete_id)) || 0;
      const redDraw = drawNumMap.get(String(match.red_athlete_id)) || 0;
      if (blueDraw && redDraw) return Math.min(blueDraw, redDraw);
      return blueDraw || redDraw || 0;
    }

    const firstRoundMap = new Map();
    for (const m of allMatches) {
      if (!firstRoundMap.has(m.weight_class) || m.round < firstRoundMap.get(m.weight_class)) {
        firstRoundMap.set(m.weight_class, m.round);
      }
    }

    const byeIds = new Set();
    const matches = allMatches.filter(m => {
      const firstRound = firstRoundMap.get(m.weight_class);
      if (m.round === firstRound) {
        const blue = (m.blue_name || '').trim();
        const red = (m.red_name || '').trim();
        if (!blue || !red) {
          byeIds.add(m.id);
          return false;
        }
      }
      return true;
    });

    matches.sort((a, b) => {
      const sa = schemeMap.get(a.weight_class) || { category_venue: '', category_date_num: '', category_order: '' };
      const sb = schemeMap.get(b.weight_class) || { category_venue: '', category_date_num: '', category_order: '' };

      const unitA = parseFloat(sa.category_date_num) || 0;
      const unitB = parseFloat(sb.category_date_num) || 0;
      if (unitA !== unitB) return unitA - unitB;

      const venueCmp = sa.category_venue.localeCompare(sb.category_venue);
      if (venueCmp !== 0) return venueCmp;

      const denomA = parseRoundDenominator(a.round_name);
      const denomB = parseRoundDenominator(b.round_name);
      if (denomA !== denomB) return denomB - denomA;

      const orderA = parseFloat(sa.category_order) || 0;
      const orderB = parseFloat(sb.category_order) || 0;
      if (orderA !== orderB) return orderA - orderB;

      const minDrawA = getMinDrawNum(a);
      const minDrawB = getMinDrawNum(b);
      if (minDrawA !== minDrawB) return minDrawA - minDrawB;

      return a.round - b.round;
    });

    const venueUnitMatchCounters = new Map();

    await db.run(
      `UPDATE taekwondo_kyougi_matchs SET kyougi_match_venue = NULL, kyougi_match_id = NULL WHERE event_id = ?`,
      [event_id]
    );

    for (const m of matches) {
      const sc = schemeMap.get(m.weight_class) || { category_venue: '', category_date_num: '1' };
      const venue = sc.category_venue;
      const unitNum = parseInt(sc.category_date_num) || 1;
      const key = `${venue}|${unitNum}`;
      if (!venueUnitMatchCounters.has(key)) {
        venueUnitMatchCounters.set(key, 0);
      }
      const cnt = venueUnitMatchCounters.get(key) + 1;
      venueUnitMatchCounters.set(key, cnt);
      const matchId = String(unitNum * 1000 + cnt);
      await db.run(
        `UPDATE taekwondo_kyougi_matchs SET kyougi_match_venue = ?, kyougi_match_id = ? WHERE id = ?`,
        [venue, matchId, m.id]
      );
    }

    for (const id of byeIds) {
      await clearKyougiMatchVenue(db, id);
    }

    const updatedMatchesRaw = await db.all(
      'SELECT * FROM taekwondo_kyougi_matchs WHERE event_id = ? AND kyougi_match_id IS NOT NULL',
      [event_id]
    );
    const updatedMatches = updatedMatchesRaw.map(toLegacyFormat);

    const classFirstRound = new Map();
    for (const m of updatedMatches) {
      if (!classFirstRound.has(m.weight_class) || m.round < classFirstRound.get(m.weight_class)) {
        classFirstRound.set(m.weight_class, m.round);
      }
    }

    const bracketMatchIdToDisplayLabel = new Map();
    for (const m of updatedMatches) {
      if (m.bracket_match_id && m.kyougi_match_id) {
        const displayLabel = (m.kyougi_match_venue || '') + String(m.kyougi_match_id);
        bracketMatchIdToDisplayLabel.set(m.bracket_match_id, displayLabel);
      }
    }

    const stageMapRows = await db.prepare('SELECT id AS stage_id, category_id AS class_name FROM bracket_stage WHERE event_id = ?').all(event_id);
    const stageIdToClassName = new Map();
    stageMapRows.forEach(r => stageIdToClassName.set(r.stage_id, r.class_name));

    const bmIdToRoundAndNum = new Map();
    const stageRoundNumToMatches = new Map();
    const allBracketMatches = await db.prepare(
      `SELECT bm.id, bm.number, bm.stage_id, br.number AS round_number
       FROM bracket_match bm
       LEFT JOIN bracket_round br ON bm.round_id = br.id`
    ).all();
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
      const firstRound = classFirstRound.get(m.weight_class) || 1;
      if (m.round <= firstRound) continue;

      let bluePrevWinner = m.blue_prev_winner || '';
      let redPrevWinner = m.red_prev_winner || '';

      if (!m.blue_name || !m.blue_name.trim()) {
        const prevBmId = findPrevBracketMatchId(m.bracket_match_id, 'blue');
        if (prevBmId) {
          const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
          if (prevLabel) {
            bluePrevWinner = prevLabel + '胜者';
          }
        }
      } else {
        bluePrevWinner = '';
      }

      if (!m.red_name || !m.red_name.trim()) {
        const prevBmId = findPrevBracketMatchId(m.bracket_match_id, 'red');
        if (prevBmId) {
          const prevLabel = bracketMatchIdToDisplayLabel.get(prevBmId);
          if (prevLabel) {
            redPrevWinner = prevLabel + '胜者';
          }
        }
      } else {
        redPrevWinner = '';
      }

      await updateKyougiMatchPrevWinners(db, m.id, bluePrevWinner, redPrevWinner);
    }
  }

  function calcRoundsDetail(count) {
    const rounds = {
      final: 1, half: 0, quarter: 0, eighth: 0,
      sixteenth: 0, thirtysecond: 0, sixtyfourth: 0,
      onetwentyeighth: 0, twofiftysixth: 0,
      gold: 1, silver: 1, bronze: 2, repechage: 0
    };

    if (count <= 1) return { ...rounds, total: 0 };
    if (count === 2) return { ...rounds, total: 1 };
    if (count <= 4) return { ...rounds, half: 1, total: 2 };
    if (count <= 8) return { ...rounds, half: 1, quarter: 2, eighth: count - 4, total: count - 1 };
    if (count <= 16) return { ...rounds, half: 1, quarter: 2, eighth: 4, sixteenth: count - 8, total: count - 1 };
    if (count <= 32) return { ...rounds, half: 1, quarter: 2, eighth: 4, sixteenth: 8, thirtysecond: count - 16, total: count - 1 };
    if (count <= 64) return { ...rounds, half: 1, quarter: 2, eighth: 4, sixteenth: 8, thirtysecond: 16, sixtyfourth: count - 32, total: count - 1 };
    if (count <= 128) return { ...rounds, half: 1, quarter: 2, eighth: 4, sixteenth: 8, thirtysecond: 16, sixtyfourth: 32, onetwentyeighth: count - 64, total: count - 1 };
    return { ...rounds, half: 1, quarter: 2, eighth: 4, sixteenth: 8, thirtysecond: 16, sixtyfourth: 32, onetwentyeighth: 64, twofiftysixth: count - 128, total: count - 1 };
  }

  function generateWrestlingEliminationMatches(weightClass, athletes, eventId) {
    const count = athletes.length;
    const targetSize = Math.pow(2, Math.ceil(Math.log2(count)));
    const totalRounds = Math.log2(targetSize);
    const matches = [];

    for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
      const roundNumber = roundIdx + 1;
      const matchesInRound = Math.pow(2, totalRounds - roundIdx - 1);
      const denom = Math.pow(2, totalRounds - roundIdx - 1);
      const roundName = denom === 1 ? '淘汰赛决赛' : `淘汰赛${roundNumber}`;

      for (let i = 0; i < matchesInRound; i++) {
        const blueIdx = i * 2;
        const redIdx = i * 2 + 1;

        let blueAthlete = null, redAthlete = null;
        if (roundIdx === 0) {
          if (blueIdx < count) blueAthlete = athletes[blueIdx];
          if (redIdx < count) redAthlete = athletes[redIdx];
        }

        matches.push({
          event_id: eventId,
          weight_class: weightClass,
          round: roundNumber,
          total_rounds: totalRounds,
          round_name: roundName,
          blue_athlete_id: blueAthlete ? blueAthlete.event_id : null,
          blue_athlete_no: blueAthlete ? blueAthlete.athlete_no : null,
          blue_name: blueAthlete ? blueAthlete.name : null,
          blue_unit: blueAthlete ? (blueAthlete.unit || blueAthlete.team || blueAthlete.origin_unit) : null,
          blue_draw_no: blueAthlete ? blueAthlete.draw_no : null,
          red_athlete_id: redAthlete ? redAthlete.event_id : null,
          red_athlete_no: redAthlete ? redAthlete.athlete_no : null,
          red_name: redAthlete ? redAthlete.name : null,
          red_unit: redAthlete ? (redAthlete.unit || redAthlete.team || redAthlete.origin_unit) : null,
          red_draw_no: redAthlete ? redAthlete.draw_no : null,
          venue: '',
          venue_no: matches.length,
          match_status: roundIdx === 0 ? '待开始' : '未开始'
        });
      }
    }

    return matches;
  }

  function generateWrestlingRoundRobinMatches(weightClass, athletes, eventId, method) {
    const count = athletes.length;
    if (count < 2) return [];

    const rrData = generateRoundRobinMatches(count, method === '5人循环赛-1' ? '5人循环赛-1' : '循环赛');
    const matches = [];

    for (let roundIdx = 0; roundIdx < rrData.length; roundIdx++) {
      const roundMatches = rrData[roundIdx];
      const roundNumber = roundIdx + 1;
      const roundName = `循环赛${roundNumber}`;

      for (const match of roundMatches) {
        const ath1 = athletes[match.seed1 - 1];
        const ath2 = athletes[match.seed2 - 1];

        matches.push({
          event_id: eventId,
          weight_class: weightClass,
          round: roundNumber,
          total_rounds: rrData.length,
          round_name: roundName,
          blue_athlete_id: ath1 ? ath1.id : null,
          blue_athlete_no: ath1 ? ath1.athlete_no : null,
          blue_name: ath1 ? ath1.name : null,
          blue_unit: ath1 ? (ath1.unit || ath1.team || ath1.origin_unit) : null,
          blue_draw_no: ath1 ? ath1.draw_no : null,
          red_athlete_id: ath2 ? ath2.id : null,
          red_athlete_no: ath2 ? ath2.athlete_no : null,
          red_name: ath2 ? ath2.name : null,
          red_unit: ath2 ? (ath2.unit || ath2.team || ath2.origin_unit) : null,
          red_draw_no: ath2 ? ath2.draw_no : null,
          venue: '',
          venue_no: matches.length,
          match_status: '待开始'
        });
      }
    }

    return matches;
  }

  function generateWrestlingDivisionalMatches(weightClass, athletes, eventId, method) {
    const count = athletes.length;
    if (count < 2) return [];

    const divisional = generateDivisionalRoundRobin(count, method);
    const { upperSize, lowerSize, upperMatches, lowerMatches, hasFinal } = divisional;
    const matches = [];

    for (let roundIdx = 0; roundIdx < upperMatches.length; roundIdx++) {
      const roundMatches = upperMatches[roundIdx];
      const roundNumber = roundIdx + 1;
      const roundName = `循环赛${roundNumber}`;

      for (const match of roundMatches) {
        const ath1 = athletes[match.seed1 - 1];
        const ath2 = athletes[match.seed2 - 1];

        matches.push({
          event_id: eventId,
          weight_class: weightClass,
          round: roundNumber,
          total_rounds: upperMatches.length + lowerMatches.length + (hasFinal ? 1 : 0),
          round_name: roundName,
          blue_athlete_id: ath1 ? ath1.id : null,
          blue_athlete_no: ath1 ? ath1.athlete_no : null,
          blue_name: ath1 ? ath1.name : null,
          blue_unit: ath1 ? (ath1.unit || ath1.team || ath1.origin_unit) : null,
          blue_draw_no: ath1 ? ath1.draw_no : null,
          red_athlete_id: ath2 ? ath2.id : null,
          red_athlete_no: ath2 ? ath2.athlete_no : null,
          red_name: ath2 ? ath2.name : null,
          red_unit: ath2 ? (ath2.unit || ath2.team || ath2.origin_unit) : null,
          red_draw_no: ath2 ? ath2.draw_no : null,
          venue: '',
          venue_no: matches.length,
          match_status: '待开始'
        });
      }
    }

    const upperRounds = upperMatches.length;
    for (let roundIdx = 0; roundIdx < lowerMatches.length; roundIdx++) {
      const roundMatches = lowerMatches[roundIdx];
      const roundNumber = upperRounds + roundIdx + 1;
      const roundName = `循环赛${roundNumber}`;

      for (const match of roundMatches) {
        const ath1 = athletes[upperSize + match.seed1 - 1];
        const ath2 = athletes[upperSize + match.seed2 - 1];

        matches.push({
          event_id: eventId,
          weight_class: weightClass,
          round: roundNumber,
          total_rounds: upperRounds + lowerMatches.length + (hasFinal ? 1 : 0),
          round_name: roundName,
          blue_athlete_id: ath1 ? ath1.id : null,
          blue_athlete_no: ath1 ? ath1.athlete_no : null,
          blue_name: ath1 ? ath1.name : null,
          blue_unit: ath1 ? (ath1.unit || ath1.team || ath1.origin_unit) : null,
          blue_draw_no: ath1 ? ath1.draw_no : null,
          red_athlete_id: ath2 ? ath2.id : null,
          red_athlete_no: ath2 ? ath2.athlete_no : null,
          red_name: ath2 ? ath2.name : null,
          red_unit: ath2 ? (ath2.unit || ath2.team || ath2.origin_unit) : null,
          red_draw_no: ath2 ? ath2.draw_no : null,
          venue: '',
          venue_no: matches.length,
          match_status: '待开始'
        });
      }
    }

    if (hasFinal) {
      matches.push({
        event_id: eventId,
        weight_class: weightClass,
        round: 999,
        total_rounds: upperRounds + lowerMatches.length + 1,
        round_name: '循环赛决赛',
        blue_athlete_id: null,
        blue_athlete_no: null,
        blue_name: null,
        blue_unit: null,
        blue_draw_no: null,
        red_athlete_id: null,
        red_athlete_no: null,
        red_name: null,
        red_unit: null,
        red_draw_no: null,
        venue: '',
        venue_no: matches.length,
        match_status: '未开始'
      });
    }

    return matches;
  }

  router.post('/stats/result-book', async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const customSections = req.body && req.body.custom_sections ? req.body.custom_sections : [];
      let rankScores = { 1: 9, 2: 7, 3: 5.5, 4: 4, 5: 2 };

      const workbook = new ExcelJS.Workbook();
      workbook.creator = '跆拳道编排系统';

      const eventName = await db.get('SELECT event_name FROM events LIMIT 1');
      const eventTitle = eventName ? eventName.name : '比赛';

      const matchesRaw = await getFinishedKyougiMatchs(db);
      const matches = matchesRaw.map(toLegacyFormat);
      const matchesByClass = {};
      for (const m of matches) {
        if (!matchesByClass[m.weight_class]) matchesByClass[m.weight_class] = [];
        matchesByClass[m.weight_class].push(m);
      }

      const units = await db.all('SELECT DISTINCT athlete_team FROM athletes');
      const unitScores = {};
      for (const u of units) {
        unitScores[u.unit] = { unit: u.unit, gold: 0, silver: 0, bronze: 0, fourth: 0, fifth: 0, total_score: 0, athlete_count: 0 };
      }
      const counts = await db.all('SELECT athlete_team as unit, COUNT(*) as count FROM athletes GROUP BY unit');
      for (const c of counts) {
        if (unitScores[c.unit]) unitScores[c.unit].athlete_count = c.count;
      }

      for (const wc in matchesByClass) {
        const classMatches = matchesByClass[wc];
        const totalRounds = classMatches[0] ? classMatches[0].total_rounds : 1;
        const finalMatch = classMatches.find(m => m.round === totalRounds);
        if (!finalMatch) continue;

        const goldUnit = finalMatch.winner === '青方' ? finalMatch.blue_unit : finalMatch.red_unit;
        if (goldUnit && unitScores[goldUnit]) unitScores[goldUnit].gold++;
        const silverUnit = finalMatch.winner === '青方' ? finalMatch.red_unit : finalMatch.blue_unit;
        if (silverUnit && unitScores[silverUnit]) unitScores[silverUnit].silver++;

        const semiMatches = classMatches.filter(m => m.round === totalRounds - 1);
        for (const semi of semiMatches) {
          const loserUnit = semi.winner === '青方' ? semi.red_unit : semi.blue_unit;
          if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].bronze++;
        }
        if (totalRounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.round === totalRounds - 2);
          for (const q of quarterMatches) {
            const loserUnit = q.winner === '青方' ? q.red_unit : q.blue_unit;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fourth++;
          }
        }
        if (totalRounds >= 4) {
          const eighthMatches = classMatches.filter(m => m.round === totalRounds - 3);
          for (const e of eighthMatches) {
            const loserUnit = e.winner === '青方' ? e.red_unit : e.blue_unit;
            if (loserUnit && unitScores[loserUnit]) unitScores[loserUnit].fifth++;
          }
        }
      }

      for (const unit in unitScores) {
        const s = unitScores[unit];
        s.total_score = s.gold * (rankScores[1] || 0) + s.silver * (rankScores[2] || 0) + s.bronze * (rankScores[3] || 0) + s.fourth * (rankScores[4] || 0) + s.fifth * (rankScores[5] || 0);
      }

      const sortedUnits = Object.values(unitScores).sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      const titleFont = { name: '宋体', size: 16, bold: true };
      const subtitleFont = { name: '宋体', size: 14, bold: true };
      const headerFont = { name: '宋体', size: 11, bold: true };
      const dataFont = { name: '宋体', size: 11 };
      const centerAlign = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const leftAlign = { vertical: 'middle', horizontal: 'left', wrapText: true };
      const thinBorder = { style: 'thin', color: { argb: 'FF000000' } };
      const borderAll = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      const goldFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
      const silverFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } };
      const bronzeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };

      const ws1 = workbook.addWorksheet('团体总分', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });
      ws1.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
      ws1.pageSetup.horizontalCentered = true;
      ws1.pageSetup.verticalCentered = true;

      [8, 8, 10, 8, 8, 8, 8, 10].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

      ws1.getRow(1).height = 30;
      ws1.getCell(1, 1).value = eventTitle + ' 团体总分';
      ws1.getCell(1, 1).font = titleFont;
      ws1.getCell(1, 1).alignment = centerAlign;
      ws1.mergeCells(1, 1, 1, 8);

      ws1.getRow(2).height = 8;

      const rankLabels = ['第一名', '第二名', '第三名', '第四名', '第五名', '第六名', '第七名', '第八名'];
      const rankFills = [goldFill, silverFill, bronzeFill, null, null, null, null, null];

      for (let i = 0; i < Math.min(sortedUnits.length, 8); i++) {
        const rowIdx = 3 + i;
        const row = ws1.getRow(rowIdx);
        row.height = 24;
        ws1.mergeCells(rowIdx, 1, rowIdx, 2);
        ws1.getCell(rowIdx, 1).value = rankLabels[i];
        ws1.getCell(rowIdx, 1).font = headerFont;
        ws1.getCell(rowIdx, 1).alignment = centerAlign;
        ws1.getCell(rowIdx, 1).border = borderAll;
        ws1.getCell(rowIdx, 2).border = borderAll;
        if (rankFills[i]) ws1.getCell(rowIdx, 1).fill = rankFills[i];

        ws1.mergeCells(rowIdx, 3, rowIdx, 5);
        ws1.getCell(rowIdx, 3).value = sortedUnits[i].unit;
        ws1.getCell(rowIdx, 3).font = dataFont;
        ws1.getCell(rowIdx, 3).alignment = centerAlign;
        ws1.getCell(rowIdx, 3).border = borderAll;
        ws1.getCell(rowIdx, 4).border = borderAll;
        ws1.getCell(rowIdx, 5).border = borderAll;

        ws1.mergeCells(rowIdx, 6, rowIdx, 7);
        ws1.getCell(rowIdx, 6).value = sortedUnits[i].total_score + '分';
        ws1.getCell(rowIdx, 6).font = headerFont;
        ws1.getCell(rowIdx, 6).alignment = centerAlign;
        ws1.getCell(rowIdx, 6).border = borderAll;
        ws1.getCell(rowIdx, 7).border = borderAll;
      }

      if (customSections && customSections.length > 0) {
        let csRow = 3 + Math.min(sortedUnits.length, 8) + 2;
        for (const section of customSections) {
          ws1.getRow(csRow).height = 8;
          csRow++;
          ws1.getRow(csRow).height = 24;
          ws1.getCell(csRow, 1).value = section.title;
          ws1.getCell(csRow, 1).font = subtitleFont;
          ws1.getCell(csRow, 1).alignment = centerAlign;
          ws1.mergeCells(csRow, 1, csRow, 8);
          csRow++;

          if (section.type === 'grid') {
            for (const rowItems of section.items) {
              ws1.getRow(csRow).height = 20;
              const colsPerRow = 4;
              const colSpan = Math.floor(8 / colsPerRow);
              for (let ci = 0; ci < colsPerRow; ci++) {
                const startCol = ci * colSpan + 1;
                const endCol = startCol + colSpan - 1;
                ws1.mergeCells(csRow, startCol, csRow, endCol);
                const cell = ws1.getCell(csRow, startCol);
                cell.value = rowItems[ci] || '';
                cell.font = dataFont;
                cell.alignment = centerAlign;
                cell.border = borderAll;
                for (let bc = startCol + 1; bc <= endCol; bc++) ws1.getCell(csRow, bc).border = borderAll;
              }
              csRow++;
            }
          } else if (section.type === 'pair') {
            for (const rowPairs of section.items) {
              ws1.getRow(csRow).height = 20;
              const pairsPerRow = rowPairs.length;
              const totalPairs = pairsPerRow;
              const nameWidth = 2;
              const unitWidth = 2;
              let col = 1;
              for (let pi = 0; pi < totalPairs; pi++) {
                const pair = rowPairs[pi];
                ws1.mergeCells(csRow, col, csRow, col + nameWidth - 1);
                const nameCell = ws1.getCell(csRow, col);
                nameCell.value = pair.name || '';
                nameCell.font = dataFont;
                nameCell.alignment = centerAlign;
                nameCell.border = borderAll;
                for (let bc = col + 1; bc <= col + nameWidth - 1; bc++) ws1.getCell(csRow, bc).border = borderAll;
                col += nameWidth;

                ws1.mergeCells(csRow, col, csRow, col + unitWidth - 1);
                const unitCell = ws1.getCell(csRow, col);
                unitCell.value = pair.unit || '';
                unitCell.font = dataFont;
                unitCell.alignment = centerAlign;
                unitCell.border = borderAll;
                for (let bc = col + 1; bc <= col + unitWidth - 1; bc++) ws1.getCell(csRow, bc).border = borderAll;
                col += unitWidth;
              }
              csRow++;
            }
          }
        }
      }

      const ws1b = workbook.addWorksheet('团体总分明细', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });
      ws1b.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
      ws1b.pageSetup.horizontalCentered = true;
      ws1b.pageSetup.verticalCentered = true;
      [8, 14, 8, 8, 8, 8, 8, 10].forEach((w, i) => { ws1b.getColumn(i + 1).width = w; });

      ws1b.getRow(1).height = 30;
      ws1b.getCell(1, 1).value = eventTitle + ' 团体总分明细';
      ws1b.getCell(1, 1).font = titleFont;
      ws1b.getCell(1, 1).alignment = centerAlign;
      ws1b.mergeCells(1, 1, 1, 8);

      const detailHeaders = ['排名', '单位', '金牌', '银牌', '铜牌', '第四名', '第五名', '总分'];
      ws1b.getRow(2).height = 22;
      for (let c = 0; c < detailHeaders.length; c++) {
        const cell = ws1b.getCell(2, c + 1);
        cell.value = detailHeaders[c];
        cell.font = headerFont;
        cell.alignment = centerAlign;
        cell.fill = headerFill;
        cell.border = borderAll;
      }

      sortedUnits.forEach((item, index) => {
        const r = 3 + index;
        const row = ws1b.getRow(r);
        row.height = 20;
        const vals = [index + 1, item.unit, item.gold, item.silver, item.bronze, item.fourth, item.fifth, item.total_score];
        for (let c = 0; c < vals.length; c++) {
          const cell = ws1b.getCell(r, c + 1);
          cell.value = vals[c];
          cell.font = dataFont;
          cell.alignment = centerAlign;
          cell.border = borderAll;
        }
      });

      const ws2 = workbook.addWorksheet('竞技成绩册', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });
      ws2.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
      ws2.pageSetup.horizontalCentered = true;
      ws2.pageSetup.verticalCentered = true;

      [5, 14, 9, 9, 9, 9, 9, 9, 9, 9].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

      ws2.getRow(1).height = 30;
      ws2.getCell(1, 1).value = eventTitle;
      ws2.getCell(1, 1).font = titleFont;
      ws2.getCell(1, 1).alignment = centerAlign;
      ws2.mergeCells(1, 1, 1, 10);

      ws2.getRow(2).height = 26;
      ws2.getCell(2, 1).value = '竞技成绩册';
      ws2.getCell(2, 1).font = subtitleFont;
      ws2.getCell(2, 1).alignment = centerAlign;
      ws2.mergeCells(2, 1, 2, 10);

      ws2.getRow(3).height = 22;
      ws2.mergeCells(3, 1, 4, 1);
      ws2.getCell(3, 1).value = '序';
      ws2.getCell(3, 1).font = headerFont;
      ws2.getCell(3, 1).alignment = centerAlign;
      ws2.getCell(3, 1).fill = headerFill;
      ws2.getCell(3, 1).border = borderAll;
      ws2.getCell(4, 1).border = borderAll;

      ws2.mergeCells(3, 2, 4, 2);
      ws2.getCell(3, 2).value = '级别';
      ws2.getCell(3, 2).font = headerFont;
      ws2.getCell(3, 2).alignment = centerAlign;
      ws2.getCell(3, 2).fill = headerFill;
      ws2.getCell(3, 2).border = borderAll;
      ws2.getCell(4, 2).border = borderAll;

      ws2.mergeCells(3, 3, 3, 10);
      ws2.getCell(3, 3).value = '名次';
      ws2.getCell(3, 3).font = headerFont;
      ws2.getCell(3, 3).alignment = centerAlign;
      ws2.getCell(3, 3).fill = headerFill;
      ws2.getCell(3, 3).border = borderAll;
      for (let c = 4; c <= 10; c++) ws2.getCell(3, c).border = borderAll;

      const rankHeaders = ['第1名', '第2名', '第3名', '', '第5名', '', '', ''];
      ws2.getRow(4).height = 20;
      ws2.getCell(4, 3).value = '第1名';
      ws2.getCell(4, 4).value = '第2名';
      ws2.getCell(4, 5).value = '第3名';
      ws2.getCell(4, 6).value = '第3名';
      ws2.getCell(4, 7).value = '第5名';
      ws2.getCell(4, 8).value = '第5名';
      ws2.getCell(4, 9).value = '第5名';
      ws2.getCell(4, 10).value = '第5名';

      for (let c = 3; c <= 10; c++) {
        ws2.getCell(4, c).font = headerFont;
        ws2.getCell(4, c).alignment = centerAlign;
        ws2.getCell(4, c).fill = headerFill;
        ws2.getCell(4, c).border = borderAll;
      }

      let currentRow = 5;
      const sortedClasses = Object.keys(matchesByClass).sort();

      for (let idx = 0; idx < sortedClasses.length; idx++) {
        const wc = sortedClasses[idx];
        const classMatches = matchesByClass[wc];
        const totalRounds = classMatches[0] ? classMatches[0].total_rounds : 1;
        const finalMatch = classMatches.find(m => m.round === totalRounds);
        if (!finalMatch) continue;

        const goldName = finalMatch.winner === '青方' ? finalMatch.blue_name : finalMatch.red_name;
        const goldUnit = finalMatch.winner === '青方' ? finalMatch.blue_unit : finalMatch.red_unit;
        const silverName = finalMatch.winner === '青方' ? finalMatch.red_name : finalMatch.blue_name;
        const silverUnit = finalMatch.winner === '青方' ? finalMatch.red_unit : finalMatch.blue_unit;

        const semiMatches = classMatches.filter(m => m.round === totalRounds - 1);
        const bronzeNames = semiMatches.map(m => m.winner === '青方' ? m.red_name : m.blue_name);
        const bronzeUnits = semiMatches.map(m => m.winner === '青方' ? m.red_unit : m.blue_unit);

        let fifthNames = [], fifthUnits = [];
        if (totalRounds >= 3) {
          const quarterMatches = classMatches.filter(m => m.round === totalRounds - 2);
          fifthNames = quarterMatches.map(m => m.winner === '青方' ? m.red_name : m.blue_name);
          fifthUnits = quarterMatches.map(m => m.winner === '青方' ? m.red_unit : m.blue_unit);
        }

        ws2.mergeCells(currentRow, 1, currentRow + 1, 1);
        ws2.getCell(currentRow, 1).value = idx + 1;
        ws2.getCell(currentRow, 1).font = dataFont;
        ws2.getCell(currentRow, 1).alignment = centerAlign;
        ws2.getCell(currentRow, 1).border = borderAll;
        ws2.getCell(currentRow + 1, 1).border = borderAll;

        ws2.mergeCells(currentRow, 2, currentRow + 1, 2);
        ws2.getCell(currentRow, 2).value = wc;
        ws2.getCell(currentRow, 2).font = dataFont;
        ws2.getCell(currentRow, 2).alignment = centerAlign;
        ws2.getCell(currentRow, 2).border = borderAll;
        ws2.getCell(currentRow + 1, 2).border = borderAll;

        const nameRow = currentRow;
        const unitRow = currentRow + 1;
        ws2.getRow(nameRow).height = 20;
        ws2.getRow(unitRow).height = 20;

        ws2.getCell(nameRow, 3).value = goldName || '';
        ws2.getCell(nameRow, 3).font = dataFont;
        ws2.getCell(nameRow, 3).alignment = centerAlign;
        ws2.getCell(nameRow, 3).border = borderAll;
        ws2.getCell(unitRow, 3).value = goldUnit || '';
        ws2.getCell(unitRow, 3).font = dataFont;
        ws2.getCell(unitRow, 3).alignment = centerAlign;
        ws2.getCell(unitRow, 3).border = borderAll;

        ws2.getCell(nameRow, 4).value = silverName || '';
        ws2.getCell(nameRow, 4).font = dataFont;
        ws2.getCell(nameRow, 4).alignment = centerAlign;
        ws2.getCell(nameRow, 4).border = borderAll;
        ws2.getCell(unitRow, 4).value = silverUnit || '';
        ws2.getCell(unitRow, 4).font = dataFont;
        ws2.getCell(unitRow, 4).alignment = centerAlign;
        ws2.getCell(unitRow, 4).border = borderAll;

        ws2.getCell(nameRow, 5).value = bronzeNames[0] || '';
        ws2.getCell(nameRow, 5).font = dataFont;
        ws2.getCell(nameRow, 5).alignment = centerAlign;
        ws2.getCell(nameRow, 5).border = borderAll;
        ws2.getCell(unitRow, 5).value = bronzeUnits[0] || '';
        ws2.getCell(unitRow, 5).font = dataFont;
        ws2.getCell(unitRow, 5).alignment = centerAlign;
        ws2.getCell(unitRow, 5).border = borderAll;

        ws2.getCell(nameRow, 6).value = bronzeNames[1] || '';
        ws2.getCell(nameRow, 6).font = dataFont;
        ws2.getCell(nameRow, 6).alignment = centerAlign;
        ws2.getCell(nameRow, 6).border = borderAll;
        ws2.getCell(unitRow, 6).value = bronzeUnits[1] || '';
        ws2.getCell(unitRow, 6).font = dataFont;
        ws2.getCell(unitRow, 6).alignment = centerAlign;
        ws2.getCell(unitRow, 6).border = borderAll;

        for (let fi = 0; fi < 4; fi++) {
          const col = 7 + fi;
          ws2.getCell(nameRow, col).value = fifthNames[fi] || '';
          ws2.getCell(nameRow, col).font = dataFont;
          ws2.getCell(nameRow, col).alignment = centerAlign;
          ws2.getCell(nameRow, col).border = borderAll;
          ws2.getCell(unitRow, col).value = fifthUnits[fi] || '';
          ws2.getCell(unitRow, col).font = dataFont;
          ws2.getCell(unitRow, col).alignment = centerAlign;
          ws2.getCell(unitRow, col).border = borderAll;
        }

        currentRow += 2;
      }

      const ws3 = workbook.addWorksheet('品势成绩册', {
        properties: { defaultRowHeight: 18 },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0
        }
      });
      ws3.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
      ws3.pageSetup.horizontalCentered = true;
      ws3.pageSetup.verticalCentered = true;

      [5, 14, 9, 9, 9, 9, 9, 9, 9, 9].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

      ws3.getRow(1).height = 30;
      ws3.getCell(1, 1).value = eventTitle;
      ws3.getCell(1, 1).font = titleFont;
      ws3.getCell(1, 1).alignment = centerAlign;
      ws3.mergeCells(1, 1, 1, 10);

      ws3.getRow(2).height = 26;
      ws3.getCell(2, 1).value = '品势成绩册';
      ws3.getCell(2, 1).font = subtitleFont;
      ws3.getCell(2, 1).alignment = centerAlign;
      ws3.mergeCells(2, 1, 2, 10);

      ws3.getRow(3).height = 22;
      ws3.mergeCells(3, 1, 4, 1);
      ws3.getCell(3, 1).value = '序';
      ws3.getCell(3, 1).font = headerFont;
      ws3.getCell(3, 1).alignment = centerAlign;
      ws3.getCell(3, 1).fill = headerFill;
      ws3.getCell(3, 1).border = borderAll;
      ws3.getCell(4, 1).border = borderAll;

      ws3.mergeCells(3, 2, 4, 2);
      ws3.getCell(3, 2).value = '级别';
      ws3.getCell(3, 2).font = headerFont;
      ws3.getCell(3, 2).alignment = centerAlign;
      ws3.getCell(3, 2).fill = headerFill;
      ws3.getCell(3, 2).border = borderAll;
      ws3.getCell(4, 2).border = borderAll;

      ws3.mergeCells(3, 3, 3, 10);
      ws3.getCell(3, 3).value = '名次';
      ws3.getCell(3, 3).font = headerFont;
      ws3.getCell(3, 3).alignment = centerAlign;
      ws3.getCell(3, 3).fill = headerFill;
      ws3.getCell(3, 3).border = borderAll;
      for (let c = 4; c <= 10; c++) ws3.getCell(3, c).border = borderAll;

      ws3.getRow(4).height = 20;
      const poomsaeRankHeaders = ['第1名', '第2名', '第3名', '第4名', '第5名', '第6名', '第7名', '第8名'];
      for (let c = 0; c < poomsaeRankHeaders.length; c++) {
        ws3.getCell(4, 3 + c).value = poomsaeRankHeaders[c];
        ws3.getCell(4, 3 + c).font = headerFont;
        ws3.getCell(4, 3 + c).alignment = centerAlign;
        ws3.getCell(4, 3 + c).fill = headerFill;
        ws3.getCell(4, 3 + c).border = borderAll;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(eventTitle + '总成绩册.xlsx')}`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('导出总成绩册错误:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-scores/:matchId', async (req, res) => {
    try {
      const { matchId } = req.params;
      const rows = await db.prepare('SELECT * FROM poomsae_scores WHERE match_id = ? ORDER BY judge_no').all(matchId);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-scores/:matchId', async (req, res) => {
    try {
      const { matchId } = req.params;
      const { scores, judge_count } = req.body;
      if (!scores || !Array.isArray(scores)) return res.status(400).json({ success: false, error: '缺少评分数据' });

      const upsert = db.prepare(`
        INSERT INTO poomsae_scores (match_id, judge_no, accuracy, presentation, total)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          accuracy = VALUES(accuracy),
          presentation = VALUES(presentation),
          total = VALUES(total),
          updated_at = CURRENT_TIMESTAMP
      `);

      {
        for (const s of scores) {
          const total = (parseFloat(s.accuracy) || 0) + (parseFloat(s.presentation) || 0);
          await upsert.run(matchId, s.judge_no, s.accuracy, s.presentation, total);
        }
      }

      const allRows = await db.prepare('SELECT accuracy, presentation, total FROM poomsae_scores WHERE match_id = ? ORDER BY judge_no').all(matchId);
      const allAcc = allRows.map(r => r.accuracy);
      const allPres = allRows.map(r => r.presentation);
      const allTotals = allRows.map(r => r.total);

      function trimAvg(arr, jc) {
        if (arr.length === 0) return 0;
        if (jc <= 3 || arr.length <= 3) {
          return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
        }
        const sorted = [...arr].sort((a, b) => a - b);
        const trim = Math.floor((jc - 3) / 2);
        const middle = sorted.slice(trim, sorted.length - trim);
        return Math.round((middle.reduce((a, b) => a + b, 0) / middle.length) * 100) / 100;
      }

      const jc = judge_count || allRows.length;
      const accAvg = trimAvg(allAcc, jc);
      const presAvg = trimAvg(allPres, jc);
      const finalScore = trimAvg(allTotals, jc);

      await db.prepare('UPDATE poomsae_match_schedule SET final_score = ?, accuracy_avg = ?, presentation_avg = ?, status = \'done\', updated_at = NOW() WHERE id = ?').run(finalScore, accAvg, presAvg, matchId);

      const finishedMatch = await db.prepare('SELECT * FROM poomsae_match_schedule WHERE id = ?').get(matchId);
      if (finishedMatch && finishedMatch.round) {
        const classKey = [finishedMatch.poomsae_type, finishedMatch.gender, finishedMatch.group_class, finishedMatch.weight_class].join('|');
        const currentRound = finishedMatch.round;

        const pendingCount = await db.prepare(
          'SELECT COUNT(*) as cnt FROM poomsae_match_schedule WHERE event_id = ? AND poomsae_type = ? AND gender = ? AND group_class = ? AND weight_class = ? AND round = ? AND status != ?'
        ).get(finishedMatch.event_id, finishedMatch.poomsae_type, finishedMatch.gender, finishedMatch.group_class, finishedMatch.weight_class, currentRound, 'done').cnt;

        if (pendingCount === 0) {
          const nextRound = currentRound + 1;
          const nextEntries = await db.prepare(
            'SELECT * FROM poomsae_match_schedule WHERE event_id = ? AND poomsae_type = ? AND gender = ? AND group_class = ? AND weight_class = ? AND round = ? AND advance_rank IS NOT NULL'
          ).all(finishedMatch.event_id, finishedMatch.poomsae_type, finishedMatch.gender, finishedMatch.group_class, finishedMatch.weight_class, nextRound);

          if (nextEntries.length > 0) {
            const currentRoundMatches = await db.prepare(
              'SELECT * FROM poomsae_match_schedule WHERE event_id = ? AND poomsae_type = ? AND gender = ? AND group_class = ? AND weight_class = ? AND round = ? AND status = ?'
            ).all(finishedMatch.event_id, finishedMatch.poomsae_type, finishedMatch.gender, finishedMatch.group_class, finishedMatch.weight_class, currentRound, 'done');

            const athleteScores = new Map();
            currentRoundMatches.forEach(m => {
              if (!athleteScores.has(m.athlete_id)) {
                athleteScores.set(m.athlete_id, { match: m, totalScore: 0 });
              }
              athleteScores.get(m.athlete_id).totalScore += (m.final_score || 0);
            });

            const rankedAthletes = Array.from(athleteScores.values())
              .sort((a, b) => b.totalScore - a.totalScore);

            const athletes = await db.prepare('SELECT * FROM athletes WHERE event_id = ? AND athlete_type = ?').all(finishedMatch.event_id, 'poomsae');
            const athleteMap = {};
            athletes.forEach(a => { athleteMap[a.id] = a; });

            const nextRoundInfo = nextEntries[0];
            const fmt = nextRoundInfo.format;
            const FORMAT_ROUNDS_LOCAL = {
              'final_1':              [{ round: 1, label: '决赛', slots: [1] }],
              'final_2':              [{ round: 1, label: '决赛', slots: [1, 2] }],
              'prelim_final_1':       [{ round: 1, label: '预赛', slots: [1] }, { round: 2, label: '决赛', slots: [2] }],
              'prelim_final_2':       [{ round: 1, label: '预赛', slots: [1, 2] }, { round: 2, label: '决赛', slots: [3, 4] }],
              'prelim_semi_final_1':  [{ round: 1, label: '预赛', slots: [1] }, { round: 2, label: '复赛', slots: [2] }, { round: 3, label: '决赛', slots: [3] }],
              'prelim_semi_final_2':  [{ round: 1, label: '预赛', slots: [1, 2] }, { round: 2, label: '复赛', slots: [3, 4] }, { round: 3, label: '决赛', slots: [5, 6] }]
            };
            const roundDef = (FORMAT_ROUNDS_LOCAL[fmt] || []).find(r => r.round === nextRound);

            const updateStmt = db.prepare(
              'UPDATE poomsae_match_schedule SET athlete_id = ?, athlete_name = ?, athlete_unit = ?, routine = ? WHERE id = ?'
            );

            const rankAthleteMap = new Map();
            rankedAthletes.forEach((entry, idx) => {
              rankAthleteMap.set(idx + 1, entry.match.athlete_id);
            });

            for (const entry of nextEntries) {
              const rank = entry.advance_rank;
              const aid = rankAthleteMap.get(rank);
              if (aid) {
                const athlete = athleteMap[aid] || {};
                let routine = '';
                if (roundDef && roundDef.slots) {
                  routine = roundDef.slots.map(s => athlete[`format_slot_${s}`] || '').filter(r => r.trim()).join('、');
                }
                await updateStmt.run(aid, athlete.name || '', athlete.unit || '', routine, entry.id);
              }
            }
          }
        }
      }

      res.json({ success: true, data: { final_score: finalScore, accuracy_avg: accAvg, presentation_avg: presAvg } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/config', async (req, res) => {
    try {
      const { event_id } = req.query;
      let sql = 'SELECT * FROM events_config';
      const params = [];
      if (event_id) {
        sql += ' WHERE event_id = ?';
        params.push(event_id);
      } else {
        sql += ' LIMIT 1';
      }
      const config = await db.get(sql, params);

      if (!config) {
        return res.json({ success: true, data: {
          weighin_tolerance: 0.30,
          eventconfig_max_limit_tolerance: 6,
          eventconfig_min_limit_tolerance: 5,
          venue_count: 1,
          date_count: 1
        }});
      }

      res.json({ success: true, data: {
        weighin_tolerance: config.eventconfig_weighing_tolerance || 0.30,
        eventconfig_win_methods: config.eventconfig_win_methods || null,
        eventconfig_default_rounds: config.eventconfig_default_rounds || 3,
        eventconfig_break_duration: config.eventconfig_break_duration || 60,
        eventconfig_max_limit_tolerance: config.eventconfig_max_limit_tolerance || 6,
        eventconfig_min_limit_tolerance: config.eventconfig_min_limit_tolerance || 5,
        venue_count: config.eventconfig_venue_count || 1,
        date_count: config.eventconfig_date_count || 1
      }});
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/config', async (req, res) => {
    try {
      const { event_id, weighin_tolerance, eventconfig_win_methods, eventconfig_default_rounds, eventconfig_break_duration, eventconfig_max_limit_tolerance, eventconfig_min_limit_tolerance, venue_count, date_count } = req.body;

      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少赛事ID' });
      }

      const existing = await db.get('SELECT id FROM events_config WHERE event_id = ?', [event_id]);

      const params = [
        weighin_tolerance !== undefined ? weighin_tolerance : null,
        eventconfig_win_methods !== undefined ? eventconfig_win_methods : null,
        eventconfig_default_rounds !== undefined ? eventconfig_default_rounds : null,
        eventconfig_break_duration !== undefined ? eventconfig_break_duration : null,
        eventconfig_max_limit_tolerance !== undefined ? eventconfig_max_limit_tolerance : null,
        eventconfig_min_limit_tolerance !== undefined ? eventconfig_min_limit_tolerance : null,
        venue_count !== undefined ? parseInt(venue_count) : 1,
        date_count !== undefined ? parseInt(date_count) : 1,
        event_id
      ];

      if (existing) {
        await db.run(
          'UPDATE events_config SET eventconfig_weighing_tolerance = ?, eventconfig_win_methods = ?, eventconfig_default_rounds = ?, eventconfig_break_duration = ?, eventconfig_max_limit_tolerance = ?, eventconfig_min_limit_tolerance = ?, eventconfig_venue_count = ?, eventconfig_date_count = ? WHERE event_id = ?',
          params
        );
      } else {
        await db.run(
          'INSERT INTO events_config (event_id, eventconfig_weighing_tolerance, eventconfig_win_methods, eventconfig_default_rounds, eventconfig_break_duration, eventconfig_max_limit_tolerance, eventconfig_min_limit_tolerance, eventconfig_venue_count, eventconfig_date_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [event_id, ...params.slice(0, 8)]
        );
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== 自动编排方案API（使用category_mode表） ====================

  router.get('/auto-arrange/scheme', async (req, res) => {
    try {
      const { event_id } = req.query;
      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }

      const schemeRows = await db.prepare(
        'SELECT weight_class, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?'
      ).all(Number(event_id));

      const schemeData = {};
      schemeRows.forEach(row => {
        if (row.weight_class) {
          schemeData[row.weight_class] = {
            category_venue: row.category_venue || '',
            category_date_num: row.category_date_num != null ? String(row.category_date_num) : '',
            category_order: row.category_order != null ? String(row.category_order) : ''
          };
        }
      });

      res.json({ success: true, data: schemeData });
    } catch (err) {
      console.error('获取编排方案失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/auto-arrange/save', async (req, res) => {
    try {
      const { event_id, data } = req.body;
      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }

      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, error: '缺少data参数或格式错误' });
      }

      for (const item of data) {
        if (!item.weight_class) continue;

        const venueVal = (item.category_venue && item.category_venue.trim() !== '') ? item.category_venue : null;
        const unitVal = (item.category_date_num && item.category_date_num.trim() !== '' && parseInt(item.category_date_num) > 0) ? parseInt(item.category_date_num) : null;
        const orderVal = (item.category_order && item.category_order.trim() !== '' && parseInt(item.category_order) > 0) ? parseInt(item.category_order) : null;

        const existing = await db.prepare(
          'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?'
        ).get(Number(event_id), item.weight_class);

        if (existing) {
          await db.prepare(
            `UPDATE category_mode SET
             category_venue = ?,
             category_date_num = ?,
             category_order = ?,
             updated_at = CURRENT_TIMESTAMP
             WHERE category_id = ?`
          ).run(
            venueVal,
            unitVal,
            orderVal,
            existing.category_id
          );
        } else {
          await db.prepare(
            `INSERT INTO category_mode
             (event_id, weight_class, category_venue, category_date_num, category_order)
             VALUES (?, ?, ?, ?, ?)`
          ).run(
            Number(event_id),
            item.weight_class,
            venueVal,
            unitVal,
            orderVal
          );
        }

        if (!venueVal || !unitVal) {
          await db.prepare(
            `DELETE FROM taekwondo_kyougi_matchs WHERE event_id = ? AND kyougi_match_categroy = ? AND kyougi_bracket_match_id IS NULL`
          ).run(Number(event_id), item.weight_class);
        }
      }

      res.json({ success: true, message: `成功保存 ${data.length} 条编排数据` });
    } catch (err) {
      console.error('保存编排方案失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/auto-arrange', async (req, res) => {
    try {
      const { event_id, weight_class, category_venue, category_date_num, category_order } = req.body;

      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }

      if (weight_class && (category_venue !== undefined || category_date_num !== undefined || category_order !== undefined)) {
        const venueVal = (category_venue && String(category_venue).trim() !== '') ? String(category_venue).trim() : null;
        const unitVal = (category_date_num && String(category_date_num).trim() !== '' && parseInt(category_date_num) > 0) ? parseInt(category_date_num) : null;
        const orderVal = (category_order && String(category_order).trim() !== '' && parseInt(category_order) > 0) ? parseInt(category_order) : null;

        const existing = await db.prepare(
          'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?'
        ).get(Number(event_id), weight_class);

        if (existing) {
          await db.prepare(
            `UPDATE category_mode SET category_venue = ?, category_date_num = ?, category_order = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?`
          ).run(venueVal, unitVal, orderVal, existing.category_id);
        } else {
          await db.prepare(
            `INSERT INTO category_mode (event_id, weight_class, category_venue, category_date_num, category_order) VALUES (?, ?, ?, ?, ?)`
          ).run(Number(event_id), weight_class, venueVal, unitVal, orderVal);
        }

        return res.json({ success: true });
      }

      const athletes = await db.all(
        'SELECT * FROM athletes WHERE event_id = ? AND athlete_type = ? ORDER BY athlete_category, athlete_gender, athlete_age_group',
        [event_id, 'taekwondo_kyougi']
      );

      if (!athletes || athletes.length === 0) {
        return res.json({ success: false, error: '没有找到运动员数据' });
      }

      const classMap = new Map();
      athletes.forEach(a => {
        const wc = a.athlete_category || '未分级';
        if (!classMap.has(wc)) {
          classMap.set(wc, []);
        }
        classMap.get(wc).push(a);
      });

      const configRow = await db.get(
        'SELECT eventconfig_venue_count, eventconfig_date_count FROM events_config WHERE event_id = ?',
        [Number(event_id)]
      );
      const venueCount = configRow?.eventconfig_venue_count || 1;
      const dateCount = configRow?.eventconfig_date_count || 1;

      const sortedClasses = Array.from(classMap.entries()).sort((a, b) => {
        if (a[1][0].athlete_gender !== b[1][0].athlete_gender) {
          return (a[1][0].athlete_gender === '男' ? -1 : 1);
        }
        const groupOrder = { '小学': 1, '初中': 2, '高中': 3, '大学': 4, '成年': 5 };
        const ga = groupOrder[a[1][0].athlete_age_group] || 99;
        const gb = groupOrder[b[1][0].athlete_age_group] || 99;
        if (ga !== gb) return ga - gb;
        return a[0].localeCompare(b[0], 'zh-CN');
      });

      const venueUnits = [];
      for (let v = 0; v < venueCount; v++) {
        const letter = String.fromCharCode(65 + v);
        for (let u = 1; u <= dateCount; u++) {
          venueUnits.push({ venue: letter, unit: u });
        }
      }

      let assigned = 0;
      let skipped = 0;
      const results = [];
      const errors = [];
      let unitIdx = 0;

      for (const [wc, classAthletes] of sortedClasses) {
        if (classAthletes.length < 2) {
          errors.push(`${wc}: 运动员不足2人，跳过`);
          skipped++;
          continue;
        }

        const existingScheme = await db.prepare(
          'SELECT category_id, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ? AND weight_class = ?'
        ).get(Number(event_id), wc);

        if (existingScheme && existingScheme.category_venue && existingScheme.category_date_num) {
          assigned++;
          results.push(`${wc}: ${classAthletes.length}人，已分配场地${existingScheme.category_venue}单元${existingScheme.category_date_num}`);
          continue;
        }

        const target = venueUnits[unitIdx % venueUnits.length];
        const order = Math.floor(unitIdx / venueUnits.length) + 1;

        if (existingScheme) {
          await db.prepare(
            `UPDATE category_mode SET category_venue = ?, category_date_num = ?, category_order = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?`
          ).run(target.venue, target.unit, order, existingScheme.category_id);
        } else {
          await db.prepare(
            `INSERT INTO category_mode (event_id, weight_class, category_venue, category_date_num, category_order) VALUES (?, ?, ?, ?, ?)`
          ).run(Number(event_id), wc, target.venue, target.unit, order);
        }

        assigned++;
        results.push(`${wc}: ${classAthletes.length}人，分配场地${target.venue}单元${target.unit}`);
        unitIdx++;
      }

      res.json({
        success: true,
        data: { generated: assigned, skipped, errors, results }
      });
    } catch (err) {
      console.error('自动编排失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/auto-arrange/generate-bracket', async (req, res) => {
    try {
      const { event_id, weight_class } = req.body;

      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }

      const athletes = await db.all(
        'SELECT * FROM athletes WHERE event_id = ? AND athlete_type = ? ORDER BY athlete_category, athlete_gender, athlete_age_group',
        [event_id, 'taekwondo_kyougi']
      );

      if (!athletes || athletes.length === 0) {
        return res.json({ success: false, error: '没有找到运动员数据' });
      }

      const classMap = new Map();
      athletes.forEach(a => {
        const wc = a.athlete_category || '未分级';
        if (!classMap.has(wc)) {
          classMap.set(wc, []);
        }
        classMap.get(wc).push(a);
      });

      const classesToGenerate = weight_class
        ? [[weight_class, classMap.get(weight_class) || []]]
        : Array.from(classMap.entries());

      const results = [];
      const errors = [];
      let generated = 0;
      let skipped = 0;

      for (const [wc, classAthletes] of classesToGenerate) {
        try {
          if (classAthletes.length < 2) {
            errors.push(`${wc}: 运动员不足2人,跳过`);
            skipped++;
            continue;
          }

          const sortedAthletes = classAthletes.sort((a, b) => {
            const drawNumA = a.athlete_draw_num || a.draw_no || 0;
            const drawNumB = b.athlete_draw_num || b.draw_no || 0;
            return drawNumA - drawNumB;
          });

          await generateBracketForClass(db, manager, wc, sortedAthletes, event_id);

          generated++;
          results.push(`${wc}: ${classAthletes.length}人，对阵图已生成`);
        } catch (err) {
          errors.push(`${wc}: ${err.message}`);
          skipped++;
        }
      }

      res.json({
        success: true,
        data: { generated, skipped, errors, results }
      });
    } catch (err) {
      console.error('生成对阵表失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/brackets/stage-map', async (req, res) => {
    try {
      const { event_id } = req.query;
      const rows = await db.all(
        'SELECT category_id AS class_name, id AS stage_id, type AS stage_type FROM bracket_stage WHERE event_id = ?',
        [Number(event_id)]
      );
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/brackets/stage-id/:weightClass', async (req, res) => {
    try {
      const { weightClass } = req.params;
      const { event_id } = req.query;
      const row = await db.get(
        'SELECT id AS stage_id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
        [Number(event_id), weightClass]
      );
      res.json({ success: true, data: row || null });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/brackets/stage/:stageId', async (req, res) => {
    try {
      const { stageId } = req.params;
      const data = await manager.get.stageData(Number(stageId));
      
      // 将 bracket-manager 返回的单数格式转换为复数格式
      const transformedData = {
        stages: data.stage || [],
        groups: data.group || [],
        rounds: data.round || [],
        matches: data.match || [],
        matchGames: data.match_game || [],
        participants: data.participant || []
      };
      
      res.json({ success: true, data: transformedData });
    } catch (err) {
      if (err.message === 'Stage not found.') {
        return res.json({ success: true, data: null });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/generate-matches', async (req, res) => {
    try {
      const { event_id } = req.body;
      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }
      const eventIdNum = Number(event_id);

      const athletes = await db.all(
        'SELECT DISTINCT athlete_category FROM athletes WHERE event_id = ? AND athlete_type = ?',
        [eventIdNum, 'taekwondo_kyougi']
      );
      const allClasses = athletes.map(a => a.athlete_category).filter(Boolean);

      if (allClasses.length === 0) {
        return res.json({ success: false, error: '没有找到运动员数据' });
      }

      const schemeRows = await db.prepare(
        'SELECT weight_class, category_venue, category_date_num, category_order FROM category_mode WHERE event_id = ?'
      ).all(eventIdNum);
      const schemeMap = new Map();
      schemeRows.forEach(r => {
        if (r.weight_class) schemeMap.set(r.weight_class, r);
      });

      const unassigned = [];
      for (const wc of allClasses) {
        const scheme = schemeMap.get(wc);
        const missing = [];
        if (!scheme || !scheme.category_venue) missing.push('场地');
        if (!scheme || scheme.category_date_num == null || String(scheme.category_date_num).trim() === '') missing.push('单元');
        if (!scheme || scheme.category_order == null || String(scheme.category_order).trim() === '') missing.push('顺序');
        if (missing.length > 0) {
          unassigned.push(`${wc}（未分配${missing.join('、')}）`);
        }
      }
      if (unassigned.length > 0) {
        return res.json({ success: false, error: '以下级别未完成场地分配：\n' + unassigned.join('\n') });
      }

      const stageRows = await db.all(
        'SELECT category_id AS class_name FROM bracket_stage WHERE event_id = ?',
        [eventIdNum]
      );
      const bracketClasses = new Set(stageRows.map(s => s.class_name).filter(Boolean));

      if (bracketClasses.size === 0) {
        return res.json({ success: false, error: '尚未生成对阵图，请先生成对阵图' });
      }

      try {
        await deleteKyougiMatchsByEvent(db, eventIdNum);
      } catch (e) {
        console.warn('清除旧对阵表数据失败:', e.message);
      }

      const results = [];
      const errors = [];
      let generated = 0;

      for (const wc of bracketClasses) {
        try {
          await syncMatchesFromBracket(wc, eventIdNum);
          generated++;
          results.push(`${wc}: 对阵表已生成`);
        } catch (err) {
          errors.push(`${wc}: ${err.message}`);
        }
      }

      try {
        await reorderMatches(eventIdNum);
      } catch (e) {
        console.warn('重排比赛失败:', e.message);
      }

      res.json({
        success: true,
        data: { generated, errors, results }
      });
    } catch (err) {
      console.error('生成对阵表失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/rebuild-match-ids', async (req, res) => {
    try {
      const { weight_class, event_id } = req.body;
      if (!weight_class || !event_id) {
        return res.status(400).json({ success: false, error: '缺少参数' });
      }
      await deleteKyougiMatchsByClass(db, weight_class, event_id);
      await syncMatchesFromBracket(weight_class, event_id);
      res.json({ success: true, data: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/generate', async (req, res) => {
    try {
      const { weight_class, event_id } = req.body;
      if (!weight_class || !event_id) {
        return res.status(400).json({ success: false, error: '缺少weight_class或event_id参数' });
      }

      const updatedAthletes = await db.all(
        'SELECT * FROM athletes WHERE event_id = ? AND athlete_category = ? ORDER BY athlete_draw_num',
        [event_id, weight_class]
      );

      if (!updatedAthletes || updatedAthletes.length < 2) {
        return res.json({ success: false, error: '该级别运动员不足2人' });
      }

      await generateBracketForClass(db, manager, weight_class, updatedAthletes, event_id);

      res.json({ success: true, message: `${weight_class} 对阵图生成成功` });
    } catch (err) {
      console.error('生成对阵图失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/clear', async (req, res) => {
    try {
      const { weight_class, event_id } = req.body;
      const eventIdNum = Number(event_id);
      if (!weight_class) {
        return res.status(400).json({ success: false, error: '缺少weight_class参数' });
      }

      await deleteKyougiMatchsByClass(db, weight_class, event_id ? eventIdNum : null);

      const stageRow = await db.get(
        'SELECT id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
        [eventIdNum, weight_class]
      );

      if (stageRow && stageRow.id) {
        const oldSid = stageRow.id;
        try {
          const matchRows = await db.prepare('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?').all(Number(oldSid));
          const pIds = new Set();
          for (const m of matchRows) {
            if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch(e) {} }
            if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch(e) {} }
          }
          await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(Number(oldSid));
          await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(Number(oldSid));
          await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(Number(oldSid));
          await db.prepare('DELETE FROM bracket_group WHERE stage_id = ?').run(Number(oldSid));
          await db.prepare('DELETE FROM bracket_stage WHERE id = ?').run(Number(oldSid));
          for (const pid of pIds) { await db.prepare('DELETE FROM bracket_participant WHERE id = ?').run(pid); }
        } catch (e) {
          console.log('清除stage:', oldSid, e.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/clear-all', async (req, res) => {
    try {
      const { event_id } = req.body;
      const eventIdNum = Number(event_id);

      if (event_id) {
        await deleteKyougiMatchsByEvent(db, eventIdNum);
      }

      const stageRows = await db.all('SELECT id FROM bracket_stage WHERE event_id = ?', [eventIdNum]);
      for (const stageRow of stageRows) {
        if (stageRow.id) {
          const oldSid = stageRow.id;
          try {
            const matchRows = await db.prepare('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?').all(Number(oldSid));
            const pIds = new Set();
            for (const m of matchRows) {
              if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch(e) {} }
              if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch(e) {} }
            }
            await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_group WHERE stage_id = ?').run(Number(oldSid));
            await db.prepare('DELETE FROM bracket_stage WHERE id = ?').run(Number(oldSid));
            for (const pid of pIds) { await db.prepare('DELETE FROM bracket_participant WHERE id = ?').run(pid); }
          } catch (e) {
            console.log('清除stage:', oldSid, e.message);
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/brackets/sync-cache', async (req, res) => {
    try {
      const { event_id } = req.body;
      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }
      const eventIdNum = Number(event_id);

      const stageRows = await db.all(
        'SELECT id AS stage_id, category_id AS class_name, type AS stage_type FROM bracket_stage WHERE event_id = ?',
        [eventIdNum]
      );

      const matchRows = await queryKyougiMatchs(db, { event_id: eventIdNum });
      const matchClasses = new Set();
      matchRows.forEach(m => {
        if (m.kyougi_match_categroy) matchClasses.add(m.kyougi_match_categroy);
      });

      const stageClasses = new Set();
      stageRows.forEach(s => {
        if (s.class_name) stageClasses.add(s.class_name);
      });

      const syncedClasses = [];
      const missingBracketClasses = [];

      for (const cls of matchClasses) {
        if (!stageClasses.has(cls)) {
          missingBracketClasses.push(cls);
        }
      }

      for (const stage of stageRows) {
        if (!matchClasses.has(stage.class_name)) {
          try {
            await syncMatchesFromBracket(stage.class_name, eventIdNum);
            syncedClasses.push(stage.class_name);
          } catch (e) {
            console.warn(`同步 ${stage.class_name} 对阵数据失败:`, e.message);
          }
        }
      }

      const updatedStageRows = await db.all(
        'SELECT category_id AS class_name, id AS stage_id, type AS stage_type FROM bracket_stage WHERE event_id = ?',
        [eventIdNum]
      );

      res.json({
        success: true,
        data: {
          stageMap: updatedStageRows || [],
          syncedClasses,
          missingBracketClasses,
          matchClassCount: matchClasses.size,
          stageClassCount: stageClasses.size
        }
      });
    } catch (err) {
      console.error('同步缓存失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
