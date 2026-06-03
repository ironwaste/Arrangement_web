const TournamentRepository = require('../database/repositories/tournamentRepository');

class TournamentService {
  constructor(db) {
    this.tournamentRepository = new TournamentRepository(db);
  }

  async createEvent(eventData) {
    if (!eventData.event_name) {
      throw new Error('赛事名称不能为空');
    }
    const eventId = await this.tournamentRepository.createEvent(eventData);
    return { event_id: eventId, ...eventData };
  }

  async getAllEvents() {
    return this.tournamentRepository.getAllEvents();
  }

  async getEventById(eventId) {
    const event = await this.tournamentRepository.getEventById(eventId);
    if (!event) {
      throw new Error(`赛事不存在: ${eventId}`);
    }
    return event;
  }

  async updateEvent(eventId, eventData) {
    const event = await this.getEventById(eventId);
    const result = await this.tournamentRepository.updateEvent(eventId, eventData);
    return { success: result.changes > 0 };
  }

  async deleteEvent(eventId) {
    const event = await this.getEventById(eventId);
    await this.tournamentRepository.deleteParticipantsByEvent(eventId);
    await this.tournamentRepository.deleteEvent(eventId);
    return { success: true };
  }

  async createStage(stageData) {
    if (!stageData.event_id || !stageData.name || !stageData.type) {
      throw new Error('赛事ID、名称和类型不能为空');
    }
    await this.getEventById(stageData.event_id);
    const stageId = await this.tournamentRepository.createStage(stageData);
    return { stage_id: stageId, ...stageData };
  }

  async getStagesByEvent(eventId) {
    await this.getEventById(eventId);
    return this.tournamentRepository.getStagesByEvent(eventId);
  }

  async createParticipants(eventId, participants) {
    await this.getEventById(eventId);
    
    const results = [];
    for (const participant of participants) {
      const participantId = await this.tournamentRepository.createParticipant({
        event_id: eventId,
        ...participant
      });
      results.push({ participant_id: participantId, ...participant });
    }
    return results;
  }

  async getParticipantsByEvent(eventId) {
    await this.getEventById(eventId);
    return this.tournamentRepository.getParticipantsByEvent(eventId);
  }
}

module.exports = TournamentService;