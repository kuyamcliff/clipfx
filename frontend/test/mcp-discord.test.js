'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS } = require('../src/mcp');

test('Discord tools are registered exactly once in the existing ClipFX MCP server', () => {
  const discordTools = TOOLS.filter((tool) => tool.name.startsWith('discord_'));
  const names = discordTools.map((tool) => tool.name);
  assert.equal(names.length, 73);
  assert.equal(new Set(names).size, names.length, 'Discord tool names must be unique');
  for (const name of ["discord_list_members","discord_get_member","discord_edit_member","discord_kick_member","discord_ban_member","discord_unban_member","discord_list_bans","discord_list_roles","discord_create_role","discord_edit_role","discord_delete_role","discord_assign_role","discord_remove_role","discord_create_channel","discord_edit_channel","discord_delete_channel","discord_edit_message","discord_delete_message","discord_bulk_delete_messages","discord_add_reaction","discord_remove_reaction","discord_pin_message","discord_unpin_message","discord_list_pins","discord_create_invite","discord_list_emojis","discord_list_webhooks","discord_create_webhook","discord_delete_webhook","discord_list_events","discord_create_event","discord_delete_event","discord_get_audit_log","discord_create_thread","discord_get_guild","discord_edit_guild","discord_list_invites","discord_list_stickers","discord_create_emoji","discord_edit_emoji","discord_delete_emoji","discord_list_active_threads","discord_create_forum_post","discord_set_channel_permission","discord_delete_channel_permission","discord_list_auto_moderation_rules","discord_get_auto_moderation_rule","discord_create_auto_moderation_rule","discord_edit_auto_moderation_rule","discord_delete_auto_moderation_rule","discord_list_stage_instances","discord_create_stage_instance","discord_edit_stage_instance","discord_delete_stage_instance","discord_move_member_voice","discord_list_integrations","discord_list_application_commands","discord_create_application_command","discord_delete_application_command","discord_list_guild_templates","discord_create_guild_template","discord_delete_guild_template","discord_get_guild_prune_count","discord_prune_guild","discord_get_event_subscribers","discord_create_poll_message","discord_get_message","discord_get_bot_user","discord_list_servers","discord_list_channels","discord_read_messages","discord_send_message","discord_get_server_info"]) assert.ok(names.includes(name), `missing ${name}`);
  const byName = new Map(discordTools.map((tool) => [tool.name, tool]));
  assert.deepEqual(byName.get('discord_send_message').inputSchema.required, ['channel_id', 'content']);
  assert.equal(byName.get('discord_send_message').annotations.readOnlyHint, false);
  assert.equal(byName.get('discord_ban_member').annotations.destructiveHint, true);
  assert.equal(byName.get('discord_delete_channel').annotations.destructiveHint, true);
  assert.equal(byName.get('discord_prune_guild').annotations.destructiveHint, true);
  assert.ok(byName.has('discord_list_servers'));
  assert.ok(byName.has('discord_get_bot_user'));
});
