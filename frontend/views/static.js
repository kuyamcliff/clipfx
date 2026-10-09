'use strict';
const { html, formatCount, formatBytes } = require('../src/html');
const { layout } = require('./layout');

const contact = (config) => (config.contactEmail
  ? html`<a href="mailto:${config.contactEmail}">${config.contactEmail}</a>`
  : html`the <a href="${config.sourceUrl}">project repository</a>`);

const PAGES = {
  about: {
    title: 'About',
    lead: (c) => `${c.siteName} is a place for video editors and motion designers to give each other the stuff they make.`,
    body: (c, stats) => html`
      <p>Most editors have a folder of things they built once: a set of light leaks, whooshes, a LUT that got a look right, a lower-third template. ${c.siteName} is somewhere to put them so other people can use them. You upload a file, choose a license, and send people the link. They can download it without making an account.</p>
      ${stats ? html`<p class="mono small muted">Right now: ${formatCount(stats.assets)} public assets, ${formatCount(stats.downloads)} downloads, ${formatCount(stats.creators)} people uploading.</p>` : ''}
      <h2>How it’s run</h2>
      <p>It’s a nonprofit project run by volunteers. There’s no paid tier, nothing behind a paywall, no ads and no analytics. The only costs are storage and bandwidth, which <a href="/donate">donations</a> pay for. The code is <a href="${c.sourceUrl}">open source</a>, so anyone can check how it works or run their own copy.</p>
      <h2>Who owns what</h2>
      <p>Uploaders keep the rights to their work. They choose the license, and each asset page says what you can do with it. See <a href="/licenses">licenses</a>.</p>
      <h2>Helping out</h2>
      <p>Upload something, <a href="/guidelines">report</a> anything that breaks the rules, send a pull request, or get in touch via ${contact(c)}.</p>`,
  },

  guidelines: {
    title: 'Guidelines',
    lead: () => 'What you can upload, and what gets removed.',
    body: (c, stats, cat) => html`
      <h2>Only share what you have the right to share</h2>
      <ul>
        <li><strong>Your own work</strong>, or work whose license allows redistribution (CC0, for example). Say where it came from in the description.</li>
        <li><strong>No paid or leaked assets.</strong> Packs from marketplaces such as Envato, Motion Array or Artlist get removed, and the uploader can be banned.</li>
        <li><strong>No clips ripped</strong> from films, TV, games, music videos or other people’s videos.</li>
        <li><strong>Music</strong> only if you wrote it and own every sample in it.</li>
        <li><strong>Fonts</strong> only if you designed them or their license allows redistribution (OFL, for example).</li>
      </ul>
      <h2>Keep it safe</h2>
      <ul>
        <li>No programs, installers, scripts or plugins (.exe, .dmg, .pkg, .aex, .jsx), including inside ZIPs. No cracked software.</li>
        <li>The download has to be the actual asset: no link-outs, “unlock” steps or malware.</li>
        <li>No sexual content, gore, hate symbols, harassment or other people’s personal information.</li>
        <li>Footage of identifiable people needs their consent.</li>
      </ul>
      <h2>Make it findable</h2>
      <p>A clear title, the right category and a few tags go a long way. For LUTs, templates and presets, add a preview so people can see the result. Put the frame rate, codec, software version and any required plugins in the description. If it’s a ZIP, include a short README.</p>
      <h2 id="formats">Accepted formats</h2>
      <table class="format-table"><tbody>
        ${Object.entries(cat.kinds).map(([kind, k]) => html`<tr><th scope="row">${k.name}</th><td>${Object.entries(cat.fileTypes).filter(([, t]) => t === kind).map(([ext]) => `.${ext}`).join(' ')}</td></tr>`)}
      </tbody></table>
      <h2>Enforcement</h2>
      <p>Anyone can report an asset. Moderators can remove it, block the same file from being uploaded again, or suspend the account. Repeated copyright problems mean a permanent ban. Questions go to ${contact(c)}.</p>`,
  },

  licenses: {
    title: 'Licenses',
    lead: () => 'Every upload uses one of these. This is a summary; the full license text is what counts.',
    body: (c, stats, cat) => {
      const yn = (v) => html`<td class="${v ? 'y' : 'n'}">${v ? 'yes' : 'no'}</td>`;
      return html`
      <div class="compare-wrap"><table class="compare">
        <thead><tr><th scope="col">License</th><th scope="col">Commercial use</th><th scope="col">Credit needed</th><th scope="col">Other conditions</th></tr></thead>
        <tbody>${cat.licenses.map((l) => html`<tr>
          <td><strong>${l.short}</strong><br><span class="small muted">${l.url.startsWith('http') ? html`<a href="${l.url}" target="_blank" rel="noopener">${l.name}</a>` : l.name}</span></td>
          ${yn(l.commercial)}
          <td class="${l.attribution ? 'n' : 'y'}">${l.attribution ? 'yes' : 'no'}</td>
          <td class="small">${l.shareAlike ? 'Modified versions of the asset must use the same license.' : l.noResale ? 'Don’t resell or re-upload the asset itself.' : '—'}</td>
        </tr>`)}</tbody>
      </table></div>
      <h2 id="free">Free Use License, full text</h2>
      <div class="prose">
        <p>The creator gives you a worldwide, non-exclusive, royalty-free, permanent license to use, copy, modify and include the asset in your own projects, personal or commercial, including client work, monetized videos, ads, broadcast and film, without credit.</p>
        <p>You may not sell, sublicense or redistribute the asset by itself or as part of another asset pack, template marketplace or stock library, modified or not, and you may not present it as your own original asset.</p>
        <p>The asset is provided as is, without warranty of any kind.</p>
      </div>
      <h2>Giving credit</h2>
      <p>For the CC BY licenses, put a line like this in your description or end credits. Each asset page has one ready to copy.</p>
      <pre class="code">“Light Leaks Vol. 1” by Jane Doe (https://example.org/a/abc123), licensed under CC BY 4.0</pre>`;
    },
  },

  terms: {
    title: 'Terms of use',
    lead: (c) => `Be decent, only upload what you’re allowed to, and understand that ${c.siteName} is a volunteer service provided as is.`,
    body: (c) => html`
      <h2>Your account</h2>
      <p>You’re responsible for what happens on your account. You need to be old enough to accept these terms where you live (13 or older in most places).</p>
      <h2>Your uploads</h2>
      <p>You keep ownership of what you upload. Uploading confirms you have the right to share it, and gives downloaders the license you chose. You also let ${c.siteName} store, copy, convert (for previews and thumbnails) and display it in order to run the site.</p>
      <p>You can delete uploads or your account at any time. Copies already downloaded stay under the license they were downloaded with.</p>
      <h2>Downloads</h2>
      <p>Assets come from community members, not from ${c.siteName}. Check the license on each one. Moderators remove infringing or harmful files when they find them, but can’t check everything.</p>
      <h2>Use of the service</h2>
      <p>Follow the <a href="/guidelines">guidelines</a>. Don’t mass-download or scrape in a way that slows the site down, and don’t use it as general file hosting.</p>
      <h2>Moderation</h2>
      <p>Content or accounts that break these terms may be removed.</p>
      <h2>No warranty</h2>
      <p>The service is provided as is. To the extent the law allows, ${c.siteName} and its volunteers aren’t liable for damages from using it.</p>
      <h2>Changes</h2>
      <p>These terms may change; big changes will be announced on the site. Questions: ${contact(c)}.</p>`,
  },

  privacy: {
    title: 'Privacy',
    lead: () => 'What the site stores, and what it doesn’t.',
    body: (c) => html`
      <h2>Stored</h2>
      <ul>
        <li>Your account: username, display name, bio, website, an optional email, and a hashed password.</li>
        <li>Your uploads and the details you add to them.</li>
        <li>View, download and save counts per asset. These are totals, not tied to anyone.</li>
        <li>Reports, including any contact details you put in them.</li>
      </ul>
      <h2>Not done</h2>
      <p>No ads, analytics, tracking pixels, third-party fonts or embeds. Data isn’t sold or shared, and there are no marketing emails.</p>
      <h2>Cookies</h2>
      <p>Three, all needed for the site to work: one keeps you logged in, one protects forms from cross-site requests, and one shows short messages such as “Saved”.</p>
      <h2>IP addresses</h2>
      <p>Kept in memory for a few hours to limit abuse and avoid counting the same download twice. They aren’t saved to the database. The server may keep standard access logs for a short time.</p>
      <h2>Your data</h2>
      <p>You can edit or delete your account and uploads in <a href="/settings">settings</a>. Anything else: ${contact(c)}.</p>`,
  },

  copyright: {
    title: 'Copyright and takedowns',
    lead: () => 'If something here is yours and was uploaded without permission, it will be taken down.',
    body: (c) => html`
      <h2>Requesting a takedown</h2>
      <ol>
        <li>Open the asset page and click <strong>Report this asset</strong>.</li>
        <li>Choose <strong>Copyright infringement</strong> or <strong>Paid or leaked asset</strong>.</li>
        <li>Link to your original, say that you own the rights or act for the owner, and leave an email address.</li>
      </ol>
      <p>Or email ${contact(c)} with the same information and the asset link. Moderators are volunteers and usually act within a few days. Infringing files are removed and blocked from being uploaded again.</p>
      <h2>Formal (DMCA) notices</h2>
      <p>Include your physical or electronic signature, what work is being infringed, the URL of the material, your contact details, a statement that you believe in good faith the use isn’t authorized, and a statement under penalty of perjury that the notice is accurate and you’re authorized to act for the owner.</p>
      <h2>Counter-notices</h2>
      <p>If your upload was removed by mistake, for example because you are the original creator, get in touch with the link and an explanation. Invalid claims are reversed.</p>
      <h2>Repeat infringement</h2>
      <p>Accounts that keep uploading infringing material are banned.</p>`,
  },

  donate: {
    title: 'Donate',
    lead: (c) => `${c.siteName} has no ads and no paid tier. Donations pay for storage and bandwidth, and that’s all they pay for.`,
    body: (c, stats) => html`
      ${stats ? html`<p class="mono small muted">Currently storing ${formatBytes(stats.bytes)} and serving ${formatCount(stats.downloads)} downloads so far.</p>` : ''}
      ${c.donateUrl ? html`<p><a class="btn btn-rec btn-lg" href="/donate/go" rel="noopener">Donate</a></p>`
    : html`<p class="notice">Donations aren’t set up on this instance yet. The operator can turn them on with <code>DONATE_URL</code>.</p>`}
      <p>Volunteers aren’t paid. Any money left over after hosting goes into more storage.</p>
      <h2>Other ways to help</h2>
      <ul>
        <li><strong>Upload.</strong> The library is only as good as what people put in it.</li>
        <li><strong>Report problems.</strong> Leaked packs, malware and broken files make the whole place less trustworthy.</li>
        <li><strong>Credit creators</strong> in your video descriptions, even when the license doesn’t require it.</li>
        <li><strong>Contribute code</strong> on <a href="${c.sourceUrl}">GitHub</a>.</li>
      </ul>`,
  },
};

function staticPage(ctx, { page, stats }) {
  const p = PAGES[page];
  const body = html`
  <div class="container narrow">
    <header class="page-head">
      <h1>${p.title}</h1>
      <p class="lead">${p.lead(ctx.config)}</p>
    </header>
    <article class="prose static">${p.body(ctx.config, stats, ctx.catalog)}</article>
  </div>`;
  return layout(ctx, { title: p.title, description: p.lead(ctx.config), body, og: { url: ctx.absolute(`/${page}`) } });
}

module.exports = { staticPage };
