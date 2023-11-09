import fs from 'fs-extra';

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
  upload: async function(params, context) {
    const content = await fs.readFile(params.theFile.path);
    return context.succeed({ content: content.toString() });
  },
  optsTest: function(params, context) {
    context.statusCode = 204;
    return context.succeed();
  },
  explode: function() {
    throw new Error('Hello There');
  }
};
