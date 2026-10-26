'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS } = require('../src/mcp');

test('Discord tools are registered in the existing ClipFX MCP server', () => {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  const expected = [
    'discord_list_servers', 'discord_list_channels', 'discord_read_messages',
    'discord_send_message', 'discord_get_server_info',
    'discord_list_members', 'discord_get_member', 'discord_edit_member',
    'discord_kick_member', 'discord_ban_member', 'discord_unban_member',
    'discord_list_bans', 'discord_list_roles', 'discord_create_role',
    'discord_edit_role', 'discord_delete_role', 'discord_assign_role',
    'discord_remove_role', 'discord_create_channel', 'discord_edit_channel',
    'discord_delete_channel', 'discord_edit_message', 'discord_delete_message',
    'discord_bulk_delete_messages', 'discord_add_reaction', 'discord_remove_reaction',
    'discord_pin_message', 'discord_unpin_message', 'discord_list_pins',
    'discord_create_invite', 'discord_list_emojis', 'discord_list_webhooks',
    'discord_create_webhook', 'discord_delete_webhook', 'discord_list_events',
    'discord_create_event', 'discord_delete_event', 'discord_get_audit_log',
    'discord_create_thread',
  ];
  for (const name of expected) assert.ok(byName.has(name), `missing ${name}`);
  assert.equal(expected.length, 39);
  assert.deepEqual(byName.get('discord_send_message').inputSchema.required, ['channel_id', 'content']);
  assert.equal(byName.get('discord_send_message').annotations.readOnlyHint, false);
  assert.equal(byName.get('discord_ban_member').annotations.destructiveHint, true);
  assert.equal(byName.get('discord_delete_channel').annotations.destructiveHint, true);
});
