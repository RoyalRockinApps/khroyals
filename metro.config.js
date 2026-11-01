// The bundler: `@school/…` imports come from the folder of the school being built
// (schools/<SCHOOL>/, see schools/index.js), so each app bundles only its own content and pictures.
const { getDefaultConfig } = require('expo/metro-config');
const { join } = require('node:path');
const { schoolDir } = require('./schools');

const config = getDefaultConfig(__dirname);
const dir = schoolDir();
const next = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, name, platform) => {
  if (name.startsWith('@school/')) return context.resolveRequest(context, join(dir, name.slice('@school/'.length)), platform);
  return next ? next(context, name, platform) : context.resolveRequest(context, name, platform);
};
// Rebuild when switching schools.
config.cacheVersion = `school:${dir}`;

module.exports = config;
