var clone = require('clone');

module.exports = function (api) {
  var index = clone(api);
  delete index['x-bravado-sourceFile'];
  delete index['properties'];
  Object.keys(index.resources).forEach(function (r) {
    delete index.resources[r]['x-bravado-controller'];
    delete index.resources[r]['x-bravado-fullPath'];
    Object.keys(index.resources[r].actions).forEach(function (a) {
      delete index.resources[r].actions[a]['x-bravado-fullPath'];
    });
  });
  return function (req, res, next) {
    res.json(index);
    next();
  };
};
