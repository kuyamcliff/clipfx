'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS } = require('../src/mcp');

test('Discord tools are part of the existing ClipFX MCP tool registry', () => {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  for (const name of [
    'discord_list_servers',
    'discord_list_channels',
    'discord_read_messages',
    'discord_send_message',
    'discord_get_server_info',
  ]) assert.ok(byName.has(name), `missing ${name}`);

  assert.deepEqual(byName.get('discord_list_servers').inputSchema.required, []);
  assert.deepEqual(byName.get('discord_list_channels').inputSchema.required, ['guild_id']);
  assert.deepEqual(byName.get('discord_read_messages').inputSchema.required, ['channel_id']);
  assert.deepEqual(byName.get('discord_send_message').inputSchema.required, ['channel_id', 'content']);
  assert.deepEqual(byName.get('discord_get_server_info').inputSchema.required, ['guild_id']);
  assert.equal(byName.get('discord_send_message').annotations.readOnlyHint, false);
});
