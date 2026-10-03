(function openIndividualBookInsideTheApp() {
  if (!/\/book(?:\.html)?\/?$/.test(window.location.pathname)) return;
  let inApp = false;
  try { inApp = window.parent !== window && Boolean(window.parent.document.querySelector(".app-frame")); } catch {}
  const bookId = new URLSearchParams(window.location.search).get("id");
  if (!inApp && bookId) window.location.replace(`/?bookId=${encodeURIComponent(bookId)}`);
})();

(function connectAuthorFavoritesToTheApp() {
  if (window.parent === window) return;
  const favoriteAuthors = new Set();
  function sync(button) {
    const saved = favoriteAuthors.has(button.dataset.authorFavoriteId);
    if (button.dataset.iconOnly === "true") {
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>`;
    } else button.textContent = `${saved ? "♥" : "♡"} ${saved ? "Author favorited" : "Favorite author"}`;
    button.classList.toggle("is-favorite", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", `${saved ? "Unfavorite" : "Favorite"} ${button.dataset.authorName || "this author"}`);
  }
  function attach(host, authorId, name) {
    if (!authorId || authorId.length > 160) return;
    if (host.dataset.authorFavoriteAttached) {
      const existing = host.nextElementSibling;
      if (existing?.classList.contains("app-author-favorite") && existing.dataset.authorName !== name) { existing.dataset.authorName = name; sync(existing); }
      return;
    }
    host.dataset.authorFavoriteAttached = "true";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-author-favorite";
    const featured = host.classList?.contains("featured-author");
    if (featured) { button.dataset.iconOnly = "true"; button.classList.add("app-author-favorite-featured"); }
    button.dataset.authorFavoriteId = authorId;
    button.dataset.authorName = name;
    sync(button);
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      window.parent.postMessage({ type: "blk-shelf-toggle-author", authorId }, window.location.origin);
    });
    if (featured || host.parentElement?.classList.contains("author-name-list")) {
      const entry = document.createElement("div");
      entry.className = featured ? "app-featured-author-entry" : "app-author-favorite-entry";
      host.parentElement.insertBefore(entry, host);
      entry.append(host, button);
    } else host.insertAdjacentElement("afterend", button);
  }
  function enhance() {
    if (/\/author(?:\.html)?\/?$/.test(window.location.pathname)) {
      const name = document.getElementById("author-name");
      const authorId = new URLSearchParams(window.location.search).get("id")?.trim();
      if (name && authorId) attach(name, authorId, name.textContent.trim());
    }
    document.querySelectorAll('a[href*="author.html"]').forEach(link => {
      let destination;
      try { destination = new URL(link.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin || !/\/author\.html$/.test(destination.pathname)) return;
      const authorId = destination.searchParams.get("id")?.trim();
      if (authorId) attach(link, authorId, link.querySelector("strong")?.textContent.trim() || link.querySelector("span")?.textContent.trim() || link.textContent.trim());
    });
  }
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== "blk-shelf-favorites-state") return;
    favoriteAuthors.clear();
    (event.data.authorFavorites || []).forEach(id => favoriteAuthors.add(String(id)));
    document.querySelectorAll(".app-author-favorite").forEach(sync);
  });
  enhance();
  new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
  window.parent.postMessage({ type: "blk-shelf-favorites-ready" }, window.location.origin);
})();

(function initializeSharedNavigation() {
  if (/\/library(?:\.html)?\/?$/.test(window.location.pathname) && new URLSearchParams(window.location.search).get("view") === "discover") {
    const label = document.querySelector(".filters .eyebrow");
    if (label) label.textContent = "Discover books";
    document.title = "Discover More – The BLK Shelf";
  }
  function closeAllMenus(exceptMenu = null) {
    document
      .querySelectorAll(
        ".nav-dropdown[open], .mobile-more-menu[open]"
      )
      .forEach(menu => {
        if (menu !== exceptMenu) {
          menu.removeAttribute("open");
        }
      });
  }

  document.addEventListener("click", event => {
    const clickedSummary = event.target.closest(
      ".nav-dropdown > summary, .mobile-more-menu > summary"
    );

    if (clickedSummary) {
      const clickedMenu = clickedSummary.parentElement;

      closeAllMenus(clickedMenu);
      return;
    }

    const clickedMenuLink = event.target.closest(
      ".dropdown-menu a, .mobile-more-links a"
    );

    if (clickedMenuLink) {
      closeAllMenus();
      return;
    }

    const clickedInsideMenu = event.target.closest(
      ".nav-dropdown, .mobile-more-menu"
    );

    if (!clickedInsideMenu) {
      closeAllMenus();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeAllMenus();
    }
  });
})();

(function keepTheBlkShelfInsideTheApp() {
  const mirroredPages = new Set([
    "about.html", "author-actions.html", "author-directory.html", "author.html",
    "book.html", "event.html", "events.html", "faq.html", "featured-authors.html",
    "index.html", "kidane-dynasty.html", "library.html", "login.html",
    "privacy-policy.html", "randomizer.html", "submission-received.html",
    "submit-author.html", "submit-book.html", "submit-event.html",
    "terms-and-conditions.html", "update-author.html"
  ]);

  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link) return;

    const rawHref = link.getAttribute("href") || "";
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("javascript:")) return;

    let destination;
    try {
      destination = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (destination.hostname === "theblkshelf.com" || destination.hostname === "www.theblkshelf.com") {
      const page = destination.pathname.split("/").filter(Boolean).pop() || "index.html";
      if (mirroredPages.has(page)) {
        event.preventDefault();
        window.location.href = `/mirror/${page}${destination.search}${destination.hash}`;
        return;
      }
    }

    if (destination.origin === window.location.origin) {
      if (link.target === "_blank") link.target = "_self";
      return;
    }
    if (!/^https?:$/.test(destination.protocol)) return;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const socialPlatforms = { "instagram.com": "Instagram", "facebook.com": "Facebook", "fb.com": "Facebook", "tiktok.com": "TikTok", "twitter.com": "X", "x.com": "X", "substack.com": "Substack", "youtube.com": "YouTube", "youtu.be": "YouTube", "threads.net": "Threads", "threads.com": "Threads", "linkedin.com": "LinkedIn" };
    const platform = Object.keys(socialPlatforms).find(host => destination.hostname === host || destination.hostname.endsWith(`.${host}`));
    if (platform && window.parent !== window) {
      event.preventDefault();
      window.parent.postMessage({ type: "blk-shelf-external-link", url: destination.href, label: socialPlatforms[platform] }, window.location.origin);
    }
  });
})();

(function connectFavoritesToTheApp() {
  if (window.parent === window) return;

  const favoriteIds = new Set();
  let shelf = {};

  async function refreshBookReviews(bookId) {
    const section = document.querySelector(".app-book-reviews");
    if (!section || section.dataset.reviewBookId !== bookId) return;
    const summary = section.querySelector(".app-review-summary");
    const previews = section.querySelector(".app-review-previews");
    try {
      const response = await fetch(`/api/reviews?bookId=${encodeURIComponent(bookId)}`);
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      summary.textContent = data.count ? `${Number(data.average).toFixed(1)} out of 5 · ${data.count} ${data.count === 1 ? "rating" : "ratings"}` : "No ratings yet.";
      previews.replaceChildren();
      (data.reviews || []).slice(0, 3).forEach(review => {
        const article = document.createElement("article");
        const name = document.createElement("strong");
        name.textContent = `${review.displayName || "Reader"} · ${review.rating}/5 stars`;
        const text = document.createElement("p");
        text.textContent = review.review || "Rating only";
        article.appendChild(name); article.appendChild(text); previews.appendChild(article);
      });
    } catch {
      summary.textContent = "Reviews are unavailable right now. Tap below to try again.";
    }
  }

  function setControlState(control) {
    const bookId = control.dataset.favoriteId;
    const active = favoriteIds.has(bookId);
    control.classList.toggle("is-favorite", active);
    control.setAttribute("aria-pressed", active ? "true" : "false");
    control.setAttribute("aria-label", active ? "Remove from Favorites" : "Add to Favorites");
    control.title = active ? "Remove from Favorites" : "Add to Favorites";
    const label = control.classList.contains("app-favorite-detail") ? active ? "♥ Favorited" : "♡ Add to Favorites" : active ? "♥" : "♡";
    if (control.textContent !== label) control.textContent = label;
  }

  function setShelfControlState(control) {
    const status = shelf[control.dataset.favoriteId];
    const current = status === "Finished" ? "Read" : status;
    control.classList.toggle("is-on-shelf", Boolean(status));
    const label = control.classList.contains("app-shelf-detail") ? current ? `My Shelf · ${current}` : "Add to My Shelf" : current || "My Shelf";
    if (control.textContent !== label) control.textContent = label;
    control.setAttribute("aria-label", `Manage book: ${label}`);
  }

  function toggleFavorite(event, control) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    window.parent.postMessage({ type: "blk-shelf-toggle-favorite", bookId: control.dataset.favoriteId }, window.location.origin);
  }

  function makeControl(bookId, detail = false) {
    const control = document.createElement(detail ? "button" : "span");
    if (detail) control.type = "button";
    else {
      control.setAttribute("role", "button");
      control.tabIndex = 0;
    }
    control.className = detail ? "app-favorite-control app-favorite-detail" : "app-favorite-control";
    control.dataset.favoriteId = bookId;
    control.addEventListener("click", event => toggleFavorite(event, control));
    control.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") toggleFavorite(event, control);
    });
    setControlState(control);
    return control;
  }

  function makeShelfControl(bookId, detail = false) {
    const control = document.createElement(detail ? "button" : "span");
    if (detail) control.type = "button";
    else { control.setAttribute("role", "button"); control.tabIndex = 0; }
    control.className = detail ? "app-shelf-control app-shelf-detail" : "app-shelf-control";
    control.dataset.favoriteId = bookId;
    const open = event => {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      window.parent.postMessage({ type: "blk-shelf-manage-book", bookId: control.dataset.favoriteId }, window.location.origin);
    };
    control.addEventListener("click", open);
    control.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") open(event); });
    setShelfControlState(control);
    return control;
  }

  function enhanceHost(host, bookId) {
    if (!bookId) return;
    const randomizerActions = host.id === "resultLink" && host.parentElement?.classList.contains("app-randomizer-actions") ? host.parentElement : null;
    if (randomizerActions) host = randomizerActions;
    if (host.tagName === "A" && !host.querySelector("img")) {
      let toolbar = host.appBookToolbar;
      if (!toolbar || !toolbar.isConnected) {
        toolbar = document.createElement("div");
        toolbar.className = "app-inline-book-actions";
        host.insertAdjacentElement("afterend", toolbar);
        host.appBookToolbar = toolbar;
      }
      host = toolbar;
    }
    host.classList.add("app-favorite-host");
    let favorite = Array.from(host.children).find(child => child.classList.contains("app-favorite-control"));
    let status = Array.from(host.children).find(child => child.classList.contains("app-shelf-control"));
    if (!favorite) {
      favorite = makeControl(bookId, Boolean(randomizerActions));
      if (randomizerActions) {
        favorite.classList.remove("app-favorite-detail");
        favorite.classList.add("app-randomizer-heart");
        setControlState(favorite);
      }
      host.appendChild(favorite);
    }
    if (!status) { status = makeShelfControl(bookId, Boolean(randomizerActions)); host.appendChild(status); }
    if (favorite.dataset.favoriteId !== bookId) { favorite.dataset.favoriteId = bookId; setControlState(favorite); }
    if (status.dataset.favoriteId !== bookId) { status.dataset.favoriteId = bookId; setShelfControlState(status); }
  }

  function bookIdFromLink(link) {
    try {
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin && !["theblkshelf.com", "www.theblkshelf.com"].includes(destination.hostname)) return null;
      const page = destination.pathname.split("/").filter(Boolean).pop();
      return page === "book.html" || page === "book" ? destination.searchParams.get("id") : null;
    } catch {
      return null;
    }
  }

  function enhanceBooks() {
    document.querySelectorAll("a[href*='book']").forEach(link => {
      const bookId = bookIdFromLink(link);
      enhanceHost(link, bookId);
    });

    document.querySelectorAll("[data-book-id]").forEach(card => {
      const bookId = card.dataset.bookId;
      enhanceHost(card, bookId);
    });

    if (/\/book(?:\.html)?\/?$/.test(window.location.pathname)) {
      const bookId = new URLSearchParams(window.location.search).get("id");
      const actions = document.querySelector(".app-spotlight-actions") || document.querySelector(".cover-actions");
      if (bookId && actions) {
        if (!actions.querySelector(".app-favorite-detail")) actions.prepend(makeControl(bookId, true));
        if (!actions.querySelector(".app-shelf-detail")) actions.prepend(makeShelfControl(bookId, true));
      }
      const bookMain = document.querySelector(".book-main");
      if (bookId && bookMain && !bookMain.querySelector(".app-book-reviews")) {
        const section = document.createElement("section");
        section.className = "app-book-reviews";
        section.dataset.reviewBookId = bookId;
        const heading = document.createElement("h2");
        heading.textContent = "Ratings & reviews";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-primary";
        button.textContent = "See ratings & write a review";
        button.addEventListener("click", () => window.parent.postMessage({ type: "blk-shelf-open-reviews", bookId }, window.location.origin));
        const summary = document.createElement("p"); summary.className = "app-review-summary"; summary.textContent = "Loading ratings…";
        const previews = document.createElement("div"); previews.className = "app-review-previews";
        section.appendChild(heading); section.appendChild(summary); section.appendChild(previews); section.appendChild(button); bookMain.appendChild(section);
        void refreshBookReviews(bookId);
      }
    }
  }

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === "blk-shelf-reviews-updated") { void refreshBookReviews(event.data.bookId); return; }
    if (event.data?.type !== "blk-shelf-favorites-state") return;
    favoriteIds.clear();
    (event.data.favorites || []).forEach(bookId => favoriteIds.add(String(bookId)));
    shelf = event.data.shelf || {};
    document.querySelectorAll(".app-favorite-control").forEach(setControlState);
    document.querySelectorAll(".app-shelf-control").forEach(setShelfControlState);
  });

  enhanceBooks();
  new MutationObserver(enhanceBooks).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "data-book-id"] });
  window.parent.postMessage({ type: "blk-shelf-favorites-ready" }, window.location.origin);
})();
