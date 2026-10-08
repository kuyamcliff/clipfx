'use strict';
const { html, formatCount, formatBytes, timeAgo, formatDate } = require('../html');
const { layout } = require('./layout');
const { avatar, csrfField, emptyState, pagination } = require('./components');

function admin(ctx, { tab, q, stats, openReports, reports, result, users, reasons }) {
  const tabs = [['reports', `Reports${openReports ? ` (${openReports})` : ''}`], ['assets', 'All assets'], ['removed', 'Removed'], ['users', 'Users']];
  let content;

  if (tab === 'reports') {
    content = reports.length ? html`<div>${reports.map((r) => html`<article class="report">
      <div class="report-head">
        <div><span class="status status-warn">${reasons[r.reason] || r.reason}</span>
          <h3><a href="/a/${r.slug}">${r.title}</a> ${r.asset_status !== 'active' ? html`<span class="status status-danger">Removed</span>` : ''}</h3>
          <p class="muted small">Reported ${timeAgo(r.created_at)} by ${r.reporter ? html`<a href="/u/${r.reporter}">@${r.reporter}</a>` : 'a visitor'}${r.contact ? html` · contact: ${r.contact}` : ''}</p>
        </div>
      </div>
      ${r.details ? html`<blockquote>${r.details}</blockquote>` : ''}
      <div class="btn-row">
        <form method="post" action="/admin/reports/${r.id}/remove" class="inline-form" data-confirm="Remove this asset from the site?">${csrfField(ctx)}
          <input type="hidden" name="reason" value="${reasons[r.reason] || r.reason}">
          <label class="check small"><input type="checkbox" name="block" ${['copyright', 'stolen', 'malware'].includes(r.reason) ? 'checked' : ''}> Block re-uploads</label>
          <button class="btn btn-danger btn-sm" type="submit">Remove asset</button>
        </form>
        <form method="post" action="/admin/reports/${r.id}/dismiss">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">Dismiss</button></form>
      </div>
    </article>`)}</div>` : emptyState(null, 'No open reports', 'New reports show up here.');
  } else if (tab === 'assets' || tab === 'removed') {
    content = html`
      ${tab === 'assets' ? html`<form class="admin-search" action="/admin"><input type="hidden" name="tab" value="assets"><input type="search" name="q" value="${q}" placeholder="Search titles, tags…" aria-label="Search assets"><button class="btn btn-secondary btn-sm">Search</button></form>` : ''}
      ${result.items.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Asset</th><th scope="col">Uploader</th><th scope="col" class="num">Downloads</th><th scope="col">Uploaded</th><th scope="col">Actions</th></tr></thead>
        <tbody>${result.items.map((a) => html`<tr>
          <td><a class="table-asset" href="${a.url}"><span class="table-thumb">${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="" loading="lazy">` : `.${a.file_ext}`}</span>
            <span><strong>${a.title}</strong><span class="mono">${a.category.name} · ${formatBytes(a.file_size)} · ${a.visibility}${a.removed_reason ? ` · ${a.removed_reason}` : ''}</span></span></a></td>
          <td><a href="/u/${a.username}">@${a.username}</a>${a.user_banned ? html` <span class="status status-danger">banned</span>` : ''}</td>
          <td class="num">${formatCount(a.downloads)}</td>
          <td>${timeAgo(a.created_at)}</td>
          <td class="actions">${tab === 'assets'
    ? html`<form method="post" action="/admin/assets/${a.id}/remove" data-confirm="Remove “${a.title}”?">${csrfField(ctx)}<input type="hidden" name="reason" value="Guidelines violation"><button class="btn btn-danger-ghost btn-sm">Remove</button></form>`
    : html`<form method="post" action="/admin/assets/${a.id}/restore">${csrfField(ctx)}<button class="btn btn-ghost btn-sm">Restore</button></form>
              <form method="post" action="/admin/assets/${a.id}/purge" data-confirm="Permanently delete the files? This can’t be undone.">${csrfField(ctx)}<button class="btn btn-danger-ghost btn-sm">Delete files</button></form>`}</td>
        </tr>`)}</tbody></table></div>` : emptyState('box', 'Nothing here', tab === 'removed' ? 'No assets have been removed.' : 'No assets match.')}
      ${pagination(result, '/admin', { tab, q })}`;
  } else {
    content = html`
      <form class="admin-search" action="/admin"><input type="hidden" name="tab" value="users"><input type="search" name="q" value="${q}" placeholder="Username, name or email" aria-label="Search users"><button class="btn btn-secondary btn-sm">Search</button></form>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">User</th><th scope="col">Email</th><th scope="col" class="num">Assets</th><th scope="col">Joined</th><th scope="col">Actions</th></tr></thead>
        <tbody>${users.map((u) => html`<tr>
          <td><a class="table-asset" href="/u/${u.username}">${avatar(u, 'sm')}<span><strong>${u.display_name}</strong><span class="mono">@${u.username}${u.role === 'admin' ? ' · moderator' : ''}${u.banned ? ' · banned' : ''}</span></span></a></td>
          <td class="small">${u.email || html`<span class="muted">—</span>`}</td>
          <td class="num">${u.asset_count}</td>
          <td>${formatDate(u.created_at)}</td>
          <td class="actions">${u.id === ctx.user.id ? html`<span class="muted small">You</span>` : html`
            <form method="post" action="/admin/users/${u.id}/ban" data-confirm="${u.banned ? 'Unban' : 'Ban'} @${u.username}?">${csrfField(ctx)}<button class="btn ${u.banned ? 'btn-ghost' : 'btn-danger-ghost'} btn-sm">${u.banned ? 'Unban' : 'Ban'}</button></form>
            <form method="post" action="/admin/users/${u.id}/role" data-confirm="Change @${u.username}’s role?">${csrfField(ctx)}<button class="btn btn-ghost btn-sm">${u.role === 'admin' ? 'Remove mod' : 'Make mod'}</button></form>
            <form method="post" action="/admin/users/${u.id}/reset">${csrfField(ctx)}<button class="btn btn-ghost btn-sm">Reset link</button></form>`}</td>
        </tr>`)}</tbody></table></div>`;
  }

  const body = html`
  <div class="container">
    <header class="page-head"><h1>Moderation</h1></header>
    <div class="summary">
      <span><b>${formatCount(stats.assets)}</b> public assets</span>
      <span><b>${formatCount(stats.users)}</b> members</span>
      <span><b>${formatCount(stats.downloads)}</b> downloads</span>
      <span><b>${formatBytes(stats.bytes)}</b> stored</span>
    </div>
    <nav class="tabs" aria-label="Moderation sections">${tabs.map(([id, label]) => html`<a href="/admin?tab=${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? html`aria-current="page"` : ''}>${label}</a>`)}</nav>
    ${content}
  </div>`;
  return layout(ctx, { title: 'Moderation', body, noindex: true });
}

module.exports = { admin };
