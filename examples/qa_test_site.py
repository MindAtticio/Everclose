import asyncio, json, sys
from playwright.async_api import async_playwright
URL = "http://localhost:8765/"
SS = "/workspace/everclose/site/screenshots/"
errors, fails = [], []
def hook(page, tag):
    page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"[{tag}] console.{m.type}: {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.on("requestfailed", lambda r: fails.append(f"[{tag}] {r.url} {r.failure}"))
    page.on("response", lambda r: r.status >= 400 and fails.append(f"[{tag}] HTTP {r.status} {r.url}"))

async def nums(page):
    return await page.evaluate("()=>({raised:document.querySelector('#raised').textContent,sup:document.querySelector('#supporters').textContent,store:localStorage.getItem('everclose_demo_progress_v1')})")

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: check.failed += 1
check.failed = 0

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = await ctx.new_page(); hook(page, "desktop")
        await page.goto(URL, wait_until="networkidle")
        await page.evaluate("document.fonts.ready")
        await page.wait_for_timeout(1200)
        cd = await page.text_content('[data-cd="d"]')
        check(cd.isdigit() and int(cd) >= 0, f"countdown running (days={cd})")
        await page.screenshot(path=SS + "01_desktop_hero.png")
        # unlock
        await page.locator("#unlock").scroll_into_view_if_needed()
        await page.evaluate("document.querySelector('#unlock').scrollIntoView()")
        await page.wait_for_timeout(1900)
        n0 = await nums(page); print("initial", n0)
        check(n0["raised"] == "$1,240" and n0["sup"] == "38", "demo start values shown")
        await page.locator("#unlock").screenshot(path=SS + "02_desktop_unlock_bar.png")
        await page.evaluate("document.querySelector('#support').scrollIntoView()")
        await page.wait_for_timeout(400)
        await page.locator("#support").screenshot(path=SS + "03_desktop_support_tiers.png")
        await page.evaluate("document.querySelector('#story').scrollIntoView()")
        await page.wait_for_timeout(300)
        await page.locator("#story").screenshot(path=SS + "04_desktop_story_characters.png")

        # --- card flow, one-time $25 ---
        await page.evaluate("window.scrollTo(0,0)")
        await page.click(".hero__cta [data-support]")
        await page.wait_for_selector('#modal.is-open')
        await page.click('#mAmounts .amt:has-text("$25")')
        await page.fill('#mName', 'Nightpaw')
        await page.wait_for_timeout(300)
        await page.screenshot(path=SS + "05_modal_step1_amount.png")
        await page.click('#toMethod')
        await page.wait_for_selector('[data-step=method]:not([hidden])')
        await page.wait_for_timeout(250)
        await page.screenshot(path=SS + "06_modal_step2_method.png")
        await page.click('#payCard')
        await page.wait_for_selector('[data-step=card]:not([hidden])')
        await page.click('#coPay')  # empty -> validation
        err = await page.text_content('#cardErr'); check(len(err) > 0, f"card validation error shown: {err!r}")
        await page.fill('#coEmail', 'fan@example.com'); await page.fill('#coCard', '4000000000000002')
        await page.fill('#coExp', '1230'); await page.fill('#coCvc', '123')
        await page.click('#coPay'); await page.wait_for_timeout(1500)
        err = await page.text_content('#cardErr'); check("declined" in err, f"decline test card handled: {err!r}")
        await page.click('#fillTest')
        await page.wait_for_timeout(200)
        await page.screenshot(path=SS + "07_modal_card_stripe_test.png")
        await page.click('#coPay')
        await page.wait_for_selector('[data-step=success]:not([hidden])', timeout=5000)
        await page.wait_for_timeout(1900)
        await page.screenshot(path=SS + "08_modal_success.png")
        await page.click('[data-step=success] [data-close]')
        await page.wait_for_timeout(400)
        n1 = await nums(page); print("after card", n1)
        check(n1["raised"] == "$1,265" and n1["sup"] == "39", "progress +$25 / +1 supporter after card")

        # --- crypto flow, custom $40 via on-page one-time card ---
        await page.fill('#onceCustom', '40')
        await page.click('#onceGo')
        await page.wait_for_selector('#modal.is-open')
        check((await page.input_value('#mCustom')) == "40", "custom amount carried into modal")
        await page.click('#toMethod')
        await page.click('#payCrypto')
        await page.wait_for_selector('[data-step=crypto]:not([hidden])')
        await page.click('.coin--eth')
        await page.wait_for_timeout(300)
        amt = await page.text_content('#cAmt'); check("ETH" in amt, f"ETH quote shown: {amt}")
        await page.screenshot(path=SS + "09_modal_crypto_test.png")
        await page.click('#simCrypto')
        await page.wait_for_selector('[data-step=success]:not([hidden])', timeout=6000)
        await page.wait_for_timeout(1800)
        await page.screenshot(path=SS + "10_modal_success_crypto.png")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        check(await page.locator('#modal').is_hidden(), "Esc closes modal")
        n2 = await nums(page); print("after crypto", n2)
        check(n2["raised"] == "$1,305" and n2["sup"] == "40", "progress +$40 after crypto")

        # --- monthly via tier button, wallet ---
        await page.click('[data-tier=veluri]')
        await page.wait_for_selector('#modal.is-open')
        sel = await page.get_attribute('.seg__btn[data-freq=monthly]', 'aria-selected'); check(sel == "true", "tier button opens monthly")
        tot = await page.text_content('#mTotal'); check("$20 / month" in tot, f"monthly total: {tot}")
        await page.screenshot(path=SS + "11_modal_monthly.png")
        await page.click('#toMethod')
        check(await page.is_disabled('#payCrypto'), "crypto disabled for monthly")
        await page.click('#payCard')
        await page.click('[data-wallet="Apple Pay"]')
        await page.wait_for_selector('[data-step=success]:not([hidden])', timeout=5000)
        await page.wait_for_timeout(1700)
        await page.click('[data-step=success] [data-close]')
        await page.wait_for_timeout(300)
        n3 = await nums(page); check(n3["raised"] == "$1,325" and n3["sup"] == "41", f"monthly counted {n3['raised']}")

        # --- min amount validation ---
        await page.click('.nav [data-support]')
        await page.fill('#mCustom', '1')
        await page.click('#toMethod')
        e = await page.text_content('#amountErr'); check("between" in e, "min amount validation")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)

        # --- signup ---
        await page.fill('#signupEmail', 'nope'); await page.click('#signupForm button')
        m = await page.text_content('#signupMsg'); check("valid" in m, "signup validation")
        await page.fill('#signupEmail', 'fan@example.com'); await page.click('#signupForm button')
        await page.wait_for_timeout(800)
        m = await page.text_content('#signupMsg'); check("on the list" in m, "signup success (simulated)")
        await page.evaluate("document.querySelector('#community').scrollIntoView()")
        await page.wait_for_timeout(300)
        await page.locator("#community").screenshot(path=SS + "12_desktop_signup_discord.png")
        await page.click('#discordLink'); await page.wait_for_timeout(300)
        check("placeholder" in (await page.text_content('#toast')), "discord placeholder toast")

        # --- persistence ---
        await page.reload(wait_until="networkidle")
        await page.evaluate("document.querySelector('#unlock').scrollIntoView()")
        await page.wait_for_timeout(2600)
        n4 = await nums(page); check(n4["raised"] == "$1,325", f"persisted after reload: {n4['raised']}")
        await page.screenshot(path=SS + "13_desktop_unlock_after_support.png")
        await page.click('#resetDemo'); await page.wait_for_timeout(1700)
        n5 = await nums(page); check(n5["raised"] == "$1,240", "reset demo works")
        await page.screenshot(path=SS + "00_desktop_fullpage.png", full_page=True)

        # --- mobile ---
        m = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = await m.new_page(); hook(mp, "mobile")
        await mp.goto(URL, wait_until="networkidle"); await mp.wait_for_timeout(1000)
        await mp.screenshot(path=SS + "14_mobile_390_hero.png")
        await mp.evaluate("document.querySelector('#unlock').scrollIntoView()"); await mp.wait_for_timeout(1800)
        sw = await mp.evaluate("document.documentElement.scrollWidth"); check(sw <= 390, f"no horizontal overflow on mobile (scrollWidth={sw})")
        await mp.screenshot(path=SS + "15_mobile_390_fullpage.png", full_page=True)
        await mp.evaluate("window.scrollTo(0,0)")
        await mp.click('.hero__cta [data-support]'); await mp.wait_for_timeout(400)
        await mp.click('#toMethod'); await mp.click('#payCard'); await mp.click('#fillTest'); await mp.wait_for_timeout(300)
        await mp.screenshot(path=SS + "16_mobile_390_card_checkout.png")
        await mp.click('#coPay'); await mp.wait_for_selector('[data-step=success]:not([hidden])', timeout=5000); await mp.wait_for_timeout(1700)
        await mp.screenshot(path=SS + "17_mobile_390_success.png")
        # --- poster aspect ratio at many widths (fresh load + live resize) ---
        pc = await b.new_context(viewport={"width": 1440, "height": 900})
        pp = await pc.new_page(); hook(pp, "poster")
        await pp.goto(URL, wait_until="networkidle")
        for w in [1440, 1024, 768, 390, 360]:
            await pp.set_viewport_size({"width": w, "height": 900 if w > 500 else 780})
            await pp.wait_for_timeout(250)
            r = await pp.evaluate("""()=>{const i=document.querySelector('.hero__poster img');const b=i.getBoundingClientRect();
               return {w:i.offsetWidth,h:i.offsetHeight,nat:i.naturalWidth/i.naturalHeight,vis:getComputedStyle(i.parentElement).display!=='none'}}""")
            ratio = r["w"] / r["h"] if r["h"] else 0
            check(r["vis"] and abs(ratio / r["nat"] - 1) < 0.01, f"poster ratio @{w}px: {r['w']}x{r['h']} = {ratio:.4f} vs natural {r['nat']:.4f}")
        # same check on a fresh load at each width
        for w in [1024, 768, 360]:
            fc = await b.new_context(viewport={"width": w, "height": 900})
            fp = await fc.new_page(); hook(fp, f"poster{w}")
            await fp.goto(URL, wait_until="networkidle")
            r = await fp.evaluate("()=>{const i=document.querySelector('.hero__poster img');return {w:i.offsetWidth,h:i.offsetHeight,nat:i.naturalWidth/i.naturalHeight}}")
            check(abs((r["w"]/r["h"]) / r["nat"] - 1) < 0.01, f"poster ratio fresh @{w}px: {r['w']}x{r['h']}")
            if w == 768:
                await fp.wait_for_timeout(600)
                await fp.screenshot(path=SS + "19_tablet_768_hero.png")
                await fp.screenshot(path=SS + "20_tablet_768_fullpage.png", full_page=True)
            await fc.close()
        # --- palette audit: no orange anywhere in computed styles ---
        orange = await pp.evaluate(r"""()=>{
          const bad=new Set();const re=/rgba?\(([^)]+)\)/g;
          const hsl=(r,g,b)=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
            if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return [h,s,l]};
          const els=[...document.querySelectorAll('*')];
          for(const el of els){const cs=getComputedStyle(el);
            for(const prop of ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor','backgroundImage','boxShadow','fill','stroke']){
              const v=cs[prop]||'';let m;re.lastIndex=0;
              while((m=re.exec(v))){const p=m[1].split(',').map(x=>parseFloat(x));if(p.length>3&&p[3]===0)continue;
                const [h,s,l]=hsl(p[0],p[1],p[2]);if(h>=5&&h<=36&&s>0.45&&l>0.25&&l<0.8)bad.add(prop+':'+m[0]+' @'+(el.className||el.tagName));}}}
          return [...bad].slice(0,20)}""")
        check(len(orange) == 0, f"no orange in computed UI colours {orange}")
        await pp.set_viewport_size({"width": 1440, "height": 900})
        bi = await pp.evaluate("""()=>{const t=document.querySelector('.marquee__track:not(.marquee__track--dup)');
            const imgs=[...t.querySelectorAll('img')];return {n:imgs.length,loaded:imgs.filter(i=>i.complete&&i.naturalWidth>0).length,
            alts:imgs.filter(i=>i.alt.length>5).length,dupHidden:document.querySelector('.marquee__track--dup').getAttribute('aria-hidden'),
            anim:getComputedStyle(t).animationName,title:document.querySelector('#beltTitle').textContent}}""")
        check(bi["n"] == 10 and bi["loaded"] == 10 and bi["alts"] == 10, f"belt: 10 real laurels loaded with alt text ({bi})")
        check(bi["dupHidden"] == "true" and bi["anim"] == "marquee", "marquee running, duplicate track aria-hidden")
        await pp.hover(".marquee")
        ps = await pp.evaluate("getComputedStyle(document.querySelector('.marquee__track')).animationPlayState")
        check(ps == "paused", f"marquee pauses on hover ({ps})")
        await pp.mouse.move(5, 5)
        pl = await pp.evaluate("""()=>({inFooter:!!document.querySelector('footer .laurel-belt'),count:document.querySelectorAll('.laurel-belt').length,
            afterPilot:document.querySelector('#pilot').nextElementSibling.id,title:document.querySelector('#beltTitle').textContent.trim(),
            footerText:document.querySelector('footer').innerText})""")
        check(pl["inFooter"] and pl["count"] == 1 and pl["afterPilot"] == "unlock", f"belt only in footer; pilot is followed by #{pl['afterPilot']}")
        check(pl["title"].lower() == "festival recognition", f"belt heading: {pl['title']!r}")
        check("A MIND ATTIC PRODUCTION" not in pl["footerText"].upper(), "no duplicate 'A Mind Attic Production' line in footer")
        await pp.evaluate("document.querySelector('#pilot').scrollIntoView()"); await pp.wait_for_timeout(300)
        await pp.locator("#pilot").screenshot(path=SS + "18_desktop_pilot_player.png")
        await pp.locator(".footer").screenshot(path=SS + "22_desktop_footer_signature.png")
        await pp.set_viewport_size({"width": 390, "height": 844})
        await pp.wait_for_timeout(300)
        bh = await pp.evaluate("document.querySelector('.laurel-belt').getBoundingClientRect().height")
        check(bh < 130, f"mobile footer belt stays compact ({bh:.0f}px)")
        await pp.locator(".footer").screenshot(path=SS + "24_mobile_390_footer.png")
        await pc.close()
        # --- character cards: faces/eyes fully visible, no distortion, at every width ---
        cc = await b.new_context(viewport={"width": 1440, "height": 900})
        cp = await cc.new_page(); hook(cp, "chars")
        await cp.goto(URL, wait_until="networkidle")
        EXPECT = ("A world of predators can only survive if it is held in check. Left alone, its hunger tips the balance and everything falls apart. "
                  "The Velur Order exists to keep that balance, by force, from the shadows \u2014 and its weapons are never single. "
                  "Operatives are bonded in pairs through an implanted earpiece that keeps them connected every waking moment. "
                  "The link forges a bond deeper than loyalty, and it is the Order\u2019s leash: what makes a pair unstoppable is also the one weakness the Order can always pull.")
        got = await cp.evaluate("[...document.querySelectorAll('.story__text > p:not(.eyebrow)')].map(p=>p.textContent.trim()).join(' ')")
        check(got == EXPECT, "story copy matches the user's text verbatim")
        FACES = {"siera": {"head": (.18, .13, .83, .70), "eyes": (.33, .37, .68, .49)},
                 "anora": {"head": (.25, .00, .78, .70), "eyes": (.37, .36, .63, .48)}}
        for w in [1440, 1024, 768, 390, 360]:
            await cp.set_viewport_size({"width": w, "height": 900})
            await cp.evaluate("document.querySelector('#story .duo').scrollIntoView()"); await cp.wait_for_timeout(400)
            for name, box in FACES.items():
                r = await cp.evaluate("""(n)=>{const i=document.querySelector('.char__img--'+n);const cs=getComputedStyle(i);
                    return {w:i.clientWidth,h:i.clientHeight,nw:i.naturalWidth,nh:i.naturalHeight,src:i.currentSrc,fit:cs.objectFit,pos:cs.objectPosition}}""", name)
                ok_load = r["nw"] > 0 and r["src"].endswith((".webp", ".jpg"))
                ratio_ok = abs((r["w"] / r["h"]) / 1.6 - 1) < 0.01
                # visible source window under object-fit: cover
                sc = max(r["w"] / r["nw"], r["h"] / r["nh"]); vw, vh = r["w"] / sc / r["nw"], r["h"] / sc / r["nh"]
                px, py = [float(v.strip("%")) / 100 for v in r["pos"].split()]
                x0, y0 = (1 - vw) * px, (1 - vh) * py
                inside = all(x0 - 1e-6 <= b0 and b2 <= x0 + vw + 1e-6 and y0 - 1e-6 <= b1 and b3 <= y0 + vh + 1e-6 for (b0, b1, b2, b3) in box.values())
                check(ok_load and ratio_ok and r["fit"] == "cover" and inside,
                      f"{name} @{w}px: {r['w']}x{r['h']} cover, visible x{x0:.2f}-{x0+vw:.2f} y{y0:.2f}-{y0+vh:.2f}, face+eyes inside, {r['src'].rsplit('/',1)[-1]}")
            if w == 1440:
                await cp.add_style_tag(content=".nav{visibility:hidden}")
                await cp.locator("#story").screenshot(path=SS + "26_story_desktop.png")
                await cp.add_style_tag(content=".nav{visibility:visible}")
            if w == 390:
                await cp.evaluate("window.scrollTo(0, document.querySelector('#story').offsetTop - 60)"); await cp.wait_for_timeout(300)
                lw = await cp.evaluate("(()=>{const p=document.querySelector('.story__text > p:not(.eyebrow)');return p.getBoundingClientRect().width})()")
                await cp.add_style_tag(content=".nav{visibility:hidden}")
                box = await cp.evaluate("(()=>{const a=document.querySelector('#story .story__text').getBoundingClientRect(),b=document.querySelector('#story .duo').getBoundingClientRect();return {x:0,y:a.top+scrollY-24,width:innerWidth,height:b.bottom-a.top+48}})()")
                await cp.screenshot(path=SS + "27_story_mobile.png", clip=box, full_page=True)
                await cp.add_style_tag(content=".nav{visibility:visible}")
        await cc.close()
        # --- episodes: titles, statuses, grid, 16:9, image swap + fallback ---
        ec = await b.new_context(viewport={"width": 1440, "height": 900})
        ep = await ec.new_page(); hook(ep, "episodes")
        await ep.goto(URL, wait_until="networkidle")
        TITLES = ["Dust", "Echo Room", "The Vent", "Routine", "The Codex", "The Shadow"]
        info = await ep.evaluate("""()=>[...document.querySelectorAll('.ep')].map(c=>({t:c.querySelector('.ep__title').textContent.trim(),
            k:c.querySelector('.ep__kicker').textContent.trim(),tag:(c.querySelector('.ep__tag-lg')||c.querySelector('.ep__tag')).textContent.trim(),lock:!!c.querySelector('.ep__lock'),
            filt:getComputedStyle(c.querySelector('.ep__art')).filter}))""")
        await ep.wait_for_timeout(300)
        st = await ep.evaluate("""()=>[...document.querySelectorAll('.ep')].map(c=>{const i=c.querySelector('.ep__img');return i?{w:i.naturalWidth,h:i.naturalHeight,src:i.currentSrc.split('/').pop()}:null})""")
        check(all(x and x["w"] == 1200 and x["h"] == 675 for x in st) and [x["src"] for x in st] == [f"ep{n}.webp" for n in range(1, 7)], f"real episode stills loaded (1200x675 webp): {[x and x['src'] for x in st]}")
        lede = (await ep.text_content("#pilot .lede")).strip()
        check(lede == "It starts on a mission. Then it goes back to how two strays became the Order\u2019s sharpest weapon." and "boardroom" not in (await ep.content()).lower(), f"pilot description updated: {lede}")
        check([i["t"] for i in info] == TITLES, f"6 episode titles in order: {[i['t'] for i in info]}")
        check([i["k"] for i in info] == [f"Episode {n}" for n in range(1, 7)], "episode kickers 'Episode 1..6'")
        check(info[0]["tag"] == "Free pilot" and not info[0]["lock"] and "blur" not in info[0]["filt"], "Ep 1: Free pilot, unlocked, not blurred")
        check(info[1]["tag"] == "Unlocks at community goal" and info[1]["lock"] and "blur" in info[1]["filt"], "Ep 2: unlocks at community goal, locked look")
        check(all(i["tag"] == "Locked" and i["lock"] and "blur" in i["filt"] for i in info[2:]), "Ep 3-6: Locked, darkened + blurred, lock icon")
        body = await ep.evaluate("document.body.innerText")
        check("chapter" not in body.lower(), "no 'Chapter' wording left on the page")
        check("Episode 2" in await ep.text_content("#unlockTitle") and "Echo Room" in await ep.text_content("[data-next-episode]"), "unlock copy says Episode 2 · Echo Room")
        for w, cols in [(1440, 3), (1024, 3), (768, 2), (390, 2), (360, 2)]:
            await ep.set_viewport_size({"width": w, "height": 900}); await ep.wait_for_timeout(200)
            g = await ep.evaluate("""()=>{const g=document.querySelector('.episodes__grid');const m=document.querySelector('.ep__media').getBoundingClientRect();
                return {cols:getComputedStyle(g).gridTemplateColumns.split(' ').length,r:m.width/m.height,sw:document.documentElement.scrollWidth}}""")
            check(g["cols"] == cols and abs(g["r"] / (16 / 9) - 1) < 0.01 and g["sw"] <= w, f"episodes @{w}px: {g['cols']} cols, media {g['r']:.3f} (16:9), no overflow")
            if w in (1440, 390):
                await ep.evaluate("Promise.all([...document.querySelectorAll('.ep__img')].map(i=>i.decode().catch(()=>0)))")
                await ep.locator("#episodes").scroll_into_view_if_needed(); await ep.wait_for_timeout(900)
            if w == 1440:
                await ep.add_style_tag(content=".nav{visibility:hidden}")
                bx = await ep.evaluate("(()=>{const r=document.querySelector('#episodes').getBoundingClientRect();return {x:Math.max(0,r.left-40),y:r.top+scrollY-40,width:r.width+80,height:r.height+80}})()")
                await ep.screenshot(path=SS + "28_episodes_desktop.png", clip=bx, full_page=True)
            if w == 390:
                bx = await ep.evaluate("(()=>{const r=document.querySelector('#episodes').getBoundingClientRect();return {x:0,y:r.top+scrollY-24,width:innerWidth,height:r.height+48}})()")
                await ep.screenshot(path=SS + "29_episodes_mobile.png", clip=bx, full_page=True)
        await ec.close()
        # image swap: patch config to point ep1/ep2 at a served test still; ep3 at a missing file (fallback)
        import base64
        jpg = base64.b64decode("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=")
        sc = await b.new_context(viewport={"width": 1440, "height": 900})
        sp = await sc.new_page()
        sp_err = []
        sp.on("pageerror", lambda e: sp_err.append(str(e)))
        async def patch_cfg(route):
            r = await route.fetch(); t = await r.text()
            t = t.replace('image: "assets/img/episodes/ep3"', 'image: "assets/img/episodes/missing"')
            await route.fulfill(response=r, body=t)
        await sp.route("**/assets/js/config.js", patch_cfg)
        await sp.route("**/assets/img/episodes/ep2.webp", lambda r: r.fulfill(status=404, body=""))
        await sp.goto(URL, wait_until="networkidle"); await sp.wait_for_timeout(400)
        sw = await sp.evaluate("[1,2,3].map(n=>document.querySelector('.ep[data-ep=\"'+n+'\"] .ep__art').classList.contains('has-img'))")
        check(sw == [True, True, False] and not sp_err, f"image swap works (ep1 jpg, ep2 webp->jpg fallback) and missing file keeps placeholder: {sw}")
        await sc.close()
        # reduced motion: static wrapped grid, duplicate hidden
        rc = await b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        rp = await rc.new_page(); hook(rp, "reduced")
        await rp.goto(URL, wait_until="networkidle")
        rm = await rp.evaluate("""()=>{const t=document.querySelector('.marquee__track');return {anim:getComputedStyle(t).animationName,
             wrap:getComputedStyle(t).flexWrap,dup:getComputedStyle(document.querySelector('.marquee__track--dup')).display}}""")
        check(rm["anim"] == "none" and rm["wrap"] == "wrap" and rm["dup"] == "none", f"reduced motion: static wrapped laurels ({rm})")
        await rp.locator(".footer").screenshot(path=SS + "25_desktop_footer_reduced_motion_all_laurels.png")
        await rc.close()
        await b.close()
    print("\nCONSOLE/PAGE ERRORS:", errors or "none")
    print("FAILED REQUESTS:", fails or "none")
    print("FAILED CHECKS:", check.failed)
asyncio.run(main())
