const ExcelJS = require('exceljs');

class ExportService {
  constructor(tournamentService, matchRepository) {
    this.tournamentService = tournamentService;
    this.matchRepository = matchRepository;
  }

  async exportEventToExcel(eventId) {
    const event = await this.tournamentService.getEventById(eventId);
    const participants = await this.tournamentService.getParticipantsByEvent(eventId);
    const matches = await this.matchRepository.getMatchesByEvent(eventId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Taekwondo Manager';
    workbook.lastModifiedBy = 'System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const eventSheet = workbook.addWorksheet('赛事信息');
    eventSheet.columns = [
      { header: '赛事ID', key: 'event_id', width: 15 },
      { header: '赛事名称', key: 'event_name', width: 30 },
      { header: '举办地点', key: 'event_venue', width: 30 },
      { header: '举办日期', key: 'event_date', width: 20 },
      { header: '赛事类型', key: 'event_type', width: 20 },
      { header: '赛事状态', key: 'event_status', width: 15 }
    ];
    eventSheet.addRow(event);

    const participantSheet = workbook.addWorksheet('参赛选手');
    participantSheet.columns = [
      { header: '选手ID', key: 'id', width: 15 },
      { header: '选手名称', key: 'name', width: 20 },
      { header: '所属组别', key: 'category_id', width: 20 },
      { header: '自定义数据', key: 'custom_data', width: 50 }
    ];
    participants.forEach(p => participantSheet.addRow(p));

    const matchSheet = workbook.addWorksheet('对阵信息');
    matchSheet.columns = [
      { header: '比赛ID', key: 'id', width: 15 },
      { header: '阶段名称', key: 'stage_name', width: 20 },
      { header: '轮次', key: 'round_id', width: 10 },
      { header: '场次', key: 'number', width: 10 },
      { header: '选手1', key: 'opponent1', width: 30 },
      { header: '选手2', key: 'opponent2', width: 30 },
      { header: '胜者', key: 'winner_id', width: 15 },
      { header: '状态', key: 'status', width: 15 }
    ];
    
    matches.forEach(match => {
      matchSheet.addRow({
        ...match,
        opponent1: this._formatOpponent(match.opponent1),
        opponent2: this._formatOpponent(match.opponent2)
      });
    });

    return workbook;
  }

  _formatOpponent(opponent) {
    if (!opponent) return '';
    try {
      const data = JSON.parse(opponent);
      if (data.bye) return '轮空';
      return data.name || data.id || '';
    } catch {
      return opponent;
    }
  }

  async exportMatchesToExcel(matches) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('对阵表');
    
    sheet.columns = [
      { header: '场次', key: 'number', width: 10 },
      { header: '选手1', key: 'opponent1', width: 30 },
      { header: '选手2', key: 'opponent2', width: 30 },
      { header: '状态', key: 'status', width: 15 }
    ];
    
    matches.forEach(match => {
      sheet.addRow({
        ...match,
        opponent1: this._formatOpponent(match.opponent1),
        opponent2: this._formatOpponent(match.opponent2)
      });
    });

    return workbook;
  }
}

module.exports = ExportService;