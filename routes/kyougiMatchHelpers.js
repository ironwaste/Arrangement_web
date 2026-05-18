const TABLE = 'taekwondo_kyougi_matchs';

function parseScores(scoresStr) {
  if (!scoresStr) return { blue_score: 0, red_score: 0 };
  const parts = String(scoresStr).split(':');
  return {
    blue_score: parseInt(parts[0]) || 0,
    red_score: parseInt(parts[1]) || 0
  };
}

function formatScores(blueScore, redScore) {
  if (blueScore == null && redScore == null) return null;
  return `${blueScore || 0}:${redScore || 0}`;
}

async function insertKyougiMatch(db, data) {
  const scores = formatScores(data.blue_score, data.red_score);
  return db.run(
    `INSERT INTO ${TABLE} (
      event_id, kyougi_match_venue, kyougi_match_id, kyougi_match_categroy,
      kyougi_match_round_num, kyougi_match_round_name, kyougi_match_category_total_rounds,
      kyougi_bracket_match_id,
      kyougi_blue_athlete_id, kyougi_blue_athlete_name, kyougi_blue_athlete_team, kyougi_blue_prev_winner,
      kyougi_red_athlete_id, kyougi_red_athlete_name, kyougi_red_athlete_team, kyougi_red_prev_winner_id,
      kyougi_match_status, kyougi_match_scores, kyougi_match_scores_detail, kyougi_win_method, kyougi_winner
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.event_id ?? null,
      data.kyougi_match_venue ?? data.venue_no ?? null,
      data.kyougi_match_id ?? data.match_id ?? null,
      data.kyougi_match_categroy ?? data.weight_class ?? null,
      data.kyougi_match_round_num ?? data.round ?? 1,
      data.kyougi_match_round_name ?? data.round_name ?? null,
      data.kyougi_match_category_total_rounds ?? data.total_rounds ?? 1,
      data.kyougi_bracket_match_id ?? data.bracket_match_id ?? null,
      data.kyougi_blue_athlete_id ?? data.blue_athlete_id ?? null,
      data.kyougi_blue_athlete_name ?? data.blue_name ?? null,
      data.kyougi_blue_athlete_team ?? data.blue_unit ?? null,
      data.kyougi_blue_prev_winner ?? data.blue_prev_winner ?? null,
      data.kyougi_red_athlete_id ?? data.red_athlete_id ?? null,
      data.kyougi_red_athlete_name ?? data.red_name ?? null,
      data.kyougi_red_athlete_team ?? data.red_unit ?? null,
      data.kyougi_red_prev_winner_id ?? data.red_prev_winner ?? null,
      data.kyougi_match_status ?? data.match_status ?? '未开始',
      scores,
      data.kyougi_match_scores_detail ?? data.match_scores_detail ?? null,
      data.kyougi_win_method ?? data.win_method ?? null,
      data.kyougi_winner ?? data.winner ?? null
    ]
  );
}

async function updateKyougiMatchScore(db, id, data) {
  const scores = formatScores(data.blue_score, data.red_score);
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_match_scores = ?, kyougi_winner = ?, kyougi_win_method = ?,
      kyougi_match_status = ?
     WHERE id = ?`,
    [
      scores,
      data.winner || null,
      data.win_method || null,
      data.match_status || '未开始',
      id
    ]
  );
}

async function resetKyougiMatch(db, id) {
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_match_scores = NULL, kyougi_winner = NULL, kyougi_win_method = NULL,
      kyougi_match_status = '未开始'
     WHERE id = ?`,
    [id]
  );
}

async function updateKyougiMatchBlue(db, id, data) {
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_blue_athlete_name = ?, kyougi_blue_athlete_team = ?,
      kyougi_blue_athlete_id = ?
     WHERE id = ?`,
    [
      data.blue_name || '',
      data.blue_unit || '',
      data.blue_athlete_id || null,
      id
    ]
  );
}

async function updateKyougiMatchRed(db, id, data) {
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_red_athlete_name = ?, kyougi_red_athlete_team = ?,
      kyougi_red_athlete_id = ?
     WHERE id = ?`,
    [
      data.red_name || '',
      data.red_unit || '',
      data.red_athlete_id || null,
      id
    ]
  );
}

async function updateKyougiMatchPrevWinners(db, id, bluePrevWinner, redPrevWinner) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_blue_prev_winner = ?, kyougi_red_prev_winner_id = ? WHERE id = ?`,
    [bluePrevWinner, redPrevWinner, id]
  );
}

async function updateKyougiMatchVenue(db, id, venue, venueNo) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_match_venue = ? WHERE id = ?`,
    [venueNo || venue, id]
  );
}

async function clearKyougiMatchVenue(db, id) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_match_venue = '' WHERE id = ?`,
    [id]
  );
}

async function batchUpdateKyougiMatch(db, matchData) {
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_match_venue = ?, kyougi_match_id = ?,
      kyougi_match_round_num = ?, kyougi_match_round_name = ?,
      kyougi_blue_athlete_id = ?, kyougi_blue_athlete_name = ?, kyougi_blue_athlete_team = ?,
      kyougi_red_athlete_id = ?, kyougi_red_athlete_name = ?, kyougi_red_athlete_team = ?,
      kyougi_match_status = ?
     WHERE id = ?`,
    [
      matchData.venue_no || matchData.venue || null,
      matchData.match_id || null,
      matchData.round || 1,
      matchData.round_name || null,
      matchData.blue_athlete_id || null,
      matchData.blue_name || null,
      matchData.blue_unit || null,
      matchData.red_athlete_id || null,
      matchData.red_name || null,
      matchData.red_unit || null,
      matchData.match_status || '未开始',
      matchData.id
    ]
  );
}

async function deleteKyougiMatchsByEvent(db, eventId) {
  return db.run(`DELETE FROM ${TABLE} WHERE event_id = ?`, [eventId]);
}

async function deleteKyougiMatchsByClass(db, weightClass, eventId) {
  if (eventId) {
    return db.run(`DELETE FROM ${TABLE} WHERE kyougi_match_categroy = ? AND event_id = ?`, [weightClass, eventId]);
  }
  return db.run(`DELETE FROM ${TABLE} WHERE kyougi_match_categroy = ?`, [weightClass]);
}

async function deleteKyougiMatchsByAthletes(db, athleteIds) {
  if (!athleteIds || athleteIds.length === 0) return;
  const placeholders = athleteIds.map(() => '?').join(',');
  return db.run(
    `DELETE FROM ${TABLE} WHERE kyougi_blue_athlete_id IN (${placeholders}) OR kyougi_red_athlete_id IN (${placeholders})`,
    [...athleteIds, ...athleteIds]
  );
}

async function deleteAllKyougiMatchs(db) {
  return db.run(`DELETE FROM ${TABLE}`);
}

async function getKyougiMatchById(db, id) {
  return db.get(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
}

async function queryKyougiMatchs(db, filters) {
  let sql = `SELECT * FROM ${TABLE} WHERE 1=1`;
  const params = [];

  if (filters.event_id) {
    sql += ' AND event_id = ?';
    params.push(filters.event_id);
  }
  if (filters.weight_class || filters.kyougi_match_categroy) {
    sql += ' AND kyougi_match_categroy = ?';
    params.push(filters.weight_class || filters.kyougi_match_categroy);
  }
  if (filters.round || filters.kyougi_match_round_num) {
    sql += ' AND kyougi_match_round_num = ?';
    params.push(filters.round || filters.kyougi_match_round_num);
  }
  if (filters.status || filters.kyougi_match_status) {
    sql += ' AND kyougi_match_status = ?';
    params.push(filters.status || filters.kyougi_match_status);
  }

  sql += ' ORDER BY kyougi_match_venue';
  return db.all(sql, params);
}

async function getFinishedKyougiMatchs(db, eventId) {
  let sql = `SELECT * FROM ${TABLE} WHERE kyougi_match_status = '已结束'`;
  const params = [];
  if (eventId) {
    sql += ' AND event_id = ?';
    params.push(eventId);
  }
  return db.all(sql, params);
}

async function findNextMatchesByPrevWinner(db, eventId, prevWinnerLabel) {
  return db.all(
    `SELECT * FROM ${TABLE} WHERE event_id = ? AND (kyougi_blue_prev_winner = ? OR kyougi_red_prev_winner_id = ?)`,
    [eventId, prevWinnerLabel, prevWinnerLabel]
  );
}

function toLegacyFormat(row) {
  if (!row) return row;
  const scores = parseScores(row.kyougi_match_scores);
  const venueStr = row.kyougi_match_venue || '';
  return {
    ...row,
    weight_class: row.kyougi_match_categroy,
    round: row.kyougi_match_round_num,
    round_name: row.kyougi_match_round_name,
    total_rounds: row.kyougi_match_category_total_rounds,
    bracket_match_id: row.kyougi_bracket_match_id,
    match_id: row.kyougi_match_id,
    blue_athlete_id: row.kyougi_blue_athlete_id,
    blue_name: row.kyougi_blue_athlete_name,
    blue_unit: row.kyougi_blue_athlete_team,
    blue_prev_winner: row.kyougi_blue_prev_winner,
    blue_score: scores.blue_score,
    red_athlete_id: row.kyougi_red_athlete_id,
    red_name: row.kyougi_red_athlete_name,
    red_unit: row.kyougi_red_athlete_team,
    red_prev_winner: row.kyougi_red_prev_winner_id,
    red_score: scores.red_score,
    match_status: row.kyougi_match_status,
    win_method: row.kyougi_win_method,
    winner: row.kyougi_winner,
    venue_no: venueStr,
    venue: venueStr.charAt(0) || ''
  };
}

module.exports = {
  TABLE,
  parseScores,
  formatScores,
  insertKyougiMatch,
  updateKyougiMatchScore,
  resetKyougiMatch,
  updateKyougiMatchBlue,
  updateKyougiMatchRed,
  updateKyougiMatchPrevWinners,
  updateKyougiMatchVenue,
  clearKyougiMatchVenue,
  batchUpdateKyougiMatch,
  deleteKyougiMatchsByEvent,
  deleteKyougiMatchsByClass,
  deleteKyougiMatchsByAthletes,
  deleteAllKyougiMatchs,
  getKyougiMatchById,
  queryKyougiMatchs,
  getFinishedKyougiMatchs,
  findNextMatchesByPrevWinner,
  toLegacyFormat
};
