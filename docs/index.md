---
layout: home

hero:
  name: 'sm<span class="alt">alt</span><span class="suffix tool">fl</span>'
  text: 'Small. Alternative.<br>Flow.'
  tagline: Data pipelines for smaltdb, built visually and run in the browser. A day that is off is paused, not published.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/
features:
  - title: A day that is off waits for you
    details: Each day's load is judged against the days before it. A day that is off is held, told as one cause with what it reaches, and published only when someone decides.
    link: /guide/demo#a-held-day
    linkText: A held day
  - title: Notebooks are the steps
    details: A flow's steps are the cells of smaltnb notebooks (.nb.ts), read top to bottom with each step's output, the rules it caught and the models beneath it.
    link: /guide/flows
    linkText: Writing a flow
  - title: Gates, bronze to gold
    details: Written checks hold; learned ones warn. Bands, due dates, scope and dependency rules, and a reconciled, sealed gold layer.
    link: /guide/app#checks
    linkText: Checks
  - title: An ontology people edit
    details: What each file's columns mean, the rules its rows are held to and the fixes a held day may be offered, set once and shared by every flow that reads the file.
    link: /guide/app#the-ontology
    linkText: The ontology
  - title: Two checks nobody wrote
    details: An isolation forest asks whether the day is unlike the days before; a classifier asks whether today's rows can be told apart. Each says how well it does.
    link: /guide/app#models
    linkText: The models
  - title: Every run can be checked
    details: Content hashes, signed run manifests, a hash-chained record and an audit bag anyone can verify offline. Runs entirely in your browser.
    link: /ARCHITECTURE
    linkText: The architecture
---

<p style="text-align:center;margin-top:2.5rem;color:var(--vp-c-text-2)">In early development: see <a href="./guide/status">Status</a>.</p>
