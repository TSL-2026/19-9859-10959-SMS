const pool = require('../db/pool');
const logger = require('./logger');
const { sendMail } = require('./email');

async function evaluateSignal(signal, tenantId) {
  const { rows: rules } = await pool.query(
    `SELECT * FROM alert_rules
     WHERE tenant_id = $1
       AND is_active = true
       AND severity_threshold <= $2
       AND probability_threshold <= $3`,
    [tenantId, signal.severity, signal.probability]
  );

  if (rules.length === 0) {
    return [];
  }

  const created = [];

  for (const rule of rules) {
    const result = await pool.query(
      `INSERT INTO alerts (tenant_id, signal_id, rule_id, alert_level)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, signal.id, rule.id, rule.alert_level]
    );

    const alert = result.rows[0];
    created.push(alert);

    logger.info('Alert triggered', {
      alertId: alert.id,
      rule: rule.rule_name,
      level: rule.alert_level,
      signalId: signal.id,
    });

    if (rule.alert_level === 'CRITICAL') {
      const channels = rule.channels || [];
      if (channels.includes('email') || channels.length === 0) {
        try {
          const { rows: users } = await pool.query(
            `SELECT email FROM users WHERE tenant_id = $1`,
            [tenantId]
          );
          for (const user of users) {
            await sendMail({
              to: user.email,
              subject: `[CRITICAL] Alert: ${rule.rule_name}`,
              html: `
                <h2>Critical Alert Triggered</h2>
                <p><strong>Rule:</strong> ${rule.rule_name}</p>
                <p><strong>Signal:</strong> ${signal.report_type} — ${signal.report_id || 'N/A'}</p>
                <p><strong>Severity:</strong> ${signal.severity} / <strong>Probability:</strong> ${signal.probability}</p>
                <p><strong>Risk Level:</strong> ${signal.risk_level}</p>
                <p><strong>Description:</strong> ${signal.description_raw || 'N/A'}</p>
              `,
            });
          }
        } catch (err) {
          logger.error('Failed to send critical alert email', { error: err.message, ruleId: rule.id });
        }
      }
    }
  }

  return created;
}

module.exports = { evaluateSignal };
