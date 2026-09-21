const { getDb } = require('./db');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS guild_settings (
          guild_id TEXT PRIMARY KEY,
          ticket_counter INTEGER NOT NULL DEFAULT 0,
          archive_forum_id TEXT,
          recovery_channel_id TEXT,
          recovery_days INTEGER NOT NULL DEFAULT 21,
          transcript_channel_id TEXT,
          auto_transcript INTEGER NOT NULL DEFAULT 1,
          ticket_category_id TEXT,
          support_role_id TEXT,
          log_ticket_create TEXT,
          log_ticket_close TEXT,
          log_ticket_delete TEXT,
          log_claim TEXT,
          log_reopen TEXT,
          log_user_change TEXT,
          log_application TEXT,
          log_permission TEXT,
          log_config TEXT,
          log_archive TEXT,
          log_restore TEXT,
          log_expire TEXT,
          log_custom_command TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS panels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          embed_title TEXT,
          embed_description TEXT,
          embed_footer TEXT,
          embed_color TEXT DEFAULT '#5865F2',
          button_label TEXT NOT NULL DEFAULT 'Open Ticket',
          button_emoji TEXT,
          button_style TEXT NOT NULL DEFAULT 'Primary',
          category_id TEXT,
          staff_role_id TEXT,
          naming_format TEXT NOT NULL DEFAULT 'ticket-{number}',
          claim_required INTEGER NOT NULL DEFAULT 0,
          max_open_per_user INTEGER NOT NULL DEFAULT 1,
          use_thread INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          message_id TEXT,
          channel_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(guild_id, name)
        );

        CREATE TABLE IF NOT EXISTS panel_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          panel_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          label TEXT NOT NULL,
          placeholder TEXT,
          required INTEGER NOT NULL DEFAULT 1,
          style TEXT NOT NULL DEFAULT 'Short',
          min_length INTEGER DEFAULT 0,
          max_length INTEGER DEFAULT 1000,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          ticket_number INTEGER NOT NULL,
          channel_id TEXT,
          thread_id TEXT,
          panel_id INTEGER,
          creator_id TEXT NOT NULL,
          claimant_id TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          ticket_type TEXT,
          custom_name TEXT,
          close_reason TEXT,
          closed_by TEXT,
          closed_at TEXT,
          archive_forum_post_id TEXT,
          recovery_expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(guild_id, ticket_number),
          FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS form_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          ticket_id INTEGER NOT NULL,
          panel_id INTEGER,
          question_id INTEGER,
          question_text TEXT NOT NULL,
          answer TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ticket_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          added_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(ticket_id, user_id),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          embed_title TEXT,
          embed_description TEXT,
          embed_footer TEXT,
          embed_color TEXT DEFAULT '#5865F2',
          button_label TEXT NOT NULL DEFAULT 'Apply',
          button_emoji TEXT,
          button_style TEXT NOT NULL DEFAULT 'Primary',
          category_id TEXT,
          staff_role_id TEXT,
          review_channel_id TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          message_id TEXT,
          channel_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(guild_id, name)
        );

        CREATE TABLE IF NOT EXISTS application_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          application_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          label TEXT NOT NULL,
          placeholder TEXT,
          required INTEGER NOT NULL DEFAULT 1,
          style TEXT NOT NULL DEFAULT 'Short',
          min_length INTEGER DEFAULT 0,
          max_length INTEGER DEFAULT 1000,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS application_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          application_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          channel_id TEXT,
          thread_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          reviewer_id TEXT,
          decision_reason TEXT,
          decided_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS application_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          submission_id INTEGER NOT NULL,
          question_id INTEGER,
          question_text TEXT NOT NULL,
          answer TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (submission_id) REFERENCES application_submissions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS role_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          permission TEXT NOT NULL,
          UNIQUE(guild_id, role_id, permission)
        );

        CREATE TABLE IF NOT EXISTS custom_commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          response_type TEXT NOT NULL DEFAULT 'embed',
          embed_title TEXT,
          embed_description TEXT,
          embed_footer TEXT,
          embed_color TEXT DEFAULT '#5865F2',
          embed_thumbnail TEXT,
          embed_image TEXT,
          embed_author TEXT,
          embed_timestamp INTEGER NOT NULL DEFAULT 0,
          ephemeral INTEGER NOT NULL DEFAULT 0,
          required_roles TEXT,
          required_permissions TEXT,
          creator_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(guild_id, name)
        );

        CREATE TABLE IF NOT EXISTS custom_command_fields (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          value TEXT NOT NULL,
          inline INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (command_id) REFERENCES custom_commands(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS custom_command_buttons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          label TEXT NOT NULL,
          url TEXT,
          style TEXT DEFAULT 'Link',
          emoji TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (command_id) REFERENCES custom_commands(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(guild_id, creator_id);
        CREATE INDEX IF NOT EXISTS idx_panels_guild ON panels(guild_id);
        CREATE INDEX IF NOT EXISTS idx_form_responses_ticket ON form_responses(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_applications_guild ON applications(guild_id);
        CREATE INDEX IF NOT EXISTS idx_custom_commands_guild ON custom_commands(guild_id);
        CREATE INDEX IF NOT EXISTS idx_role_permissions_guild ON role_permissions(guild_id);
      `);
    }
  }
];

function migrate() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const current = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  const currentVersion = current?.v || 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      const run = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      });
      run();
      console.log(`[DB] Applied migration v${migration.version}: ${migration.name}`);
    }
  }
}

module.exports = { migrate };
