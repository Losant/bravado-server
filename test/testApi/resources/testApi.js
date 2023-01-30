export default {
  objectId: function(params, context) {
    return context.succeed(params);
  },
  objectIds: function(params, context) {
    return context.succeed(params);
  },
  date: function(params, context) {
    return context.succeed(params);
  },
  object: function(params, context) {
    return context.succeed(params);
  },
  upload: function(params, context) {
    return context.succeed(params);
  },
  optsTest: function(params, context) {
    context.statusCode = 204;
    return context.succeed();
  },
  explode: function() {
    throw new Error('Hello There');
  }
};
