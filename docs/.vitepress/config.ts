import { defineConfig } from 'vitepress'
import path from 'node:path'
import { smaltLight, smaltDark } from './theme/shiki'
import { smaltworksMenu, smaltworksFooter } from './theme/smaltworks'

const REPO = 'https://github.com/stenhoor/smaltfl'
// Served at stenhoor.github.io/smaltfl/ until the site has a domain of its own: then DOCS_BASE is '/'.
const base = process.env.DOCS_BASE ?? '/smaltfl/'

export default defineConfig({
  title: 'smaltfl',
  description: 'Data pipelines for smaltdb, built visually and run in the browser, that pause a day that is off until someone decides.',
  base,
  cleanUrls: true,
  // The demos are deployed beside the site (.github/workflows/docs.yml), not built by VitePress; the design records
  // link into the repository's sources, which the markdown hook below sends to GitHub.
  ignoreDeadLinks: [/^\/app\//, /^\/signins\//, /^\.\.?\//, /localhost/],
  srcExclude: ['brand/**', 'research/**'],
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}a-smaltworks-project.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
    ['meta', { property: 'og:title', content: 'smaltfl' }],
    ['meta', { property: 'og:description', content: 'Data pipelines for smaltdb, built visually and run in the browser.' }],
  ],
  markdown: {
    theme: { light: smaltLight, dark: smaltDark },
    config(md) {
      // Links that leave docs/ (sources, examples, tests) point at the file on GitHub.
      const fallback = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href')
        if (href && !/^[a-z]+:|^#|^\//i.test(href) && env?.relativePath) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(env.relativePath), href))
          if (target.startsWith('../')) {
            tokens[idx].attrSet('href', `${REPO}/blob/HEAD/${target.slice(3)}`)
            tokens[idx].attrSet('target', '_blank')
            tokens[idx].attrSet('rel', 'noreferrer')
          }
        }
        return fallback(tokens, idx, options, env, self)
      }
    },
  },
  themeConfig: {
    siteTitle: 'smaltfl',
    nav: [
      { text: 'Demo', link: '/app/', target: '_self' },
      { text: 'Quick start', link: '/guide/' },
      { text: 'Guide', link: '/guide/demo' },
      { text: 'Status', link: '/guide/status' },
      smaltworksMenu(),
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Quick start', link: '/guide/' },
          { text: 'A walk through the demo', link: '/guide/demo' },
          { text: 'Working in the app', link: '/guide/app' },
          { text: 'Writing a flow', link: '/guide/flows' },
          { text: 'Status', link: '/guide/status' },
        ],
      },
      {
        text: 'Design',
        items: [
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'The scenario', link: '/SCENARIO' },
          { text: 'Decisions (ADRs)', link: '/adr/' },
          { text: 'Open questions', link: '/OPEN_QUESTIONS' },
          { text: 'Where the work stands', link: '/HANDOFF' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: smaltworksFooter(base),
  },
})
