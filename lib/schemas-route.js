
module.exports = function (api) {
  return function (req, res, next) {
    res.json({ definitions: api.definitions });
    next();
  };
};
