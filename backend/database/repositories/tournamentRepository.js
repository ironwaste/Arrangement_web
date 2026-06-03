class TournamentRepository {
  constructor(db) {
    this.db = db;
  }

  async createEvent(eventData) {
    const { event_name, event_venue, event_date, event_type = 'taekwondo_kyougi' } = eventData;
    const result = await this.db.run(
      'INSERT INTO events (event_name, event_venue, event_date, event_type) VALUES (?, ?, ?, ?)',
      [event_name, event_venue, event_date, event_type]
    );
    return result.insertId;
  }

  async getAllEvents() {
    return this.db.all('SELECT * FROM events ORDER BY created_at DESC');
  }

  async getEventById(eventId) {
    return this.db.get('SELECT * FROM events WHERE event_id = ?', [eventId]);
  }

  async updateEvent(eventId, eventData) {
    const fields = [];
    const values = [];

    if (eventData.event_name !== undefined) {
      fields.push('event_name = ?');
      values.push(eventData.event_name);
    }
    if (eventData.event_venue !== undefined) {
      fields.push('event_venue = ?');
      values.push(eventData.event_venue);
    }
    if (eventData.event_date !== undefined) {
      fields.push('event_date = ?');
      values.push(eventData.event_date);
    }
    if (eventData.event_type !== undefined) {
      fields.push('event_type = ?');
      values.push(eventData.event_type);
    }
    if (eventData.event_status !== undefined) {
      fields.push('event_status = ?');
      values.push(eventData.event_status);
    }

    if (fields.length === 0) return { changes: 0 };

    values.push(eventId);
    return this.db.run(`UPDATE events SET ${fields.join(', ')} WHERE event_id = ?`, values);
  }

  async deleteEvent(eventId) {
    return this.db.run('DELETE FROM events WHERE event_id = ?', [eventId]);
  }

  async createStage(stageData) {
    const { tournament_id = 1, event_id, category_id, name, type, number, settings, seeding } = stageData;
    const result = await this.db.run(
      'INSERT INTO bracket_stage (tournament_id, event_id, category_id, name, type, number, settings, seeding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tournament_id, event_id, category_id, name, type, number, settings, seeding]
    );
    return result.insertId;
  }

  async getStagesByEvent(eventId) {
    return this.db.all('SELECT * FROM bracket_stage WHERE event_id = ?', [eventId]);
  }

  async getStageById(stageId) {
    return this.db.get('SELECT * FROM bracket_stage WHERE id = ?', [stageId]);
  }

  async createParticipant(participantData) {
    const { tournament_id = 1, event_id, category_id, name, custom_data } = participantData;
    const result = await this.db.run(
      'INSERT INTO bracket_participant (tournament_id, event_id, category_id, name, custom_data) VALUES (?, ?, ?, ?, ?)',
      [tournament_id, event_id, category_id, name, custom_data]
    );
    return result.insertId;
  }

  async getParticipantsByEvent(eventId) {
    return this.db.all('SELECT * FROM bracket_participant WHERE event_id = ?', [eventId]);
  }

  async deleteParticipantsByEvent(eventId) {
    return this.db.run('DELETE FROM bracket_participant WHERE event_id = ?', [eventId]);
  }
}

module.exports = TournamentRepository;