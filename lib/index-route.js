var clone = require('clone');

module.exports = function (api) {
  var index = clone(api);
  delete index['x-bravado-sourceFile'];
  delete index['properties'];
  Object.keys(index.resources).forEach(function (r) {
    var resource = index.resources[r];
    if (resource.private) {
      delete index.resources[r];
    } else {
      delete resource['x-bravado-controller'];
      delete resource['x-bravado-fullPath'];
      Object.keys(resource.actions).forEach(function (a) {
        var action = resource.actions[a];
        if (action.private) {
          delete resource.actions[a];
        } else {
          delete action['x-bravado-fullPath'];
        }
      });
    }
  });
  return function (req, res, next) {
    res.json(index);
    next();
  };
};
