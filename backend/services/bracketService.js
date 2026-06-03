const { BracketsManager } = require('brackets-manager');
const MatchRepository = require('../database/repositories/matchRepository');

class BracketService {
  constructor(db, storage) {
    this.matchRepository = new MatchRepository(db);
    this.storage = storage;
    this.bracketsManager = new BracketsManager(storage);
  }

  async createBracket(eventId, categoryId, participants, type = 'single_elimination') {
    const participantIds = await this._createParticipants(eventId, categoryId, participants);
    
    const stage = {
      tournamentId: 1,
      name: `Category ${categoryId}`,
      type: type,
      number: 1,
      settings: {
        seedOrdering: 'natural'
      },
      seeding: participantIds
    };

    stage.event_id = eventId;
    stage.category_id = categoryId;

    await this.bracketsManager.create.stage(stage);
    
    return { success: true, stageName: stage.name };
  }

  async _createParticipants(eventId, categoryId, participants) {
    const ids = [];
    for (let i = 0; i < participants.length; i++) {
      const participant = {
        tournamentId: 1,
        name: participants[i],
        custom_data: JSON.stringify({
          event_id: eventId,
          category_id: categoryId,
          original_index: i
        })
      };
      const id = await this.bracketsManager.create.participant(participant);
      ids.push(id);
    }
    return ids;
  }

  async getBracketByStage(stageId) {
    const matches = await this.matchRepository.getMatchesByStage(stageId);
    return this._formatBracket(matches);
  }

  async getBracketByEvent(eventId) {
    const matches = await this.matchRepository.getMatchesByEvent(eventId);
    return this._formatBracket(matches);
  }

  _formatBracket(matches) {
    const rounds = {};
    
    matches.forEach(match => {
      const roundNum = match.round_id || 1;
      if (!rounds[roundNum]) {
        rounds[roundNum] = [];
      }
      
      rounds[roundNum].push({
        match_id: match.id,
        number: match.number,
        opponent1: match.opponent1 ? JSON.parse(match.opponent1) : null,
        opponent2: match.opponent2 ? JSON.parse(match.opponent2) : null,
        winner_id: match.winner_id,
        status: match.status,
        next_match_id: match.next_match_id
      });
    });
    
    return Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b)).map(round => ({
      round_number: parseInt(round),
      matches: rounds[round]
    }));
  }

  async updateMatchResult(matchId, winnerId) {
    const match = await this.matchRepository.getMatchById(matchId);
    if (!match) {
      throw new Error(`比赛不存在: ${matchId}`);
    }

    await this.matchRepository.updateMatch(matchId, {
      winner_id: winnerId,
      status: 'completed'
    });

    await this._promoteWinner(matchId, winnerId, match.next_match_id);

    return { success: true };
  }

  async _promoteWinner(matchId, winnerId, nextMatchId) {
    if (!nextMatchId) return;

    const nextMatch = await this.matchRepository.getMatchById(nextMatchId);
    if (!nextMatch) return;

    const opponent1 = nextMatch.opponent1 ? JSON.parse(nextMatch.opponent1) : null;
    const opponent2 = nextMatch.opponent2 ? JSON.parse(nextMatch.opponent2) : null;

    const winnerData = { id: winnerId, bye: false };
    
    let updatedOpponent1 = opponent1;
    let updatedOpponent2 = opponent2;

    if (!opponent1 || opponent1.bye) {
      updatedOpponent1 = winnerData;
    } else if (!opponent2 || opponent2.bye) {
      updatedOpponent2 = winnerData;
    }

    await this.matchRepository.updateMatch(nextMatchId, {
      opponent1: JSON.stringify(updatedOpponent1),
      opponent2: JSON.stringify(updatedOpponent2),
      status: updatedOpponent1 && updatedOpponent2 && !updatedOpponent1.bye && !updatedOpponent2.bye ? 'ready' : 'pending'
    });
  }

  async resetBracket(stageId) {
    await this.matchRepository.deleteMatchesByStage(stageId);
    return { success: true };
  }
}

module.exports = BracketService;