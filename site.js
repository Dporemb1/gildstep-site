// gildstep.com: the main button (from /config.js), the waitlist, the invite
// page, optional analytics, and the home page's motion. No inline script
// anywhere: the Content Security Policy forbids it.
//
// On the home page this loads in <head>: the "js" class goes on <html>
// before anything is drawn, and only then do the styles hold an animation
// at its starting state. If this file never arrives, the page shows every
// section finished and still.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- The main button: /config.js decides ----
  // APP_STORE_URL wins, then BETA_URL, else the waitlist form. A value that
  // isn't the right kind of link is ignored, so a bad paste can't turn every
  // button on the site into a broken one.
  var cfg = window.GILDSTEP || {};
  function link(key, pattern) {
    var value = typeof cfg[key] === "string" ? cfg[key].trim() : "";
    if (value && !pattern.test(value) && window.console) console.warn("config.js: " + key + " doesn't look right and was ignored: " + value);
    return pattern.test(value) ? value : "";
  }
  var STORE = link("APP_STORE_URL", /^https:\/\/apps\.apple\.com\/\S+$/);
  var BETA = link("BETA_URL", /^https:\/\/testflight\.apple\.com\/\S+$/);
  var mode = STORE ? "store" : BETA ? "beta" : "waitlist";
  if (mode !== "waitlist") root.classList.add("cta-" + mode);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  function $(sel, el) {
    return (el || document).querySelector(sel);
  }
  function $$(sel, el) {
    return Array.prototype.slice.call((el || document).querySelectorAll(sel));
  }

  ready(function () {
    var d = document.body.dataset;

    $$("[data-link]").forEach(function (a) {
      var href = a.getAttribute("data-link") === "store" ? STORE : BETA;
      if (href) a.href = href;
    });
    // Footer: Instagram and TikTok appear once they have a URL.
    $$("[data-social]").forEach(function (a) {
      var href = link(a.getAttribute("data-social"), /^https:\/\/\S+$/);
      if (!href) return;
      a.href = href;
      a.hidden = false;
    });

    // Analytics, only if a PostHog key is set: no cookies or local storage
    // (memory only), no autocapture, no session recording, no person
    // profiles, and never an email or a username.
    var ph = null;
    if (d.posthogKey && d.posthogSrc) {
      var s = document.createElement("script");
      s.src = d.posthogSrc;
      s.async = true;
      s.onload = function () {
        if (!window.posthog) return;
        window.posthog.init(d.posthogKey, {
          api_host: d.posthogHost,
          persistence: "memory",
          autocapture: false,
          capture_pageleave: false,
          disable_session_recording: true,
          // Never identified, so no person profiles are made.
          person_profiles: "identified_only",
          property_denylist: ["$current_url", "$referrer", "$initial_referrer"],
        });
        ph = window.posthog;
        ph.capture("site_viewed", { page: d.page });
      };
      document.head.appendChild(s);
    }
    function track(name, props) {
      if (ph) ph.capture(name, props || {});
    }
    $$("[data-track]").forEach(function (el) {
      el.addEventListener("click", function () {
        track("site_cta", { kind: el.getAttribute("data-track") });
      });
    });

    // Email links, on every page. The link is a plain mailto: and the click
    // goes through, so a mail app opens if there is one. The address is
    // also copied and "Email copied" shown, so the click does something
    // you can see on a computer with no mail app set up. The message sits
    // in a live region, so a screen reader says it too.
    var copied = document.createElement("p");
    copied.className = "copied";
    copied.setAttribute("role", "status");
    copied.setAttribute("aria-live", "polite");
    document.body.appendChild(copied);
    var copiedTimer = null;
    function sayCopied() {
      clearTimeout(copiedTimer);
      // Emptied first, so the same words are announced again on a second click.
      copied.textContent = "";
      setTimeout(function () {
        copied.textContent = "Email copied";
        copied.classList.add("on");
      }, 30);
      copiedTimer = setTimeout(function () {
        copied.classList.remove("on");
      }, 2800);
    }
    // For browsers without the Clipboard API (or when it refuses): a
    // hidden field, selected and copied the old way.
    function copyOldWay(text) {
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.className = "sr";
      var focused = document.activeElement;
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(field);
      // Selecting the field took the focus: back to the link.
      if (focused && focused.focus) focused.focus();
      return ok;
    }
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
      if (!a) return;
      var address = a.getAttribute("href").slice(7).split("?")[0];
      try {
        address = decodeURIComponent(address);
      } catch (err) {}
      if (!address) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(sayCopied, function () {
          if (copyOldWay(address)) sayCopied();
        });
      } else if (copyOldWay(address)) {
        sayCopied();
      }
    });

    // The invite page: /u/<username> (GitHub Pages serves it from 404.html).
    var m = location.pathname.match(/^\/u\/([A-Za-z0-9_]{3,20})\/?$/);
    var invite = document.getElementById("invite");
    var missing = document.getElementById("missing");
    if (invite && missing) {
      if (m) {
        var name = m[1].toLowerCase();
        $$("[data-username]").forEach(function (el) {
          el.textContent = "@" + name;
        });
        var open = document.getElementById("open-app");
        if (open) open.href = d.scheme + "://u/" + name;
        invite.hidden = false;
        document.title = "@" + name + " invited you to " + d.app;
      } else {
        missing.hidden = false;
      }
    }

    // The waitlist: one call to the database function, nothing else. The
    // home page has the form twice; joining through one settles both.
    var copy = {
      ok: "You're on the list. We'll email you when " + d.app + " is ready.",
      invalid: "That email doesn't look right. Check it and try again.",
      slow_down: "That's a lot of tries. Give it a little while and try again.",
      error: "Couldn't add you right now. Email " + d.support + " and we'll add you.",
    };
    var forms = $$("form.waitlist");
    forms.forEach(function (form) {
      var msg = form.parentNode.querySelector(".msg");
      var button = form.querySelector("button");
      function say(kind, on) {
        var target = on || msg;
        target.textContent = copy[kind] || copy.error;
        target.className = "msg " + (kind === "ok" ? "ok" : "err");
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = form.email.value.trim();
        // A filled hidden field means a bot: answer as if it worked.
        if (form.company.value) return say("ok");
        if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return say("invalid");
        button.disabled = true;
        fetch(d.supabaseUrl + "/rest/v1/rpc/join_waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: d.supabaseKey, Authorization: "Bearer " + d.supabaseKey },
          body: JSON.stringify({ p_email: email, p_source: m ? "invite" : "site" }),
        })
          .then(function (r) {
            return r.ok ? r.json() : { status: "error" };
          })
          .then(function (res) {
            var status = res && res.status === "closed" ? "error" : res && res.status;
            if (status !== "ok") return say(status);
            forms.forEach(function (f) {
              f.reset();
              f.hidden = true;
              var note = f.parentNode.querySelector(".note");
              if (note) note.hidden = true;
              say("ok", f.parentNode.querySelector(".msg"));
            });
            track("site_waitlist_joined", { from: m ? "invite" : "home" });
          })
          .catch(function () {
            say("error");
          })
          .then(function () {
            button.disabled = false;
          });
      });
    });

    if (d.page === "home") {
      try {
        home();
      } catch (err) {
        // Anything unexpected: show the page finished and still.
        root.classList.remove("js", "pin", "pin-tight", "climbing");
        if (window.console) console.error(err);
      }
    }
  });

  // ------------------------------------------------------------ Home --
  function home() {
    var hasIO = "IntersectionObserver" in window;
    var SVG = "http://www.w3.org/2000/svg";
    function svg(name, attrs, parent) {
      var node = document.createElementNS(SVG, name);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(node);
      return node;
    }
    function cents(el) {
      var m = el && el.textContent.match(/(\d+)(?:\.(\d{1,2}))?/);
      return m ? Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2)) : 0;
    }

    // Founders pricing. The "Save" badges are worked out from the two
    // prices shown beside them (rounded down, in cents, like the app's own
    // saving), so changing a price in the page changes its badge. The offer
    // closes when the app's does: 11:59 PM Arizona time (UTC-7 all year) on
    // its last day. After that the standard prices show alone.
    $$("[data-deal]").forEach(function (row) {
      var now = cents($("[data-now]", row));
      var was = cents($("[data-was]", row));
      var badge = $("[data-save]", row);
      var pct = was > 0 ? Math.floor(((was - now) * 100) / was + 1e-9) : 0;
      if (badge && pct > 0) badge.textContent = "Save " + pct + "%";
    });
    $$("[data-deal-ends]").forEach(function (el) {
      var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(el.getAttribute("data-deal-ends") || "");
      if (d && Date.now() >= Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + 1, 7)) root.classList.add("deal-over");
    });

    // ================= How it works: the breakdown =================
    // Pinned, the section is four screens tall and the stage stays put: one
    // big goal splits into months, a month into weeks, a week into one card,
    // and then that card is done. PHASES are where each moment starts, as a
    // share of the scroll. Without motion (or on a very short screen) nothing
    // pins and the whole tree is laid out at once.
    var how = $("#how");
    var pinEl = $(".how-pin", how);
    var stage = $("#stage");
    var tree = $("#tree");
    var links = $(".links", tree);
    var ot = $("#ot");
    var lineList = $(".b1 .lines", how);
    var lineEls = $$("li", lineList);
    var PHASES = [0.16, 0.4, 0.64, 0.84];
    var pinOn = false;
    var phase = -1;
    var pinStart = 0;
    var pinRun = 0;
    var checkTimer = null;
    var tightFor = "";
    var pinWanted = false;

    // Where something sits on the page, from the layout itself (so a reveal
    // that's still sliding, or a pinned screen, doesn't move the answer).
    function pageTop(el, until) {
      var y = 0;
      while (el && el !== until) {
        y += el.offsetTop;
        el = el.offsetParent;
      }
      return y;
    }
    function px(name) {
      return parseFloat(getComputedStyle(stage).getPropertyValue(name)) || 0;
    }

    // The gold lines: from the bottom of each card to the top of each card
    // it split into, with square corners eased round. The one that leads to
    // today is the bright one. Drawn from where the cards are laid out, so
    // they fit any width.
    function drawLinks() {
      var gap = px("--c");
      var rows = [$(".lv-goal", tree), $(".lv-months", tree), $(".lv-weeks", tree), $(".lv-today", tree)];
      function mid(row, el) {
        return row.offsetLeft + el.offsetLeft + el.offsetWidth / 2;
      }
      function path(x0, y0, x1, y1) {
        var half = (y0 + y1) / 2;
        var r = Math.min(8, Math.abs(x1 - x0) / 2, (y1 - y0) / 2);
        var dir = x1 > x0 ? 1 : -1;
        if (Math.abs(x1 - x0) < 1) return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "V" + y1.toFixed(1);
        return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "V" + (half - r).toFixed(1) + "Q" + x0.toFixed(1) + " " + half.toFixed(1) + " " + (x0 + dir * r).toFixed(1) + " " + half.toFixed(1) + "H" + (x1 - dir * r).toFixed(1) + "Q" + x1.toFixed(1) + " " + half.toFixed(1) + " " + x1.toFixed(1) + " " + (half + r).toFixed(1) + "V" + y1.toFixed(1);
      }
      links.textContent = "";
      var from = [$(".gcard", tree), $(".mo.now", tree), $(".wk.now", tree)];
      var to = [$$(".mo", tree), $$(".wk", tree), [ot]];
      for (var n = 0; n < 3; n++) {
        var g = svg("g", { class: "c" + (n + 1) }, links);
        var y1 = rows[n + 1].offsetTop;
        var y0 = y1 - gap;
        var x0 = mid(rows[n], from[n]);
        var hot = null;
        for (var j = 0; j < to[n].length; j++) {
          var el = to[n][j];
          // Today's card is as wide as the tree: the line comes straight down.
          var x1 = n === 2 ? x0 : mid(rows[n + 1], el);
          var p = svg("path", { d: path(x0, y0, x1, y1), pathLength: 1 }, g);
          if (n === 2 || el.classList.contains("now")) {
            p.setAttribute("class", "hot");
            hot = { p: p, x: x1 };
          }
        }
        if (hot) {
          g.appendChild(hot.p); // on top of the fainter ones
          svg("circle", { cx: x0.toFixed(1), cy: y0.toFixed(1), r: 2.5 }, g);
          svg("circle", { cx: hot.x.toFixed(1), cy: y1.toFixed(1), r: 2.5 }, g);
        }
      }
    }

    // The gold marker beside the lines sits on the one that's happening.
    function moveMarker() {
      var li = lineEls[Math.max(0, Math.min(3, phase))];
      if (!li) return;
      lineList.style.setProperty("--my", li.offsetTop + "px");
      lineList.style.setProperty("--mh", li.offsetHeight + "px");
    }

    function setDone(done, celebrate) {
      clearTimeout(checkTimer);
      ot.classList.remove("charging", "pop");
      if (done && celebrate) {
        // The app's check: the ring charges, then it fills and bursts.
        ot.classList.add("charging");
        checkTimer = setTimeout(function () {
          ot.classList.remove("charging");
          ot.classList.add("done");
          void ot.offsetWidth;
          ot.classList.add("pop");
        }, 380);
      } else {
        ot.classList.toggle("done", done);
      }
      // This week's count takes today's run with it.
      tree.classList.toggle("checked", done);
    }
    function setPhase(n) {
      if (n === phase) return;
      var was = phase;
      phase = n;
      for (var i = 0; i <= 4; i++) {
        how.classList.toggle("ph" + i, i === n);
        if (i) how.classList.toggle("ge" + i, n >= i);
      }
      moveMarker();
      if (n >= 4 && was < 4) setDone(true, was >= 0);
      else if (n < 4 && was >= 4) setDone(false, false);
    }
    // Pinning needs room for the words and the tree in one screen: a very
    // short screen (a small phone with its toolbars up, a squat window)
    // gets the whole tree laid out instead.
    function canPin() {
      return !reduced && hasIO && window.innerHeight >= (window.innerWidth < 960 ? 600 : 560) && window.CSS && CSS.supports && CSS.supports("position", "sticky");
    }
    function measurePin() {
      // On a phone (or a short tablet) the heading and the note ride in
      // above the pinned screen. Both choices are made once per width
      // there, so a phone's toolbars sliding away never flip the layout
      // mid-scroll.
      var narrow = window.innerWidth < 960;
      var key = String(window.innerWidth);
      if (key !== tightFor) {
        tightFor = key;
        pinWanted = canPin();
        root.classList.toggle("pin-tight", window.innerWidth < 720 || (narrow && window.innerHeight < 720));
      } else if (!narrow) {
        pinWanted = canPin();
      }
      pinOn = pinWanted;
      root.classList.toggle("pin", pinOn);
      // "+20 XP" rises from the circle toward the "Set 6:40 AM" above it:
      // only as far as the room between them (styles.css, xp-float).
      var setAt = $(".ot-set", ot);
      var room = pageTop($(".ot-circle", ot), ot) - pageTop(setAt, ot) - setAt.offsetHeight;
      ot.style.setProperty("--xr", Math.max(4, Math.min(32, room - 12)) + "px");
      stage.style.removeProperty("--oth");
      stage.style.removeProperty("--k");
      ["--mf", "--mp", "--wf", "--wp"].forEach(function (name) {
        stage.style.removeProperty(name);
      });
      if (!pinOn) {
        // Laid out whole, with the card done.
        phase = -1;
        for (var i = 0; i <= 4; i++) how.classList.remove("ph" + i, "ge" + i);
        how.style.removeProperty("--hh");
        setDone(true, false);
        drawLinks();
        return;
      }
      var head = $(".how-head", how);
      how.style.setProperty("--hh", (root.classList.contains("pin-tight") ? head.offsetHeight + 8 : 0) + "px");
      // The tiles' heights, the One Thing card's real height, then the
      // tree's, then how much of the screen there is for it.
      fitRows();
      stage.style.setProperty("--oth", ot.offsetHeight + "px");
      var full = tree.offsetHeight;
      var stacked = window.innerWidth < 960;
      var room = stacked ? pinEl.clientHeight - pageTop(stage, pinEl) - 14 : pinEl.clientHeight - 2 * 92;
      stage.style.setProperty("--k", Math.max(0.62, Math.min(1, room / full)).toFixed(4));
      // Scaled down, the tree is laid out wider, so the tiles and the card
      // may be shorter.
      fitRows();
      stage.style.setProperty("--oth", ot.offsetHeight + "px");
      var pad = parseFloat(getComputedStyle(how).paddingTop) || 0;
      pinStart = pageTop(how) + pad;
      pinRun = Math.max(1, how.offsetHeight - pad - pinEl.offsetHeight);
      drawLinks();
      moveMarker();
    }
    // While pinned, a row of tiles has two heights: in focus, and on the
    // path once it has split. Both come from the row's tallest tile, so the
    // tiles in a row stay the same height and each is tall enough for its
    // label, its words and its bar, whatever the width or the font does to
    // the line breaks. The heights in styles.css are the least they can be.
    function fitRow(tiles, focusVar, pathVar, pathShowsWords) {
      stage.style.removeProperty(focusVar);
      stage.style.removeProperty(pathVar);
      var set = getComputedStyle(stage);
      var focus = parseFloat(set.getPropertyValue(focusVar)) || 0;
      var onPath = parseFloat(set.getPropertyValue(pathVar)) || 0;
      tiles.forEach(function (tile) {
        var t = getComputedStyle(tile);
        var gap = parseFloat(t.rowGap) || 0;
        var top = parseFloat(t.paddingTop) + parseFloat(t.borderTopWidth);
        var words = $("small", tile).offsetHeight + gap + $("b", tile).offsetHeight;
        var foot = parseFloat(t.paddingBottom) + parseFloat(t.borderBottomWidth);
        // In focus there is a bar under the words (a week that hasn't
        // started has none).
        var bar = $(".t-split, .t-prog", tile);
        var barRoom = bar ? gap + (parseFloat(getComputedStyle(bar).marginTop) || 0) + bar.offsetHeight : 0;
        focus = Math.max(focus, Math.ceil(top + words + barRoom + foot));
        // On the path a tile keeps its words, or (on a phone) its label
        // alone: a month's whole label, a week's first line.
        var label = tile.classList.contains("wk") ? $("small", tile).firstElementChild : $("small", tile);
        onPath = Math.max(onPath, Math.ceil(pathShowsWords ? top + words + foot : top + label.offsetHeight + 6));
      });
      stage.style.setProperty(focusVar, focus + "px");
      stage.style.setProperty(pathVar, onPath + "px");
    }
    function fitRows() {
      // From 720px a tile on the path keeps its words (styles.css); under
      // that it shows its label alone.
      var words = window.matchMedia("(min-width: 720px)").matches;
      fitRow($$(".mo", tree), "--mf", "--mp", words);
      fitRow($$(".wk", tree), "--wf", "--wp", words);
    }
    function phaseAt(y) {
      var p = (y - pinStart) / pinRun;
      var n = 0;
      PHASES.forEach(function (start) {
        if (p >= start) n++;
      });
      return n;
    }

    // ================= The finish: press and hold for 1.5 s =================
    var finish = $("#finish");
    var hold = $("#hold");
    var HOLD_MS = 1500;
    var holdTimer = null;
    var built = false;
    var touchedFinish = false;
    var keyHeld = false;

    // The rays and the laurel, with the app's own geometry
    // (components/celebration/Rays, lib/celebrationGeometry). The page
    // scales them with the medal.
    function build() {
      if (built) return;
      built = true;
      var rays = $(".rays-g", finish);
      for (var i = 0; i < 28; i++) {
        var long = i % 2 === 0;
        svg("line", { x1: 0, y1: -72, x2: 0, y2: long ? -176 : -136.5, stroke: long ? "url(#ray-l)" : "url(#ray-s)", "stroke-width": long ? 1.5 : 1, "stroke-linecap": "round", transform: "rotate(" + ((i * 360) / 28).toFixed(2) + ")" }, rays);
      }
      var wreath = $(".wreath-g", finish);
      var R = 96; // the medal's radius + 34
      function at(deg) {
        return { x: R * Math.cos((deg * Math.PI) / 180), y: -R * Math.sin((deg * Math.PI) / 180) };
      }
      function leaf(p, angle, length) {
        var w = length * 0.3;
        svg("path", { class: "leaf", d: "M0,0 Q" + length / 2 + "," + -w + " " + length + ",0 Q" + length / 2 + "," + w + " 0,0 Z", transform: "translate(" + p.x.toFixed(2) + " " + p.y.toFixed(2) + ") rotate(" + angle.toFixed(2) + ")" }, wreath);
      }
      function branch(from, to) {
        var ccw = to > from;
        var a = at(from);
        var b = at(to);
        svg("path", { class: "stem", pathLength: 1, d: "M" + a.x.toFixed(2) + "," + a.y.toFixed(2) + " A" + R + "," + R + " 0 0 " + (ccw ? 0 : 1) + " " + b.x.toFixed(2) + "," + b.y.toFixed(2) }, wreath);
        for (var i = 0; i < 10; i++) {
          var deg = from + (to - from) * ((i + 0.5) / 10);
          var raw = -(ccw ? deg + 90 : deg - 90);
          var along = raw - 360 * Math.ceil(raw / 360);
          var length = 22 * (1 - 0.4 * (i / 9));
          var outward = ccw ? 38 : -38;
          var out = ccw ? Math.min(along + outward, -6) : Math.max(along + outward, -174);
          leaf(at(deg), out, length);
          leaf(at(deg), along - outward, length * 0.82);
        }
      }
      branch(300, 390);
      branch(240, 150);
    }

    // The burst: pieces fly out from behind the medal in every direction
    // (further upward than down), slow, then fall and fade. Gone in about
    // two seconds. The same burst every time (no random numbers).
    function confetti() {
      var box = $(".fin-confetti", finish);
      box.textContent = "";
      if (reduced) return;
      var medal = $(".medal-stage", finish);
      var cx = medal.offsetLeft + medal.offsetWidth / 2;
      var cy = medal.offsetTop + medal.offsetHeight / 2;
      var reach = Math.min(box.clientWidth * 0.62, 400);
      var colors = ["#F2C65A", "#F7DC8A", "#E0863A", "#F4EFE6", "#C8973A", "#F2C65A"];
      var seed = 7;
      function rnd() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }
      var COUNT = 96;
      for (var i = 0; i < COUNT; i++) {
        var a = (i / COUNT) * Math.PI * 2 + rnd() * 0.3;
        var up = Math.sin(a) < 0 ? 1 : 0.62;
        var far = reach * (0.34 + rnd() * 0.66) * up;
        var x1 = cx + Math.cos(a) * far * 1.12;
        var y1 = cy + Math.sin(a) * far * 0.9 - 30;
        var piece = document.createElement("i");
        piece.className = i % 5 === 0 ? "dot" : i % 3 === 0 ? "tall" : "";
        piece.style.backgroundColor = colors[i % colors.length];
        piece.style.setProperty("--x0", cx.toFixed(0) + "px");
        piece.style.setProperty("--y0", cy.toFixed(0) + "px");
        piece.style.setProperty("--x1", x1.toFixed(0) + "px");
        piece.style.setProperty("--y1", y1.toFixed(0) + "px");
        piece.style.setProperty("--x2", (x1 + (rnd() - 0.5) * 70).toFixed(0) + "px");
        piece.style.setProperty("--y2", (y1 + 170 + rnd() * 260).toFixed(0) + "px");
        piece.style.setProperty("--r1", ((rnd() - 0.5) * 540).toFixed(0) + "deg");
        piece.style.setProperty("--r2", ((rnd() - 0.5) * 1300).toFixed(0) + "deg");
        piece.style.setProperty("--dl", Math.round(rnd() * 140) + "ms");
        piece.style.setProperty("--dur", Math.round(1500 + rnd() * 700) + "ms");
        box.appendChild(piece);
      }
    }

    function finished() {
      clearTimeout(holdTimer);
      holdTimer = null;
      hold.classList.remove("holding");
      build();
      finish.classList.add("done");
      confetti();
      climbed();
    }
    function startHold() {
      if (holdTimer || finish.classList.contains("done")) return;
      hold.classList.add("holding");
      holdTimer = setTimeout(finished, HOLD_MS);
    }
    // Let go early and it's cancelled: the ring runs back.
    function cancelHold() {
      if (!holdTimer) return;
      clearTimeout(holdTimer);
      holdTimer = null;
      hold.classList.remove("holding");
    }
    hold.addEventListener("pointerdown", function (e) {
      touchedFinish = true;
      // Keep the press if the finger drifts off the ring. Never let a
      // browser that refuses the capture stop the hold itself.
      try {
        hold.setPointerCapture(e.pointerId);
      } catch (err) {}
      startHold();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      hold.addEventListener(type, cancelHold);
    });
    hold.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    hold.addEventListener("keydown", function (e) {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat) return;
      touchedFinish = true;
      keyHeld = true;
      startHold();
    });
    hold.addEventListener("keyup", function (e) {
      if (e.key !== " " && e.key !== "Enter") return;
      keyHeld = false;
      cancelHold();
    });
    hold.addEventListener("blur", cancelHold);
    // A screen reader's activation has no press to hold: it finishes at once
    // (the app swaps the ring for a "Yes, I finished" button with VoiceOver).
    hold.addEventListener("click", function (e) {
      if (e.detail === 0 && !keyHeld && !holdTimer) {
        touchedFinish = true;
        finished();
      }
    });
    $("#again").addEventListener("click", function () {
      touchedFinish = true;
      finish.classList.remove("done");
      $(".fin-confetti", finish).textContent = "";
      hold.focus({ preventScroll: true });
      climbed();
    });
    // Seen for the first time, it shows itself once: the ring fills, the
    // goal is finished. After that it's the visitor's to hold.
    function demo() {
      if (touchedFinish || finish.classList.contains("done")) return;
      setTimeout(function () {
        if (!touchedFinish) startHold();
      }, 900);
    }

    // ================= The staircase =================
    // Four steps, like the mark: the ground you start on, then Plan, One
    // Thing and Finish. Each turns gold when you reach it and stays gold;
    // the last one turns when the goal is finished. It lives in the mark in
    // the corner and the one beside each step's label.
    var climb = $("#climb");
    var stepEls = [1, 2, 3].map(function (k) {
      return $('.step[data-step="' + k + '"]', climb);
    });
    var navMark = $(".nav .mark");
    var reached = [false, false];

    function light(mark, n) {
      for (var i = 1; i <= 4; i++) $(".s" + i, mark).classList.toggle("lit", i <= n);
    }
    function climbed() {
      var done = finish.classList.contains("done");
      var n = 1 + (reached[0] ? 1 : 0) + (reached[1] ? 1 : 0);
      light(navMark, done && n === 3 ? 4 : n);
      light($(".mark", stepEls[0]), reached[0] ? 2 : 1);
      light($(".mark", stepEls[1]), reached[1] ? 3 : 2);
      light($(".mark", stepEls[2]), done ? 4 : 3);
    }

    // ================= Scroll =================
    var hero = $(".hero");
    var depth = $$("[data-depth]");
    var queued = false;
    function onScroll() {
      queued = false;
      var y = window.scrollY || 0;
      var vh = window.innerHeight;
      // The hero's three phones drift apart a little (depth). Under 768px
      // only the middle one is shown, whole and still: nothing to move.
      if (!reduced && window.innerWidth >= 768 && y < hero.offsetHeight) {
        depth.forEach(function (node) {
          node.style.setProperty("--py", (y * parseFloat(node.getAttribute("data-depth"))).toFixed(1) + "px");
        });
      }
      // Which steps have been reached.
      if (pinOn) {
        setPhase(phaseAt(y));
        if (y >= pinStart - vh * 0.35) reached[0] = true;
        if (phase >= 4) reached[1] = true;
      } else {
        if (stepEls[0].getBoundingClientRect().top < vh * 0.62) reached[0] = true;
        if (stepEls[1].getBoundingClientRect().top < vh * 0.62) reached[1] = true;
      }
      climbed();
    }
    function relayout() {
      measurePin();
      onScroll();
    }

    // ================= Seen, live, and where you are =================
    function reveal(el) {
      if (el.classList.contains("in")) return;
      el.classList.add("in");
      if (el.id === "feed-card") {
        var cheers = $(".cheers", el);
        if (reduced) cheers.setAttribute("data-n", "3");
        else
          [700, 1500, 2300].forEach(function (ms, i) {
            setTimeout(function () {
              cheers.setAttribute("data-n", String(i + 1));
            }, ms);
          });
      }
    }
    $(".cheers").setAttribute("data-n", "0");
    var reveals = $$("[data-reveal]");
    var lives = $$("[data-live]");

    if (reduced || !hasIO) {
      // Everything finished, nothing moving: the breakdown laid out whole,
      // the card done, the goal finished, every step gold.
      reveals.forEach(reveal);
      $(".cheers").setAttribute("data-n", "3");
      reached = [true, true];
      relayout();
      finished();
      window.addEventListener("resize", relayout);
      window.addEventListener("load", relayout);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    } else {
      root.classList.add("climbing");
      relayout();
      var seen = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            seen.unobserve(entry.target);
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -6% 0px" },
      );
      reveals.forEach(function (node) {
        seen.observe(node);
      });
      // Loops only run while their stage is on screen.
      var live = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          entry.target.classList.toggle("live", entry.isIntersecting);
        });
      });
      lives.forEach(function (node) {
        live.observe(node);
      });
      var finishSeen = new IntersectionObserver(
        function (entries) {
          if (!entries[0].isIntersecting) return;
          finishSeen.disconnect();
          demo();
        },
        { threshold: 0.6 },
      );
      finishSeen.observe($(".fin-sheet", finish));

      window.addEventListener(
        "scroll",
        function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(onScroll);
        },
        { passive: true },
      );
      var resizing = null;
      window.addEventListener("resize", function () {
        clearTimeout(resizing);
        resizing = setTimeout(relayout, 120);
      });
      window.addEventListener("load", relayout);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    }

    // The capsule marks the section you're in.
    var navLinks = $$(".nav-links a");
    if (hasIO) {
      var current = {};
      var spy = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            current[entry.target.id] = entry.isIntersecting;
          });
          var id = "";
          $$("[data-spy]").forEach(function (sec) {
            if (current[sec.id]) id = sec.id;
          });
          navLinks.forEach(function (a) {
            a.classList.toggle("on", a.getAttribute("href") === "#" + id);
          });
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      $$("[data-spy]").forEach(function (sec) {
        spy.observe(sec);
      });
    }

    // Questions: native <details>, so they open from the keyboard and read
    // right to a screen reader without any of this. With motion allowed,
    // the answer's height eases open and shut instead of jumping.
    if (!reduced && Element.prototype.animate) {
      $$(".qa details").forEach(function (item) {
        var summary = $("summary", item);
        var answer = $(".a", item);
        var running = null;
        function run(from, to, done) {
          if (running) running.cancel();
          answer.classList.add("moving");
          var anim = answer.animate(
            [
              { height: from + "px", opacity: from ? 1 : 0 },
              { height: to + "px", opacity: to ? 1 : 0 },
            ],
            { duration: 360, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
          );
          running = anim;
          anim.onfinish = function () {
            if (running !== anim) return;
            running = null;
            answer.classList.remove("moving");
            if (done) done();
          };
        }
        summary.addEventListener("click", function (e) {
          e.preventDefault();
          if (item.open && !item.classList.contains("closing")) {
            item.classList.add("closing");
            run(answer.offsetHeight, 0, function () {
              item.open = false;
              item.classList.remove("closing");
            });
          } else {
            var from = item.open ? answer.offsetHeight : 0;
            item.classList.remove("closing");
            item.open = true;
            run(from, answer.scrollHeight, null);
          }
        });
      });
    }

    // The focus session's clock keeps counting while it's on screen.
    var tick = $(".tick");
    var left = 21 * 60 + 47;
    if (tick && !reduced) {
      setInterval(function () {
        if (!tick.closest(".live")) return;
        left = left > 0 ? left - 1 : 25 * 60;
        tick.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      }, 1000);
    }
  }
})();
