'use strict';
const { html, raw, formatCount, formatBytes, timeAgo, formatDate } = require('../src/html');
const { layout } = require('./layout');
const { icon, hue, avatar, csrfField, emptyState, pagination, media } = require('./components');

function admin(ctx, { tab, q, stats, openReports, reports, result, users, reasons }) {
  const backUrl = `/admin?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const back = html`<input type="hidden" name="back" value="${backUrl}">`;
  const tabs = [['reports', 'Reports', openReports], ['assets', 'Assets'], ['removed', 'Removed'], ['users', 'Users']];
  const search = (placeholder) => html`<form class="adminsearch" action="/admin" role="search">
    <input type="hidden" name="tab" value="${tab}">
    ${icon('search')}<input type="search" name="q" value="${q}" placeholder="${placeholder}" aria-label="${placeholder}">
    <button class="btn btn-sm">Search</button>
  </form>`;
  let content;

  if (tab === 'reports') {
    content = reports.length ? html`<div class="reports">${reports.map((r) => html`<article class="reportcard">
      <div class="reportcard-head">
        <span class="pill pill-warn">${reasons[r.reason] || r.reason}</span>
        ${r.asset_status !== 'active' ? html`<span class="pill pill-danger">Removed</span>` : ''}
        <span class="dim">${timeAgo(r.created_at)}</span>
      </div>
      <h3><a href="/a/${r.slug}">${r.title}</a></h3>
      <p class="hint">Reported by ${r.reporter ? html`<a href="/u/${r.reporter}">@${r.reporter}</a>` : 'a visitor'}${r.contact ? html`, contact: ${r.contact}` : ''}</p>
      ${r.details ? html`<blockquote>${r.details}</blockquote>` : ''}
      <div class="reportcard-actions">
        <form method="post" action="/admin/reports/${r.id}/remove" data-confirm="Remove this asset from the site?">${csrfField(ctx)}${back}
          <input type="hidden" name="reason" value="${reasons[r.reason] || r.reason}">
          <label class="check"><input type="checkbox" name="block" ${['copyright', 'stolen', 'malware'].includes(r.reason) ? 'checked' : ''}><span>Block re-uploads</span></label>
          <button class="btn btn-sm btn-danger" type="submit">Remove asset</button>
        </form>
        <form method="post" action="/admin/reports/${r.id}/dismiss">${csrfField(ctx)}${back}<button class="btn btn-sm btn-ghost" type="submit">Dismiss</button></form>
      </div>
    </article>`)}</div>` : emptyState('No open reports', 'New reports will show up here.');
  } else if (tab === 'assets' || tab === 'removed') {
    content = html`
      ${tab === 'assets' ? search('Search titles and tags') : ''}
      ${result.items.length ? html`<ul class="rows">${result.items.map((a) => html`<li class="row row-admin" ${hue(a.category)}>
        <a class="row-thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${media(a)}</a>
        <div class="row-main">
          <a class="row-title" href="${a.url}">${a.title}</a>
          <p class="row-meta">${a.category.name} · ${formatBytes(a.file_size)} · ${a.visibility}${a.removed_reason ? ` · ${a.removed_reason}` : ''}</p>
          <p class="row-meta"><a href="/u/${a.username}">@${a.username}</a>${a.user_banned ? html` <span class="pill pill-danger">Banned</span>` : ''} · ${timeAgo(a.created_at)}</p>
        </div>
        <dl class="row-stats"><div><dt>Downloads</dt><dd>${formatCount(a.downloads)}</dd></div></dl>
        <div class="row-actions">${tab === 'assets'
    ? html`<form method="post" action="/admin/assets/${a.id}/remove" data-confirm="Remove &quot;${a.title}&quot;?">${csrfField(ctx)}${back}<input type="hidden" name="reason" value="Guidelines violation"><button class="btn btn-sm btn-danger">Remove</button></form>`
    : html`<form method="post" action="/admin/assets/${a.id}/restore">${csrfField(ctx)}${back}<button class="btn btn-sm">Restore</button></form>
          <form method="post" action="/admin/assets/${a.id}/purge" data-confirm="Permanently delete the files? This can't be undone.">${csrfField(ctx)}${back}<button class="btn btn-sm btn-danger">Delete files</button></form>`}</div>
      </li>`)}</ul>` : emptyState('Nothing here', tab === 'removed' ? 'No assets have been removed.' : 'No assets match.')}
      ${pagination(result, '/admin', { tab, q })}`;
  } else {
    content = html`
      ${search('Username, name or email')}
      ${users.length ? html`<ul class="rows">${users.map((u) => html`<li class="row row-user">
        ${avatar(u)}
        <div class="row-main">
          <a class="row-title" href="/u/${u.username}">${u.display_name}</a>
          <p class="row-meta">@${u.username}${u.role === 'admin' ? ' · moderator' : ''}${u.banned ? html` <span class="pill pill-danger">Banned</span>` : ''}</p>
          <p class="row-meta">${u.email || 'No email'} · joined ${formatDate(u.created_at)}</p>
        </div>
        <dl class="row-stats"><div><dt>Assets</dt><dd>${formatCount(u.asset_count)}</dd></div></dl>
        <div class="row-actions">${u.id === ctx.user.id ? html`<span class="dim">That's you</span>` : html`
          <form method="post" action="/admin/users/${u.id}/ban" data-confirm="${u.banned ? 'Unban' : 'Ban'} @${u.username}?">${csrfField(ctx)}${back}<button class="btn btn-sm ${u.banned ? '' : 'btn-danger'}">${u.banned ? 'Unban' : 'Ban'}</button></form>
          <form method="post" action="/admin/users/${u.id}/role" data-confirm="Change @${u.username}'s role?">${csrfField(ctx)}${back}<button class="btn btn-sm btn-ghost">${u.role === 'admin' ? 'Remove mod' : 'Make mod'}</button></form>
          <form method="post" action="/admin/users/${u.id}/reset">${csrfField(ctx)}${back}<button class="btn btn-sm btn-ghost">Reset link</button></form>`}</div>
      </li>`)}</ul>` : emptyState('No users found', 'Try a different search.')}`;
  }

  const body = html`
  <div class="container">
    <header class="pagehead"><div><h1>Moderation</h1><p class="sub">Reports, removals and accounts.</p></div></header>
    <div class="statgrid">
      <div class="stat"><p class="stat-label">Public assets</p><p class="stat-num">${formatCount(stats.assets)}</p></div>
      <div class="stat"><p class="stat-label">Members</p><p class="stat-num">${formatCount(stats.users)}</p></div>
      <div class="stat"><p class="stat-label">Downloads</p><p class="stat-num">${formatCount(stats.downloads)}</p></div>
      <div class="stat"><p class="stat-label">Stored</p><p class="stat-num">${formatBytes(stats.bytes)}</p></div>
    </div>
    <nav class="seg seg-scroll" aria-label="Moderation sections">${tabs.map(([id, label, n]) => html`<a href="/admin?tab=${id}" ${tab === id ? raw('aria-current="page"') : ''}>${label}${n ? html` <span class="badge">${n}</span>` : ''}</a>`)}</nav>
    ${content}
  </div>`;
  return layout(ctx, { title: 'Moderation', body, noindex: true });
}

module.exports = { admin };
