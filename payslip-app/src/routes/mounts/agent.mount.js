'use strict';

/** מחבר /agent (סוכן הצ'אט). */
function mountAgent(api, { services }) {
  api.use('/agent', services.agent.delegate);
}

module.exports = { mountAgent };
