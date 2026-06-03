class TournamentController {
  constructor(tournamentService, bracketService) {
    this.tournamentService = tournamentService;
    this.bracketService = bracketService;
  }

  async createEvent(req, res) {
    try {
      const eventData = req.body;
      const result = await this.tournamentService.createEvent(eventData);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getAllEvents(req, res) {
    try {
      const events = await this.tournamentService.getAllEvents();
      res.json({ success: true, data: events });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getEventById(req, res) {
    try {
      const eventId = parseInt(req.params.id);
      const event = await this.tournamentService.getEventById(eventId);
      res.json({ success: true, data: event });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async updateEvent(req, res) {
    try {
      const eventId = parseInt(req.params.id);
      const eventData = req.body;
      const result = await this.tournamentService.updateEvent(eventId, eventData);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteEvent(req, res) {
    try {
      const eventId = parseInt(req.params.id);
      const result = await this.tournamentService.deleteEvent(eventId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async createStage(req, res) {
    try {
      const stageData = req.body;
      const result = await this.tournamentService.createStage(stageData);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getStagesByEvent(req, res) {
    try {
      const eventId = parseInt(req.params.eventId);
      const stages = await this.tournamentService.getStagesByEvent(eventId);
      res.json({ success: true, data: stages });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async createParticipants(req, res) {
    try {
      const eventId = parseInt(req.params.eventId);
      const participants = req.body;
      const results = await this.tournamentService.createParticipants(eventId, participants);
      res.status(201).json({ success: true, data: results });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getParticipantsByEvent(req, res) {
    try {
      const eventId = parseInt(req.params.eventId);
      const participants = await this.tournamentService.getParticipantsByEvent(eventId);
      res.json({ success: true, data: participants });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async createBracket(req, res) {
    try {
      const { eventId, categoryId, participants, type } = req.body;
      const result = await this.bracketService.createBracket(eventId, categoryId, participants, type);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getBracketByEvent(req, res) {
    try {
      const eventId = parseInt(req.params.eventId);
      const bracket = await this.bracketService.getBracketByEvent(eventId);
      res.json({ success: true, data: bracket });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateMatchResult(req, res) {
    try {
      const matchId = parseInt(req.params.matchId);
      const { winnerId } = req.body;
      const result = await this.bracketService.updateMatchResult(matchId, winnerId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = TournamentController;