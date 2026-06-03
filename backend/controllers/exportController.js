class ExportController {
  constructor(exportService) {
    this.exportService = exportService;
  }

  async exportEventToExcel(req, res) {
    try {
      const eventId = parseInt(req.params.eventId);
      const workbook = await this.exportService.exportEventToExcel(eventId);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=event_${eventId}.xlsx`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async exportMatchesToExcel(req, res) {
    try {
      const matches = req.body;
      const workbook = await this.exportService.exportMatchesToExcel(matches);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=matches.xlsx');
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = ExportController;