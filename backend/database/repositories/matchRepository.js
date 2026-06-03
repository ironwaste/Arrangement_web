class MatchRepository {
  constructor(db) {
    this.db = db;
  }

  async createMatch(matchData) {
    const { stage_id, round_id, group_id, number, child_count = 0, opponent1, opponent2, winner_id, status = 'pending', next_match_id } = matchData;
    const result = await this.db.run(
      'INSERT INTO bracket_match (stage_id, round_id, group_id, number, child_count, opponent1, opponent2, winner_id, status, next_match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [stage_id, round_id, group_id, number, child_count, opponent1, opponent2, winner_id, status, next_match_id]
    );
    return result.insertId;
  }

  async getMatchesByStage(stageId) {
    return this.db.all('SELECT * FROM bracket_match WHERE stage_id = ? ORDER BY number', [stageId]);
  }

  async getMatchById(matchId) {
    return this.db.get('SELECT * FROM bracket_match WHERE id = ?', [matchId]);
  }

  async updateMatch(matchId, matchData) {
    const fields = [];
    const values = [];

    if (matchData.opponent1 !== undefined) {
      fields.push('opponent1 = ?');
      values.push(matchData.opponent1);
    }
    if (matchData.opponent2 !== undefined) {
      fields.push('opponent2 = ?');
      values.push(matchData.opponent2);
    }
    if (matchData.winner_id !== undefined) {
      fields.push('winner_id = ?');
      values.push(matchData.winner_id);
    }
    if (matchData.status !== undefined) {
      fields.push('status = ?');
      values.push(matchData.status);
    }
    if (matchData.next_match_id !== undefined) {
      fields.push('next_match_id = ?');
      values.push(matchData.next_match_id);
    }

    if (fields.length === 0) return { changes: 0 };

    values.push(matchId);
    return this.db.run(`UPDATE bracket_match SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deleteMatchesByStage(stageId) {
    return this.db.run('DELETE FROM bracket_match WHERE stage_id = ?', [stageId]);
  }

  async getMatchesByEvent(eventId) {
    return this.db.all(`
      SELECT m.*, s.name as stage_name
      FROM bracket_match m
      JOIN bracket_stage s ON m.stage_id = s.id
      WHERE s.event_id = ?
      ORDER BY s.number, m.number
    `, [eventId]);
  }

  async createMatchGame(gameData) {
    const { stage_id, parent_id, number, opponent1_score, opponent2_score } = gameData;
    const result = await this.db.run(
      'INSERT INTO bracket_match_game (stage_id, parent_id, number, opponent1_score, opponent2_score) VALUES (?, ?, ?, ?, ?)',
      [stage_id, parent_id, number, opponent1_score, opponent2_score]
    );
    return result.insertId;
  }

  async getMatchGames(parentId) {
    return this.db.all('SELECT * FROM bracket_match_game WHERE parent_id = ? ORDER BY number', [parentId]);
  }
}

module.exports = MatchRepository;