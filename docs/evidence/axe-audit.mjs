// Re-runnable a11y audit: `node audit.mjs`. Needs the app on :5190 (mock mode). Exit 1 if any axe violation remains.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
const here = new URL('./', import.meta.url).pathname
const BASE = process.env.BASE ?? 'http://localhost:5190/'
const axeSrc = readFileSync(here + 'node_modules/axe-core/axe.min.js', 'utf8')
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9391', '--hide-scrollbars', `--user-data-dir=${here}chrome-profile`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, seq = 0; const waiting = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const run = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
const phone = () => send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
const desk = () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
const media = (theme, motion = 'no-preference') => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: motion }] })
const goto = async (url, theme = 'light', motion) => { await media(theme, motion); await send('Page.navigate', { url: 'about:blank' }); await sleep(80); await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage' }).catch(() => {}); await send('Page.navigate', { url: BASE + url }); await sleep(1500) }
const H = `window.tap=(t,root=document)=>{const b=[...root.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(t)&&!e.disabled);if(!b)throw new Error('no '+t);b.click()}
window.type=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))}`
// scenarios: [name, viewport, url, setup JS run before the audit (optional)]
const S = [
  ['Stage', 'desk', '?mock#/stage'],
  ['Onboarding 1 You', 'phone', '?mock#/'],
  ['Onboarding 2 Interests', 'phone', '?mock#/'],
  ['Onboarding 3 Sharing and selfie', 'phone', '?mock#/'],
  ['Scan manual (type badge)', 'phone', '?mock&as=amara&nocam#/scan'],
  ['Scan card silhouette + Connect composer', 'phone', '?mock&as=amara&nocam&catch=501#/scan'],
  ['Scan group of 3', 'phone', '?mock&as=amara&nocam#/scan', `tap('A group of 3')`],
  ['Person revealed (after share)', 'phone', '?mock&as=amara&demo=shared#/people/p501'],
  ['People list', 'phone', '?mock&as=amara&demo=shared#/people'],
  ['Inbox: Requests', 'phone', '?mock&as=diego&demo=asked#/inbox'],
  ['Inbox: Chats', 'phone', '?mock&as=amara&demo=chat#/inbox', `tap('Chats')`],
  ['Inbox: Receipts', 'phone', '?mock&as=amara&demo=both#/inbox', `tap('Receipts')`],
  ['Chat', 'phone', '?mock&as=amara&demo=chat#/inbox/p501'],
  ['Chat (request pending reply)', 'phone', '?mock&as=diego&demo=asked#/inbox/p500'],
  ['Discover', 'phone', '?mock&as=amara#/discover'],
  ['Discover with search', 'phone', '?mock&as=amara#/discover', `type('input[type=search]','tracing');document.querySelector('input[type=search]').form.requestSubmit()`],
  ['Me', 'phone', '?mock&as=amara#/me'],
  ['Booth: Scan', 'phone', '?mock&as=booth&nocam#/scan'],
  ['Booth: Scan card', 'phone', '?mock&as=booth&nocam#/scan', `tap('Badge 500')`],
  ['Booth: Leads', 'phone', '?mock&as=booth&demo=lead#/leads'],
  ['Booth: Setup', 'phone', '?mock&as=booth#/booth'],
  ['Organizer: Pulse', 'phone', '?mock&as=organizer#/pulse'],
]
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const results = [], extra = {}
const sizes = `(()=>{const out=[];const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])').forEach(e=>{if(!vis(e))return;const r=e.getBoundingClientRect();
 const label=e.closest('label');const R=(label&&e.matches('input[type=checkbox],input[type=radio]'))?label.getBoundingClientRect():r;
 if(R.width<44||R.height<44)out.push({sel:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):''),text:(e.innerText||e.getAttribute('aria-label')||e.value||'').trim().slice(0,40),w:Math.round(R.width),h:Math.round(R.height)})});return out})()`
try {
  let t
  for (let i = 0; i < 40 && !t; i++) { await sleep(250); t = await fetch('http://localhost:9391/json').then((r) => r.json()).then((l) => l.find((x) => x.type === 'page'), () => undefined) }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) } }
  await send('Page.enable')
  extra.targets = {}
  for (const theme of ['light', 'dark']) for (const [name, vp, url, setup] of S) {
    await (vp === 'desk' ? desk() : phone())
    try {
      await goto(url, theme); await run(H)
      if (name.startsWith('Onboarding') && name !== 'Onboarding 1 You') for (let k = 0; k < (name.includes('2') ? 1 : 2); k++) { await run(`document.querySelectorAll('form.paper input').forEach(i=>{if(i.required&&!i.value&&i.type!=='file')type_(i)});${'tap'}('Next')`.replace('type_(i)', "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,i.type==='email'?'a@b.dev':'Ada Test'),i.dispatchEvent(new Event('input',{bubbles:true}))")).catch(() => {}); await sleep(300); if (name.includes('3')) for (let c = 0; c < 4; c++) { await run(`document.querySelectorAll('.chip.pick')[${c}].click()`).catch(() => {}); await sleep(120) } await sleep(200) }
      if (setup) await run(setup)
      await sleep(700)
      await run(axeSrc)
      const r = await run(`axe.run(document,{runOnly:{type:'tag',values:${JSON.stringify(TAGS)}}}).then(r=>({v:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target.join(' '),html:n.html.slice(0,160),text:(document.querySelector(n.target[0])?.innerText||'').slice(0,50),summary:(n.failureSummary||'').split('\\n').slice(0,3).join(' ')}))})),passes:r.passes.length,incomplete:r.incomplete.map(i=>({id:i.id,n:i.nodes.length,why:(i.nodes[0]?.any[0]?.message||'').slice(0,100),sel:i.nodes.slice(0,3).map(n=>n.target.join(' '))}))}))`)
      results.push({ screen: name, theme, ...r })
      if (theme === 'light') extra.targets[name] = await run(sizes)
    } catch (e) { results.push({ screen: name, theme, error: e.message, v: [], passes: 0 }) }
  }
  // --- 2. reduced motion: scan + share
  await phone()
  await goto('?mock&as=amara&nocam#/scan', 'light', 'reduce'); await run(H)
  const anim = `document.getAnimations().map(a=>{const t=a.effect?.getTiming?.();const kf=a.effect?.getKeyframes?.()||[];const props=[...new Set(kf.flatMap(k=>Object.keys(k)).filter(k=>!['offset','easing','composite','computedOffset'].includes(k)))];return {el:(a.effect?.target?.tagName||'')+'.'+(a.effect?.target?.className?.baseVal??a.effect?.target?.className??'').toString().slice(0,30),name:a.animationName||a.transitionProperty||'',dur:t?.duration,iter:t?.iterations,props}}).filter(a=>a.dur>200||a.iter===Infinity||a.props.some(p=>/transform|translate|scale|rotate|clipPath|clip-path/.test(p)))`
  extra.reduced = { rmClass: await run(`document.documentElement.classList.contains('rm')`), scan: [], share: [] }
  await run(`tap('Badge 501')`)
  for (const d of [100, 350, 800]) { await sleep(d); extra.reduced.scan.push(...(await run(anim)).map((a) => ({ ...a, atMs: d }))) }
  await goto('?mock&as=amara&demo=chat#/inbox/p501', 'light', 'reduce'); await run(H)
  await run(`tap('Share my card')`)
  for (const d of [100, 350, 800]) { await sleep(d); extra.reduced.share.push(...(await run(anim)).map((a) => ({ ...a, atMs: d }))) }
  await goto('?mock&as=amara&demo=shared#/people/p501', 'light', 'reduce'); await run(H); extra.reduced.reveal = []
  for (const d of [50, 150, 300, 600]) { await sleep(d); extra.reduced.reveal.push(...(await run(anim)).map((a) => ({ ...a, atMs: d })).filter((a) => a.el !== 'MAIN.screen')) }
  // --- 3. keyboard on Scan manual, Inbox
  extra.keyboard = {}
  const key = async (k, code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Tab' ? 9 : 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k === 'Tab' ? 9 : 13 }) }
  const probe = `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const s=getComputedStyle(e);return {kb:e.dataset.kb,tag:e.tagName.toLowerCase(),text:(e.innerText||e.getAttribute('aria-label')||e.placeholder||e.type||'').trim().slice(0,30),outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0?s.outlineWidth+' '+s.outlineColor:'none',shadow:s.boxShadow,matchesFV:e.matches(':focus-visible')}})()`
  for (const [name, url] of [['Scan manual', '?mock&as=amara&nocam#/scan'], ['Inbox requests', '?mock&as=diego&demo=asked#/inbox'], ['Person revealed', '?mock&as=amara&demo=shared#/people/p501'], ['Discover', '?mock&as=amara#/discover']]) {
    await goto(url, 'light'); await run(H)
    const reach = await run(`[...document.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map((e,i)=>(e.dataset.kb=i,e)).map(e=>(e.innerText||e.getAttribute('aria-label')||e.placeholder||e.tagName+':'+(e.closest('label')?.innerText||e.type)).trim().slice(0,30))`)
    const seen = [], first = []
    for (let i = 0; i < reach.length + 6; i++) { await key('Tab', 'Tab'); await sleep(40); const p = await run(probe); if (p) seen.push(p); if (i === 0) first.push(p) }
    const seenKb = new Set(seen.map((s) => s.kb))
    extra.keyboard[name] = { reachable: reach, first: first[0], neverFocused: reach.filter((r, i) => !seenKb.has(String(i))), invisibleFocus: seen.filter((s) => s.outline === 'none' && (s.shadow === 'none' || !s.shadow) && !s.matchesFV).map((s) => s.text), noOutlineButFV: seen.filter((s) => s.outline === 'none' && s.shadow === 'none').map((s) => s.text), skipLink: await run(`!!document.querySelector('a[href^="#"][class*=skip],a.skip')`), focusAfterNav: null }
  }
  // focus after route change
  await goto('?mock&as=amara&nocam#/scan', 'light'); await run(H); await run(`tap('People',document.querySelector('nav'))`); await sleep(500)
  extra.keyboard.focusAfterRouteChange = await run(`document.activeElement?.tagName+': '+document.activeElement?.innerText?.slice(0,30)`)
  extra.keyboard.dialogs = await run(`document.querySelectorAll('dialog,[role=dialog],[aria-modal]').length`)
  // --- 5. live regions: do a scan/share and read toast
  await goto('?mock&as=amara&nocam#/scan', 'light'); await run(H)
  extra.live = { regions: await run(`[...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e=>e.tagName+'.'+e.className+' role='+e.getAttribute('role')+' live='+e.getAttribute('aria-live'))`) }
  await run(`tap('Badge 501')`); await sleep(700); extra.live.afterScan = await run(`document.querySelector('.toast').innerText`)
  await goto('?mock&as=amara&demo=chat#/inbox/p501', 'light'); await run(H); await run(`tap('Share my card')`); await sleep(800); extra.live.afterShare = await run(`document.querySelector('.toast').innerText+' | status regions: '+[...document.querySelectorAll('[role=status],[aria-live]')].map(e=>e.innerText.trim().slice(0,40)).join(' / ')`)
  extra.live.unnamedButtons = []
  for (const [, , url] of S) { if (/stage/.test(url)) continue; await goto(url, 'light'); extra.live.unnamedButtons.push(...(await run(`[...document.querySelectorAll('button,a[href],input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.labels?.length&&!e.title}).map(e=>e.outerHTML.slice(0,100))`)).map((h) => url + ' ' + h)) }
  // --- 6. reflow at 320
  extra.reflow = {}
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false })
  for (const [name, , url] of S.filter((s) => s[1] === 'phone')) { await goto(url, 'light'); await run(H); const s = S.find((x) => x[0] === name)[3]; if (s) await run(s).catch(() => {}); await sleep(500)
    extra.reflow[name] = await run(`(()=>{const d=document.documentElement;const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>d.clientWidth+1&&getComputedStyle(e).position!=='fixed'}).slice(0,4).map(e=>e.tagName+'.'+e.className+' right='+Math.round(e.getBoundingClientRect().right));const clipped=[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);return e.children.length===0&&e.innerText&&(s.overflow==='hidden'||s.textOverflow==='ellipsis')&&e.scrollWidth>e.clientWidth+1}).slice(0,4).map(e=>e.className+': '+e.innerText.slice(0,30));return {scrollW:d.scrollWidth,clientW:d.clientWidth,hscroll:d.scrollWidth>d.clientWidth,over,clipped}})()`) }
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1 } finally { chrome.kill() }
writeFileSync(here + 'axe-results.json', JSON.stringify({ results, extra }, null, 1))
const imp = ['critical', 'serious', 'moderate', 'minor']
console.log('| Screen | Theme | critical | serious | moderate | minor | passes |\n|---|---|---|---|---|---|---|')
for (const r of results) console.log(`| ${r.screen} | ${r.theme} | ${imp.map((i) => r.v.filter((v) => v.impact === i).reduce((n, v) => n + v.nodes.length, 0)).join(' | ')} | ${r.passes}${r.error ? ' ERR ' + r.error.slice(0, 50) : ''} |`)
const total = results.reduce((n, r) => n + r.v.reduce((m, v) => m + v.nodes.length, 0), 0)
console.log(`TOTAL: ${total} axe violation nodes across ${results.length} screen/theme runs`)
if (total) process.exitCode = 1
