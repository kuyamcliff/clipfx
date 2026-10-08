'use strict';
const { html, formatCount, formatBytes } = require('../html');
const { layout } = require('./layout');
const { icon } = require('./components');
const { LICENSES, FILE_TYPES, KINDS } = require('../catalog');

const contact = (config) => (config.contactEmail
  ? html`<a href="mailto:${config.contactEmail}">${config.contactEmail}</a>`
  : html`the <a href="${config.sourceUrl}">project repository</a>`);

const PAGES = {
  about: {
    title: 'About & mission',
    lead: (c) => `${c.siteName} is a nonprofit library where video editors and motion designers share free assets with each other.`,
    body: (c, stats) => html`
      ${stats ? html`<div class="stats-row inline">
        <div><strong>${formatCount(stats.assets)}</strong><span>free assets</span></div>
        <div><strong>${formatCount(stats.downloads)}</strong><span>downloads</span></div>
        <div><strong>${formatCount(stats.creators)}</strong><span>creators</span></div>
      </div>` : ''}
      <h2>Why we exist</h2>
      <p>Every editor has a folder of things they made once and never used again: a set of light leaks, a whoosh pack, a LUT that nailed a look, a lower-third template. Meanwhile, beginners are paying for asset subscriptions or downloading sketchy “free packs” bundled with malware.</p>
      <p>${c.siteName} connects the two. Upload what you’ve made, pick a clear license, and share one short link. Anyone can download it — no paywall, no account, no countdown timers.</p>
      <h2>What we promise</h2>
      <ul class="check-list">
        <li>${icon('check')}<span><strong>Free forever.</strong> No premium tier, no “pro” downloads, no paywalled resolution.</span></li>
        <li>${icon('check')}<span><strong>No ads and no tracking.</strong> No analytics scripts, no third-party cookies, no selling data.</span></li>
        <li>${icon('check')}<span><strong>Creators keep their rights.</strong> You choose the license; we just host the file.</span></li>
        <li>${icon('check')}<span><strong>Clear licensing.</strong> Every asset shows exactly what you can and can’t do with it.</span></li>
        <li>${icon('check')}<span><strong>Open source.</strong> The code that runs this site is public. Anyone can audit it or run their own copy.</span></li>
      </ul>
      <h2>How it’s funded</h2>
      <p>Hosting video is expensive. Our only costs are storage, bandwidth and the occasional domain renewal, and they’re covered by <a href="/donate">donations</a> from people who find the site useful. Volunteers handle moderation and development.</p>
      <h2>Get involved</h2>
      <p><a href="/upload">Share an asset</a>, report anything that breaks the <a href="/guidelines">guidelines</a>, contribute code on <a href="${c.sourceUrl}">GitHub</a>, or reach the team via ${contact(c)}.</p>`,
  },

  guidelines: {
    title: 'Community guidelines',
    lead: () => 'A few simple rules keep this place useful, legal and safe for everyone.',
    body: (c) => html`
      <h2>Share things you have the right to share</h2>
      <ul>
        <li><strong>Upload your own work</strong>, or work that’s clearly licensed for redistribution (e.g. CC0). Credit sources in the description.</li>
        <li><strong>No paid or leaked assets.</strong> Re-uploading packs from marketplaces (Envato, Motion Array, Artlist, etc.) or “free downloads” of paid products will be removed and can get you banned.</li>
        <li><strong>No ripped content.</strong> Clips from films, TV, games, music videos or other creators’ videos aren’t yours to license.</li>
        <li><strong>Music:</strong> only upload tracks you composed and own outright, including all samples.</li>
        <li><strong>Fonts:</strong> only fonts you designed or whose license explicitly allows redistribution (e.g. OFL).</li>
      </ul>
      <h2>Keep it safe</h2>
      <ul>
        <li><strong>No executables, installers, scripts or plugins</strong> (.exe, .dmg, .pkg, .aex, .jsx, cracked software). Archives containing them will be removed.</li>
        <li>No malware, phishing links or “unlock” schemes. Every download must be the actual asset.</li>
        <li>No sexual content, gore, hate symbols, harassment or personal data about others.</li>
        <li>Footage that shows identifiable people should only be shared with their consent.</li>
      </ul>
      <h2>Make it useful</h2>
      <ul>
        <li>Use a clear title and the right category. Add tags people will actually search for.</li>
        <li>Add a preview for LUTs, templates and presets so people can see the result before downloading.</li>
        <li>Mention frame rate, resolution, codec, software version and any required plugins in the description.</li>
        <li>For packs, include a short README inside the ZIP.</li>
      </ul>
      <h2>Supported formats</h2>
      <div class="format-table">
        ${Object.entries(KINDS).map(([kind, k]) => html`<div><strong>${icon(k.icon)}${k.name}</strong><span>${Object.entries(FILE_TYPES).filter(([, t]) => t.kind === kind).map(([ext]) => `.${ext}`).join(' ')}</span></div>`)}
      </div>
      <h2>Enforcement</h2>
      <p>Anyone can report an asset. Volunteer moderators review reports and may remove assets, block files from being re-uploaded, or suspend accounts. Repeated copyright infringement leads to a permanent ban. Questions? Contact ${contact(c)}.</p>`,
  },

  licenses: {
    title: 'Licenses explained',
    lead: () => 'Every asset is shared under one of these licenses. Here’s what each one lets you do.',
    body: () => html`
      <div class="license-cards">
        ${LICENSES.map((l) => html`<section class="panel license-card" id="${l.id}">
          <div class="license-head"><span class="chip chip-license">${l.short}</span><h2>${l.name}</h2></div>
          <p>${l.summary}</p>
          <ul class="license-list">
            <li class="yes">${icon('check')}Use in personal projects</li>
            <li class="${l.commercial ? 'yes' : 'no'}">${icon(l.commercial ? 'check' : 'x')}${l.commercial ? 'Use in commercial & client work' : 'No commercial use'}</li>
            <li class="${l.attribution ? 'no' : 'yes'}">${icon(l.attribution ? 'info' : 'check')}${l.attribution ? 'Credit the creator' : 'No credit required'}</li>
            ${l.shareAlike ? html`<li class="no">${icon('info')}Modified versions of the asset must use the same license</li>` : ''}
            ${l.noResale ? html`<li class="no">${icon('x')}Don’t sell or redistribute the asset itself as a standalone file</li>` : ''}
          </ul>
          ${l.url.startsWith('http') ? html`<a href="${l.url}" target="_blank" rel="noopener">Read the full license →</a>` : ''}
        </section>`)}
      </div>
      <h2 id="free">The Free Use License, in full</h2>
      <div class="prose">
        <p>The creator grants you a worldwide, non-exclusive, royalty-free, perpetual license to use, copy, modify and incorporate the asset into your own projects — personal or commercial, including client work, monetized videos, ads, broadcast and films — without attribution.</p>
        <p>You may not sell, sublicense or redistribute the asset on its own or as part of another asset pack, template marketplace or stock library, whether modified or not, and you may not claim it as your own original asset.</p>
        <p>The asset is provided “as is”, without warranty of any kind.</p>
      </div>
      <h2>How to give credit</h2>
      <p>For CC BY licenses, put a line like this in your video description or credits. Each asset page has a copy-ready credit.</p>
      <pre class="code">“Light Leaks Vol. 1” by Jane Doe (https://example.org/a/abc123) — licensed under CC BY 4.0</pre>
      <p class="muted small">This page is a summary, not legal advice. The full license text always wins.</p>`,
  },

  terms: {
    title: 'Terms of use',
    lead: (c) => `The short version: be decent, only share what you’re allowed to, and understand that ${c.siteName} is a volunteer-run service provided as is.`,
    body: (c) => html`
      <h2>1. Your account</h2>
      <p>You’re responsible for activity on your account. Keep your password safe. You must be old enough to agree to these terms where you live (13+ in most places).</p>
      <h2>2. Your uploads</h2>
      <p>You keep ownership of everything you upload. By uploading, you confirm you have the right to share it, and you grant downloaders the license you selected. You also grant ${c.siteName} a license to host, copy, transcode (for previews and thumbnails) and display it to operate the service.</p>
      <p>You can delete your uploads or your account at any time. Copies people have already downloaded remain under the license they received.</p>
      <h2>3. Downloads</h2>
      <p>Assets are provided by community members, not by ${c.siteName}. Check the license on each asset and use your own judgement. We do our best to remove infringing or harmful content but can’t guarantee every file.</p>
      <h2>4. Acceptable use</h2>
      <p>Follow the <a href="/guidelines">community guidelines</a>. Don’t abuse the service: no automated mass downloading, scraping that degrades performance, or using it as generic file hosting for unrelated content.</p>
      <h2>5. Moderation</h2>
      <p>We may remove content or suspend accounts that break these terms, at our discretion.</p>
      <h2>6. No warranty</h2>
      <p>The service is provided “as is” without warranties. To the extent allowed by law, ${c.siteName} and its volunteers aren’t liable for any damages arising from its use.</p>
      <h2>7. Changes</h2>
      <p>We may update these terms; significant changes will be announced on the site. Questions: ${contact(c)}.</p>`,
  },

  privacy: {
    title: 'Privacy',
    lead: () => 'We collect as little as possible, and we never sell or share it.',
    body: (c) => html`
      <h2>What we store</h2>
      <ul>
        <li><strong>Account details:</strong> username, display name, optional email, bio, website, and a securely hashed password.</li>
        <li><strong>Your uploads</strong> and the information you add to them.</li>
        <li><strong>Counts:</strong> total views, downloads and saves per asset. These are anonymous numbers.</li>
        <li><strong>Reports</strong> you submit, including any contact details you choose to provide.</li>
      </ul>
      <h2>What we don’t do</h2>
      <ul>
        <li>No ads, no analytics scripts, no tracking pixels, no third-party fonts or embeds.</li>
        <li>No selling or sharing your data with anyone.</li>
        <li>No marketing emails.</li>
      </ul>
      <h2>Cookies</h2>
      <p>We use three strictly necessary cookies: one to keep you logged in, one to protect forms against cross-site attacks, and a short-lived one to show messages like “Saved”. That’s it — so there’s no cookie banner.</p>
      <h2>IP addresses</h2>
      <p>Your IP address is held briefly in memory to prevent abuse (rate limiting) and to avoid double-counting downloads. It isn’t written to our database. Standard web server logs may be kept for a short time for security.</p>
      <h2>Your choices</h2>
      <p>You can edit your profile or delete your account and all uploads at any time from <a href="/settings">Settings</a>. For anything else, contact ${contact(c)}.</p>`,
  },

  copyright: {
    title: 'Copyright & takedowns',
    lead: () => 'We respect creators — that’s the whole point of this site. If something here is yours and was shared without permission, we’ll take it down.',
    body: (c) => html`
      <h2>How to request a takedown</h2>
      <ol>
        <li>Open the asset page and click <strong>Report this asset</strong>.</li>
        <li>Choose <strong>Copyright infringement / I own this</strong> (or <strong>Paid or leaked asset</strong>).</li>
        <li>Include a link to your original work, a statement that you own the rights (or represent the owner), and an email we can reach you at.</li>
      </ol>
      <p>You can also email ${contact(c)} with the same information, including the asset link(s). Volunteer moderators usually act within a few days. Clearly infringing files are removed and blocked from being uploaded again.</p>
      <h2>Formal notices (DMCA)</h2>
      <p>A formal notice should include: your physical or electronic signature; identification of the copyrighted work; the URL(s) of the infringing material; your contact information; a statement of good-faith belief that the use isn’t authorized; and a statement, under penalty of perjury, that the information is accurate and you’re authorized to act for the owner.</p>
      <h2>Counter-notices</h2>
      <p>If your upload was removed and you believe it was a mistake (for example, you’re the original creator), contact us with the asset link and an explanation. We may restore it if the claim was invalid.</p>
      <h2>Repeat infringers</h2>
      <p>Accounts that repeatedly upload infringing material are permanently banned.</p>`,
  },

  donate: {
    title: 'Support the project',
    lead: (c) => `${c.siteName} is run by volunteers as a nonprofit. Donations keep the servers on — nothing else.`,
    body: (c, stats) => html`
      <div class="donate-hero panel">
        <div>
          <h2>Every download is free. Every byte costs something.</h2>
          <p>Hosting ${stats ? formatBytes(stats.bytes) : 'gigabytes'} of footage and serving ${stats ? formatCount(stats.downloads) : 'thousands of'} downloads isn’t free. Donations go directly to storage, bandwidth and infrastructure. If there’s ever a surplus, it’s spent on more storage — not salaries or ads.</p>
          ${c.donateUrl ? html`<a class="btn btn-primary btn-lg" href="/donate/go" rel="noopener">${icon('heart')}Donate now</a>`
    : html`<p class="notice">${icon('info')}<span>Donations aren’t set up on this instance yet. The site operator can enable them by setting <code>DONATE_URL</code>.</span></p>`}
        </div>
      </div>
      <h2>Other ways to help</h2>
      <div class="how-grid">
        <div class="how-step">${icon('upload')}<h3>Share assets</h3><p>The library is only as good as what the community uploads. Your old project folders are someone else’s treasure.</p></div>
        <div class="how-step">${icon('shield')}<h3>Report problems</h3><p>Spot a leaked pack, malware or a broken file? Hit “Report”. It keeps the library trustworthy.</p></div>
        <div class="how-step">${icon('globe')}<h3>Spread the word</h3><p>Link assets in your tutorials and video descriptions. Credit creators even when it’s not required.</p></div>
        <div class="how-step">${icon('settings')}<h3>Contribute code</h3><p>The site is open source. Bug fixes, translations and features are welcome on <a href="${c.sourceUrl}">GitHub</a>.</p></div>
      </div>`,
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
    <article class="prose static">${p.body(ctx.config, stats)}</article>
  </div>`;
  return layout(ctx, { title: p.title, description: p.lead(ctx.config), body, og: { url: ctx.absolute(`/${page}`) } });
}

module.exports = { staticPage };
