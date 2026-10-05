// gildstep.com: the waitlist form, the invite page and optional analytics.
// Settings come from data-* attributes on <body> (written by
// scripts/build-site.mjs), so there's no inline script.
(function () {
  var d = document.body.dataset;

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
  document.querySelectorAll("[data-track]").forEach(function (el) {
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
      document.querySelectorAll("[data-username]").forEach(function (el) {
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

  // The waitlist: one call to the database function, nothing else.
  var form = document.getElementById("waitlist");
  if (!form) return;
  var msg = form.parentNode.querySelector(".msg");
  var button = form.querySelector("button");
  var copy = {
    ok: "You're on the list. We'll email you when " + d.app + " is ready.",
    invalid: "That email doesn't look right. Check it and try again.",
    slow_down: "That's a lot of tries. Give it a little while and try again.",
    error: "Couldn't add you right now. Email " + d.support + " and we'll add you.",
  };
  function say(kind) {
    msg.textContent = copy[kind] || copy.error;
    msg.className = "msg " + (kind === "ok" ? "ok" : "err");
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
        say(status);
        if (status === "ok") {
          form.reset();
          form.hidden = true;
          track("site_waitlist_joined", { from: m ? "invite" : "home" });
        }
      })
      .catch(function () {
        say("error");
      })
      .then(function () {
        button.disabled = false;
      });
  });
})();
