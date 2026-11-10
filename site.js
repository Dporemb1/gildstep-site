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
        root.classList.remove("js", "pin", "climbing");
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

    // Founders pricing shows through its last day (the visitor's own date).
    $$("[data-deal-ends]").forEach(function (el) {
      var now = new Date();
      var key = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      if (key > el.getAttribute("data-deal-ends")) root.classList.add("deal-over");
    });

    // The check-in calendar on the hero's Progress screen: 12 weeks, steadier
    // as they go (three runs a week, the odd one that got away).
    var WEEKS = ["0000000", "0100100", "0101000", "0101010", "0100010", "0101010", "0101011", "0101010", "0001010", "0101010", "0101011", "0101000"];
    $$("[data-heat]").forEach(function (el) {
      WEEKS.forEach(function (week, w) {
        week.split("").forEach(function (on, day) {
          var cell = document.createElement("i");
          // The last week stops at today.
          if (on === "1" && !(w === WEEKS.length - 1 && day > 3)) cell.className = "on";
          el.appendChild(cell);
        });
      });
    });

    // ================= How it works: the breakdown =================
    // Pinned, the section is four screens tall and the stage stays put: one
    // big goal splits into months, a month into weeks, a week into one card,
    // and then that card is done. PHASES are where each moment starts, as a
    // share of the scroll. Without motion (or on a very short screen) nothing
    // pins and the whole breakdown is laid out at once.
    var how = $("#how");
    var pinEl = $(".how-pin", how);
    var ot = $("#ot");
    var PHASES = [0.16, 0.4, 0.64, 0.84];
    var pinOn = false;
    var phase = -1;
    var pinStart = 0;
    var pinRun = 0;
    var checkTimer = null;
    var tightFor = -1;

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
    }
    function setPhase(n) {
      if (n === phase) return;
      var was = phase;
      phase = n;
      for (var i = 0; i <= 4; i++) {
        how.classList.toggle("ph" + i, i === n);
        if (i) how.classList.toggle("ge" + i, n >= i);
      }
      if (n >= 4 && was < 4) setDone(true, was >= 0);
      else if (n < 4 && was >= 4) setDone(false, false);
    }
    function canPin() {
      return !reduced && hasIO && window.innerHeight >= 540 && window.CSS && CSS.supports && CSS.supports("position", "sticky");
    }
    function measurePin() {
      pinOn = canPin();
      root.classList.toggle("pin", pinOn);
      // A short phone keeps the heading out of the pinned screen. Decided
      // per width, so a browser's toolbars sliding away don't flip it.
      if (window.innerWidth !== tightFor) {
        tightFor = window.innerWidth;
        root.classList.toggle("pin-tight", window.innerWidth < 960 && window.innerHeight < 640);
      }
      if (!pinOn) {
        // Laid out whole, with the card done.
        phase = -1;
        for (var i = 0; i <= 4; i++) how.classList.remove("ph" + i, "ge" + i);
        setDone(true, false);
        return;
      }
      var pad = parseFloat(getComputedStyle(how).paddingTop) || 0;
      pinStart = pageTop(how) + pad;
      pinRun = Math.max(1, how.offsetHeight - pad - pinEl.offsetHeight);
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
    // (components/celebration/Rays, lib/celebrationGeometry), at this size.
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

    // A short burst: small turned rectangles falling down the sides of the
    // stage, never over the words, gone in a second and a half.
    function confetti() {
      var box = $(".fin-confetti", finish);
      box.textContent = "";
      if (reduced) return;
      var W = box.clientWidth;
      var H = box.clientHeight;
      var colors = ["#F2C65A", "#E0863A", "#F4EFE6", "#C8973A"];
      for (var i = 0; i < 32; i++) {
        var r = ((i * 9301 + 49297) % 233280) / 233280;
        var band = 0.22;
        var lane = i % 2 === 0 ? r * band + 0.02 : 1 - (r * band + 0.02);
        var share = 0.5 + ((i * 13) % 35) / 100;
        var piece = document.createElement("i");
        if (i % 3 === 0) piece.className = "tall";
        piece.style.backgroundColor = colors[(i + (i >> 1)) % colors.length];
        piece.style.setProperty("--x", (lane * W).toFixed(0) + "px");
        piece.style.setProperty("--dx", (lane < 0.5 ? -1 : 1) * (6 + ((i * 37) % 20)) + "px");
        piece.style.setProperty("--fall", (H * share).toFixed(0) + "px");
        piece.style.setProperty("--spin", (i % 2 === 0 ? 1 : -1) * (160 + ((i * 53) % 300)) + "deg");
        piece.style.setProperty("--dl", (i % 8) * 35 + "ms");
        piece.style.setProperty("--dur", "1500ms");
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
      if (hold.setPointerCapture) hold.setPointerCapture(e.pointerId);
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
    // the last one turns when the goal is finished. The mark in the corner
    // and beside each beat always shows it. With room in the left margin
    // (about 1250 px and wider) the steps are also one thin line down the
    // page that comes down beside each beat and steps in toward it.
    var climb = $("#climb");
    var stepEls = [1, 2, 3].map(function (k) {
      return $('.step[data-step="' + k + '"]', climb);
    });
    var navMark = $(".nav .mark");
    var reached = [false, false];
    var rail = svg("svg", { class: "rail", "aria-hidden": "true", focusable: "false" });
    var railBase = svg("path", { class: "base" }, rail);
    var railGold = svg("path", { class: "gold" }, rail);
    climb.insertBefore(rail, climb.firstChild);
    var geo = null; // the line's corners, when there's room for it
    var goldMax = 0;
    var climbTop = 0;

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
      if (!geo) return;
      // Gold as far as you've been; the last tread only once it's finished.
      var len = Math.min(goldMax, geo.beforeLast) + (done && goldMax >= geo.beforeLast ? geo.jog : 0);
      railGold.setAttribute("stroke-dasharray", len.toFixed(1) + " " + (geo.total + 10).toFixed(1));
    }
    function layoutRail() {
      var cr = climb.getBoundingClientRect();
      climbTop = pageTop(climb);
      function mid(el) {
        return pageTop(el) + el.offsetHeight / 2 - climbTop;
      }
      var edge = stepEls[2].getBoundingClientRect().left - cr.left; // where the content starts
      var jog = Math.min(30, (edge - 36) / 3);
      if (jog < 16) {
        geo = null;
        rail.classList.remove("on");
        return;
      }
      var x3 = edge - 20;
      var x = [x3 - 3 * jog, x3 - 2 * jog, x3 - jog, x3];
      var t1, t2, anchor;
      if (pinOn) {
        // The beats sit in the pinned screen. The first tread is where the
        // label is as the screen pins; the second arrives at the label at
        // the moment the breakdown gives way to today's One Thing.
        anchor = pageTop(stepEls[0], pinEl) + stepEls[0].offsetHeight / 2;
        t1 = pinStart + anchor - climbTop;
        t2 = t1 + PHASES[3] * pinRun;
      } else {
        anchor = window.innerHeight * 0.5;
        t1 = mid(stepEls[0]);
        t2 = mid(stepEls[1]);
      }
      var t3 = mid(stepEls[2]);
      var dPath = "M" + x[0] + " 0V" + t1.toFixed(1) + "H" + x[1] + "V" + t2.toFixed(1) + "H" + x[2] + "V" + t3.toFixed(1) + "H" + x[3];
      railBase.setAttribute("d", dPath);
      railGold.setAttribute("d", dPath);
      geo = { t: [t1, t2, t3], jog: jog, anchor: anchor, beforeLast: t3 + 2 * jog, total: t3 + 3 * jog };
      rail.classList.add("on");
    }
    // How far down the line the gold has come, for a scroll position.
    function goldAt(y) {
      var v = y + geo.anchor - climbTop;
      var t = geo.t;
      if (v < t[0]) return Math.max(0, v);
      if (v < t[1]) return v + geo.jog;
      return Math.min(v, t[2]) + 2 * geo.jog;
    }

    // ================= Scroll =================
    var hero = $(".hero");
    var depth = $$("[data-depth]");
    var queued = false;
    function onScroll() {
      queued = false;
      var y = window.scrollY || 0;
      var vh = window.innerHeight;
      // The hero's phones drift apart a little (depth).
      if (!reduced && y < hero.offsetHeight) {
        depth.forEach(function (node) {
          node.style.setProperty("--py", (y * parseFloat(node.getAttribute("data-depth"))).toFixed(1) + "px");
        });
      }
      if (pinOn) setPhase(phaseAt(y));
      // Which steps have been reached.
      if (geo) {
        var v = y + geo.anchor - climbTop;
        if (v >= geo.t[0]) reached[0] = true;
        if (v >= geo.t[1]) reached[1] = true;
        goldMax = Math.max(goldMax, goldAt(y));
      } else if (pinOn) {
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
      layoutRail();
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
      goldMax = geo ? geo.total : 0;
      finished();
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
        { threshold: 0.25, rootMargin: "0px 0px -6% 0px" },
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
      // The finish copy slides up as it appears; measure once it has settled.
      setTimeout(relayout, 1200);
    }

    // The capsule marks the section you're in.
    var links = $$(".nav-links a");
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
          links.forEach(function (a) {
            a.classList.toggle("on", a.getAttribute("href") === "#" + id);
          });
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      $$("[data-spy]").forEach(function (sec) {
        spy.observe(sec);
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
