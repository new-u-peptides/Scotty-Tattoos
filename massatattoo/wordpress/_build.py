#!/usr/bin/env python3
"""Assemble self-contained, WordPress-paste-ready HTML for massatattoo.com.

Takes the existing massatattoo/*.html pages, keeps every element/section, and
re-skins them into a refined dark + antique-gold theme with all CSS inlined,
header/footer inlined, and the only external dependency being Google Fonts.
"""
import re, json, pathlib, html

SRC = pathlib.Path("/home/user/Scotty-Tattoos/massatattoo")
OUT = SRC / "wordpress"
OUT.mkdir(exist_ok=True)
photos = json.load(open("/tmp/build/photos.json"))

# ---------------------------------------------------------------- dark theme CSS
CSS = r"""
:root{
  --bg:#0E0B07;--bg-alt:#14100A;--bg-deep:#080605;
  --surface:#19130C;--surface-2:#221A10;--panel:#0C0907;
  --bone:#ECE3D1;--cream:#F5EEDF;--text:#D8CDB8;--muted:#A99B83;--dim:#8B7D67;--linen:#CFC3AC;
  --gold:#C6A06B;--gold-bright:#DCBD8C;--gold-deep:#A8834F;
  --rule:rgba(198,160,107,.16);--rule-soft:rgba(236,227,209,.08);--rule-strong:rgba(198,160,107,.34);
  --radius-sm:4px;--radius:14px;--radius-lg:22px;
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --shadow:0 18px 44px -24px rgba(0,0,0,.75);
  --shadow-lg:0 40px 80px -30px rgba(0,0,0,.85);
  --serif:"Cormorant Garamond",Georgia,serif;
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --container:1200px;
  --t-fast:200ms ease;--t-base:320ms cubic-bezier(.2,.7,.2,1);--t-slow:600ms cubic-bezier(.2,.7,.2,1);
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:var(--sans);font-size:16px;line-height:1.6;color:var(--text);background:var(--bg);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  background-image:radial-gradient(120% 70% at 50% -15%,rgba(198,160,107,.10),transparent 60%),radial-gradient(90% 60% at 100% 110%,rgba(198,160,107,.05),transparent 60%);
  background-attachment:fixed}
img,svg{max-width:100%;display:block}
a{color:var(--gold-bright);text-decoration:none;transition:color var(--t-fast)}
a:hover{color:var(--cream)}
::selection{background:rgba(198,160,107,.28);color:var(--cream)}
.container{width:100%;max-width:var(--container);margin:0 auto;padding:0 28px;position:relative}
.eyebrow{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;color:var(--gold);display:inline-flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--gold)}
h1,h2,h3,h4{font-family:var(--serif);font-weight:500;color:var(--bone);margin:0 0 .5em;letter-spacing:-.012em}
h1{font-size:clamp(2.8rem,6.5vw,5.4rem);line-height:1.02}
h2{font-size:clamp(2rem,3.6vw,3rem);line-height:1.1}
h3{font-size:1.4rem;line-height:1.25}
p{margin:0 0 1em;color:var(--muted)}
em{font-style:italic;color:var(--gold-bright)}
.geo-rule{display:flex;align-items:center;gap:10px;margin:18px 0 28px}
.geo-rule::before,.geo-rule::after{content:"";flex:1;height:1px;background:var(--rule)}
.geo-rule__diamond{width:10px;height:10px;background:var(--gold);transform:rotate(45deg)}
.geo-rule--left::before{display:none}.geo-rule--left{justify-content:flex-start}.geo-rule--left::after{flex:0 0 64px}
/* buttons */
.btn{appearance:none;border:0;cursor:pointer;font:inherit;font-family:var(--mono);padding:16px 28px;font-size:11px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;transition:transform var(--t-fast),background var(--t-fast),color var(--t-fast),box-shadow var(--t-fast);clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);display:inline-block}
.btn--primary{background:var(--gold);color:#1b1308}
.btn--primary:hover{background:var(--gold-bright);transform:translateY(-2px);box-shadow:0 10px 30px -12px rgba(198,160,107,.6)}
.btn--dark{background:var(--bone);color:#1b1308}
.btn--dark:hover{background:var(--cream);color:#1b1308;transform:translateY(-2px)}
.btn--ghost{background:transparent;color:var(--bone);border:1px solid var(--rule-strong)}
.btn--ghost:hover{background:var(--gold);color:#1b1308;border-color:var(--gold)}
/* nav */
.nav{position:sticky;top:0;z-index:50;background:rgba(10,8,5,.72);backdrop-filter:saturate(140%) blur(14px);-webkit-backdrop-filter:saturate(140%) blur(14px);border-bottom:1px solid var(--rule)}
.nav__inner{display:flex;align-items:center;justify-content:space-between;height:82px}
.brand{display:flex;align-items:center;gap:14px;font-family:var(--serif);font-size:1.55rem;font-weight:600;color:var(--bone);letter-spacing:.08em;text-transform:uppercase}
.brand__mark{width:40px;height:40px;flex-shrink:0}
.brand__mark circle,.brand__mark path,.brand__mark polygon{fill:none;stroke:var(--gold);stroke-width:1.2}
.nav__links{display:flex;gap:28px;list-style:none;padding:0;margin:0}
.nav__links a{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);position:relative;padding:6px 0}
.nav__links a:hover{color:var(--bone)}
.nav__links a.is-active{color:var(--gold)}
.nav__links a.is-active::after{content:"";position:absolute;left:50%;bottom:-2px;transform:translateX(-50%) rotate(45deg);width:6px;height:6px;background:var(--gold)}
.nav__cta{padding:11px 22px;background:var(--gold);color:#1b1308;font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;transition:transform var(--t-fast),background var(--t-fast);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.nav__cta:hover{background:var(--gold-bright);transform:translateY(-1px)}
.nav__actions{display:flex;align-items:center;gap:12px}
.nav__toggle{display:none;min-width:44px;min-height:44px;padding:0;background:transparent;border:1px solid var(--rule-strong);color:var(--bone);font-size:1.3rem;line-height:1;cursor:pointer;transition:background var(--t-fast)}
.nav__toggle:hover{background:var(--surface)}
.nav__toggle[aria-expanded="true"]{background:var(--gold);color:#1b1308;border-color:var(--gold)}
@media(max-width:980px){.nav__links{display:none}
 .nav__toggle{display:inline-flex;align-items:center;justify-content:center}
 .nav__links.is-open{display:flex!important;flex-direction:column;position:absolute;top:100%;left:0;right:0;gap:0;background:var(--bg-deep);border-bottom:1px solid var(--rule);padding:14px 28px 22px;box-shadow:var(--shadow)}
 .nav__links.is-open li{width:100%}
 .nav__links.is-open a{display:block;padding:14px 0;border-bottom:1px solid var(--rule-soft);font-size:13px;min-height:44px}
 .nav__links.is-open li:last-child a{border-bottom:0}}
@media(max-width:600px){.nav__cta{padding:14px 18px}}
.skip-link{position:absolute;top:-100px;left:1rem;z-index:100;padding:.75rem 1rem;background:var(--bone);color:#000;font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;border:2px solid var(--gold)}
.skip-link:focus{top:1rem;outline:2px solid var(--gold);outline-offset:2px}
/* sections */
.section{padding:100px 0;position:relative}
.section--alt{background:var(--bg-alt)}
.section--dark{background:var(--bg-deep)}
.section-head{max-width:60ch;margin-bottom:56px}
/* hero */
.hero{position:relative;padding:120px 0 110px;overflow:hidden}
.mandala{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.mandala--hero{z-index:0;opacity:.55}
.hero__inner{position:relative;display:grid;grid-template-columns:1.05fr 1fr;gap:60px;align-items:center;z-index:1}
.hero__title{margin-bottom:.2em}
.hero__lede{font-size:1.18rem;color:var(--muted);max-width:50ch;margin-top:1.4rem}
.hero__meta{margin-top:2.4rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.hero__meta-item{padding:18px 18px 18px 0;border-right:1px solid var(--rule)}
.hero__meta-item:nth-child(2){padding-left:18px}
.hero__meta-item:last-child{border-right:0;padding-left:18px}
.hero__meta-label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--dim)}
.hero__meta-value{display:block;margin-top:6px;font-family:var(--serif);font-size:1.25rem;color:var(--bone)}
.hero__actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:2rem}
.hero__geo{position:relative;aspect-ratio:1;display:grid;place-items:center;color:var(--bone)}
.hero__geo svg{width:100%;height:100%}
.hero__geo svg .ring{fill:none;stroke:var(--bone);stroke-width:.6;opacity:.55}
.hero__geo svg .ring--thin{stroke-width:.35;opacity:.3}
.hero__geo svg .ring--accent{stroke:var(--gold);stroke-width:.8;opacity:.95}
.hero__geo svg .dot{fill:var(--bone)}
.hero__geo svg .dot--accent{fill:var(--gold)}
.hero__geo svg .tri{fill:none;stroke:var(--gold);stroke-width:.5;opacity:.7}
.hero__waves{position:absolute;right:-10%;bottom:-20%;width:60%;opacity:.16;pointer-events:none;color:var(--gold)}
.hero__waves svg path{fill:none;stroke:currentColor;stroke-width:.8}
.geo-rotate{transform-origin:50% 50%;animation:spin 90s linear infinite}
.geo-rotate--rev{transform-origin:50% 50%;animation:spin 140s linear infinite reverse}
.geo-pulse{transform-origin:50% 50%;animation:pulse 6s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.04);opacity:.75}}
@media(prefers-reduced-motion:reduce){.geo-rotate,.geo-rotate--rev,.geo-pulse,.studio__pin-vesica{animation:none!important}}
@media(max-width:900px){.hero{padding:70px 0}.hero__inner{grid-template-columns:1fr;gap:40px}.hero__geo{max-width:460px;margin:0 auto}}
/* page orbit */
.page-orbit{position:fixed;right:-180px;top:35%;width:460px;height:460px;pointer-events:none;opacity:.10;z-index:0}
.page-orbit svg{width:100%;height:100%}
.page-orbit svg circle{fill:none;stroke:var(--gold);stroke-width:.5}
@media(max-width:980px){.page-orbit{display:none}}
/* style strip */
.style-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-top:60px}
@media(max-width:800px){.style-strip{grid-template-columns:repeat(2,1fr)}}
.style-cell{padding:36px 28px;border-right:1px solid var(--rule);display:flex;flex-direction:column;gap:14px;transition:background var(--t-fast);position:relative}
.style-cell:last-child{border-right:0}
.style-cell:hover{background:var(--surface)}
.style-cell svg{width:56px;height:56px;color:var(--gold)}
.style-cell svg .stroke{fill:none;stroke:currentColor;stroke-width:1.2}
.style-cell svg .fill{fill:currentColor}
.style-cell h3{margin:6px 0 0;font-size:1.3rem}
.style-cell p{margin:0;font-size:.95rem}
.style-cell__num{position:absolute;top:14px;right:18px;font-family:var(--mono);font-size:10px;letter-spacing:.24em;color:var(--dim)}
@media(max-width:800px){.style-cell:nth-child(2){border-right:0}.style-cell:nth-child(1),.style-cell:nth-child(2){border-bottom:1px solid var(--rule)}}
/* work grid */
.work-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}
.work-tile{position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--rule);aspect-ratio:4/5;transition:transform var(--t-base),box-shadow var(--t-base);cursor:pointer}
.work-tile:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.work-tile__art{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,rgba(198,160,107,.28),transparent 55%),linear-gradient(135deg,#241c12 0%,#161009 100%)}
.work-tile__art svg{width:70%;height:70%;color:var(--gold)}
.work-tile--dark .work-tile__art{background:radial-gradient(circle at 70% 30%,rgba(198,160,107,.30),transparent 60%),linear-gradient(135deg,#161009 0%,#0c0805 100%)}
.work-tile--dark .work-tile__art svg{color:var(--gold)}
.work-tile__art[class*=" photo-"],.work-tile__art[class^="photo-"]{background-size:cover;background-position:center;background-repeat:no-repeat}
/*PHOTOS*/
.work-tile__meta{position:absolute;left:0;right:0;bottom:0;padding:16px 18px;background:linear-gradient(0deg,rgba(8,6,4,.88),transparent);color:var(--cream);display:flex;justify-content:space-between;align-items:end;gap:10px}
.work-tile__title{font-family:var(--serif);font-size:1.15rem;line-height:1.1;color:var(--cream)}
.work-tile__tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);flex-shrink:0}
.work-grid .work-tile:nth-child(1){grid-column:span 5}
.work-grid .work-tile:nth-child(2){grid-column:span 4}
.work-grid .work-tile:nth-child(3){grid-column:span 3}
.work-grid .work-tile:nth-child(4){grid-column:span 3}
.work-grid .work-tile:nth-child(5){grid-column:span 5}
.work-grid .work-tile:nth-child(6){grid-column:span 4}
.work-grid .work-tile:nth-child(7){grid-column:span 4}
.work-grid .work-tile:nth-child(8){grid-column:span 4}
.work-grid .work-tile:nth-child(9){grid-column:span 4}
@media(max-width:900px){.work-grid .work-tile{grid-column:span 6!important}}
@media(max-width:560px){.work-grid .work-tile{grid-column:span 12!important}}
.work-tile:focus-within{outline:2px solid var(--gold);outline-offset:2px}
@media(hover:none){.work-tile__meta{opacity:1}}
.work-empty{margin-top:34px;font-family:var(--serif);font-style:italic;font-size:1.25rem;color:var(--muted)}
.work-empty[hidden]{display:none}
/* filter bar */
.filter-bar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 40px;padding:18px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);align-items:center}
.filter-bar__label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--dim);margin-right:14px}
.filter{appearance:none;border:1px solid var(--rule);background:transparent;color:var(--muted);font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:8px 14px;cursor:pointer;transition:all var(--t-fast);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.filter:hover{color:var(--bone);border-color:var(--gold)}
.filter.is-active{background:var(--gold);color:#1b1308;border-color:var(--gold)}
/* pull quote */
.pull-quote{margin:0;padding:60px 40px;background:var(--surface);border-left:4px solid var(--gold);font-family:var(--serif);font-style:italic;font-size:clamp(1.4rem,2.2vw,1.9rem);line-height:1.3;color:var(--bone);position:relative}
.pull-quote em{color:var(--gold-bright)}
.pull-quote cite{display:block;margin-top:24px;font-family:var(--mono);font-style:normal;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--dim)}
/* cta banner */
.cta-banner{padding:80px 60px;background:var(--panel);color:var(--cream);display:grid;grid-template-columns:1.3fr 1fr;gap:60px;align-items:center;position:relative;overflow:hidden;border:1px solid var(--rule);border-top:3px solid var(--gold)}
.cta-banner::before{content:"";position:absolute;top:0;right:0;width:50%;height:100%;background:radial-gradient(circle at 80% 50%,rgba(198,160,107,.22),transparent 60%);pointer-events:none}
@media(max-width:900px){.cta-banner{grid-template-columns:1fr;padding:50px 32px;gap:36px}}
.cta-banner h2{color:var(--cream);margin:0 0 14px}
.cta-banner em{color:var(--gold)}
.cta-banner p{color:var(--linen);margin:0;max-width:50ch}
.cta-banner__form{display:flex;align-items:stretch;position:relative;z-index:1}
.cta-banner__form input{flex:1;font:inherit;font-family:var(--sans);color:var(--cream);background:rgba(255,255,255,.03);border:1px solid var(--rule-strong);border-right:0;padding:14px 18px;outline:none}
.cta-banner__form input::placeholder{color:var(--dim)}
.cta-banner__form input:focus{border-color:var(--gold)}
.cta-banner__form button{appearance:none;border:0;cursor:pointer;font:inherit;font-family:var(--mono);background:var(--gold);color:#1b1308;padding:0 26px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;transition:background var(--t-fast)}
.cta-banner__form button:hover{background:var(--gold-bright)}
/* about */
.manifesto{font-family:var(--serif);font-size:clamp(1.6rem,2.5vw,2.4rem);line-height:1.3;color:var(--bone);max-width:22ch;margin-bottom:0}
.manifesto em{color:var(--gold-bright)}
.about-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:60px;align-items:start}
@media(max-width:900px){.about-grid{grid-template-columns:1fr}}
.timeline{list-style:none;padding:0;margin:0;display:grid;gap:8px;position:relative}
.timeline::before{content:"";position:absolute;top:8px;bottom:8px;left:7px;width:1px;background:var(--rule)}
.timeline li{display:grid;grid-template-columns:28px 1fr;gap:22px;padding:18px 0;border-bottom:1px dashed var(--rule)}
.timeline li:last-child{border-bottom:0}
.timeline__dot{position:relative;z-index:1;width:16px;height:16px;background:var(--bg);border:1.5px solid var(--gold);transform:rotate(45deg);margin-top:4px}
.timeline__year{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);display:block;margin-bottom:4px}
.timeline h3{font-size:1.2rem;margin:0 0 6px}
.timeline p{margin:0;font-size:.95rem}
.team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
@media(max-width:900px){.team-grid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.team-grid{grid-template-columns:1fr}}
.team-card{background:var(--surface);border:1px solid var(--rule);position:relative}
.team-card__art{aspect-ratio:4/5;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,rgba(198,160,107,.26),transparent 60%),linear-gradient(180deg,#221a11 0%,#140f09 100%);color:var(--gold)}
.team-card__art svg{width:60%;height:60%}
.team-card__body{padding:22px 24px 26px}
.team-card__role{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.team-card h3{margin:0 0 6px;font-size:1.3rem}
.team-card p{margin:0;font-size:.95rem}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-top:40px}
@media(max-width:700px){.stats{grid-template-columns:1fr 1fr}}
.stat{padding:28px 22px;border-right:1px solid var(--rule)}
.stat:last-child{border-right:0}
@media(max-width:700px){.stat:nth-child(2){border-right:0}.stat:nth-child(1),.stat:nth-child(2){border-bottom:1px solid var(--rule)}}
.stat__num{font-family:var(--serif);font-size:3rem;line-height:1;color:var(--bone);margin-bottom:10px}
.stat__num em{color:var(--gold);font-style:italic}
.stat__label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--dim)}
/* process */
.process{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--rule)}
@media(max-width:900px){.process{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.process{grid-template-columns:1fr}}
.process__step{padding:40px 28px 36px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);position:relative;transition:background var(--t-fast)}
.process__step:hover{background:var(--surface)}
.process__step:last-child{border-right:0}
@media(max-width:900px){.process__step:nth-child(2n){border-right:0}}
@media(max-width:560px){.process__step{border-right:0}}
.process__num{font-family:var(--serif);font-size:3rem;font-style:italic;color:var(--gold);line-height:1;margin-bottom:18px}
.process__step h3{font-size:1.25rem;margin:0 0 10px}
.process__step p{font-size:.95rem;margin:0}
/* testimonials */
.quote-feature{background:var(--panel);color:var(--cream);padding:80px;box-shadow:var(--shadow-lg);position:relative;overflow:hidden;display:grid;grid-template-columns:1fr 1.3fr;gap:60px;align-items:center;border:1px solid var(--rule);border-top:3px solid var(--gold)}
.quote-feature::before{content:"";position:absolute;top:-120px;right:-120px;width:420px;height:420px;background:radial-gradient(circle,rgba(198,160,107,.30),transparent 65%);pointer-events:none}
.quote-feature>*{position:relative;z-index:1}
@media(max-width:980px){.quote-feature{grid-template-columns:1fr;padding:50px 36px;gap:36px}}
.quote-feature__mark{font-family:var(--serif);font-size:11rem;line-height:.7;color:var(--gold);height:100px}
.quote-feature blockquote{font-family:var(--serif);font-style:italic;font-size:clamp(1.6rem,2.4vw,2.2rem);line-height:1.3;color:var(--cream);margin:0 0 30px;max-width:24ch}
.quote-feature__attr{display:grid;grid-template-columns:60px 1fr;gap:18px;align-items:center}
.quote-feature__avatar{width:60px;height:60px;background:var(--gold);display:grid;place-items:center;font-family:var(--serif);font-size:1.5rem;color:#1b1308;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.quote-feature__name{font-family:var(--serif);font-size:1.2rem;color:var(--cream)}
.quote-feature__sub{font-family:var(--mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin-top:4px}
.testimonial-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:60px}
@media(max-width:900px){.testimonial-grid{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.testimonial-grid{grid-template-columns:1fr}}
.testimonial{background:var(--surface);border:1px solid var(--rule);padding:32px 30px;position:relative;display:flex;flex-direction:column;gap:20px}
.testimonial::before{content:"";position:absolute;top:10px;left:10px;width:12px;height:12px;border:1px solid var(--gold);border-right:0;border-bottom:0}
.testimonial__stars{display:flex;gap:4px;color:var(--gold)}
.testimonial__stars svg{width:14px;height:14px}
.testimonial blockquote{margin:0;font-family:var(--serif);font-style:italic;font-size:1.15rem;color:var(--bone);line-height:1.4}
.testimonial__attr{display:flex;justify-content:space-between;align-items:end;padding-top:16px;border-top:1px dashed var(--rule);gap:14px}
.testimonial__name{font-family:var(--serif);font-size:1.05rem;color:var(--bone)}
.testimonial__date{font-family:var(--mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.testimonial__src{font-family:var(--mono);font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.press-strip{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-top:40px}
@media(max-width:800px){.press-strip{grid-template-columns:repeat(2,1fr)}}
.press-cell{padding:32px 18px;display:grid;place-items:center;border-right:1px solid var(--rule);font-family:var(--serif);font-style:italic;font-size:1.4rem;color:var(--dim);letter-spacing:-.01em;transition:color var(--t-fast)}
.press-cell:hover{color:var(--gold)}
.press-cell:last-child{border-right:0}
@media(max-width:800px){.press-cell{border-right:0;border-bottom:1px solid var(--rule)}.press-cell:nth-last-child(-n+1){border-bottom:0}}
/* blog */
.featured-post{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;align-items:center;background:var(--surface);border:1px solid var(--rule);padding:40px;box-shadow:var(--shadow);position:relative}
.featured-post::before,.featured-post::after{content:"";position:absolute;width:16px;height:16px;border:1px solid var(--gold)}
.featured-post::before{top:12px;left:12px;border-right:0;border-bottom:0}
.featured-post::after{bottom:12px;right:12px;border-left:0;border-top:0}
@media(max-width:900px){.featured-post{grid-template-columns:1fr;padding:28px}}
.featured-post__art{aspect-ratio:4/3;background:radial-gradient(circle at 20% 30%,rgba(198,160,107,.40),transparent 60%),linear-gradient(135deg,#1c150d 0%,#0d0906 100%);display:grid;place-items:center;color:var(--gold)}
.featured-post__art svg{width:60%;height:60%}
.featured-post__meta{display:flex;gap:14px;font-family:var(--mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin-bottom:14px}
.post-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:56px}
@media(max-width:900px){.post-grid{grid-template-columns:1fr}}
.post-card{background:var(--surface);border:1px solid var(--rule);display:flex;flex-direction:column;transition:transform var(--t-base),box-shadow var(--t-base);cursor:pointer}
.post-card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.post-card__art{aspect-ratio:5/3;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,rgba(198,160,107,.26),transparent 55%),linear-gradient(135deg,#221a11 0%,#140f09 100%);color:var(--gold)}
.post-card__art svg{width:60%;height:60%}
.post-card__art--dark{background:radial-gradient(circle at 30% 20%,rgba(198,160,107,.36),transparent 60%),linear-gradient(135deg,#161009 0%,#0b0805 100%);color:var(--gold)}
.post-card__body{padding:24px 26px 28px;flex:1;display:flex;flex-direction:column}
.post-card__meta{display:flex;gap:12px;font-family:var(--mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
.post-card h3{margin:0 0 10px;font-size:1.4rem}
.post-card p{font-size:.95rem;flex:1}
.post-card__more{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-top:10px}
/* contact */
.contact-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:start}
@media(max-width:980px){.contact-grid{grid-template-columns:1fr;gap:40px}}
.info-card{background:var(--surface);border:1px solid var(--rule);padding:44px;box-shadow:var(--shadow);position:relative}
.info-card+.info-card{margin-top:22px}
.info-card::before,.info-card::after{content:"";position:absolute;width:14px;height:14px;border:1px solid var(--gold)}
.info-card::before{top:10px;left:10px;border-right:0;border-bottom:0}
.info-card::after{bottom:10px;right:10px;border-left:0;border-top:0}
.info-list{list-style:none;padding:0;margin:0;display:grid;gap:24px}
.info-list li{display:grid;grid-template-columns:50px 1fr;gap:20px;align-items:start;padding-bottom:24px;border-bottom:1px dashed var(--rule)}
.info-list li:last-child{padding-bottom:0;border-bottom:0}
.info-icon{width:50px;height:50px;display:grid;place-items:center;position:relative;flex-shrink:0}
.info-icon::before{content:"";position:absolute;inset:0;background:rgba(198,160,107,.14);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.info-icon svg{position:relative;width:20px;height:20px;color:var(--gold)}
.info-label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--dim);display:block;margin-bottom:6px}
.info-value{font-family:var(--serif);font-size:1.25rem;color:var(--bone);line-height:1.4}
.info-value a{color:var(--gold-bright)}
.hours{display:grid;grid-template-columns:1fr auto;gap:12px 22px;margin-top:6px;font-family:var(--mono);font-size:13px}
.hours dt{color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.hours dd{margin:0;color:var(--bone);font-variant-numeric:tabular-nums}
.hours dt.is-closed,.hours dd.is-closed{color:var(--dim)}
.form-card{background:var(--panel);color:var(--cream);padding:52px;box-shadow:var(--shadow-lg);position:relative;overflow:hidden;border:1px solid var(--rule);border-top:3px solid var(--gold)}
.form-card::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(198,160,107,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(198,160,107,.06) 1px,transparent 1px);background-size:32px 32px;pointer-events:none}
.form-card::after{content:"";position:absolute;top:-120px;right:-120px;width:360px;height:360px;background:radial-gradient(circle,rgba(198,160,107,.30),transparent 65%);pointer-events:none}
.form-card>*{position:relative;z-index:1}
.form-card h2{color:var(--cream)}
.form-card .eyebrow{color:var(--gold)}.form-card .eyebrow::before{background:var(--gold)}
.form-card p{color:var(--linen)}
.form{display:grid;gap:20px;margin-top:30px}
.form__row{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:600px){.form__row{grid-template-columns:1fr}.form-card,.info-card{padding:30px}}
.field{display:flex;flex-direction:column;gap:8px}
.field label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold)}
.field input,.field select,.field textarea{font:inherit;font-family:var(--sans);color:var(--cream);background:transparent;border:0;border-bottom:1px solid var(--rule-strong);padding:12px 0;outline:none;transition:border-color var(--t-fast)}
.field input::placeholder,.field textarea::placeholder{color:var(--dim)}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--gold)}
.field textarea{min-height:130px;resize:vertical;padding-top:8px}
.field select{appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><polygon points='5,8 1,2 9,2' fill='%23C6A06B'/></svg>");background-repeat:no-repeat;background-position:right 4px center;padding-right:24px}
.field select option{background:var(--panel);color:var(--cream)}
fieldset.field{border:0;padding:0;margin:0;min-inline-size:auto}
fieldset.field>legend{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);padding:0;margin:0 0 8px}
.chip-group{display:flex;flex-wrap:wrap;gap:8px}
.chip{position:relative;cursor:pointer;user-select:none}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:9px 14px;border:1px solid var(--rule-strong);color:var(--linen);transition:all var(--t-fast);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.chip:hover span{border-color:var(--gold);color:var(--cream)}
.chip input:checked+span{background:var(--gold);color:#1b1308;border-color:var(--gold)}
.chip input:focus-visible+span{outline:2px solid var(--gold);outline-offset:2px}
.form__actions{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:12px}
.form__note{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--dim);max-width:28ch;text-align:right}
.form-gun{position:absolute;top:22px;right:22px;width:110px;opacity:.55;pointer-events:none;z-index:2;transform:rotate(-18deg)}
.form-gun svg{width:100%;height:auto;display:block}
@media(max-width:720px){.form-gun{width:80px;top:14px;right:14px;opacity:.4}}
.studio{display:grid;grid-template-columns:1fr 1.1fr;gap:60px;align-items:center}
@media(max-width:980px){.studio{grid-template-columns:1fr}}
.studio__map{aspect-ratio:5/4;background:var(--surface);position:relative;box-shadow:var(--shadow);overflow:hidden;border:1px solid var(--rule)}
.studio__map svg{position:absolute;inset:0;width:100%;height:100%}
.studio__map svg .road{fill:none;stroke:var(--gold);stroke-width:.5;opacity:.35}
.studio__map svg .block{fill:rgba(198,160,107,.07);stroke:rgba(198,160,107,.18);stroke-width:.4}
.studio__pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;z-index:2}
.studio__pin-vesica{width:60px;height:60px;animation:pulse 4s ease-in-out infinite}
.studio__pin-vesica circle{fill:none;stroke:var(--gold);stroke-width:1.2}
.studio__pin-vesica circle.fill{fill:var(--gold);opacity:.9}
.studio__pin-label{margin-top:14px;background:var(--gold);color:#1b1308;font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;padding:8px 14px;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.faq{display:grid;border-top:1px solid var(--rule);margin-top:32px}
details.faq__item{border-bottom:1px solid var(--rule);padding:0 8px;transition:background var(--t-fast)}
details.faq__item[open]{background:var(--surface)}
details.faq__item summary{list-style:none;cursor:pointer;padding:24px 12px;font-family:var(--serif);font-size:1.3rem;color:var(--bone);display:flex;justify-content:space-between;align-items:center;gap:18px}
details.faq__item summary::-webkit-details-marker{display:none}
.faq__icon{width:22px;height:22px;flex-shrink:0;position:relative;transition:transform var(--t-base)}
.faq__icon::before,.faq__icon::after{content:"";position:absolute;background:var(--gold)}
.faq__icon::before{left:50%;top:0;bottom:0;width:1.5px;transform:translateX(-50%)}
.faq__icon::after{top:50%;left:0;right:0;height:1.5px;transform:translateY(-50%)}
details.faq__item[open] .faq__icon{transform:rotate(45deg)}
details.faq__item .faq__body{padding:0 12px 28px;color:var(--muted);max-width:70ch}
/* footer */
.footer{background:var(--bg-deep);color:var(--linen);padding:80px 0 32px;position:relative;overflow:hidden}
.footer::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.footer a{color:var(--linen)}.footer a:hover{color:var(--gold)}
.footer__grid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;padding-bottom:50px;border-bottom:1px solid var(--rule-soft)}
@media(max-width:820px){.footer__grid{grid-template-columns:1fr 1fr}}
.footer__brand{display:flex;align-items:center;gap:14px;font-family:var(--serif);font-size:1.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--bone);margin-bottom:14px}
.footer__brand svg{width:38px;height:38px}
.footer__brand svg circle,.footer__brand svg path{fill:none;stroke:var(--gold);stroke-width:1.2}
.footer p{color:var(--muted);max-width:36ch}
.footer h4{font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin:0 0 20px}
.footer ul{list-style:none;padding:0;margin:0;display:grid;gap:12px;font-size:14px}
.footer__bottom{padding-top:26px;display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--dim);flex-wrap:wrap;gap:12px}
.socials{display:flex;gap:10px}
.socials a{width:40px;height:40px;display:grid;place-items:center;background:transparent;border:1px solid var(--rule-strong);transition:all var(--t-fast);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.socials a:hover{background:var(--gold)}
.socials a:hover svg{color:#1b1308}
.socials svg{width:16px;height:16px;color:var(--linen)}
/* entrance — load-triggered, so content is never left hidden by JS/scroll */
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:no-preference){
  main>section{animation:rise .8s both cubic-bezier(.2,.7,.2,1)}
  main>section:nth-child(2){animation-delay:.06s}
  main>section:nth-child(3){animation-delay:.12s}
  main>section:nth-child(4){animation-delay:.18s}
  main>section:nth-child(5){animation-delay:.24s}
  main>section:nth-child(n+6){animation-delay:.3s}
}
/* 881-980 tightening */
@media(min-width:881px) and (max-width:980px){
  .container{max-width:880px;padding:0 24px}
  .section{padding:80px 0}.section-head{margin-bottom:44px}
  .hero{padding:90px 0 80px}.hero__inner{gap:44px;grid-template-columns:1.1fr 1fr}
  .hero__lede{font-size:1.08rem;margin-top:1.1rem}.hero__meta{margin-top:1.8rem}
  .hero__meta-item{padding:14px 14px 14px 0}.hero__meta-item:nth-child(2),.hero__meta-item:last-child{padding-left:14px}
  .hero__meta-value{font-size:1.1rem}.hero__actions{gap:12px;margin-top:1.6rem}
  .info-card{padding:34px}.form-card{padding:40px}.contact-grid{gap:44px}
  .style-strip{gap:0}.work-grid{gap:18px}
  .quote-feature{padding:56px 40px;gap:40px}.quote-feature__mark{font-size:9rem;height:80px}
  .quote-feature blockquote{font-size:clamp(1.4rem,2vw,1.8rem)}
  .testimonial-grid{gap:20px;margin-top:48px}.testimonial{padding:28px 26px}
  .post-grid{gap:22px}.about-grid{gap:44px}.team-grid{gap:22px}
  .footer{padding-top:60px}.footer__grid{gap:36px}
}
"""

# ------------------------------------------------------------------- chrome
NAV = [
    ("home", "index.html", "Home"),
    ("portfolio", "portfolio.html", "Portfolio"),
    ("mandala", "mandala-tattoos.html", "Mandala"),
    ("courses", "tattoo-course.html", "Courses"),
    ("community", "social-club.html", "Community"),
    ("about", "about.html", "About"),
    ("testimonials", "testimonials.html", "Testimonials"),
]

def header(current):
    links = []
    for slug, href, label in NAV:
        active = ' class="is-active" aria-current="page"' if slug == current else ""
        links.append(f'        <li><a href="{href}" data-nav="{slug}"{active}>{label}</a></li>')
    links = "\n".join(links)
    return f"""    <a class="skip-link" href="#main">Skip to content</a>
    <header class="nav">
      <div class="container nav__inner">
        <a href="index.html" class="brand">
          <svg class="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="14" r="8" />
            <circle cx="13" cy="25" r="8" />
            <circle cx="27" cy="25" r="8" />
            <polygon points="20,4 36,30 4,30" />
          </svg>
          <span>Massa Tattoo</span>
        </a>
        <nav aria-label="Primary">
          <ul class="nav__links" id="nav-menu">
{links}
          </ul>
        </nav>
        <div class="nav__actions">
          <a class="nav__cta" href="contact.html">Book a Consult</a>
          <button class="nav__toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu">&#9776;</button>
        </div>
      </div>
    </header>"""

FOOTER = """    <footer class="footer">
      <div class="container">
        <div class="footer__grid">
          <div>
            <div class="footer__brand">
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="14" r="8" />
                <circle cx="13" cy="25" r="8" />
                <circle cx="27" cy="25" r="8" />
              </svg>
              <span>Massa Tattoo</span>
            </div>
            <p>A private studio for custom geometric tattoo work &mdash; sacred geometry, dotwork, blackwork, and fine line, by appointment.</p>
            <div class="socials" style="margin-top: 20px;">
              <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a>
              <a href="#" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3v3.2a4.8 4.8 0 0 0 4 2.3v3a7.6 7.6 0 0 1-4-1.2v6.4A5.7 5.7 0 1 1 10.3 11v3.1a2.6 2.6 0 1 0 2.6 2.6V3z"/></svg></a>
              <a href="mailto:hello@massatattoo.com" aria-label="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg></a>
            </div>
          </div>
          <div>
            <h4>Studio</h4>
            <ul>
              <li><a href="portfolio.html">Portfolio</a></li>
              <li><a href="mandala-tattoos.html">Mandala tattoos</a></li>
              <li><a href="tattoo-course.html">Tattoo courses</a></li>
              <li><a href="social-club.html">Social Club</a></li>
              <li><a href="about.html">About</a></li>
              <li><a href="blog.html">Blog</a></li>
              <li><a href="testimonials.html">Testimonials</a></li>
            </ul>
          </div>
          <div>
            <h4>Visit</h4>
            <ul>
              <li>123 Atelier Lane</li>
              <li>Your City, ST 00000</li>
              <li><a href="tel:+15555550123">(555) 555-0123</a></li>
              <li><a href="mailto:hello@massatattoo.com">hello@massatattoo.com</a></li>
            </ul>
          </div>
          <div>
            <h4>Visit us</h4>
            <ul>
              <li><a href="contact.html">Contact</a></li>
              <li><a href="contact.html#book">Book a consult</a></li>
              <li><a href="#">Aftercare</a></li>
              <li><a href="#">Deposits</a></li>
            </ul>
          </div>
        </div>
        <div class="footer__bottom">
          <span>&copy; <span id="year"></span> Massa Tattoo &middot; All rights reserved</span>
          <span>Lat 00.0000&deg; &middot; Lng 00.0000&deg;</span>
        </div>
      </div>
    </footer>"""

JS = """    <script>
    (function(){
      function ready(fn){if(document.readyState!=='loading'){fn();}else{document.addEventListener('DOMContentLoaded',fn);}}
      ready(function(){
        var y=document.getElementById('year'); if(y){y.textContent=new Date().getFullYear();}
        var t=document.querySelector('.nav__toggle'), m=document.querySelector('.nav__links');
        if(t&&m){t.addEventListener('click',function(){var o=m.classList.toggle('is-open');t.setAttribute('aria-expanded',String(o));t.setAttribute('aria-label',o?'Close menu':'Open menu');});}
        document.addEventListener('click',function(e){
          var b=e.target.closest('.filter'); if(!b) return;
          var bar=b.closest('.filter-bar'); if(!bar) return;
          bar.querySelectorAll('.filter').forEach(function(s){s.classList.remove('is-active');s.setAttribute('aria-pressed','false');});
          b.classList.add('is-active'); b.setAttribute('aria-pressed','true');
          var f=b.getAttribute('data-filter')||'all';
          var scope=bar.closest('.container')||document;
          var grid=scope.querySelector('.work-grid'); if(!grid) return;
          var shown=0;
          grid.querySelectorAll('.work-tile').forEach(function(t){
            var styles=(t.getAttribute('data-style')||'').split(' ');
            var ok=(f==='all')||styles.indexOf(f)>-1;
            t.style.display=ok?'':'none'; if(ok) shown++;
          });
          var note=scope.querySelector('.work-empty'); if(note) note.hidden=(shown>0);
        });
        initMandala();
      });
      function initMandala(){
        var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.querySelectorAll('canvas[data-mandala]').forEach(function(cv){
          var ctx=cv.getContext('2d'); if(!ctx)return;
          var rings=+cv.dataset.mandalaRings||6, dots=+cv.dataset.mandalaDots||144, speed=+cv.dataset.mandalaSpeed||0.55, op=+cv.dataset.mandalaOpacity||0.7;
          var t0=performance.now(), rect={width:0,height:0};
          function size(){var r=cv.getBoundingClientRect();var dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.max(1,r.width*dpr);cv.height=Math.max(1,r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);rect=r;}
          size(); window.addEventListener('resize',size);
          function frame(now){
            var w=rect.width,h=rect.height; ctx.clearRect(0,0,w,h);
            var cx=w*0.5, cy=h*0.5, R=Math.min(w,h)*0.46, ang=(now-t0)/1000*speed*0.15;
            for(var ri=1;ri<=rings;ri++){
              var rr=R*ri/rings, n=Math.max(6,Math.round(dots*ri/rings)), dir=ri%2?1:-1;
              for(var i=0;i<n;i++){
                var a=ang*dir + i/n*Math.PI*2, x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
                var rad=Math.max(0.6,1.7*(1-ri/(rings+2)));
                ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);
                ctx.fillStyle='rgba(198,160,107,'+(op*(1-ri/(rings+3))).toFixed(3)+')';ctx.fill();
              }
            }
            if(!reduce){requestAnimationFrame(frame);}
          }
          requestAnimationFrame(frame);
        });
      }
    })();
    </script>"""

# Prefix with .work-tile__art so the photo wins specificity over the
# .work-tile--dark .work-tile__art gradient (both 0,2,0 -> later rule wins).
PHOTO_CSS = "\n".join(
    f'.work-tile__art.{cls}{{background-image:url("{uri}")}}' for cls, uri in photos.items()
)

def grab(pattern, text, default=""):
    m = re.search(pattern, text, re.S)
    return m.group(1).strip() if m else default

# ---------------------------------------------------------------- reusable parts
SKOOL = "https://www.skool.com/massa-tattoo-social-club-7386"

ORBIT = """<div class="page-orbit" aria-hidden="true">
      <svg viewBox="0 0 200 200"><g class="geo-rotate--rev">
        <circle cx="100" cy="100" r="90"/><circle cx="100" cy="100" r="76"/><circle cx="100" cy="100" r="60"/>
        <circle cx="100" cy="100" r="44"/><circle cx="100" cy="100" r="28"/><circle cx="100" cy="100" r="14"/>
      </g></svg>
    </div>"""

GEO_STAR = """<div class="hero__geo" aria-hidden="true">
          <svg viewBox="-100 -100 200 200">
            <defs><circle id="floc" r="18" class="ring"/></defs>
            <g class="geo-pulse"><circle r="92" class="ring ring--thin"/><circle r="86" class="ring"/></g>
            <g class="geo-rotate">
              <use href="#floc"/><use href="#floc" x="18" y="-31.18"/><use href="#floc" x="36" y="0"/>
              <use href="#floc" x="18" y="31.18"/><use href="#floc" x="-18" y="31.18"/><use href="#floc" x="-36" y="0"/>
              <use href="#floc" x="-18" y="-31.18"/><use href="#floc" x="0" y="-62.36"/><use href="#floc" x="54" y="-31.18"/>
              <use href="#floc" x="54" y="31.18"/><use href="#floc" x="0" y="62.36"/><use href="#floc" x="-54" y="31.18"/>
              <use href="#floc" x="-54" y="-31.18"/>
            </g>
            <g class="geo-rotate--rev">
              <polygon points="0,-62 54,31 -54,31" class="tri"/><polygon points="0,62 -54,-31 54,-31" class="tri"/>
              <circle cx="0" cy="-62" r="2.6" class="dot--accent"/><circle cx="54" cy="31" r="2.6" class="dot--accent"/>
              <circle cx="-54" cy="31" r="2.6" class="dot--accent"/><circle cx="0" cy="62" r="2.6" class="dot--accent"/>
              <circle cx="-54" cy="-31" r="2.6" class="dot--accent"/><circle cx="54" cy="-31" r="2.6" class="dot--accent"/>
            </g>
            <circle r="6" class="ring ring--accent"/><circle r="1.6" class="dot"/>
          </svg>
        </div>"""

GEO_RINGS = """<div class="hero__geo" aria-hidden="true">
          <svg viewBox="-100 -100 200 200">
            <g class="geo-rotate">
              <circle r="80" class="ring"/><circle r="68" class="ring ring--thin"/><circle r="56" class="ring"/>
              <circle r="44" class="ring ring--thin"/><circle r="32" class="ring"/><circle r="20" class="ring ring--thin"/>
            </g>
            <g class="geo-rotate--rev"><polygon points="0,-82 71,41 -71,41" class="tri"/></g>
            <circle r="6" class="ring ring--accent"/><circle r="1.6" class="dot"/>
          </svg>
        </div>"""

HERO_WAVES = """<div class="hero__waves" aria-hidden="true">
        <svg viewBox="0 0 200 200"><g>
          <path d="M0,160 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0"/>
          <path d="M-20,140 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0"/>
          <path d="M0,120 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0"/>
          <path d="M-20,100 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0 a20,20 0 0 0 40,0"/>
        </g></svg>
      </div>"""

def tile(cls, title, tag, dark=False, style=""):
    d = " work-tile--dark" if dark else ""
    s = f' data-style="{style}"' if style else ""
    return (f'<a class="work-tile{d}" href="portfolio.html"{s}>'
            f'<div class="work-tile__art {cls}" aria-hidden="true"></div>'
            f'<div class="work-tile__meta"><span class="work-tile__title">{title}</span>'
            f'<span class="work-tile__tag">{tag}</span></div></a>')

WORK_6 = "\n          ".join([
    tile("photo-chest-mandala", "Chest Mandala", "Dotwork · Sternum"),
    tile("photo-leg-sleeve", "Mandala Sleeve", "Geometric · Full leg"),
    tile("photo-back-mandala", "Back Mandala", "Dotwork · Shoulder"),
    tile("photo-chrysanthemum", "Chrysanthemum Sleeve", "Decorative · Full leg"),
    tile("photo-hip-leopard", "Leopard &amp; Mandala", "Blackwork · Hip &amp; thigh", dark=True),
    tile("photo-back-in-progress", "Mid-Session", "In progress · Back", dark=True),
])

PORTFOLIO_GRID = "\n          ".join([
    tile("photo-chest-mandala", "Chest Mandala", "Dotwork · Sternum", style="dotwork mandala"),
    tile("photo-leg-sleeve", "Mandala Sleeve", "Geometric · Full leg", style="sacred-geometry mandala"),
    tile("photo-back-mandala", "Back Mandala", "Dotwork · Shoulder", style="dotwork mandala"),
    tile("photo-chrysanthemum", "Chrysanthemum Sleeve", "Decorative · Full leg", style="ornamental"),
    tile("photo-hip-leopard", "Leopard &amp; Mandala", "Blackwork · Hip &amp; thigh", dark=True, style="blackwork mandala"),
    tile("photo-back-in-progress", "Mid-Session", "In progress · Back", dark=True, style="blackwork mandala"),
    tile("photo-chest-mandala", "Chest Mandala", "Dotwork · Sternum", style="dotwork mandala"),
    tile("photo-leg-sleeve", "Mandala Sleeve", "Geometric · Full leg", style="sacred-geometry mandala"),
    tile("photo-back-mandala", "Back Mandala", "Dotwork · Shoulder", style="dotwork mandala"),
])

STYLE_STRIP = """<div class="style-strip">
          <div class="style-cell"><span class="style-cell__num">01</span>
            <svg viewBox="0 0 56 56" aria-hidden="true"><g class="stroke">
              <circle cx="28" cy="28" r="22"/><circle cx="28" cy="28" r="16"/><circle cx="28" cy="28" r="10"/>
              <polygon points="28,6 50,40 6,40"/><polygon points="28,50 50,16 6,16"/></g></svg>
            <h3>Sacred geometry</h3><p>Metatron's cube, Sri Yantra, Vesica Piscis, the Flower of Life.</p></div>
          <div class="style-cell"><span class="style-cell__num">02</span>
            <svg viewBox="0 0 56 56" aria-hidden="true"><g class="fill">
              <circle cx="14" cy="14" r="2"/><circle cx="28" cy="14" r="2"/><circle cx="42" cy="14" r="2"/>
              <circle cx="14" cy="28" r="2"/><circle cx="28" cy="28" r="3"/><circle cx="42" cy="28" r="2"/>
              <circle cx="14" cy="42" r="2"/><circle cx="28" cy="42" r="2"/><circle cx="42" cy="42" r="2"/>
              <circle cx="21" cy="21" r="1.3"/><circle cx="35" cy="21" r="1.3"/><circle cx="21" cy="35" r="1.3"/><circle cx="35" cy="35" r="1.3"/></g></svg>
            <h3>Dotwork</h3><p>Stippled gradients, shading by density, soft transitions on hard form.</p></div>
          <div class="style-cell"><span class="style-cell__num">03</span>
            <svg viewBox="0 0 56 56" aria-hidden="true"><g class="stroke">
              <polygon points="28,4 52,18 52,38 28,52 4,38 4,18"/><polygon points="28,14 44,22 44,34 28,42 12,34 12,22"/>
              <line x1="28" y1="4" x2="28" y2="52"/><line x1="4" y1="18" x2="52" y2="38"/><line x1="52" y1="18" x2="4" y2="38"/></g></svg>
            <h3>Blackwork</h3><p>Bold negative space, solid fills, architectural composition.</p></div>
          <div class="style-cell"><span class="style-cell__num">04</span>
            <svg viewBox="0 0 56 56" aria-hidden="true"><g class="stroke">
              <path d="M4 28 Q 16 4, 28 28 T 52 28"/><path d="M4 36 Q 16 12, 28 36 T 52 36"/>
              <path d="M4 20 Q 16 -4, 28 20 T 52 20"/><line x1="4" y1="44" x2="52" y2="44"/></g></svg>
            <h3>Fine line</h3><p>Delicate single-needle work, hairline detail, restrained palette.</p></div>
        </div>"""

def star(): return '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9"/></svg>'
STARS = star() * 5

def testimonial(quote, name, date, src):
    return (f'<article class="testimonial"><div class="testimonial__stars" aria-hidden="true">{STARS}</div>'
            f'<blockquote>{quote}</blockquote><div class="testimonial__attr"><div>'
            f'<div class="testimonial__name">{name}</div><div class="testimonial__date">{date}</div></div>'
            f'<span class="testimonial__src">{src}</span></div></article>')

TESTIMONIALS = f"""<div class="quote-feature">
          <div><div class="quote-feature__mark" aria-hidden="true">"</div><span class="eyebrow" style="color: var(--gold);">Featured</span></div>
          <div><blockquote>Massa drew the design over three sittings. By the time the machine started, it already felt like mine — like she'd surfaced something I'd been carrying around for years and finally put a line around it.</blockquote>
            <div class="quote-feature__attr"><div class="quote-feature__avatar">M</div>
              <div><div class="quote-feature__name">Mara K.</div><div class="quote-feature__sub">Tucson · Half-sleeve · 2024</div></div></div>
          </div>
        </div>
        <div class="testimonial-grid" style="margin-top: 56px;">
          {testimonial("I came in with a Pinterest board and walked out with a sketch I would never have thought to ask for. Iris saw what I was actually after.", "Daniel R.", "Feb 2026", "via Email")}
          {testimonial("Five hours in the chair felt like one. The studio is quiet, the music is right, and they treat the appointment like a piece of work, not a transaction.", "Priya S.", "Jan 2026", "via Google")}
          {testimonial("Tomas's fine line is the best I've found anywhere on the continent. Three months in and the hair-thin work has held up beautifully.", "Sofie L.", "Dec 2025", "via Instagram")}
        </div>"""

def proc(steps):
    cells = "".join(f'<div class="process__step"><div class="process__num">{n}</div><h3>{h}</h3><p>{p}</p></div>'
                    for n, h, p in steps)
    return f'<div class="process">{cells}</div>'

PROCESS_IDEA = proc([
    ("01", "Conversation", "You send the idea through the form — symbolism, placement, scale. We come back with the right artist and a draft direction."),
    ("02", "Sketch", "The artist draws your piece by hand, then refines until the composition feels resolved. Two rounds of revisions are baked in."),
    ("03", "Sitting", "You come in, we stencil, and tweak placement until it lives right on the body. Then we make the marks."),
    ("04", "Aftercare", "You leave with a wrap, an aftercare sheet, and a number to text. We check in after two weeks."),
])

STATS = """<div class="stats">
          <div class="stat"><div class="stat__num"><em>10</em>+</div><div class="stat__label">Years in practice</div></div>
          <div class="stat"><div class="stat__num"><em>1.2</em>k</div><div class="stat__label">Pieces completed</div></div>
          <div class="stat"><div class="stat__num"><em>3</em></div><div class="stat__label">Resident artists</div></div>
          <div class="stat"><div class="stat__num"><em>4 — 8</em></div><div class="stat__label">Week wait, on average</div></div>
        </div>"""

def faq(items):
    rows = "".join(f'<details class="faq__item"><summary>{q} <span class="faq__icon" aria-hidden="true"></span></summary>'
                   f'<div class="faq__body">{a}</div></details>' for q, a in items)
    return f'<div class="faq">{rows}</div>'

FAQ_MANDALA = [
    ("What does a mandala tattoo mean?", "Traditionally a mandala stands for wholeness and balance — a center with everything ordered around it. In practice it means whatever you bring to it; we start from your symbolism and build the geometry to match."),
    ("Do mandala tattoos hurt?", "It depends on placement. Flat, fleshy areas (outer arm, thigh) are easier; ribs, sternum, spine and hands are sharper. Larger mandalas run over several sittings, paced so you're not pushed past your limit."),
    ("What does a custom mandala cost?", "Most custom pieces run <strong>€3,000–€7,000</strong>, depending on the hours in the chair, the number of sessions, the design work, and delivery. We quote your piece after a short consult; a deposit secures the date and comes off the final price."),
    ("How long does a mandala take to heal?", "The surface settles in about two weeks; the skin fully recovers over six to eight. You leave with an aftercare sheet and a number to text — we check in after two weeks."),
]
FAQ_HOME = faq(FAQ_MANDALA)
FAQ_FULL = faq(FAQ_MANDALA + [
    ("How big should a mandala be?", "Geometry needs room to breathe — very small mandalas lose detail as they heal. Most pieces sit palm-sized or larger; sleeves and backs run multiple sessions. We'll advise honestly at the consult."),
])

VISIT = """<div class="contact-grid">
          <div class="info-card">
            <span class="eyebrow">The studio</span><h3 style="margin-top:8px;">Find us</h3>
            <div class="geo-rule geo-rule--left"><span class="geo-rule__diamond"></span></div>
            <ul class="info-list">
              <li><span class="info-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
                <div><span class="info-label">Address</span><span class="info-value">123 Atelier Lane · Suite 4<br/>Your City, ST 00000</span></div></li>
              <li><span class="info-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg></span>
                <div><span class="info-label">Email</span><span class="info-value"><a href="mailto:hello@massatattoo.com">hello@massatattoo.com</a></span></div></li>
              <li><span class="info-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/></svg></span>
                <div><span class="info-label">Instagram</span><span class="info-value"><a href="https://instagram.com/" target="_blank" rel="noopener">@massatattoo</a></span></div></li>
            </ul>
          </div>
          <div class="info-card">
            <span class="eyebrow">Open hours</span><h3 style="margin-top:8px;">When you can stop by</h3>
            <div class="geo-rule geo-rule--left"><span class="geo-rule__diamond"></span></div>
            <dl class="hours">
              <dt>Mon</dt><dd class="is-closed">— Closed</dd><dt>Tue</dt><dd>12:00 — 20:00</dd>
              <dt>Wed</dt><dd>12:00 — 20:00</dd><dt>Thu</dt><dd>12:00 — 20:00</dd>
              <dt>Fri</dt><dd>12:00 — 21:00</dd><dt>Sat</dt><dd>11:00 — 19:00</dd>
              <dt>Sun</dt><dd class="is-closed">— By appointment</dd>
            </dl>
          </div>
        </div>"""

# ------------------------------------------------------------------ home (journey)
HOME_MAIN = f"""<main id="main">
    <section class="hero">
      <canvas class="mandala mandala--hero" data-mandala data-mandala-theme="gold" data-mandala-rings="6" data-mandala-dots="144" data-mandala-speed="0.55" data-mandala-opacity="0.7" aria-hidden="true"></canvas>
      <div class="container hero__inner">
        <div>
          <span class="eyebrow">§ 00 — Mandala &amp; Sacred-Geometry Tattoo · Est. 2014</span>
          <h1 class="hero__title">Mandala tattoos, made <em>with intention</em>.</h1>
          <p class="hero__lede">A small, private studio for custom mandala and sacred-geometry work — dotwork, blackwork, and fine line. Composed for the body, drawn for the person.</p>
          <div class="hero__actions">
            <a class="btn btn--dark" href="contact.html#book">Book a consult →</a>
            <a class="btn btn--ghost" href="portfolio.html">See the portfolio</a>
          </div>
          <div class="hero__meta">
            <div class="hero__meta-item"><span class="hero__meta-label">Studio</span><span class="hero__meta-value">By appointment</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Pieces shipped</span><span class="hero__meta-value">1,200+</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Wait time</span><span class="hero__meta-value">4 — 8 weeks</span></div>
          </div>
        </div>
        {GEO_STAR}
      </div>
      {HERO_WAVES}
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 01 — The work</span><h2>See the <em>work</em> first.</h2>
          <p>Most people choosing an artist want one thing up front: the pieces. A few recent ones — the full archive goes deeper.</p></div>
        <div class="work-grid">
          {WORK_6}
        </div>
        <div style="margin-top: 40px;"><a class="btn btn--ghost" href="portfolio.html">See the whole portfolio →</a></div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 02 — What we specialise in</span><h2>A studio built around <em>mandala &amp; geometry</em>.</h2>
          <p>A mandala is a circle that stands for wholeness — a center, and everything ordered around it. We start every piece from that idea, then build the geometry out by hand.</p></div>
        {STYLE_STRIP}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 03 — How we work</span><h2>Composed for the <em>body</em>. Drawn for the <em>person</em>.</h2></div>
        <p style="max-width: 60ch; font-size: 1.1rem;">Every piece begins with a conversation — what drew you to the symbolism, where it lives on your body, how you want to feel walking out of the chair. From there we sketch, refine, and only ink when the design feels resolved.</p>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 04 — In their words</span><h2>What clients say <em>after</em>.</h2></div>
        {TESTIMONIALS}
        <div style="margin-top: 40px;"><a class="btn btn--ghost" href="testimonials.html">Read more testimonials →</a></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 05 — How it works</span><h2>Four steps from <em>idea to ink</em>.</h2></div>
        {PROCESS_IDEA}
      </div>
    </section>

    <section class="section section--dark">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 06 — The studio</span><h2>Ten years, <em>still small on purpose</em>.</h2>
          <p>A private, appointment-only studio. We take a handful of clients each week so every piece gets the attention it needs.</p></div>
        {STATS}
        <div style="margin-top: 36px;"><a class="btn btn--ghost" href="about.html">Meet the studio →</a></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 07 — Common questions</span><h2>Mandala tattoos, <em>answered</em>.</h2></div>
        {FAQ_HOME}
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 08 — Visit</span><h2>Private studio, <em>by appointment</em>.</h2>
          <p>Walk in during open hours to browse the portfolio or talk through an idea; sittings are booked ahead.</p></div>
        {VISIT}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 09 — Learn with us</span><h2>Massa Tattoo <em>Social Club</em>.</h2>
            <p>Newly launched — an online community for people serious about learning to tattoo properly. Build skill fast, share your work, and grow with others who value clean work and respect.</p></div>
          <div><a class="btn btn--primary" href="social-club.html">Learn more →</a></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 10 — Booking</span><h2>Ready to start a <em>mandala</em>?</h2>
            <p>Send us your idea — symbolism, placement, scale — and we'll come back with the right artist, a sketch direction, and a date for the chair.</p></div>
          <div><a class="btn btn--primary" href="contact.html#book">Send a request →</a></div>
        </div>
      </div>
    </section>
    </main>"""

# ------------------------------------------------------------------ portfolio
PORTFOLIO_MAIN = f"""<main id="main">
    <section class="hero">
      <div class="container hero__inner">
        <div>
          <span class="eyebrow">§ 01 — Portfolio</span>
          <h1 class="hero__title">Ten years, <em>line by line</em>.</h1>
          <p class="hero__lede">A working archive of recent pieces — mandala, sacred geometry, dotwork, blackwork, fine line. Filter to find the work closest to the idea you're carrying.</p>
          <div class="hero__meta">
            <div class="hero__meta-item"><span class="hero__meta-label">Pieces shown</span><span class="hero__meta-value">9 / 1,200+</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Styles</span><span class="hero__meta-value">Five</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Updated</span><span class="hero__meta-value">Weekly</span></div>
          </div>
        </div>
        {GEO_RINGS}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="filter-bar">
          <span class="filter-bar__label">Filter →</span>
          <button class="filter is-active" type="button" data-filter="all" aria-pressed="true">All</button>
          <button class="filter" type="button" data-filter="mandala" aria-pressed="false">Mandala</button>
          <button class="filter" type="button" data-filter="sacred-geometry" aria-pressed="false">Sacred geometry</button>
          <button class="filter" type="button" data-filter="dotwork" aria-pressed="false">Dotwork</button>
          <button class="filter" type="button" data-filter="blackwork" aria-pressed="false">Blackwork</button>
          <button class="filter" type="button" data-filter="ornamental" aria-pressed="false">Ornamental</button>
        </div>
        <div class="work-grid">
          {PORTFOLIO_GRID}
        </div>
        <p class="work-empty" hidden>No pieces in this style yet — ask in your booking request and we'll show you more.</p>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 02 — A note on the archive</span><h2>What you don't see is <em>most of it</em>.</h2>
          <p>This page is a selection. We don't post every piece — some clients keep their tattoos off the feed, and we honour that. If you'd like to see more of a specific style, ask in your booking request.</p></div>
        <blockquote class="pull-quote">"A good portfolio shows you what an artist <em>can</em> do. A great one tells you what they keep coming back to. This is ours."<cite>— from the studio notes</cite></blockquote>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 03 — Your turn</span><h2>See a piece that <em>opens something up</em>?</h2>
            <p>Send us a reference or just describe what drew you to it. We'll come back with a sketch direction.</p></div>
          <div><a class="btn btn--primary" href="contact.html#book">Send a request →</a></div>
        </div>
      </div>
    </section>
    </main>"""

# ------------------------------------------------------------------ mandala pillar
MANDALA_MAIN = f"""<main id="main">
    <section class="hero">
      <canvas class="mandala mandala--hero" data-mandala data-mandala-rings="6" data-mandala-dots="150" data-mandala-speed="0.5" data-mandala-opacity="0.7" aria-hidden="true"></canvas>
      <div class="container hero__inner">
        <div>
          <span class="eyebrow">§ 00 — Mandala Tattoos</span>
          <h1 class="hero__title">Mandala tattoos, from <em>meaning to skin</em>.</h1>
          <p class="hero__lede">A mandala is a circle that stands for wholeness. We design custom mandala tattoos built from sacred geometry — drawn by hand, composed for your body, made to last.</p>
          <div class="hero__actions">
            <a class="btn btn--dark" href="contact.html#book">Book a consult →</a>
            <a class="btn btn--ghost" href="portfolio.html">See mandala work</a>
          </div>
          <div class="hero__meta">
            <div class="hero__meta-item"><span class="hero__meta-label">Specialty</span><span class="hero__meta-value">Mandala</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Built from</span><span class="hero__meta-value">Sacred geometry</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Studio</span><span class="hero__meta-value">By appointment</span></div>
          </div>
        </div>
        {GEO_STAR}
      </div>
      {HERO_WAVES}
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 01 — Meaning</span><h2>What a mandala <em>carries</em>.</h2></div>
        <p class="manifesto">A center, and everything ordered around it — a map of <em>wholeness</em>, balance, and return.</p>
        <p style="max-width: 62ch; margin-top: 24px;">Across cultures the mandala shows up as the same idea: concentric symmetry radiating from a single point. On skin it reads as calm, deliberate, and personal — which is why we start every piece from your symbolism, not a flash sheet, and build the geometry out from the center.</p>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 02 — Styles</span><h2>Four ways we draw a <em>mandala</em>.</h2>
          <p>Most pieces live where these meet — a dotwork-shaded sacred-geometry mandala, a blackwork-anchored sleeve, a fine-line ornament.</p></div>
        {STYLE_STRIP}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 03 — Placement</span><h2>Where a mandala <em>sits best</em>.</h2>
          <p>Symmetry wants a surface that flows. These placements carry mandala work well.</p></div>
        {proc([
          ("01", "Sternum &amp; chest", "Centered symmetry that mirrors the body — a classic home for a radial mandala."),
          ("02", "Spine &amp; back", "The largest canvas; full mandalas and stacked geometry down the spine."),
          ("03", "Sleeve", "Wraps the arm — geometry that travels around the limb and reads from every angle."),
          ("04", "Hand, thigh, behind-ear", "Smaller, decorative, fine-line mandalas where detail and restraint matter."),
        ])}
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 04 — Recent work</span><h2>A few <em>mandala pieces</em>.</h2></div>
        <div class="work-grid">
          {WORK_6}
        </div>
        <div style="margin-top: 40px;"><a class="btn btn--ghost" href="portfolio.html">See the whole portfolio →</a></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 05 — Process</span><h2>From idea to <em>ink</em>.</h2></div>
        {PROCESS_IDEA}
      </div>
    </section>

    <section class="section section--dark">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 06 — Questions</span><h2>Mandala tattoos, <em>answered</em>.</h2></div>
        {FAQ_FULL}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 07 — Booking</span><h2>Start your <em>mandala</em>.</h2>
            <p>Send your idea — symbolism, placement, scale — and we'll come back with a sketch direction and a date.</p></div>
          <div><a class="btn btn--primary" href="contact.html#book">Send a request →</a></div>
        </div>
      </div>
    </section>
    </main>"""

# ------------------------------------------------------------------ courses
COURSE_MAIN = f"""<main id="main">
    <section class="hero">
      <div class="container hero__inner">
        <div>
          <span class="eyebrow">§ 00 — Tattoo Courses · By application</span>
          <h1 class="hero__title">Learn to tattoo, <em>properly</em>.</h1>
          <p class="hero__lede">Small-group, mentor-led tattoo training at the studio — a foundation course for people starting out, and an advanced course for working tattooers pushing geometric and mandala work.</p>
          <div class="hero__actions">
            <a class="btn btn--dark" href="contact.html#book">Apply / enquire →</a>
            <a class="btn btn--ghost" href="#foundation">See the courses</a>
          </div>
          <div class="hero__meta">
            <div class="hero__meta-item"><span class="hero__meta-label">Format</span><span class="hero__meta-value">Small groups</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Level</span><span class="hero__meta-value">Beginner → Pro</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Intake</span><span class="hero__meta-value">By application</span></div>
          </div>
        </div>
        {GEO_RINGS}
      </div>
    </section>

    <section class="section" id="foundation">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 01 — Foundation course</span><h2>Start from <em>zero</em>, the right way.</h2>
          <p>For complete beginners. By the end you can set up safely, run a machine, and complete a clean, healed tattoo under supervision.</p></div>
        {proc([
          ("01", "Health &amp; safety", "Bloodborne pathogens, sterilisation, cross-contamination, station setup, and studio law — first, and properly."),
          ("02", "Machines &amp; needles", "Coil vs rotary, needle groupings, voltage, depth — how to build and tune a working setup."),
          ("03", "Line &amp; shade", "Stencils, lining, packing, whip and dotwork shading — practised on synthetic skin before anyone."),
          ("04", "Supervised tattoos", "Your first real tattoos on willing models, fully mentored, from stencil to healed result."),
        ])}
      </div>
    </section>

    <section class="section section--alt" id="advanced">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 02 — Advanced course</span><h2>For working tattooers going <em>geometric</em>.</h2>
          <p>Prerequisite: you already tattoo. This is about construction, symmetry, and scale — what mandala and sacred-geometry work live or die on.</p></div>
        {proc([
          ("01", "Geometry &amp; construction", "Grids, compass work, freehand symmetry — building a mandala from the center out."),
          ("02", "Dotwork &amp; density", "Stippled gradients, packing solid black, and controlling the healed result."),
          ("03", "Composition at scale", "Sleeves, backs, and fitting a large design to the body's natural flow."),
          ("04", "Critique &amp; mentorship", "Portfolio review, one-to-one feedback, and a guided large piece start to finish."),
        ])}
      </div>
    </section>

    <section class="section section--dark">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 03 — What you get</span><h2>Small groups, <em>real mentorship</em>.</h2></div>
        <div class="stats">
          <div class="stat"><div class="stat__num"><em>6</em></div><div class="stat__label">Students max, per intake</div></div>
          <div class="stat"><div class="stat__num"><em>1:3</em></div><div class="stat__label">Mentor-to-student ratio</div></div>
          <div class="stat"><div class="stat__num"><em>∞</em></div><div class="stat__label">Aftercare — questions answered for life</div></div>
          <div class="stat"><div class="stat__num"><em>1</em></div><div class="stat__label">Certificate of completion</div></div>
        </div>
        <p style="max-width: 60ch; margin-top: 30px;">Kit and practice materials are provided during the course. <em>Dates, duration, and pricing are set per intake — drop your live details in here.</em></p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 04 — Questions</span><h2>Before you <em>apply</em>.</h2></div>
        {faq([
          ("Do I need experience?", "Not for the foundation course — it starts from zero. The advanced course is for people who already tattoo and want to push geometric and mandala work."),
          ("What does it cost?", "Pricing is set per intake and a deposit secures your seat. <em>Replace with your live course fees and dates.</em>"),
          ("Do I get a certificate?", "Yes — a certificate of completion. Note that tattoo licensing rules vary by country, so check your local requirements too."),
          ("What do I need to bring?", "Kit and practice skin are provided during the course. Bring a sketchbook, something to take notes on, and any reference work you'd like to build toward."),
        ])}
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 05 — Community</span><h2>Or learn in the <em>Social Club</em>.</h2>
            <p>Prefer to learn online, or want a community between sittings? The Massa Tattoo Social Club is an online home for people serious about learning to tattoo.</p></div>
          <div><a class="btn btn--primary" href="social-club.html">See the club →</a></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 06 — Apply</span><h2>Ready to <em>learn</em>?</h2>
            <p>Tell us where you are now and which course fits. Seats are limited and go by application.</p></div>
          <div><a class="btn btn--primary" href="contact.html#book">Apply now →</a></div>
        </div>
      </div>
    </section>
    </main>"""

# ------------------------------------------------------------------ social club
SOCIAL_CLUB_MAIN = f"""<main id="main">
    <section class="hero">
      <canvas class="mandala mandala--hero" data-mandala data-mandala-rings="6" data-mandala-dots="150" data-mandala-speed="0.5" data-mandala-opacity="0.6" aria-hidden="true"></canvas>
      <div class="container hero__inner">
        <div>
          <span class="eyebrow">§ 00 — Massa Tattoo Social Club · Online</span>
          <h1 class="hero__title">Learn to tattoo, <em>in good company</em>.</h1>
          <p class="hero__lede">Want to become a tattoo artist? Learn the fundamentals, build skill fast, and join a grounded community that values growth, clean work, and respect.</p>
          <div class="hero__actions">
            <a class="btn btn--dark" href="{SKOOL}" target="_blank" rel="noopener">Join the club →</a>
            <a class="btn btn--ghost" href="#inside">See what's inside</a>
          </div>
          <div class="hero__meta">
            <div class="hero__meta-item"><span class="hero__meta-label">Format</span><span class="hero__meta-value">Online community</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Level</span><span class="hero__meta-value">Beginner → Pro</span></div>
            <div class="hero__meta-item"><span class="hero__meta-label">Membership</span><span class="hero__meta-value">$497</span></div>
          </div>
        </div>
        {GEO_STAR}
      </div>
      {HERO_WAVES}
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 01 — What it is</span><h2>Serious about learning, <em>without the ego</em>.</h2></div>
        <p class="manifesto">No egos, no shortcuts — just real people learning, improving, and growing <em>together</em>.</p>
        <p style="max-width: 62ch; margin-top: 24px;">The Social Club is built for people who want to learn tattooing and do it properly. Share your work, ask questions, stay accountable, and learn from artists at every stage — whether you're picking up a machine for the first time or already on the path.</p>
      </div>
    </section>

    <section class="section section--alt" id="inside">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 02 — Inside the club</span><h2>What you <em>get</em>.</h2></div>
        {proc([
          ("01", "Share your work", "Post your pieces and your practice and get honest, useful feedback from people further down the road."),
          ("02", "Ask anything", "Machines, needles, healing, design — ask questions at any stage and get grounded answers."),
          ("03", "Stay accountable", "A space that keeps you showing up, practising, and pushing the work forward."),
          ("04", "Learn at every level", "Beginners to experienced artists, learning side by side and lifting each other's work."),
        ])}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 03 — Who it's for</span><h2>Wherever you <em>are</em> on the path.</h2>
          <p>Brand new and want to start right, or already tattooing and after a community that holds the bar high — both belong here.</p></div>
        <div class="stats">
          <div class="stat"><div class="stat__num"><em>$497</em></div><div class="stat__label">One membership, full access</div></div>
          <div class="stat"><div class="stat__num"><em>24/7</em></div><div class="stat__label">Community, always on</div></div>
          <div class="stat"><div class="stat__num"><em>All</em></div><div class="stat__label">Skill levels welcome</div></div>
          <div class="stat"><div class="stat__num"><em>0</em></div><div class="stat__label">Egos, shortcuts, gatekeeping</div></div>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 04 — Club vs course</span><h2>How it fits the <em>in-person course</em>.</h2></div>
        <p style="max-width: 62ch;">The <a href="tattoo-course.html">in-person courses</a> are hands-on, mentor-led training at the studio. The Social Club is the online home around it — daily community, feedback, and accountability you can plug into from anywhere. Plenty of members do both.</p>
      </div>
    </section>

    <section class="section section--dark">
      <div class="container">
        <div class="section-head"><span class="eyebrow">§ 05 — Questions</span><h2>Before you <em>join</em>.</h2></div>
        {faq([
          ("Is it for complete beginners?", "Yes — it's built for people starting out as much as those already tattooing. You won't be the only beginner in the room."),
          ("What do I get for the membership?", "Full access to the community: share work, ask questions, get feedback, and learn alongside artists at every level. Membership is $497."),
          ("Is this the same as the in-person course?", "No — the course is hands-on training at the studio; the club is the online community around it. They work well together."),
          ("How do I join?", "Membership runs through Skool. Hit join and you're in — see you inside."),
        ])}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta-banner">
          <div><span class="eyebrow">§ 06 — Join</span><h2>Come build skill, <em>grounded</em>.</h2>
            <p>Join the Massa Tattoo Social Club on Skool and start learning with a community that values clean work and respect.</p></div>
          <div><a class="btn btn--primary" href="{SKOOL}" target="_blank" rel="noopener">Join on Skool →</a></div>
        </div>
      </div>
    </section>
    </main>"""

PAGE_SPECS = [
    dict(file="index.html", slug="home", photos=True, main=HOME_MAIN,
         title="Massa Tattoo — Custom Mandala &amp; Sacred-Geometry Tattoo Studio",
         desc="A private, appointment-only studio for custom mandala and sacred-geometry tattoos — dotwork, blackwork, and fine line. See the work, then book a consult.",
         canon="https://massatattoo.com/"),
    dict(file="portfolio.html", slug="portfolio", photos=True, main=PORTFOLIO_MAIN,
         title="Mandala &amp; Geometric Tattoo Portfolio — Massa Tattoo",
         desc="A filterable archive of mandala, sacred geometry, dotwork, and blackwork tattoo work from Massa Tattoo.",
         canon="https://massatattoo.com/portfolio.html"),
    dict(file="mandala-tattoos.html", slug="mandala", photos=True, main=MANDALA_MAIN,
         title="Mandala Tattoos — Meaning, Styles &amp; Custom Work | Massa Tattoo",
         desc="Everything on mandala tattoos: what they mean, the styles (dotwork, sacred geometry, blackwork, fine line), placement, the process, and how to book a custom piece.",
         canon="https://massatattoo.com/mandala-tattoos/"),
    dict(file="tattoo-course.html", slug="courses", photos=False, main=COURSE_MAIN,
         title="Tattoo Courses — Foundation &amp; Advanced | Massa Tattoo",
         desc="Small-group, mentor-led tattoo courses at Massa Tattoo — a foundation course for beginners and an advanced course in geometric and mandala work.",
         canon="https://massatattoo.com/tattoo-course/"),
    dict(file="social-club.html", slug="community", photos=False, main=SOCIAL_CLUB_MAIN,
         title="Massa Tattoo Social Club — Learn to Tattoo Online | Massa Tattoo",
         desc="An online community for people serious about learning to tattoo — fundamentals, feedback, and accountability. Join the Massa Tattoo Social Club on Skool.",
         canon="https://massatattoo.com/social-club/"),
    dict(file="about.html", slug="about", photos=False, main=None),
    dict(file="blog.html", slug="blog", photos=False, main=None),
    dict(file="testimonials.html", slug="testimonials", photos=False, main=None),
    dict(file="contact.html", slug="contact", photos=False, main=None),
]

for spec in PAGE_SPECS:
    fname = spec["file"]; slug = spec["slug"]
    if spec["main"] is None:
        src = (SRC / fname).read_text()
        title = grab(r"<title>(.*?)</title>", src)
        desc = grab(r'name="description" content="(.*?)"', src)
        canon = grab(r'rel="canonical" href="(.*?)"', src)
        orbit = grab(r'(<div class="page-orbit".*?</div>)', src)
        main = grab(r"(<main id=\"main\">.*?</main>)", src)
    else:
        title = spec["title"]; desc = spec["desc"]; canon = spec["canon"]
        orbit = ORBIT; main = spec["main"]
    uses_photos = spec["photos"]
    css = CSS.replace("/*PHOTOS*/", PHOTO_CSS if uses_photos else "")

    doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content="{desc}" />
    <link rel="canonical" href="{canon}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Massa Tattoo" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{desc}" />
    <meta property="og:url" content="{canon}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{desc}" />
    <meta name="theme-color" content="#0E0B07" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
{css}
    </style>
  </head>
  <body data-nav-current="{slug}">
    {orbit}

{header(slug)}

    {main}

{FOOTER}

{JS}
  </body>
</html>
"""
    (OUT / fname).write_text(doc)
    print(f"wrote {fname:18} {len(doc)//1024:4d} KB  (photos={uses_photos})")

print("\nDone ->", OUT)
