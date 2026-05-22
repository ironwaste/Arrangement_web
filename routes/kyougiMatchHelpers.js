/** 竞技比赛数据操作辅助模块，封装 taekwondo_kyougi_matchs 表的 CRUD 操作 */
const TABLE = 'taekwondo_kyougi_matchs';

/** 解析比分字符串 "3:2" → { blue_score, red_score } */
function parseScores(scoresStr) {
  if (!scoresStr) return { blue_score: 0, red_score: 0 };
  const parts = String(scoresStr).split(':');
  return {
    blue_score: parseInt(parts[0]) || 0,
    red_score: parseInt(parts[1]) || 0
  };
}

/** 格式化比分为字符串 */
function formatScores(blueScore, redScore) {
  if (blueScore == null && redScore == null) return null;
  return `${blueScore || 0}:${redScore || 0}`;
}

/** 插入一条竞技比赛记录 */
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

/** 更新比赛比分和结果 */
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

/** 重置比赛（清除比分和场地信息） */
async function resetKyougiMatch(db, id) {
  return db.run(
    `UPDATE ${TABLE} SET
      kyougi_match_scores = NULL, kyougi_winner = NULL, kyougi_win_method = NULL,
      kyougi_match_status = '未开始',
      kyougi_match_venue = NULL, kyougi_match_id = NULL
     WHERE id = ?`,
    [id]
  );
}

/** 更新青方选手信息 */
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

/** 更新红方选手信息 */
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

/** 更新上一轮胜者标签 */
async function updateKyougiMatchPrevWinners(db, id, bluePrevWinner, redPrevWinner) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_blue_prev_winner = ?, kyougi_red_prev_winner_id = ? WHERE id = ?`,
    [bluePrevWinner, redPrevWinner, id]
  );
}

/** 更新比赛场地 */
async function updateKyougiMatchVenue(db, id, venue, venueNo) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_match_venue = ? WHERE id = ?`,
    [venueNo || venue, id]
  );
}

/** 清除比赛场地信息 */
async function clearKyougiMatchVenue(db, id) {
  return db.run(
    `UPDATE ${TABLE} SET kyougi_match_venue = NULL, kyougi_match_id = NULL WHERE id = ?`,
    [id]
  );
}

/** 批量更新比赛信息 */
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
      matchData.kyougi_match_venue || matchData.venue_no || matchData.venue || null,
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

/** 按赛事ID删除所有比赛 */
async function deleteKyougiMatchsByEvent(db, eventId) {
  return db.run(`DELETE FROM ${TABLE} WHERE event_id = ?`, [eventId]);
}

async function deleteKyougiMatchsByClass(db, weightClass, eventId) {
  if (eventId) {
    return db.run(`DELETE FROM ${TABLE} WHERE kyougi_match_categroy = ? AND event_id = ?`, [weightClass, eventId]);
  }
  return db.run(`DELETE FROM ${TABLE} WHERE kyougi_match_categroy = ?`, [weightClass]);
}

/** 按运动员ID删除相关比赛 */
async function deleteKyougiMatchsByAthletes(db, athleteIds) {
  if (!athleteIds || athleteIds.length === 0) return;
  const placeholders = athleteIds.map(() => '?').join(',');
  return db.run(
    `DELETE FROM ${TABLE} WHERE kyougi_blue_athlete_id IN (${placeholders}) OR kyougi_red_athlete_id IN (${placeholders})`,
    [...athleteIds, ...athleteIds]
  );
}

/** 删除所有比赛记录 */
async function deleteAllKyougiMatchs(db) {
  return db.run(`DELETE FROM ${TABLE}`);
}

/** 按ID查询单条比赛 */
async function getKyougiMatchById(db, id) {
  return db.get(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
}

/** 按条件查询比赛列表 */
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

/** 查询已结束的比赛 */
async function getFinishedKyougiMatchs(db, eventId) {
  let sql = `SELECT * FROM ${TABLE} WHERE kyougi_match_status = '已结束'`;
  const params = [];
  if (eventId) {
    sql += ' AND event_id = ?';
    params.push(eventId);
  }
  return db.all(sql, params);
}

/** 根据上一轮胜者标签查找后续比赛 */
async function findNextMatchesByPrevWinner(db, eventId, prevWinnerLabel) {
  return db.all(
    `SELECT * FROM ${TABLE} WHERE event_id = ? AND (kyougi_blue_prev_winner = ? OR kyougi_red_prev_winner_id = ?)`,
    [eventId, prevWinnerLabel, prevWinnerLabel]
  );
}

/** 将新版数据格式转换为旧版兼容格式 */
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
    venue_no:((row.kyougi_match_venue !== null && row.kyougi_match_id !== null) 
        ? (String(row.kyougi_match_venue) + String(row.kyougi_match_id)) 
        : ''),
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
