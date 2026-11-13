(() => {
  const config = window.APP_CONFIG || {};
  const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  const hasSupabase = Boolean(window.supabase && window.supabase.createClient);
  const client = configured && hasSupabase
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const currency = value => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const message = (element, text, success = false) => {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("success", success);
  };
  let toastTimer;
  const notify = text => {
    const toast = $("#toast");
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  };
  const showError = (element, error, prefix = "Something went wrong") => {
    console.error(prefix, error);
    message(element, `${prefix}: ${error.message || "Please try again."}`);
  };
  const imageMarkup = (url, name, extraClass = "") => url
    ? `<img class="${extraClass}" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy">`
    : `<div class="image-placeholder ${extraClass}" aria-label="No product image">✳</div>`;

  const state = { publicProducts: [], adminProducts: [], categories: [], activeCategory: "", query: "", adminQuery: "", isAdmin: false };

  function setContactLinks() {
    const contactUrl = config.SHOP_CONTACT_URL || "https://m.me/";
    $$('a[href="https://m.me/"]').forEach(link => { link.href = contactUrl; });
  }

  function initMobileMenu() {
    const button = $("#mobile-menu");
    const nav = $(".main-nav");
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
    $$(".main-nav a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }));
  }

  function showPublicSetupMessage() {
    const status = $("#catalog-status");
    if (!configured) {
      status.textContent = "The shop is getting ready. Supabase settings need to be added in config.js.";
    } else if (!hasSupabase) {
      status.textContent = "The shop could not connect to its catalog. Please try again later.";
    }
  }

  async function loadPublicCatalog() {
    if (!client) {
      showPublicSetupMessage();
      return;
    }
    $("#catalog-status").textContent = "Finding the good stuff…";
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        client.from("public_products").select("id,name,description,image_url,category_id,category_name,public_price,in_stock,created_at").order("created_at", { ascending: false }),
        client.from("categories").select("id,name").order("name")
      ]);
      if (productsResult.error) throw productsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      state.publicProducts = productsResult.data || [];
      state.categories = categoriesResult.data || [];
      renderFilters();
      renderProducts();
    } catch (error) {
      console.error("Could not load the public catalog", error);
      $("#catalog-status").textContent = "We couldn’t load the collection just now. Please refresh to try again.";
    }
  }

  function renderFilters() {
    const filters = $("#category-filters");
    filters.innerHTML = `<button class="filter-chip ${state.activeCategory ? "" : "selected"}" data-category="">Everything</button>` +
      state.categories.map(category => `<button class="filter-chip ${state.activeCategory === category.id ? "selected" : ""}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`).join("");
  }

  function filteredProducts() {
    const query = state.query.trim().toLowerCase();
    return state.publicProducts.filter(product => {
      const matchesCategory = !state.activeCategory || product.category_id === state.activeCategory;
      const matchesQuery = !query || `${product.name} ${product.description || ""} ${product.category_name || ""}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    $("#product-count").textContent = `${products.length} ${products.length === 1 ? "PIECE" : "PIECES"}`;
    $("#catalog-status").textContent = "";
    $("#product-grid").innerHTML = products.map(product => `
      <article class="product-card" tabindex="0" role="button" data-product-id="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)}">
        <div class="product-image">${imageMarkup(product.image_url, product.name)}
          ${product.in_stock ? '<span class="product-tag">A GOOD FIND</span>' : '<span class="product-out">SOLD OUT</span>'}
        </div>
        <div class="product-info">
          <div class="product-category">${escapeHtml(product.category_name || "JUST FOUND")}</div>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
          <p class="product-description">${escapeHtml(product.description || "A little something worth discovering.")}</p>
          <div class="product-price-row"><span class="product-price">${currency(product.public_price)}</span><span class="availability ${product.in_stock ? "" : "sold-out"}">${product.in_stock ? "In stock" : "Sold out"}</span></div>
        </div>
      </article>`).join("");
    const empty = $("#empty-state");
    empty.classList.toggle("hidden", products.length > 0);
    if (products.length === 0 && state.publicProducts.length > 0) {
      $("h3", empty).textContent = "Nothing found this time.";
      $("p", empty).textContent = "Try another search or category.";
    } else if (!state.publicProducts.length) {
      $("h3", empty).textContent = "No finds just yet.";
      $("p", empty).textContent = "Our next little collection is on its way. Check back soon.";
    }
  }

  function openProduct(product) {
    $("#product-detail").innerHTML = `<div class="detail-layout">
      <div class="detail-image">${imageMarkup(product.image_url, product.name)}</div>
      <div class="detail-copy">
        <div class="eyebrow">${escapeHtml(product.category_name || "A GOOD FIND")}</div>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description || "A little something worth discovering.")}</p>
        <div class="detail-price">${currency(product.public_price)}</div>
        <div class="detail-stock">${product.in_stock ? "✳ In stock and ready for a new home" : "Currently sold out"}</div>
        <a class="button button-dark detail-contact" href="${escapeHtml(config.SHOP_CONTACT_URL || "https://m.me/")}" target="_blank" rel="noreferrer">Ask us about this find <span>↗</span></a>
      </div>
    </div>`;
    $("#product-dialog").showModal();
  }

  function renderAdminProducts() {
    const products = state.adminProducts.filter(product => {
      const q = state.adminQuery.toLowerCase();
      return !q || `${product.name} ${product.categories?.name || ""}`.toLowerCase().includes(q);
    });
    $("#admin-products-body").innerHTML = products.map(product => {
      const categoryName = product.categories?.name || "Uncategorized";
      const margin = Number(product.public_price) - Number(product.offer_price);
      const publicDifference = Number(product.market_price) - Number(product.public_price);
      return `<tr>
        <td><div class="table-product"><span class="table-thumb">${imageMarkup(product.image_url, product.name)}</span><span class="table-product-name">${escapeHtml(product.name)}<small class="table-product-category">${escapeHtml(categoryName)}</small></span></div></td>
        <td><span class="status-pill ${product.is_published ? "" : "draft"}">${product.is_published ? "Published" : "Draft"}</span></td>
        <td>${currency(product.market_price)}</td>
        <td>${currency(product.offer_price)}</td>
        <td><span class="price-main">${currency(product.public_price)}</span><small class="price-profit">vs market ${publicDifference >= 0 ? "−" : "+"}${currency(Math.abs(publicDifference))}</small></td>
        <td class="${product.stock_quantity < 1 ? "stock-low" : ""}">${Number(product.stock_quantity)}</td>
        <td><div class="row-actions"><button class="row-action" data-edit="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit">✎</button><button class="row-action" data-delete="${escapeHtml(product.id)}" aria-label="Delete ${escapeHtml(product.name)}" title="Delete">×</button></div><span class="price-profit">Margin ${currency(margin)}</span></td>
      </tr>`;
    }).join("");
    const count = state.adminProducts.length;
    const published = state.adminProducts.filter(product => product.is_published).length;
    $("#admin-total").textContent = count;
    $("#side-product-count").textContent = count;
    $("#metric-all").textContent = count;
    $("#metric-published").textContent = published;
    $("#metric-draft").textContent = count - published;
    $("#admin-empty").classList.toggle("hidden", count > 0);
    $(".table-wrap").classList.toggle("hidden", count === 0);
  }

  function renderAdminCategories() {
    $("#admin-category-list").innerHTML = state.categories.map(category => {
      const count = state.adminProducts.filter(product => product.category_id === category.id).length;
      return `<div class="category-row"><span>${escapeHtml(category.name)}<small>${count} ${count === 1 ? "product" : "products"}</small></span><span class="category-row-actions"><button data-rename-category="${escapeHtml(category.id)}">Rename</button><button class="delete-category" data-delete-category="${escapeHtml(category.id)}">Delete</button></span></div>`;
    }).join("") || '<div class="category-row">No categories yet. Add one above.</div>';
  }

  function updateProductCategoryOptions(selected = "") {
    $("#product-category").innerHTML = '<option value="">No category</option>' +
      state.categories.map(category => `<option value="${escapeHtml(category.id)}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");
  }

  async function loadAdminData() {
    const [productsResult, categoriesResult] = await Promise.all([
      client.from("products").select("*, categories(name)").order("created_at", { ascending: false }),
      client.from("categories").select("id,name").order("name")
    ]);
    if (productsResult.error) throw productsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    state.adminProducts = productsResult.data || [];
    state.categories = categoriesResult.data || [];
    renderAdminProducts();
    renderAdminCategories();
    updateProductCategoryOptions();
  }

  function setAdminView(view) {
    $("#login-view").classList.toggle("hidden", view !== "login");
    $("#dashboard-view").classList.toggle("hidden", view !== "dashboard");
    $("#admin-app").classList.remove("hidden");
    $("#storefront").classList.add("hidden");
    $(".site-header").classList.add("hidden");
    $(".site-footer").classList.add("hidden");
  }

  function setStorefrontView() {
    $("#admin-app").classList.add("hidden");
    $("#storefront").classList.remove("hidden");
    $(".site-header").classList.remove("hidden");
    $(".site-footer").classList.remove("hidden");
    document.title = "Tipid Tan — Good finds, better prices";
  }

  async function verifyAndShowAdmin(session) {
    if (!session) {
      state.isAdmin = false;
      setAdminView("login");
      return;
    }
    $("#admin-email").textContent = session.user.email || "";
    const { data: role, error } = await client.from("user_roles").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (error) {
      setAdminView("login");
      message($("#login-message"), `Could not verify admin access: ${error.message}`);
      return;
    }
    if (!role) {
      state.isAdmin = false;
      setAdminView("login");
      message($("#login-message"), "This account does not have administrator access.");
      return;
    }
    state.isAdmin = true;
    setAdminView("dashboard");
    try {
      await loadAdminData();
    } catch (loadError) {
      console.error("Could not load admin data", loadError);
      notify(`Could not load products: ${loadError.message || "Please try again."}`);
    }
  }

  function resetProductForm(product = null) {
    const form = $("#product-form");
    form.reset();
    form.elements.id.value = product?.id || "";
    form.elements.name.value = product?.name || "";
    form.elements.description.value = product?.description || "";
    form.elements.stock_quantity.value = product?.stock_quantity ?? 1;
    form.elements.market_price.value = product?.market_price ?? "";
    form.elements.offer_price.value = product?.offer_price ?? "";
    form.elements.public_price.value = product?.public_price ?? "";
    form.elements.is_published.checked = Boolean(product?.is_published);
    form.dataset.existingImage = product?.image_url || "";
    $("#image-current").textContent = product?.image_url ? "Current photo will be kept unless replaced." : "No image selected";
    $("#edit-title").textContent = product ? "Edit this good find" : "Add a product";
    updateProductCategoryOptions(product?.category_id || "");
    updatePriceInsights();
    message($("#product-message"), "");
  }

  function updatePriceInsights() {
    const form = $("#product-form");
    const market = Number(form.elements.market_price.value);
    const offer = Number(form.elements.offer_price.value);
    const posted = Number(form.elements.public_price.value);
    const set = form.elements.market_price.value !== "" && form.elements.offer_price.value !== "" && form.elements.public_price.value !== "";
    $("#price-insights").innerHTML = set
      ? `<span>${posted <= market ? "Below" : "Above"} market by <b>${currency(Math.abs(market - posted))}</b></span><span>Gross margin <b>${currency(posted - offer)}</b></span>`
      : "<span>Set your prices to see the breakdown.</span>";
  }

  async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const data = new FormData(form);
    const values = {
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim(),
      category_id: data.get("category_id") || null,
      stock_quantity: Number(data.get("stock_quantity")),
      market_price: Number(data.get("market_price")),
      offer_price: Number(data.get("offer_price")),
      public_price: Number(data.get("public_price")),
      is_published: data.get("is_published") === "on"
    };
    if (!values.name || !Number.isInteger(values.stock_quantity) || values.stock_quantity < 0 ||
      [values.market_price, values.offer_price, values.public_price].some(price => !Number.isFinite(price) || price < 0)) {
      message($("#product-message"), "Enter a product name, whole-number stock, and valid non-negative prices.");
      return;
    }
    const image = data.get("image");
    if (image?.size > 5 * 1024 * 1024) {
      message($("#product-message"), "That image is larger than 5 MB.");
      return;
    }
    if (image?.size && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(image.type)) {
      message($("#product-message"), "Choose a JPEG, PNG, WebP or GIF image.");
      return;
    }
    submit.disabled = true;
    submit.textContent = "Saving…";
    message($("#product-message"), "");
    try {
      if (image?.size) {
        const extension = image.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `products/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from("product-images").upload(path, image, { cacheControl: "3600", upsert: false, contentType: image.type });
        if (uploadError) throw uploadError;
        const { data: imageData } = client.storage.from("product-images").getPublicUrl(path);
        values.image_url = imageData.publicUrl;
      } else {
        values.image_url = form.dataset.existingImage || null;
      }
      const id = form.elements.id.value;
      const result = id
        ? await client.from("products").update(values).eq("id", id).select("id").single()
        : await client.from("products").insert(values).select("id").single();
      if (result.error) throw result.error;
      $("#edit-dialog").close();
      await loadAdminData();
      notify(id ? "Product updated." : "Product added to your collection.");
      if (!location.hash.includes("admin")) await loadPublicCatalog();
    } catch (error) {
      showError($("#product-message"), error, "Could not save product");
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Save product <span>↗</span>';
    }
  }

  async function deleteProduct(id) {
    const product = state.adminProducts.find(item => item.id === id);
    if (!product || !window.confirm(`Delete “${product.name}”? This can’t be undone.`)) return;
    try {
      const { error } = await client.from("products").delete().eq("id", id);
      if (error) throw error;
      await loadAdminData();
      notify("Product deleted.");
    } catch (error) {
      console.error("Could not delete product", error);
      notify(`Could not delete product: ${error.message || "Please try again."}`);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.name;
    const name = input.value.trim();
    if (!name) return;
    try {
      const { error } = await client.from("categories").insert({ name });
      if (error) throw error;
      input.value = "";
      await loadAdminData();
      notify("Category added.");
    } catch (error) {
      console.error("Could not add category", error);
      notify(`Could not add category: ${error.message || "Please try again."}`);
    }
  }

  async function renameCategory(id) {
    const category = state.categories.find(item => item.id === id);
    if (!category) return;
    const name = window.prompt("Rename this category:", category.name);
    if (name === null || !name.trim()) return;
    try {
      const { error } = await client.from("categories").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
      await loadAdminData();
      notify("Category renamed.");
    } catch (error) {
      console.error("Could not rename category", error);
      notify(`Could not rename category: ${error.message || "Please try again."}`);
    }
  }

  async function deleteCategory(id) {
    const category = state.categories.find(item => item.id === id);
    if (!category || !window.confirm(`Delete “${category.name}”? Products will be moved to Uncategorized.`)) return;
    try {
      const { error } = await client.from("categories").delete().eq("id", id);
      if (error) throw error;
      await loadAdminData();
      notify("Category deleted.");
    } catch (error) {
      console.error("Could not delete category", error);
      notify(`Could not delete category: ${error.message || "Please try again."}`);
    }
  }

  function bindEvents() {
    $("#category-filters").addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.activeCategory = button.dataset.category;
      renderFilters();
      renderProducts();
    });
    $("#product-search").addEventListener("input", event => {
      state.query = event.target.value;
      renderProducts();
    });
    $("#product-grid").addEventListener("click", event => {
      const card = event.target.closest("[data-product-id]");
      if (card) openProduct(state.publicProducts.find(product => product.id === card.dataset.productId));
    });
    $("#product-grid").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-product-id]");
      if (!card) return;
      event.preventDefault();
      openProduct(state.publicProducts.find(product => product.id === card.dataset.productId));
    });
    $("#admin-products-body").addEventListener("click", event => {
      const edit = event.target.closest("[data-edit]");
      const remove = event.target.closest("[data-delete]");
      if (edit) {
        const product = state.adminProducts.find(item => item.id === edit.dataset.edit);
        if (product) {
          resetProductForm(product);
          $("#edit-dialog").showModal();
        }
      } else if (remove) {
        deleteProduct(remove.dataset.delete);
      }
    });
    $("#add-product-button").addEventListener("click", () => {
      resetProductForm();
      $("#edit-dialog").showModal();
    });
    $("#empty-add-button").addEventListener("click", () => {
      resetProductForm();
      $("#edit-dialog").showModal();
    });
    $("#product-form").addEventListener("submit", saveProduct);
    ["market_price", "offer_price", "public_price"].forEach(name => {
      $("#product-form").elements[name].addEventListener("input", updatePriceInsights);
    });
    $("#product-form").elements.image.addEventListener("change", event => {
      $("#image-current").textContent = event.target.files[0]?.name || (event.currentTarget.form.dataset.existingImage ? "Current photo will be kept unless replaced." : "No image selected");
    });
    $("#admin-search").addEventListener("input", event => {
      state.adminQuery = event.target.value;
      renderAdminProducts();
    });
    $("#category-form").addEventListener("submit", saveCategory);
    $("#admin-category-list").addEventListener("click", event => {
      const rename = event.target.closest("[data-rename-category]");
      const remove = event.target.closest("[data-delete-category]");
      if (rename) renameCategory(rename.dataset.renameCategory);
      else if (remove) deleteCategory(remove.dataset.deleteCategory);
    });
    $$("[data-admin-tab]").forEach(button => button.addEventListener("click", () => {
      const categories = button.dataset.adminTab === "categories";
      $("#products-panel").classList.toggle("hidden", categories);
      $("#categories-panel").classList.toggle("hidden", !categories);
      $("#admin-page-title").textContent = categories ? "Categories" : "Products";
      $$("[data-admin-tab]").forEach(tab => tab.classList.toggle("selected", tab === button));
    }));
    $("#login-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (!client) {
        message($("#login-message"), "Add your Supabase URL and publishable anon key to config.js first.");
        return;
      }
      const form = event.currentTarget;
      const submit = $('button[type="submit"]', form);
      submit.disabled = true;
      message($("#login-message"), "Signing in…", true);
      try {
        const { error } = await client.auth.signInWithPassword({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        });
        if (error) message($("#login-message"), `Could not sign in: ${error.message}`);
      } catch (error) {
        showError($("#login-message"), error, "Could not sign in");
      } finally {
        submit.disabled = false;
      }
    });
    $("#logout-button").addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) {
        notify(`Could not sign out: ${error.message}`);
        return;
      }
      location.hash = "";
      setStorefrontView();
      notify("You’re signed out.");
    });
    $$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
    [$("#product-dialog"), $("#edit-dialog")].forEach(dialog => dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    }));
    $("#product-dialog").addEventListener("close", () => { $("#product-detail").innerHTML = ""; });
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("#product-search").focus();
      }
      if (event.key === "Escape") {
        $$(".product-dialog[open]").forEach(dialog => dialog.close());
      }
    });
    $$("[data-category-link]").forEach(link => link.addEventListener("click", () => {
      const category = state.categories.find(item => item.name.toLowerCase() === link.dataset.categoryLink.toLowerCase());
      state.activeCategory = category?.id || "";
      renderFilters();
      renderProducts();
    }));
    window.addEventListener("hashchange", route);
  }

  async function route() {
    if (location.hash === "#admin") {
      document.title = "Shopkeeper — Tipid Tan";
      if (!client) {
        setAdminView("login");
        message($("#login-message"), configured ? "Supabase could not be loaded. Check your connection and refresh." : "Add your Supabase URL and publishable anon key to config.js first.");
        return;
      }
      setAdminView("login");
      message($("#login-message"), "");
      const { data, error } = await client.auth.getSession();
      if (error) {
        message($("#login-message"), `Could not restore your session: ${error.message}`);
        return;
      }
      await verifyAndShowAdmin(data.session);
    } else {
      setStorefrontView();
      if (client) await loadPublicCatalog();
    }
  }

  async function init() {
    setContactLinks();
    initMobileMenu();
    bindEvents();
    if (location.hash === "#admin") {
      await route();
    } else {
      setStorefrontView();
      await loadPublicCatalog();
    }
    if (client) {
      client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          state.isAdmin = false;
          if (location.hash === "#admin") setAdminView("login");
          return;
        }
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && location.hash === "#admin") {
          setTimeout(() => verifyAndShowAdmin(session), 0);
        }
      });
    }
  }

  init();
})();
