import omnibelt from 'omnibelt';
const { clone } = omnibelt;

const cleanParams = function(params) {
  const newParams = [];
  params.forEach(function(param) {
    if (!param.private) { newParams.push(param); }
  });
  return newParams;
};

export default function(api) {
  const index = clone(api);
  delete index['x-bravado-sourceFile'];
  delete index.properties;
  if (index.params) {
    index.params = cleanParams(index.params);
  }
  Object.keys(index.resources).forEach(function(r) {
    const resource = index.resources[r];
    if (resource.private) {
      delete index.resources[r];
    } else {
      if (resource.params) {
        resource.params = cleanParams(resource.params);
      }
      delete resource['x-bravado-controller'];
      delete resource['x-bravado-fullPath'];
      Object.keys(resource.actions).forEach(function(a) {
        const action = resource.actions[a];
        if (action.private) {
          delete resource.actions[a];
        } else {
          if (action.params) {
            action.params = cleanParams(action.params);
          }
          delete action['x-bravado-fullPath'];
        }
      });
    }
  });
  return function(req, res, next) {
    res.json(index);
    next();
  };
}
