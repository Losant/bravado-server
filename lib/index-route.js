
module.exports = function (api) {
  return function (req, res, next) {
    var entity = {
      title: api.info.title,
      version: api.info.version,
      _links: {}
    }
    for (var r in api.resources) {
      var resource = api.resources[r];
      entity._links[r] = resource['x-bravado-fullPath'];
    }
    res.json(entity);
    next();
  };
};
