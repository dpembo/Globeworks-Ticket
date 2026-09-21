const { PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../database/db');
const { PERMISSIONS } = require('../config/constants');

function hasDiscordAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function getRolePermissions(guildId, roleIds) {
  if (!roleIds || roleIds.length === 0) return new Set();
  const db = getDb();
  const placeholders = roleIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT permission FROM role_permissions WHERE guild_id = ? AND role_id IN (${placeholders})`
  ).all(guildId, ...roleIds);
  return new Set(rows.map(r => r.permission));
}

function memberHasPermission(member, permission) {
  if (!member) return false;
  if (hasDiscordAdmin(member)) return true;

  const roleIds = member.roles.cache.map(r => r.id);
  const perms = getRolePermissions(member.guild.id, roleIds);
  return perms.has(permission);
}

function memberHasAnyPermission(member, permissions) {
  if (!member) return false;
  if (hasDiscordAdmin(member)) return true;
  const roleIds = member.roles.cache.map(r => r.id);
  const perms = getRolePermissions(member.guild.id, roleIds);
  return permissions.some(p => perms.has(p));
}

function setRolePermission(guildId, roleId, permission, enabled) {
  const db = getDb();
  if (enabled) {
    db.prepare(
      `INSERT OR IGNORE INTO role_permissions (guild_id, role_id, permission) VALUES (?, ?, ?)`
    ).run(guildId, roleId, permission);
  } else {
    db.prepare(
      `DELETE FROM role_permissions WHERE guild_id = ? AND role_id = ? AND permission = ?`
    ).run(guildId, roleId, permission);
  }
}

function getAllRolePermissions(guildId) {
  const db = getDb();
  return db.prepare(
    `SELECT role_id, permission FROM role_permissions WHERE guild_id = ?`
  ).all(guildId);
}

function clearRolePermissions(guildId, roleId) {
  const db = getDb();
  db.prepare(`DELETE FROM role_permissions WHERE guild_id = ? AND role_id = ?`).run(guildId, roleId);
}

module.exports = {
  hasDiscordAdmin,
  memberHasPermission,
  memberHasAnyPermission,
  setRolePermission,
  getAllRolePermissions,
  clearRolePermissions,
  getRolePermissions
};
