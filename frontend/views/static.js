'use strict';
const { html, formatCount } = require('../src/html');
const { layout } = require('./layout');
const { icon } = require('./components');

const contact = (config) => (config.contactEmail
  ? html`<a href="mailto:${config.contactEmail}">${config.contactEmail}</a>`
  : html`the <a href="${config.sourceUrl}">project repository</a>`);

const PAGES = {
  about: {
    title: 'About',
    lead: (c) => `${c.siteName} is where developers publish, distribute and track the things they build.`,
    body: (c, stats) => html`
      ${stats ? html`<dl class="factrow">
        <div><dt>Products</dt><dd>${formatCount(stats.assets)}</dd></div>
        <div><dt>Downloads</dt><dd>${formatCount(stats.downloads)}</dd></div>
        <div><dt>Developers</dt><dd>${formatCount(stats.creators)}</dd></div>
      </dl>` : ''}
      <p>Shipping something should be the easy part. Upload your app, plugin, library, template or asset pack, choose a license, and share one link. Every developer gets their own page at <strong>yourname.${c.pagesDomain || 'clipfx.me'}</strong> with their products, links and story, styled the way they like.</p>
      <h2>What you get</h2>
      <ul>
        <li><strong>Your own page</strong> on a subdomain, with an accent color, layout, featured products, links and a call to action.</li>
        <li><strong>Direct product links</strong> like <code>yourname.${c.pagesDomain || 'clipfx.me'}/abc123</code> that you can put in a README, a tweet or a release note.</li>
        <li><strong>Analytics</strong>: page views, product views, downloads, referrers, countries and devices.</li>
        <li><strong>API keys and an MCP server</strong>, so scripts, CI and AI agents can publish and manage releases for you.</li>
        <li><strong>Private links</strong> that expire, stop after a number of downloads, or need a password.</li>
      </ul>
      <p>It's free. Downloads don't need an account.</p>
      <h2>Who owns what</h2>
      <p>Developers keep the rights to their work. They pick the license, and every product page spells out what you can do with it. The <a href="/licenses">licenses page</a> compares them.</p>
      <h2>Built on Cloudflare</h2>
      <p>Pages run on Cloudflare Workers close to visitors, files are served from Cloudflare R2 through its cache, and data lives in Cloudflare D1. The code is <a href="${c.sourceUrl}">open source</a>.</p>
      <h2>Get in touch</h2>
      <p>Questions, partnerships or problems: ${contact(c)}. Found something that breaks the rules? <a href="/guidelines">Report it</a>.</p>`,
  },

  guidelines: {
    title: 'Guidelines',
    lead: () => 'What you can publish, and what gets taken down.',
    body: (c, stats, cat) => html`
      <h2>Only share what you have the right to share</h2>
      <ul>
        <li><strong>Your own work</strong>, or work whose license allows redistribution (MIT, Apache, GPL, CC0 and so on). Credit upstream projects in the description and keep their license files in your package.</li>
        <li><strong>No paid or leaked products.</strong> Commercial software, plugins or packs you don't own get removed, and the uploader can be banned.</li>
        <li><strong>No ripped or pirated content</strong>: films, games, music or other people's code without permission.</li>
        <li><strong>Fonts, models and datasets</strong> only if their license allows redistribution.</li>
      </ul>
      <h2>Keep it safe</h2>
      <ul>
        <li>Installers, packages and scripts (.exe, .msi, .dmg, .pkg, .AppImage, .deb, .vsix, .whl, .sh and more) are welcome from accounts. Every download shows its SHA-256, so publish the same hash in your README or release notes.</li>
        <li>No malware, adware, miners, credential stealers, cracked software, keygens or license bypasses. Uploading any of these gets the account banned and reported.</li>
        <li>Don't hide what a program does: describe what it installs, what it connects to and what data it collects.</li>
        <li>The download has to be the actual product. No link-outs, "unlock" steps or bundled offers.</li>
        <li>No sexual content, gore, hate symbols, harassment or other people's personal information.</li>
      </ul>
      <h2>Make it findable</h2>
      <p>A clear title, the right category, the platforms it runs on and a few tags go a long way. Add a screenshot or a short demo video as the preview. Put the version, system requirements, install steps and a changelog in the description.</p>
      <h2 id="formats">Accepted formats</h2>
      <dl class="formats">
        ${Object.entries(cat.kinds).map(([kind, k]) => html`<div><dt>${k.name}</dt><dd>${Object.entries(cat.fileTypes).filter(([, t]) => t === kind).map(([ext]) => html`<code>.${ext}</code> `)}</dd></div>`)}
      </dl>
      <h2>Enforcement</h2>
      <p>Anyone can report an asset. Moderators can remove it, block the same file from being uploaded again, or suspend the account. Repeated copyright problems mean a permanent ban. Questions go to ${contact(c)}.</p>`,
  },

  licenses: {
    title: 'Licenses',
    lead: () => 'Every upload uses one of these. This is a plain-language summary. The full license text is what counts.',
    body: (c, stats, cat) => {
      const row = (ok, text) => html`<li class="${ok ? 'ok' : 'cond'}">${icon(ok ? 'check' : 'minus')}<span>${text}</span></li>`;
      return html`
      <div class="licgrid">
        ${cat.licenses.map((l) => html`<article class="lic">
          <h3>${l.short}</h3>
          <p class="hint">${l.url.startsWith('http') ? html`<a href="${l.url}" target="_blank" rel="noopener">${l.name}</a>` : html`<a href="${l.url.replace(/^\/licenses/, '')}">${l.name}</a>`}</p>
          <ul class="terms">
            ${row(l.commercial, l.commercial ? 'Commercial use' : 'Non-commercial only')}
            ${row(!l.attribution, l.attribution ? 'Credit required' : 'No credit needed')}
            ${l.shareAlike ? row(false, 'Share modified versions alike') : ''}
            ${l.noResale ? row(false, 'No reselling the asset itself') : ''}
          </ul>
        </article>`)}
      </div>
      <h2 id="free">Free Use License, full text</h2>
      <p>The creator gives you a worldwide, non-exclusive, royalty-free, permanent license to use, copy, modify and include the asset in your own projects, personal or commercial, including client work, monetized videos, ads, broadcast and film, without credit.</p>
      <p>You may not sell, sublicense or redistribute the asset by itself or as part of another asset pack, template marketplace or stock library, modified or not, and you may not present it as your own original asset.</p>
      <p>The asset is provided as is, without warranty of any kind.</p>
      <h2 id="proprietary">Proprietary (free download)</h2>
      <p>The developer keeps all rights. You may download and use the product as the developer intends, on your own devices, under any terms included with it (an end-user license agreement, for example). You may not resell, redistribute, decompile or modify it unless those terms allow it.</p>
      <h2>Giving credit</h2>
      <p>Open-source licenses (MIT, Apache, BSD, GPL) ask you to keep the copyright and license notice with any copy you ship. For the CC BY licenses, add a credit line like this one. Every product page has one ready to copy.</p>
      <pre class="code">"Tiny CLI" by Jane Doe (https://example.org/a/abc123), licensed under CC BY 4.0</pre>`;
    },
  },

  terms: {
    title: 'Terms of use',
    lead: (c) => `Be decent, only publish what you're allowed to, and understand that ${c.siteName} is provided as is.`,
    body: (c) => html`
      <h2>Your account</h2>
      <p>You're responsible for what happens on your account. You need to be old enough to accept these terms where you live (13 or older in most places).</p>
      <h2>Your uploads</h2>
      <p>You keep ownership of what you upload. Uploading confirms you have the right to share it, and gives downloaders the license you chose. You also let ${c.siteName} store, copy, convert (for previews and thumbnails) and display it in order to run the site.</p>
      <p>You can delete uploads or your account at any time. Copies already downloaded stay under the license they were downloaded with.</p>
      <h2>Downloads</h2>
      <p>Products come from the developers who publish them, not from ${c.siteName}. Check the license on each one and the SHA-256 the developer publishes. Moderators remove infringing or harmful files when they find them, but can't check everything.</p>
      <h2>Developer pages</h2>
      <p>Your page at <em>yourname.${c.pagesDomain || 'clipfx.me'}</em> is tied to your username. Links and text you add must follow these terms. Pages that impersonate someone else or link to harmful content are removed.</p>
      <h2>Use of the service</h2>
      <p>Follow the <a href="/guidelines">guidelines</a>. Don't mass-download or scrape in a way that slows the site down, and don't use it as general file hosting.</p>
      <h2>Moderation</h2>
      <p>Content or accounts that break these terms may be removed.</p>
      <h2>No warranty</h2>
      <p>The service is provided as is. To the extent the law allows, ${c.siteName} isn't liable for damages from using it.</p>
      <h2>Changes</h2>
      <p>These terms may change. Big changes will be announced on the site. Questions: ${contact(c)}.</p>`,
  },

  privacy: {
    title: 'Privacy',
    lead: () => 'What the site stores, and what it doesn\'t.',
    body: (c) => html`
      <h2>What's stored</h2>
      <ul>
        <li>Your account: username, display name, bio, website, an optional email, and a hashed password.</li>
        <li>Your uploads and the details you add to them.</li>
        <li>View, download and save counts per product. These are totals, not tied to anyone.</li>
        <li>Visit analytics for developer pages: the page or product viewed, the visitor's country, the referring site's domain and the device type (desktop, mobile or tablet). No IP address, cookie or identifier is stored, so visits can't be linked to a person or to each other. They're kept in Cloudflare Workers Analytics Engine and only shown to the page's developer as totals.</li>
        <li>Reports, including any contact details you put in them.</li>
      </ul>
      <h2>What isn't done</h2>
      <p>No ads, tracking pixels, third-party analytics, third-party fonts or embeds. Data isn't sold or shared, and there are no marketing emails.</p>
      <h2>Cookies</h2>
      <p>Three, all needed for the site to work: one keeps you logged in, one protects forms from cross-site requests, and one shows short messages such as "Saved". Signing in with Google or GitHub adds a short-lived one that expires after ten minutes.</p>
      <h2>IP addresses</h2>
      <p>Kept in memory for a few hours to limit abuse and avoid counting the same download twice. They aren't saved to the database. The server may keep standard access logs for a short time.</p>
      <h2>Your data</h2>
      <p>You can edit or delete your account and uploads in <a href="/settings">settings</a>. For anything else, contact ${contact(c)}.</p>`,
  },

  copyright: {
    title: 'Copyright and takedowns',
    lead: () => 'If something here is yours and was uploaded without permission, it will be taken down.',
    body: (c) => html`
      <h2>Requesting a takedown</h2>
      <ol>
        <li>Open the asset page and choose <strong>Report this asset</strong>.</li>
        <li>Pick <strong>Copyright infringement</strong> or <strong>Paid or leaked asset</strong>.</li>
        <li>Link to your original, say that you own the rights or act for the owner, and leave an email address.</li>
      </ol>
      <p>Or email ${contact(c)} with the same information and the asset link. Moderators usually act within a few days. Infringing files are removed and blocked from being uploaded again.</p>
      <h2>Formal (DMCA) notices</h2>
      <p>Include your physical or electronic signature, the work being infringed, the URL of the material, your contact details, a statement that you believe in good faith the use isn't authorized, and a statement under penalty of perjury that the notice is accurate and you're authorized to act for the owner.</p>
      <h2>Counter-notices</h2>
      <p>If your upload was removed by mistake, for example because you're the original creator, get in touch with the link and an explanation. Invalid claims are reversed.</p>
      <h2>Repeat infringement</h2>
      <p>Accounts that keep uploading infringing material are banned.</p>`,
  },

  developers: {
    title: 'API and AI access',
    lead: (c) => `Publish and manage releases from scripts, CI and AI agents. Browsing data is public JSON with no key.`,
    body: (c, stats, cat, origin) => {
      const ep = (method, path, text) => html`<div class="endpoint"><p><span class="method">${method}</span><code>${path}</code></p><p>${text}</p></div>`;
      return html`
      <h2>MCP server for AI agents</h2>
      <p>Connect Claude, ChatGPT, Cursor, VS Code and other agents to <code>${origin}/mcp</code>. You sign in with your ClipFX account and choose what the agent may do; then it can search, download, upload and manage your files. <a href="/developers/mcp">Setup guide</a>.</p>
      <h2>Your account from code</h2>
      <p>Create a personal <a href="/developers/api">API key</a> to publish, update and delete products, customize your developer page and read your download stats from scripts, CI pipelines and AI agents. Each key has its own permissions and expiry.</p>
      <h2>For AI assistants and crawlers</h2>
      <p>Every public page is crawlable and every AI crawler is welcome (see <a href="/robots.txt">robots.txt</a>). A plain-text summary written for language models lives at <a href="/llms.txt">/llms.txt</a>, and the <a href="/sitemap.xml">sitemap</a> lists every public file and creator.</p>
      <h2>Endpoints</h2>
      <p>All responses are JSON with <code>ok: true</code> on success. No authentication is needed for these.</p>
      <div class="endpoints">
        ${ep('GET', '/api/assets?q=&category=&software=&license=&kind=&sort=&page=', 'Search and filter public files. Sort is new, trending or downloads. 24 per page.')}
        ${ep('GET', '/api/assets/{slug}', 'One file: title, description, tags, license, file details, preview URLs and creator.')}
        ${ep('GET', '/api/users/{username}', 'A developer\'s public profile, page settings, featured products and products.')}
        ${ep('GET', '/api/creators?limit=8', 'The most downloaded developers.')}
        ${ep('GET', '/api/meta', 'Categories, supported software, licenses and accepted file types.')}
        ${ep('GET', '/a/{slug}/download', 'Downloads the file (a redirect to storage). Counts as a download.')}
      </div>
      <h2>Example</h2>
      <pre class="code">curl "${origin}/api/assets?category=devtools&amp;sort=downloads"</pre>
      <h2>Fair use</h2>
      <p>Please cache what you can and keep it under a few requests per second. Respect each file's license when you use or recommend it, and link back to the file page so people can see the terms.</p>`;
    },
  },

};

function staticPage(ctx, { page, stats }) {
  const p = PAGES[page];
  const body = html`
  <div class="container narrow">
    <header class="pagehead doc-head">
      <div>
        <h1>${p.title}</h1>
        <p class="lede">${p.lead(ctx.config)}</p>
      </div>
    </header>
    <article class="prose doc">${p.body(ctx.config, stats, ctx.catalog, ctx.absolute(''))}</article>
  </div>`;
  return layout(ctx, { title: p.title, description: p.lead(ctx.config), body, og: { url: ctx.absolute(`/${page}`) } });
}

module.exports = { staticPage };
