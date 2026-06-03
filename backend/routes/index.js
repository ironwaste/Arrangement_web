const express = require('express');
const router = express.Router();

module.exports = (tournamentController, exportController) => {
  const tournamentRoutes = require('./tournamentRoutes')(tournamentController);
  const exportRoutes = require('./exportRoutes')(exportController);

  router.use(tournamentRoutes);
  router.use(exportRoutes);

  return router;
};