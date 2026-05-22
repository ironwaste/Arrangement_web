/** API 路由汇总入口，挂载所有子模块路由 */
const express = require('express');
const router = express.Router();
const athletesRoutes = require('./athletes');
const matchesRoutes = require('./matches');
const statsRoutes = require('./stats');
const poomsaeRoutes = require('./poomsae');
const eventsRoutes = require('./events');
const weighinRoutes = require('./weighin');
const categoryModeRoutes = require('./category-mode');

module.exports = (db, bracketsManager, upload) => {
  router.use(athletesRoutes(db));
  router.use(matchesRoutes(db));
  router.use(statsRoutes(db));
  router.use(poomsaeRoutes(db, upload));
  router.use(eventsRoutes(db, bracketsManager));
  router.use(weighinRoutes(db, upload));
  router.use(categoryModeRoutes(db));
  return router;
};
