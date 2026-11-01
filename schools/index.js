/**
 * The schools this one codebase builds an app for. Each has its own folder here (names, colors,
 * website content, pictures, app IDs and its own Supabase project, so no data is ever shared),
 * and a build picks one with the SCHOOL environment variable (Kingdom Heights when it's unset):
 *
 *   SCHOOL=wca npx expo start
 *
 * app.config.js applies the school's app.json on top of the shared one, and metro.config.js
 * points `@school/…` imports at its folder. Plain CommonJS, read by both.
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const SCHOOLS = ['khroyals', 'wca'];
const DEFAULT = 'khroyals';

/** The school being built (SCHOOL, else Kingdom Heights); throws on an unknown one. */
function schoolId(env = process.env) {
  const id = (env.SCHOOL || DEFAULT).trim().toLowerCase();
  if (!SCHOOLS.includes(id) || !existsSync(join(__dirname, id))) {
    throw new Error(`Unknown SCHOOL "${id}". Pick one of: ${SCHOOLS.join(', ')}.`);
  }
  return id;
}

const schoolDir = (id = schoolId()) => join(__dirname, id);

module.exports = { SCHOOLS, DEFAULT, schoolId, schoolDir };
