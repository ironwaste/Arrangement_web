const express = require('express');
const router = express.Router();

module.exports = (exportController) => {
  router.get('/export/events/:eventId/excel', (req, res) => exportController.exportEventToExcel(req, res));
  router.post('/export/matches/excel', (req, res) => exportController.exportMatchesToExcel(req, res));

  return router;
};