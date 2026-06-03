const express = require('express');
const router = express.Router();

module.exports = (tournamentController) => {
  router.get('/tournaments', (req, res) => tournamentController.getAllEvents(req, res));
  router.get('/tournaments/:id', (req, res) => tournamentController.getEventById(req, res));
  router.post('/tournaments', (req, res) => tournamentController.createEvent(req, res));
  router.put('/tournaments/:id', (req, res) => tournamentController.updateEvent(req, res));
  router.delete('/tournaments/:id', (req, res) => tournamentController.deleteEvent(req, res));

  router.get('/tournaments/:eventId/stages', (req, res) => tournamentController.getStagesByEvent(req, res));
  router.post('/stages', (req, res) => tournamentController.createStage(req, res));

  router.get('/tournaments/:eventId/participants', (req, res) => tournamentController.getParticipantsByEvent(req, res));
  router.post('/tournaments/:eventId/participants', (req, res) => tournamentController.createParticipants(req, res));

  router.post('/brackets', (req, res) => tournamentController.createBracket(req, res));
  router.get('/tournaments/:eventId/brackets', (req, res) => tournamentController.getBracketByEvent(req, res));
  router.put('/matches/:matchId/result', (req, res) => tournamentController.updateMatchResult(req, res));

  return router;
};