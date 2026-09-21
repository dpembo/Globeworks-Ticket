module.exports = {
  MAIN_COMMAND: 'globeworks-ticket',

  PERMISSIONS: {
    VIEW_TICKETS: 'view_tickets',
    CLAIM: 'claim',
    UNCLAIM: 'unclaim',
    CLOSE: 'close',
    REOPEN: 'reopen',
    DELETE: 'delete',
    RENAME: 'rename',
    ADD_USERS: 'add_users',
    REMOVE_USERS: 'remove_users',
    VIEW_TRANSCRIPTS: 'view_transcripts',
    MANAGE_PANELS: 'manage_panels',
    MANAGE_APPLICATIONS: 'manage_applications',
    REVIEW_APPLICATIONS: 'review_applications',
    ACCEPT_APPLICATIONS: 'accept_applications',
    DENY_APPLICATIONS: 'deny_applications',
    MANAGE_SETTINGS: 'manage_settings',
    RECOVER_ARCHIVED: 'recover_archived',
    MANAGE_CUSTOM_COMMANDS: 'manage_custom_commands'
  },

  PERMISSION_LABELS: {
    view_tickets: 'View Tickets',
    claim: 'Claim Tickets',
    unclaim: 'Unclaim Tickets',
    close: 'Close Tickets',
    reopen: 'Reopen Tickets',
    delete: 'Delete Tickets',
    rename: 'Rename Tickets',
    add_users: 'Add Users',
    remove_users: 'Remove Users',
    view_transcripts: 'View Transcripts',
    manage_panels: 'Manage Panels',
    manage_applications: 'Manage Applications',
    review_applications: 'Review Applications',
    accept_applications: 'Accept Applications',
    deny_applications: 'Deny Applications',
    manage_settings: 'Manage Bot Settings',
    recover_archived: 'Recover Archived Tickets',
    manage_custom_commands: 'Manage Custom Commands'
  },

  TICKET_STATUS: {
    OPEN: 'open',
    CLOSED: 'closed',
    ARCHIVED: 'archived',
    PERMANENT: 'permanent'
  },

  APPLICATION_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DENIED: 'denied'
  },

  BUTTON_STYLES: {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4
  },

  COLORS: {
    PRIMARY: 0x5865F2,
    SUCCESS: 0x57F287,
    DANGER: 0xED4245,
    WARNING: 0xFEE75C,
    INFO: 0x5865F2,
    BLURPLE: 0x5865F2
  },

  DEFAULT_RECOVERY_DAYS: 21
};
