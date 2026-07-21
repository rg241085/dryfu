import { messaging } from "./firebase-config.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

import { collection, onSnapshot, addDoc, doc, setDoc, query, where, getDocs, updateDoc, arrayUnion, getDoc, increment, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
auth.useDeviceLanguage();

const mainContainer = document.getElementById('catalog-main');

// 🌟 NAYA: Local Storage se cart uthana, agar nahi hai toh khali array banana
let cart = JSON.parse(localStorage.getItem('dryfu_cart')) || [];
let allProducts = [];
let productsByCategory = {};
let selectedCategory = "All";

// 🎟️ Coupons State
let availableCoupons = [];

function listenCoupons() {
    onSnapshot(collection(db, "coupons"), (snapshot) => {
        availableCoupons = [];
        snapshot.forEach(docSnap => {
            if (docSnap.data().isActive) {
                availableCoupons.push({ id: docSnap.id, ...docSnap.data() });
            }
        });
    });
}

// 🌟 NAYA: Render ko control karne ke liye Debounce timer
let renderTimer;
window.safeRenderCatalog = function () {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        if (typeof renderCatalog === 'function') {
            renderCatalog(); // ✅ SAHI CODE (Asli render function ko call karega)
        }
    }, 150);
};



// 🌟 SMART LOGIN SYSTEM
let loggedInUser = localStorage.getItem('customerMobile') || null;
let currentLoginIntent = 'checkout';

// ==========================================
// 🖼️ MULTI-BANNER AUTO SLIDER LOGIC
// ==========================================
function listenBanners() {
    onSnapshot(collection(db, "banners"), (snapshot) => {
        const bannerContainer = document.getElementById('dynamic-banner-container');
        if (!bannerContainer) return;

        bannerContainer.innerHTML = '<div id="banner-slider" class="banner-slider-container"></div>';
        const slider = document.getElementById('banner-slider');

        if (snapshot.empty) {
            slider.innerHTML = '<p style="text-align:center; width:100%; color:#888; font-size:12px;">No active banners</p>';
            return;
        }

        snapshot.forEach((doc) => {
            let data = doc.data();

            // 🌟 NAYA: Kaala parda (overlay) aur text hata diya hai taaki chamak 100% rahe!
            // Poore banner par click karne se sidha Catalog page khulega.
            let bannerHTML = `
                <div class="banner-slide" style="flex: 0 0 100%; width: 100%; box-sizing: border-box; scroll-snap-align: center;">
                    <div onclick="window.switchTab('catalog')" style="background: url('${data.imgUrl}') center/100% 100% no-repeat; width: 100%; height: 140px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); cursor: pointer; box-sizing: border-box;">
                    </div>
                </div>
            `;
            slider.insertAdjacentHTML('beforeend', bannerHTML);
        });

        // Auto Slide Logic
        if (window.bannerInterval) clearInterval(window.bannerInterval);

        window.bannerInterval = setInterval(() => {
            if (slider && slider.children.length > 1) {
                let maxScroll = slider.scrollWidth - slider.clientWidth;
                if (slider.scrollLeft >= maxScroll - 10) {
                    slider.scrollLeft = 0;
                } else {
                    slider.scrollLeft += slider.clientWidth + 15;
                }
            }
        }, 3500);
    });
}


// ==========================================
// 👕 1. CATALOG & PRODUCTS LOGIC
// ==========================================

function listenProducts() {
    onSnapshot(collection(db, "products"), (querySnapshot) => {
        productsByCategory = {};
        allProducts = [];

        querySnapshot.forEach((doc) => {
            let data = doc.data();
            data.id = doc.id;
            allProducts.push(data);

            let catName = data.mainCategory || "Uncategorized";

            if (!productsByCategory[catName]) {
                productsByCategory[catName] = [];
            }
            productsByCategory[catName].push(data);
        });

        if (allProducts.length === 0) {
            mainContainer.innerHTML = '<p style="text-align:center; padding: 20px;">Koi product nahi mila.</p>';
            document.getElementById('category-nav').innerHTML = '';
            document.getElementById('sub-category-nav').classList.add('hidden');
        } else {
            renderCategoryNav();
            window.safeRenderCatalog();

            // 🌟 Yahan par Dynamic Sections aur Categories dono call ho rahi hain
            if (typeof window.renderDynamicHomeSections === 'function') {
                window.renderDynamicHomeSections();
            }
            if (typeof window.renderHomeCategories === 'function') {
                window.renderHomeCategories();
            }
        }
    });
}

function renderCategoryNav() {
    const navContainer = document.getElementById('category-nav');
    if (!navContainer) return;
    navContainer.innerHTML = '';

    // 🌟 JADU: masterMainCategories array (jo sorted hai) se naam nikalna
    let sortedCategoryNames = masterMainCategories.map(cat => cat.name);

    // "All" button sabse pehle dikhna chahiye
    const categories = ["All", ...sortedCategoryNames];

    // Check karein ki selectedCategory valid hai ya nahi
    if (!categories.includes(selectedCategory)) {
        selectedCategory = "All";
    }

    categories.forEach(cat => {
        let btn = document.createElement('button');
        btn.classList.add('category-tab');
        if (cat === selectedCategory) btn.classList.add('active');
        btn.innerText = cat;
        btn.onclick = () => {
            selectedCategory = cat;
            renderCategoryNav(); // Naya order update karne ke liye
            window.safeRenderCatalog();
        };
        navContainer.appendChild(btn);
    });
}

function renderSubCategoryNav(productsGroupedBySub, subCatsArray) {
    const subNavContainer = document.getElementById('sub-category-nav');
    if (selectedCategory === "All" || subCatsArray.length === 0) {
        subNavContainer.classList.add('hidden');
        return;
    }

    subNavContainer.classList.remove('hidden');
    subNavContainer.innerHTML = '';

    subCatsArray.forEach((sub, index) => {
        let cleanSubId = sub.replace(/\s+/g, '-');
        let subImg = productsGroupedBySub[sub][0].img;
        let btn = document.createElement('button');
        btn.classList.add('sub-category-tab');
        btn.id = `tab-${cleanSubId}`;

        btn.innerHTML = `
            <div class="sub-cat-img-wrapper"><img src="${subImg}" alt="${sub}"></div>
            <span class="sub-cat-name">${sub}</span>
        `;
        if (index === 0) btn.classList.add('active');

        btn.onclick = () => {
            document.getElementById(`section-${cleanSubId}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        subNavContainer.appendChild(btn);
    });
}

// 🌟 NAYA: Global variable banayein observer ko track karne ke liye
let catalogObserver = null;



function setupIntersectionObserver() {
    const sections = document.querySelectorAll('.category-section');

    if (catalogObserver) {
        catalogObserver.disconnect();
    }

    const observerOptions = { root: null, rootMargin: '-120px 0px -50% 0px', threshold: 0 };

    catalogObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const subName = entry.target.id.replace('section-', '');
                document.querySelectorAll('.sub-category-tab').forEach(tab => tab.classList.remove('active'));
                const activeTab = document.getElementById(`tab-${subName}`);

                if (activeTab) {
                    activeTab.classList.add('active');

                    // 🌟 FIX YAHAN HAI: scrollIntoView() ko hata kar manual scrollTo lagaya hai
                    // Isse main screen ka scroll nahi hilega, sirf chhota sidebar scroll hoga
                    const sidebar = document.getElementById('sub-category-nav');
                    if (sidebar) {
                        sidebar.scrollTo({
                            top: activeTab.offsetTop - 50,
                            behavior: 'smooth'
                        });
                    }
                }
            }
        });
    }, observerOptions);

    sections.forEach(section => catalogObserver.observe(section));
}

function renderCatalog() {
    mainContainer.innerHTML = '';

    if (selectedCategory === "All") {
        document.getElementById('sub-category-nav').classList.add('hidden');

        // 🌟 JADU: All Products mein bhi Main Category ko Order me lagana
        let sortedMainCats = Object.keys(productsByCategory).sort((a, b) => {
            let catA = masterMainCategories.find(m => m.name === a);
            let catB = masterMainCategories.find(m => m.name === b);
            let prioA = catA ? (catA.priority || 99) : 99;
            let prioB = catB ? (catB.priority || 99) : 99;
            return prioA - prioB;
        });

        sortedMainCats.forEach(categoryName => {
            let products = productsByCategory[categoryName];

            // 🌟 SMART SORTING: Pehle Sub-Category ki rank dekhega, phir Product ki rank
            products.sort((a, b) => {
                // 1. Dono products ki Sub-Category ki priority pata karo
                let subA = masterSubCategories.find(m => m.name === a.subCategory && m.parent === categoryName);
                let subB = masterSubCategories.find(m => m.name === b.subCategory && m.parent === categoryName);

                let prioSubA = subA ? (subA.priority || 99) : 99;
                let prioSubB = subB ? (subB.priority || 99) : 99;

                // 2. Agar Sub-Categories alag-alag order ki hain, toh unhe alag karo
                if (prioSubA !== prioSubB) {
                    return prioSubA - prioSubB;
                }

                // 3. Agar same Sub-Category ke hain, tab product ka apna order dekho
                return (a.priority || 99) - (b.priority || 99);
            });

            let section = document.createElement('div');
            section.classList.add('category-section');
            section.innerHTML += `<div class="category-header"><h3>${categoryName}</h3></div>`;
            products.forEach(product => { section.appendChild(window.createProductItem(product)); });
            mainContainer.appendChild(section);
        });
    } else {
        let productsInMainCat = productsByCategory[selectedCategory] || [];
        let subCatsSet = new Set();
        let productsGroupedBySub = {};

        productsInMainCat.forEach(p => {
            let sub = p.subCategory && p.subCategory.trim() !== "" ? p.subCategory : "Others";
            subCatsSet.add(sub);
            if (!productsGroupedBySub[sub]) productsGroupedBySub[sub] = [];
            productsGroupedBySub[sub].push(p);
        });

        let subCatsArray = Array.from(subCatsSet);

        // 🌟 JADU: Subcategories (e.g. Almonds, Cashews) ko Priority se lagana
        subCatsArray.sort((a, b) => {
            let subA = masterSubCategories.find(m => m.name === a && m.parent === selectedCategory);
            let subB = masterSubCategories.find(m => m.name === b && m.parent === selectedCategory);
            let prioA = subA ? (subA.priority || 99) : 99;
            let prioB = subB ? (subB.priority || 99) : 99;
            return prioA - prioB;
        });

        renderSubCategoryNav(productsGroupedBySub, subCatsArray);

        subCatsArray.forEach(sub => {
            let cleanSubId = sub.replace(/\s+/g, '-');
            let section = document.createElement('div');
            section.classList.add('category-section');
            section.id = `section-${cleanSubId}`;
            section.innerHTML += `<div class="category-header"><h3 style="color:#128c7e;">${sub}</h3></div>`;

            // 🌟 NAYA JODA: Sub category ke products ko order se lagana
            let productsInSub = productsGroupedBySub[sub];
            productsInSub.sort((a, b) => (a.priority || 99) - (b.priority || 99));

            productsInSub.forEach(product => { section.appendChild(window.createProductItem(product)); });
            mainContainer.appendChild(section);
        });
        setupIntersectionObserver();
    }
}

window.createProductItem = function (product) {
    let div = document.createElement('div');
    div.classList.add('product-item');

    div.style.padding = '12px';
    div.style.borderRadius = '14px';
    div.style.border = '1px solid #eef0f2';
    div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
    div.style.marginBottom = '15px';
    div.style.background = '#fff';

    const cartItem = cart.find(item => item.id === product.id);
    let actionHTML = '';

    let btnStyle = "border: none; color: #fff; background: linear-gradient(135deg, #128c7e, #0f766a); font-weight: 800; border-radius: 8px; padding: 8px 24px; font-size: 13px; cursor: pointer; text-transform: uppercase; box-shadow: 0 4px 10px rgba(18,140,126,0.25); transition: 0.2s;";
    let qtyStyle = "display: flex; align-items: center; border: 1px solid #128c7e; border-radius: 8px; background: #f3fdf6; overflow: hidden; box-shadow: 0 2px 6px rgba(18,140,126,0.15); height: 34px;";

    if (product.stockQty !== undefined && product.stockQty <= 0) {
        actionHTML = `<span style="color:#dc3545; font-weight:bold; font-size:12px; padding: 6px 10px; background: #fff0f0; border-radius: 6px;">Out of Stock</span>`;
    } else if (cartItem) {
        actionHTML = `<div style="${qtyStyle}">
            <button onclick="window.decreaseQuantity('${product.id}')" style="background:transparent; border:none; color:#128c7e; font-size:18px; font-weight:bold; width:30px; height:100%; cursor:pointer;">-</button>
            <span style="font-size:14px; font-weight:800; color:#111; width:26px; text-align:center; background:#fff; line-height:34px; border-left:1px solid #128c7e; border-right:1px solid #128c7e;">${cartItem.quantity}</span>
            <button onclick="window.addToCart('${product.id}')" style="background:transparent; border:none; color:#128c7e; font-size:18px; font-weight:bold; width:30px; height:100%; cursor:pointer;">+</button>
        </div>`;
    } else {
        actionHTML = `<button style="${btnStyle}" onclick="window.addToCart('${product.id}')">ADD</button>`;
    }

    // 🌟 BUG FIX: Yahan String ko Number mein convert kiya gaya hai
    let mrpNum = Number(product.mrp) || 0;
    let spNum = Number(product.sellingPrice) || 0;

    let savePercent = mrpNum > spNum ? Math.round(((mrpNum - spNum) / mrpNum) * 100) : 0;

    let mrpHtml = savePercent > 0 ?
        `<div style="display: flex; align-items: center; margin-top: 3px;">
            <span style="font-size: 12px; color: #999; text-decoration: line-through;">₹${mrpNum}</span>
        </div>` : '';

    let discountBadgeHtml = savePercent > 0 ?
        `<div style="position: absolute; top: -1px; left: -1px; background: #e11d48; color: #fff; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 10px 0 10px 0; z-index: 10; box-shadow: 2px 2px 5px rgba(0,0,0,0.15);">
            ${savePercent}% OFF
        </div>` : '';

    div.innerHTML = `
        <div style="display: flex; gap: 15px; align-items: stretch; width: 100%;">
            
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0; background: #f8fafc; border-radius: 10px; padding: 5px; border: 1px solid #f1f5f9;" onclick="window.openPDP('${product.id}')">
                ${discountBadgeHtml}
                <img src="${product.img}" alt="Product" style="width: 100%; height: 100%; object-fit: contain; cursor: pointer; mix-blend-mode: multiply;">
            </div>

            <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-top: 2px; min-width: 0;">
                
                <div style="margin-bottom: 6px;">
                    <h4 style="font-size: 15px; color: #1e293b; margin: 0 0 6px 0; line-height: 1.3; font-weight: 800; cursor:pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" onclick="window.openPDP('${product.id}')">${product.name}</h4>
                    
                    <div style="display: inline-block; background: #e6f4ea; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 800; border: 1px solid #c8e6c9;">
                        ${product.weight || 'Standard Pack'}
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto;">
                    <div>
                        <div style="font-size: 17px; font-weight: 900; color: #0f172a;">₹${spNum}</div>
                        ${mrpHtml}
                    </div>
                    <div id="action-${product.id}" style="display: flex; justify-content: flex-end;">${actionHTML}</div>
                </div>
            </div>
        </div>
    `;
    return div;
}
// ==========================================
// 🛒 2. CART LOGIC
// ==========================================

window.addToCart = function (productId) {
    const product = allProducts.find(p => p.id === productId);
    if (product) {
        const existingItem = cart.find(item => item.id === productId);
        let currentQty = existingItem ? existingItem.quantity : 0;

        // 🌟 Limit and Stock Validation
        if (product.stockQty !== undefined && currentQty >= product.stockQty) {
            window.showToast(`Sorry, only ${product.stockQty} items left in stock!`, false);
            return;
        }
        if (product.maxPerOrder && product.maxPerOrder > 0 && currentQty >= product.maxPerOrder) {
            window.showToast(`Limit reached! You can only buy ${product.maxPerOrder} qty per order.`, false);
            return;
        }

        if (existingItem) { existingItem.quantity += 1; }
        else { cart.push({ ...product, quantity: 1 }); }
        updateProductActionUI(productId);
        updateCartUI(true);
    }
}

window.decreaseQuantity = function (productId) {
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex > -1) {
        if (cart[itemIndex].quantity > 1) { cart[itemIndex].quantity -= 1; }
        else { cart.splice(itemIndex, 1); }
        updateProductActionUI(productId);
        updateCartUI(true);
    }
}

window.updateProductActionUI = function (productId) {
    // Ye function ab screen par maujud us product ke sabhi buttons ko dhundh kar update karega
    const actionDivs = document.querySelectorAll(`#action-${productId}, .product-action-ui-${productId}`);
    if (actionDivs.length === 0) return;

    const cartItem = cart.find(item => item.id === productId);

    actionDivs.forEach(div => {
        // Check karte hain ki button Catalog page par hai ya Home page slider mein
        let isCatalog = div.id.startsWith('action-');

        // Catalog aur Home page dono ke alag styles
        let btnStyle = isCatalog ?
            "border: none; color: #fff; background: linear-gradient(135deg, #128c7e, #0f766a); font-weight: 800; border-radius: 8px; padding: 8px 24px; font-size: 13px; cursor: pointer; text-transform: uppercase; box-shadow: 0 4px 10px rgba(18,140,126,0.25); transition: 0.2s;" :
            "width: 100%; border: none; color: #fff; background: linear-gradient(135deg, #128c7e, #0f766a); font-weight: 800; border-radius: 6px; padding: 8px; font-size: 12px; cursor: pointer; text-transform: uppercase;";

        let qtyStyle = isCatalog ?
            "display: flex; align-items: center; border: 1px solid #128c7e; border-radius: 8px; background: #f3fdf6; overflow: hidden; box-shadow: 0 2px 6px rgba(18,140,126,0.15); height: 34px;" :
            "display: flex; align-items: center; justify-content: space-between; border: 1px solid #128c7e; border-radius: 6px; background: #f3fdf6; height: 32px; width: 100%;";

        let html = '';
        if (cartItem) {
            if (isCatalog) {
                // Fixed Pixels for Catalog Page (Taaki chipke nahi)
                html = `<div style="${qtyStyle}">
                    <button onclick="window.decreaseQuantity('${productId}')" style="background:transparent; border:none; color:#128c7e; font-size:18px; font-weight:bold; width:30px; height:100%; cursor:pointer;">-</button>
                    <span style="font-size:14px; font-weight:800; color:#111; width:26px; text-align:center; background:#fff; line-height:34px; border-left:1px solid #128c7e; border-right:1px solid #128c7e;">${cartItem.quantity}</span>
                    <button onclick="window.addToCart('${productId}')" style="background:transparent; border:none; color:#128c7e; font-size:18px; font-weight:bold; width:30px; height:100%; cursor:pointer;">+</button>
                </div>`;
            } else {
                // Percentages for Home Page Tags
                html = `<div style="${qtyStyle}">
                    <button onclick="window.decreaseQuantity('${productId}')" style="background:transparent; border:none; color:#128c7e; font-size:16px; font-weight:bold; width:30%; cursor:pointer;">-</button>
                    <span style="font-size:13px; font-weight:800; color:#111; width:40%; text-align:center; background:#fff; line-height:30px; border-left:1px solid #128c7e; border-right:1px solid #128c7e;">${cartItem.quantity}</span>
                    <button onclick="window.addToCart('${productId}')" style="background:transparent; border:none; color:#128c7e; font-size:16px; font-weight:bold; width:30%; cursor:pointer;">+</button>
                </div>`;
            }
        } else {
            html = `<button style="${btnStyle}" onclick="window.addToCart('${productId}')">ADD</button>`;
        }

        div.innerHTML = html;
    });
}
let lastGiftEligibility = false;



function updateCartUI(showPopup = false) {
    // 🌟 NAYA: Har baar update hone par cart ko phone ki memory me save kar do
    localStorage.setItem('dryfu_cart', JSON.stringify(cart));

    if (typeof window.evaluateCouponNudges === 'function') {
        window.evaluateCouponNudges();
    }

    const cartCount = document.getElementById('cart-count');
    const cartTotal = document.getElementById('cart-total');
    const modalCartTotal = document.getElementById('modal-cart-total');

    // 🌟 NAYA: Bottom Nav Badge Logic
    const navCartBadge = document.getElementById('nav-cart-badge');

    if (cart.length > 0) {
        let totalItems = 0, totalPrice = 0;
        cart.forEach(item => {
            totalItems += item.quantity;
            totalPrice += (parseFloat(item.sellingPrice) * item.quantity);
        });

        if (cartCount) cartCount.innerText = `${totalItems} Items`;
        if (cartTotal) cartTotal.innerText = `₹${totalPrice}`;
        if (modalCartTotal) modalCartTotal.innerText = `₹${totalPrice}`;

        // Naye Red Badge ka number update karna
        if (navCartBadge) {
            navCartBadge.innerText = totalItems;
            navCartBadge.classList.remove('hidden');
            // Item add hone par chhota sa bounce effect
            navCartBadge.classList.add('pop');
            setTimeout(() => navCartBadge.classList.remove('pop'), 300);
        }
    } else {
        // Agar cart khali hai toh badge hata do
        if (navCartBadge) {
            navCartBadge.classList.add('hidden');
        }

        // 👇 NAYA FIX: Puraani "window.closeCart()" wali line ko hatakar ye naya code daalein
        const cartModal = document.getElementById('cart-modal');
        if (cartModal && !cartModal.classList.contains('hidden')) {
            renderCartItems(); // Empty design screen par dikhane ke liye render call karein
        }
    }

    // Puraani niche wali render line aisi hi rahegi:
    const cartModal = document.getElementById('cart-modal');
    if (cartModal && !cartModal.classList.contains('hidden')) { renderCartItems(); }
}

window.openCart = function () {
    document.getElementById('cart-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Basket open hone par 'cart' icon ko green karo
    window.updateNavHighlight('cart');
    renderCartItems();
}

window.closeCart = function () {
    document.getElementById('cart-modal').classList.add('hidden');
    document.body.style.overflow = '';

    // Basket band hone par wapas purane tab ko green karo
    window.updateNavHighlight(localStorage.getItem('dryfu_active_tab') || 'home');
}

function renderCartItems() {
    const container = document.getElementById('cart-items-container');
    const checkoutBar = document.getElementById('cart-checkout-bar');
    container.innerHTML = '';

    if (cart.length === 0) {
        if (checkoutBar) checkoutBar.style.display = 'none';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center;">
                <div style="font-size: 80px; margin-bottom: 10px; opacity: 0.9;">🛍️</div>
                <h2 style="font-size: 20px; color: #111; font-weight: 800; margin-bottom: 8px;">No Items here!</h2>
                <p style="color: #666; font-size: 14px; max-width: 80%; line-height: 1.5; margin-bottom: 25px;">Items will start appearing here once you shop with us.</p>
                <button onclick="window.closeCart(); window.switchTab('catalog');" style="background: #128c7e; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer; box-shadow: 0 4px 10px rgba(18,140,126,0.2);">Browse Products</button>
            </div>
        `;
        return;
    }

    if (checkoutBar) checkoutBar.style.display = 'flex';

    cart.forEach(item => {
        let div = document.createElement('div');
        div.classList.add('cart-item');

        let isGiftOrPromo = item.isFreeGift || item.isPromoGift;

        let qtyControlsHtml = isGiftOrPromo ?
            `<span style="color:#10b981; font-weight:800; font-size:11px; padding: 6px 10px; background: #ecfdf5; border-radius: 6px; border: 1px dashed #10b981;">REWARD</span>` :
            `<div class="qty-controls">
                <button class="btn-qty" onclick="window.decreaseQuantity('${item.id}')">-</button>
                <span class="qty-count">${item.quantity}</span>
                <button class="btn-qty" onclick="window.addToCart('${item.id}')">+</button>
            </div>`;

        div.innerHTML = `
            <img src="${item.img}" alt="img" class="cart-item-img">
            <div class="cart-item-info">
                <div class="cart-item-title" style="${isGiftOrPromo ? 'color:#065f46; font-weight:bold;' : ''}">
                    ${item.name}
                </div>
                <!-- 🌟 NAYA: Weight ko alag div mein properly style kiya hai -->
                <div class="cart-item-weight" style="font-size: 11px; color: #777; font-weight: 600; margin-top: 3px;">
                    Pack Size: ${item.weight || 'Standard Pack'}
                </div>
                <div class="cart-item-price">
                    ${(isGiftOrPromo && item.sellingPrice === 0) ? '<strike style="color:#999; font-size:12px;">₹' + item.mrp + '</strike> <span style="color:#10b981;">FREE</span>' : '₹' + item.sellingPrice}
                </div>
            </div>
            ${qtyControlsHtml}
        `;
        container.appendChild(div);
    });
}
// ==========================================
// 🔐 3. FIREBASE OTP LOGIN & AUTH LOGIC
// ==========================================

let recaptchaWidgetId = null;

window.openLoginModal = function (intent = 'checkout') {
    currentLoginIntent = intent;
    if (loggedInUser) {
        if (intent === 'checkout') { openCheckoutPage(); }
        else { openProfile(); }
        return;
    }
    if (intent === 'checkout' && cart.length === 0) {
        window.showToast("Your cart is empty!", false);
        return;
    }

    resetLoginUI();
    document.getElementById('login-overlay').classList.add('active');

    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible'
        });
        window.recaptchaVerifier.render().then((widgetId) => {
            recaptchaWidgetId = widgetId;
        });
    } else if (recaptchaWidgetId !== null) {
        grecaptcha.reset(recaptchaWidgetId);
    }
}

window.closeLoginModal = function () {
    document.getElementById('login-overlay').classList.remove('active');
}

window.resetLoginUI = function () {
    document.getElementById('step1-phone').style.display = 'block';
    document.getElementById('step2-otp').style.display = 'none';
    document.getElementById('loginHelpText').innerText = "Please enter your 10-digit mobile number.";
    document.getElementById('mobileNumber').value = "";
    document.getElementById('otpInput').value = "";
}

window.sendOTP = function () {
    const mobile = document.getElementById('mobileNumber').value.trim();
    const btn = document.getElementById('sendOtpBtn');

    if (mobile.length !== 10) {
        window.showToast("Please enter a valid 10-digit mobile number", false);
        return;
    }

    btn.innerText = "Sending OTP...";
    btn.disabled = true;

    const phoneNumber = "+91" + mobile;

    signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            document.getElementById('step1-phone').style.display = 'none';
            document.getElementById('step2-otp').style.display = 'block';
            document.getElementById('loginHelpText').innerHTML = `OTP sent to <strong>+91 ${mobile}</strong>`;
            btn.innerText = "Send OTP";
            btn.disabled = false;
        }).catch((error) => {
            console.error("SMS not sent", error);
            window.showToast("SMS not sent: " + error.message, false);
            btn.innerText = "Send OTP";
            btn.disabled = false;
            if (recaptchaWidgetId !== null) {
                try { grecaptcha.reset(recaptchaWidgetId); } catch (e) { }
            }
        });
}

window.verifyOTP = async function () {
    const otpCode = document.getElementById('otpInput').value.trim();
    const btn = document.getElementById('verifyOtpBtn');
    const mobile = document.getElementById('mobileNumber').value.trim();

    if (otpCode.length !== 6) {
        window.showToast("Please enter a valid 6-digit OTP.", false);
        return;
    }

    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        const result = await window.confirmationResult.confirm(otpCode);

        await setDoc(doc(db, "customers", mobile), {
            mobileNumber: mobile,
            lastLogin: new Date().toISOString()
        }, { merge: true });

        loggedInUser = mobile;
        localStorage.setItem('customerMobile', mobile);

        // 🌟 नया: लॉगिन सफल होते ही नोटिफिकेशन की परमिशन माँगना
        if (typeof window.requestNotificationPermission === 'function') {
            window.requestNotificationPermission();
        }

        closeLoginModal();
        btn.innerText = "Verify OTP & Login";
        btn.disabled = false;

        if (currentLoginIntent === 'checkout') {
            openCheckoutPage();
        } else if (currentLoginIntent === 'profile') {
            openProfile();
        }
    } catch (error) {
        console.error("OTP Verification failed", error);
        window.showToast("Invalid OTP! Please enter the correct code.", false);
        btn.innerText = "Verify OTP & Login";
        btn.disabled = false;
    }
}

// ==========================================
// 💳 4. PREMIUM CHECKOUT LOGIC & PROMO CODES
// ==========================================

let checkoutState = {
    selectedAddressIndex: 0,
    paymentMethod: 'COD',
    couponCode: '',
    couponDiscount: 0
};

window.openCheckoutPage = function () {
    closeCart();
    document.getElementById('checkout-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderCheckoutPage();
}

window.closeCheckoutPage = function () {
    document.getElementById('checkout-modal').classList.add('hidden');
    document.body.style.overflow = '';
    openCart();
}
// 🌟 NAYA HELPER FUNCTION: List band karne aur smooth update ke liye
window.selectAddressAndRender = function (idx) {
    checkoutState.selectedAddressIndex = idx;

    // List ko turant close karo
    const addressList = document.getElementById('chk-body-address');
    if (addressList) addressList.classList.remove('active');

    // Page ko bina "Loading..." flash kiye smooth update karo
    window.renderCheckoutPage(true);
}

window.renderCheckoutPage = async function (isSilentUpdate = false) {
    const container = document.getElementById('checkout-content-container');

    // Agar silent update nahi hai, tabhi loading text dikhao
    if (!isSilentUpdate) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Loading Secure Checkout...</p>';
    }

    let savedAddresses = [];
    try {
        const docSnap = await getDoc(doc(db, "customers", loggedInUser));
        if (docSnap.exists() && docSnap.data().addresses) {
            savedAddresses = docSnap.data().addresses;
        }
    } catch (e) { console.error("Error fetching addresses"); }

    let mrpTotal = 0;
    let sellingTotal = 0;
    let totalItems = 0;

    let orderSummaryHtml = '';
    cart.forEach(item => {
        let mrp = parseFloat(item.mrp) || parseFloat(item.sellingPrice);
        let sp = parseFloat(item.sellingPrice);
        mrpTotal += (mrp * item.quantity);
        sellingTotal += (sp * item.quantity);
        totalItems += item.quantity;

        orderSummaryHtml += `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <img src="${item.img}" style="width:50px; height:50px; border-radius:6px; border:1px solid #eee; object-fit:cover;">
                <div style="flex:1;">
                   <div style="font-size:13px; font-weight:600; color:#222;">
    ${item.name} <span style="font-size: 11px; color: #777; font-weight: normal;">(${item.weight || 'Standard'})</span>
</div>
                    <div style="font-size:12px; color:#555;">QTY: ${item.quantity}</div>
                </div>
                <div style="font-weight:700; font-size:14px;">₹${sp * item.quantity}</div>
            </div>
        `;
    });

    let itemDiscount = mrpTotal - sellingTotal;

    // 🌟 Promo Code Integrity Check
    if (checkoutState.couponCode !== '') {
        const appliedCpn = availableCoupons.find(c => c.code === checkoutState.couponCode);
        let eligibleTotal = 0;
        cart.forEach(item => { if (!item.isPromoGift && !item.isFreeGift) eligibleTotal += (parseFloat(item.sellingPrice) * item.quantity); });

        if (!appliedCpn || eligibleTotal < appliedCpn.minOrder) {
            window.removeCoupon(false);
            window.showToast("Cart value dropped below requirement. Promo removed automatically.", false);
        }
    }

    let finalAmount = sellingTotal - checkoutState.couponDiscount;

    let addressHtml = ``;
    let activeAddressDisplay = ``;

    if (savedAddresses.length > 0) {
        if (checkoutState.selectedAddressIndex >= savedAddresses.length) checkoutState.selectedAddressIndex = 0;
        let activeAddr = savedAddresses[checkoutState.selectedAddressIndex];

        if (typeof activeAddr === 'object') {
            activeAddressDisplay = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div style="font-size: 15px; color: #111; font-weight: bold;">Deliver to:</div>
                    <button onclick="toggleChkBody('chk-body-address')" style="background: #fff; border: 1px solid #d1d5db; padding: 6px 16px; border-radius: 4px; color: #2563eb; font-weight: 600; font-size: 13px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">Change</button>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <strong style="font-size: 16px; color: #111;">${activeAddr.fullName}</strong>
                    <span style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; color: #555;">${(activeAddr.type || 'HOME').toUpperCase()}</span>
                </div>
                <div style="font-size: 14px; color: #444; line-height: 1.5; margin-bottom: 10px;">
                    ${activeAddr.building}, ${activeAddr.area}, ${activeAddr.city}, ${activeAddr.state} - ${activeAddr.pincode}
                </div>
                <div style="font-size: 15px; font-weight: 600; color: #111;">
                    ${activeAddr.mobile}
                </div>
            `;
        } else {
            activeAddressDisplay = `<div style="font-size: 14px; color: #444;">${activeAddr}</div>
            <button onclick="toggleChkBody('chk-body-address')" style="margin-top:10px; background: #fff; border: 1px solid #d1d5db; padding: 6px 16px; border-radius: 4px; color: #2563eb; font-weight: 600; font-size: 13px; cursor: pointer;">Change</button>`;
        }

        addressHtml += `<button style="width:100%; padding:10px; margin-bottom:15px; border-radius:6px; background:#fff; border:1px dashed #128c7e; color:#128c7e; font-weight:bold;" onclick="window.openNewAddressModal('checkout')">+ Add New Address</button>`;

        savedAddresses.forEach((addr, idx) => {
            let isChecked = idx === checkoutState.selectedAddressIndex ? 'checked' : '';
            let isSelectedClass = idx === checkoutState.selectedAddressIndex ? 'selected' : '';

            let addrText = typeof addr === 'object' ?
                `<strong style="color:#111;">${addr.fullName}</strong> <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; color: #555; margin-left: 5px;">${(addr.type || 'HOME').toUpperCase()}</span><br><div style="margin-top:4px;">${addr.building}, ${addr.area}, ${addr.city}, ${addr.state} - ${addr.pincode}</div>`
                : addr;

            // 🌟 NAYA FIX: onclick par event.preventDefault() aur naya helper function lagaya gaya hai
            addressHtml += `
                <label class="address-radio-label ${isSelectedClass}" style="position: relative; display: flex; align-items: flex-start; cursor: pointer;" onclick="event.preventDefault(); window.selectAddressAndRender(${idx});">
                    <div style="flex: 1;">
                        <div style="font-size:13px; color:#444; line-height:1.4;">${addrText}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; height: 100%;">
                        <input type="radio" name="addressSelect" class="radio-custom" ${isChecked} style="pointer-events: none;">
                        <span style="color:#2563eb; font-size:12px; font-weight:600; cursor:pointer; margin-top: 15px; padding: 4px;" onclick="event.stopPropagation(); window.editAddress(${idx}, 'checkout')">✏️ Edit</span>
                    </div>
                </label>
            `;
        });
    }

    // 🌟 नया फिक्स: एक्सपायर हो चुके कूपन को हटाकर सिर्फ वैलिड कूपन गिनें
    let validCouponsForCount = availableCoupons.filter(c => {
        if (c.expiryDate) {
            // आज की तारीख (रात 12 बजे) से एक्सपायरी डेट को मैच करें
            return new Date(c.expiryDate) >= new Date(new Date().setHours(0, 0, 0, 0));
        }
        return true;
    });

    let offerHeaderText = '';
    if (checkoutState.couponCode !== '') {
        offerHeaderText = `<span style="color:#10b981;">'${checkoutState.couponCode}' Applied ✅</span>`;
    } else if (validCouponsForCount.length > 0) {
        let plural = validCouponsForCount.length > 1 ? 's' : '';
        // availableCoupons.length की जगह validCouponsForCount.length का इस्तेमाल
        offerHeaderText = `${validCouponsForCount.length} Offer${plural} available ➔`;
    } else {
        offerHeaderText = '<span style="color:#999;">No offers ➔</span>';
    }

    container.innerHTML = `
        <div style="background: #fff; border-radius: 10px; margin-bottom: 12px; border: 1px solid #eef0f2; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            ${savedAddresses.length > 0 ? activeAddressDisplay : `
                <div style="text-align:center; padding:10px;">
                    <p style="font-size:14px; color:#666; margin-bottom:12px;">No delivery address found.</p>
                    <button class="btn-checkout" onclick="window.openNewAddressModal('checkout')">+ Add Delivery Address</button>
                </div>
            `}
            <div class="chk-body" id="chk-body-address" style="border-top: 1px dashed #eee; margin-top: 15px; padding-top: 15px;">
                ${savedAddresses.length > 0 ? addressHtml : ''}
            </div>
        </div>

        <div class="chk-section">
            <div class="chk-header" onclick="toggleChkBody('chk-body-summary')">
                <div class="chk-header-left"><span class="chk-header-icon">👜</span> Order Summary</div>
                <div class="chk-header-right">${totalItems} Items ⌄</div>
            </div>
            <div class="chk-body" id="chk-body-summary">${orderSummaryHtml}</div>
        </div>

        <div class="chk-section">
            <div class="chk-header" onclick="toggleChkBody('chk-body-coupon')">
                <div class="chk-header-left"><span class="chk-header-icon">🏷️</span> Apply Promo Code</div>
                <div class="chk-header-right" style="color: #128c7e; font-weight: bold;">${offerHeaderText}</div>
            </div>
            <div class="chk-body" id="chk-body-coupon">
                <div class="coupon-input-box" style="margin-bottom: 15px;">
                    <input type="text" id="coupon-input" placeholder="Enter Coupon Code" value="${checkoutState.couponCode}" style="flex:1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; text-transform: uppercase;">
                    <button onclick="applyManualCoupon()" style="background: #128c7e; color: white; border: none; padding: 0 15px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-left:10px;">APPLY</button>
                </div>
                
                <div id="applied-coupon-msg" style="display: ${checkoutState.couponCode !== '' ? 'block' : 'none'}; color: #10b981; font-weight: bold; font-size: 13px; margin-bottom: 10px; background: #ecfdf5; padding: 10px; border-radius: 6px; border: 1px dashed #10b981;">
                    ✅ '${checkoutState.couponCode}' applied. ${checkoutState.couponDiscount > 0 ? `You saved ₹${Math.round(checkoutState.couponDiscount)}!` : 'Reward added to your cart!'} 
                    <span onclick="window.removeCoupon()" style="color: #dc3545; cursor: pointer; text-decoration: underline; margin-left: 10px; float: right;">Remove</span>
                </div>
                
                <div id="available-coupons-list" style="display: ${checkoutState.couponCode !== '' ? 'none' : 'flex'}; flex-direction: column; gap: 10px;">
                </div>
            </div>
        </div>

        <div class="chk-section">
            <div class="chk-header" onclick="toggleChkBody('chk-body-price')">
                <div class="chk-header-left"><span class="chk-header-icon">₹</span> Price Details</div>
                <div class="chk-header-right" style="color:#111; font-weight:800;">₹${finalAmount} ⌄</div>
            </div>
            <div class="chk-body active" id="chk-body-price">
                <div class="price-row"><span>Items Total</span><span>₹${mrpTotal}</span></div>
                <div class="price-row discount"><span>Discount</span><span>-₹${itemDiscount}</span></div>
                <div class="price-row discount" style="display: ${checkoutState.couponDiscount > 0 ? 'flex' : 'none'};"><span>Coupon Discount</span><span>-₹${checkoutState.couponDiscount}</span></div>
                <div class="price-row"><span>Shipping</span><span><span style="color:#1e8354">FREE</span></span></div>
                <div class="price-row total"><span>Total Amount</span><span>₹${finalAmount}</span></div>
            </div>
        </div>

       <div class="chk-section">
            <div class="chk-header" onclick="toggleChkBody('chk-body-payment')">
                <div class="chk-header-left"><span class="chk-header-icon">💳</span> Payment Method</div>
                <div class="chk-header-right">${checkoutState.paymentMethod} ⌄</div>
            </div>
            <div class="chk-body active" id="chk-body-payment">
                <label class="address-radio-label ${checkoutState.paymentMethod === 'COD' ? 'selected' : ''}" onclick="checkoutState.paymentMethod='COD'; window.renderCheckoutPage(true);">
                    <div><strong style="color:#111; font-size:14px;">🚚 Cash on delivery</strong><br><span style="color:#666; font-size:12px;">Pay with cash</span></div>
                    <input type="radio" name="paySelect" class="radio-custom" ${checkoutState.paymentMethod === 'COD' ? 'checked' : ''} style="pointer-events: none;">
                </label>
            </div>
        </div>
    `;

    setTimeout(() => { window.renderAvailableCoupons(); }, 100);
}

window.toggleChkBody = function (id) {
    const el = document.getElementById(id);
    if (el.classList.contains('active')) el.classList.remove('active');
    else el.classList.add('active');
}


window.renderAvailableCoupons = function () {
    const list = document.getElementById('available-coupons-list');
    if (!list) return;
    list.innerHTML = '';

    let eligibleTotal = 0;
    cart.forEach(item => { if (!item.isPromoGift && !item.isFreeGift) eligibleTotal += (parseFloat(item.sellingPrice) * item.quantity); });

    // 🌟 Sirf Valid (Non-Expired) Coupons Customer ko dikhayenge
    let validCoupons = availableCoupons.filter(c => {
        if (c.expiryDate) {
            return new Date(c.expiryDate) >= new Date(new Date().setHours(0, 0, 0, 0));
        }
        return true;
    });

    if (validCoupons.length === 0) {
        list.innerHTML = '<p style="font-size: 13px; color: #777; text-align: center;">No offers available right now.</p>';
        return;
    }

    validCoupons.forEach(c => {
        let isEligible = eligibleTotal >= c.minOrder;

        let discountText = '';
        if (c.type === 'FLAT') discountText = `₹${c.details ? c.details.discountValue : c.value} OFF`;
        else if (c.type === 'PERCENT') discountText = `${c.details ? c.details.discountPercent : c.value}% OFF`;
        else if (c.type === 'FREE_GIFT') discountText = `🎁 Free Gift Included`;
        else if (c.type === 'FREE_CHOICE') discountText = `🎁 Choose 1 Free Item`;
        else if (c.type === 'DISCOUNTED_CHOICE') discountText = `🔥 Special Discounted Item`;

        list.innerHTML += `
            <div style="border: 1px dashed ${isEligible ? '#128c7e' : '#ccc'}; padding: 12px; border-radius: 6px; background: ${isEligible ? '#f0fdf4' : '#f9f9f9'}; opacity: ${isEligible ? '1' : '0.6'}; transition: 0.3s; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #111; font-size: 15px;">${c.code}</strong>
                    ${isEligible
                ? `<button onclick="window.applyCoupon('${c.code}')" style="background: transparent; border: 1px solid #128c7e; color: #128c7e; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">APPLY</button>`
                : `<span style="font-size: 11px; color: #e11d48; font-weight: bold;">Add ₹${c.minOrder - eligibleTotal} more</span>`
            }
                </div>
                <div style="font-size: 12px; color: #555; margin-top: 4px;">${discountText} on orders above ₹${c.minOrder}</div>
            </div>
        `;
    });
}
window.applyManualCoupon = function () {
    const code = document.getElementById('coupon-input').value.toUpperCase().trim();
    if (!code) return;
    window.applyCoupon(code);
}

// ==========================================
// 🎟️ ADVANCE PROMO CODE & REWARD LOGIC
// ==========================================

// Cart Nudge Logic (Update Cart UI me call hoga)
window.evaluateCouponNudges = function () {
    const banner = document.getElementById('cart-gift-banner');
    if (!banner) return;
    banner.style.display = 'none';

    // 👇 NAYA FIX: Agar cart khali hai toh coupon ka hisab mat lagao, yahi se wapas jao
    if (cart.length === 0) return;

    let eligibleTotal = 0;
    cart.forEach(item => { if (!item.isPromoGift && !item.isFreeGift) eligibleTotal += (parseFloat(item.sellingPrice) * item.quantity); });

    // Find upcoming coupons that have a nudge message
    let upcomingCoupons = availableCoupons.filter(c => c.minOrder > eligibleTotal && c.nudgeMsg);
    upcomingCoupons.sort((a, b) => a.minOrder - b.minOrder);

    if (upcomingCoupons.length > 0) {
        let targetCoupon = upcomingCoupons[0];
        let remaining = targetCoupon.minOrder - eligibleTotal;
        let msg = targetCoupon.nudgeMsg.replace('{amount}', remaining);
        banner.innerHTML = `🌟 ${msg}`;
        banner.style.display = 'block';
    }
}
// Update `updateCartUI` function to use new Nudge system
// Find `evaluateFreeGift(showPopup);` inside updateCartUI and REPLACE it with:
// window.evaluateCouponNudges();

window.applyCoupon = function (code) {
    const coupon = availableCoupons.find(c => c.code === code);
    if (!coupon) { window.showToast("Invalid Promo Code!", false); return; }

    // 🌟 BUG FIX: Naya coupon process karne se pehle, purana coupon aur uske free items cart se hata do
    window.removeCoupon(false);

    let eligibleTotal = 0;
    cart.forEach(item => { if (!item.isPromoGift && !item.isFreeGift) eligibleTotal += (parseFloat(item.sellingPrice) * item.quantity); });

    if (eligibleTotal < coupon.minOrder) {
        window.showToast(`This coupon requires a minimum order of ₹${coupon.minOrder}`, false);
        return;
    }

    if (coupon.type === 'FLAT' || coupon.type === 'PERCENT') {
        let discount = 0;
        if (coupon.type === 'FLAT') discount = coupon.details.discountValue;
        else if (coupon.type === 'PERCENT') {
            discount = (eligibleTotal * coupon.details.discountPercent) / 100;
            if (discount > coupon.details.maxDiscount) discount = coupon.details.maxDiscount;
        }
        if (discount > eligibleTotal) discount = eligibleTotal;

        checkoutState.couponCode = coupon.code;
        checkoutState.couponDiscount = discount;
        renderCheckoutPage();


        // NAYA VISUAL EFFECT
        window.showCelebration("WOOHOO! 🥳", `You just saved ₹${Math.round(discount)} on this order!`);
    }
    else if (coupon.type === 'FREE_GIFT') {
        window.addPromoItemToCart(coupon.details.productId, 0, coupon.code);
    }
    else if (coupon.type === 'FREE_CHOICE' || coupon.type === 'DISCOUNTED_CHOICE') {
        window.openPromoChoiceModal(coupon);
    }
}

window.openPromoChoiceModal = function (coupon) {
    document.getElementById('activePromoCodeSelected').value = coupon.code;
    document.getElementById('activePromoCodeType').value = coupon.type;
    const list = document.getElementById('promoChoiceList');
    list.innerHTML = '';

    document.getElementById('promoChoiceTitle').innerText = coupon.type === 'FREE_CHOICE' ? '🎁 Select Your Free Gift' : '🔥 Select Discounted Item';

    let itemsToRender = coupon.type === 'FREE_CHOICE' ? coupon.details.productIds : coupon.details.discountedItems;

    itemsToRender.forEach((item, index) => {
        let productId = coupon.type === 'FREE_CHOICE' ? item : item.productId;
        let specialPrice = coupon.type === 'FREE_CHOICE' ? 0 : item.offerPrice;
        let productData = allProducts.find(p => p.id === productId);

        if (productData) {
            let isChecked = index === 0 ? 'checked' : '';
            list.innerHTML += `
                <label style="display:flex; align-items:center; background:#fff; padding:12px; border-radius:8px; border:1px solid ${isChecked ? '#128c7e' : '#ddd'}; cursor:pointer; gap:10px;">
                    <input type="radio" name="promoChoiceRadio" value="${productId}" data-price="${specialPrice}" style="accent-color:#128c7e; width:18px; height:18px;" ${isChecked}>
                    <img src="${productData.img}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-size:14px; font-weight:bold; color:#111;">${productData.name}</div>
                        <div style="font-size:13px; color:#128c7e; font-weight:bold;">${specialPrice === 0 ? 'FREE' : 'Special Price: ₹' + specialPrice} <strike style="color:#999; font-size:11px; font-weight:normal;">₹${productData.sellingPrice}</strike></div>
                    </div>
                </label>
            `;
        }
    });

    document.getElementById('promo-choice-overlay').classList.add('active');
}

window.confirmPromoChoice = function () {
    const selectedRadio = document.querySelector('input[name="promoChoiceRadio"]:checked');
    if (!selectedRadio) { window.showToast("Please select an item!"); return; }

    const productId = selectedRadio.value;
    const specialPrice = Number(selectedRadio.getAttribute('data-price'));
    const code = document.getElementById('activePromoCodeSelected').value;

    closePromoChoiceModal();
    window.addPromoItemToCart(productId, specialPrice, code);
}

window.addPromoItemToCart = function (productId, specialPrice, promoCode) {
    // Agar pehle se koi code laga hai, usko hatai
    window.removeCoupon(false);

    const product = allProducts.find(p => p.id === productId);
    if (product) {
        cart.push({
            ...product,
            id: product.id + "_PROMO",
            originalId: product.id,
            quantity: 1,
            sellingPrice: specialPrice,
            isPromoGift: true,
            appliedPromoCode: promoCode,
            name: `🎁 [PROMO] ${product.name}`
        });

        checkoutState.couponCode = promoCode;
        checkoutState.couponDiscount = 0; // Kyunki discount item ke rate me adjustment karke diya hai
        renderCheckoutPage();
        updateCartUI(false);


        // NAYA VISUAL EFFECT
        let subtitleText = specialPrice === 0 ? "You got a FREE ITEM added to your cart! 🎁" : "You unlocked a Special Discounted Item! 🔥";
        window.showCelebration("AWESOME! 🎉", subtitleText);
    }
}

window.removeCoupon = function (renderUI = true) {
    checkoutState.couponCode = '';
    checkoutState.couponDiscount = 0;
    // Cart me se saare isPromoGift wale items uda do
    cart = cart.filter(item => !item.isPromoGift);
    if (renderUI) {
        renderCheckoutPage();
        updateCartUI(false);
    }
}

// 🛒 Order Finalize Function
window.finalizeOrder = async function () {
    if (cart.length === 0) return;

    const btn = document.querySelector('.checkout-modal .btn-checkout') || document.querySelector('.btn-full');
    btn.innerText = "Processing..."; btn.disabled = true;

    try {
        const docSnap = await getDoc(doc(db, "customers", loggedInUser));
        let selectedAddress = null;
        if (docSnap.exists() && docSnap.data().addresses && docSnap.data().addresses.length > 0) {
            selectedAddress = docSnap.data().addresses[checkoutState.selectedAddressIndex];
        }

        if (!selectedAddress) {
            window.showToast("Please add a delivery address before proceeding.", false);
            btn.innerText = "Proceed to pay"; btn.disabled = false;
            return;
        }

        let sellingTotal = 0;
        cart.forEach(item => { sellingTotal += (parseFloat(item.sellingPrice) * item.quantity); });
        let finalGrandTotal = sellingTotal - checkoutState.couponDiscount;

        // 🌟 NAYA: Counter Logic (Total Orders count karke DF-100X banana)
        const orderCountSnap = await getCountFromServer(collection(db, "orders"));
        const nextOrderNum = 1000 + orderCountSnap.data().count + 1; // 1001 se start hoga
        const generatedOrderId = "DF-" + nextOrderNum;

        const orderData = {
            displayOrderId: generatedOrderId, // 🌟 NAYA: Database me custom ID save kar rahe hain
            customerMobile: loggedInUser,
            deliveryAddress: selectedAddress,
            items: cart,
            totalAmount: finalGrandTotal,
            couponApplied: checkoutState.couponCode || 'None',
            paymentMethod: checkoutState.paymentMethod,
            status: "New",
            orderDate: new Date().toISOString()
        };

        // 1. Order database me save hua
        const newOrderRef = await addDoc(collection(db, "orders"), orderData);
        const shortOrderId = generatedOrderId;

        // 🌟 2. NAYA: ATOMIC STOCK DEDUCTION LOGIC
        for (let item of cart) {
            if (item.isFreeGift) continue; // Free gift ka stock track nahi kar rahe
            try {
                const pRef = doc(db, "products", item.id);
                // Server ko sidha minus karne ka command
                await updateDoc(pRef, {
                    stockQty: increment(-item.quantity)
                });
            } catch (e) { console.error("Stock update failed", e); }
        }

        // 3. Cart khali karein aur modal band karein
        cart = [];
        updateCartUI();
        closeCheckoutPage();
        checkoutState = { selectedAddressIndex: 0, paymentMethod: 'COD', couponCode: '', couponDiscount: 0 };

        document.getElementById('success-order-id').innerText = shortOrderId;
        document.getElementById('order-success-modal').style.display = 'flex';

        btn.innerText = "Proceed to pay"; btn.disabled = false;

    } catch (error) {
        window.showToast("Order error: " + error.message, false);
        btn.innerText = "Proceed to pay"; btn.disabled = false;
    }
}

window.closeSuccessModal = function () {
    document.getElementById('order-success-modal').style.display = 'none';
}

window.closeSuccessAndOpenProfile = function () {
    document.getElementById('order-success-modal').style.display = 'none';
    openProfile();
    setTimeout(() => { renderMyOrders(); }, 300);
}

// ==========================================
// 👤 5. PROFILE SECTION LOGIC
// ==========================================

let currentProfileScreen = 'home';
let currentCustomerOrders = [];
let currentSavedAddresses = [];

window.openProfile = function () {
    document.getElementById('profile-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // 👇 Profile open hone par 'profile' icon ko green karo
    window.updateNavHighlight('profile');
    renderProfileHome();
}

window.closeProfile = function () {
    document.getElementById('profile-modal').classList.add('hidden');
    document.body.style.overflow = '';

    // 👇 Profile band hone par wapas purane tab ko green karo
    window.updateNavHighlight(localStorage.getItem('dryfu_active_tab') || 'home');
}

window.handleProfileBack = function () {
    if (currentProfileScreen === 'home') { closeProfile(); }
    else { renderProfileHome(); }
}

window.logoutUser = function () {
    loggedInUser = null;
    localStorage.removeItem('customerMobile');
    closeProfile();
    window.showToast("Logged out successfully", true);
}

window.renderProfileHome = function () {
    currentProfileScreen = 'home';
    document.getElementById('profile-title').innerText = "My Account";
    const container = document.getElementById('profile-content-container');
    let displayPhone = loggedInUser ? `+91 ${loggedInUser}` : 'Not Logged In';

    // 🌟 नया लॉजिक: चेक करें कि यूज़र लॉग इन है या नहीं
    let authBtnHTML = "";
    if (loggedInUser) {
        authBtnHTML = `<div class="logout-btn-card" onclick="logoutUser()" style="color: #dc3545;">Logout from DRYFU</div>`;
    } else {
        authBtnHTML = `<div class="logout-btn-card" onclick="openLoginModal('profile')" style="color: #128c7e;">Login / Sign Up</div>`;
    }

    // 🌟 एक और सुधार: अगर यूज़र लॉग इन नहीं है और 'My Orders' पर क्लिक करता है, तो उसे पहले Login का पॉपअप दिखेगा।
    let ordersAction = loggedInUser ? 'renderMyOrders()' : "openLoginModal('profile')";
    let addressAction = loggedInUser ? 'renderMyAddresses()' : "openLoginModal('profile')";

    container.innerHTML = `
        <div class="user-info-card">
            <div class="user-info-text">
                <h3>Hi! ${loggedInUser ? 'User' : 'Guest'}</h3>
                <p>${displayPhone}</p>
            </div>
            <div class="user-avatar">👤</div>
        </div>
        
        <div class="profile-menu">
            <div class="profile-menu-item" onclick="${ordersAction}">
                <div class="menu-item-left"><span class="menu-icon">📦</span> My Orders</div>
                <div class="menu-arrow">›</div>
            </div>
            <div class="profile-menu-item" onclick="${addressAction}">
                <div class="menu-item-left"><span class="menu-icon">📍</span> Address Book</div>
                <div class="menu-arrow">›</div>
            </div>
            <div class="profile-menu-item" onclick="window.showToast('Help & Support coming soon!', true)">
                <div class="menu-item-left"><span class="menu-icon">🎧</span> Help & Support</div>
                <div class="menu-arrow">›</div>
            </div>
        </div>
        
        ${authBtnHTML}
    `;
}

let unsubscribeOrders = null;

window.renderMyOrders = function () {
    currentProfileScreen = 'orders';
    document.getElementById('profile-title').innerText = "Your Orders";
    const container = document.getElementById('profile-content-container');
    container.innerHTML = '<p style="text-align:center; padding: 30px;">Loading your orders...</p>';

    try {
        const q = query(collection(db, "orders"), where("customerMobile", "==", loggedInUser));

        if (unsubscribeOrders) {
            unsubscribeOrders();
        }

        unsubscribeOrders = onSnapshot(q, (querySnapshot) => {
            if (querySnapshot.empty) {
                if (currentProfileScreen === 'orders') {
                    container.innerHTML = '<p style="text-align:center; padding: 30px; color:#777;">No orders found yet.</p>';
                }
                return;
            }

            currentCustomerOrders = [];
            querySnapshot.forEach(doc => currentCustomerOrders.push({ id: doc.id, ...doc.data() }));
            currentCustomerOrders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

            let html = '';
            currentCustomerOrders.forEach(order => {
                let totalItems = 0;
                if (order.items) { order.items.forEach(i => totalItems += i.quantity); }

                let dateObj = new Date(order.orderDate);
                let dateStr = dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                let timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                let shortOrderId = order.displayOrderId || ("ORD" + order.id.substring(0, 6).toUpperCase());

                let itemsListHtml = '';
                if (order.items && order.items.length > 0) {
                    order.items.forEach(item => {
                        let itemRowTotal = parseFloat(item.sellingPrice) * item.quantity;
                        itemsListHtml += `
                            <div class="hist-item-row">
                                <div class="hist-item-left">
                                    <img src="${item.img}" class="hist-item-img" alt="img">
                                    <div>
                                        <div class="hist-item-name">
    ${item.name} <span style="font-size: 11px; color: #777; font-weight: normal;">(${item.weight || 'Standard'})</span>
</div>
                                        <div class="hist-item-qty-price">₹${item.sellingPrice} x ${item.quantity}</div>
                                    </div>
                                </div>
                                <div class="hist-item-total">₹${itemRowTotal}</div>
                            </div>
                        `;
                    });
                }

                let cancelBtnHtml = '';
                if (order.status === 'New' || order.status === 'Processing') {
                    cancelBtnHtml = `
                        <div style="margin-top: 10px;">
                            <span style="color:#dc3545; font-size:12px; font-weight:bold; cursor:pointer;" onclick="window.cancelOrder('${order.id}')">❌ Cancel Order</span>
                        </div>
                    `;
                }

                html += `
                    <div class="order-card">
                        <div class="order-top">
                            <div class="order-details-left">
                                <h4>Order Id: ${shortOrderId}</h4>
                                <p>Total Amount: ₹${order.totalAmount}.00</p>
                                <p>Total Items: ${totalItems}</p>
                            </div>
                            <div class="order-details-right">
                                <span>Placed On</span>
                                <div class="date">${dateStr} @<br>${timeStr}</div>
                            </div>
                        </div>
                        <div class="dotted-divider"></div>
                        <div class="order-bottom">
                            <div>
                                <span class="status-badge ${order.status}">${order.status}</span>
                                ${cancelBtnHtml}
                            </div>
                            <span class="view-details" style="cursor:pointer;" onclick="window.toggleOrderDetails('${order.id}', this)">View Details ↓</span>
                        </div>
                        <div id="details-${order.id}" class="order-items-details" style="display: none;">
                            ${itemsListHtml}
                            <button class="btn-reorder-all" onclick="window.reorderItems('${order.id}')">
                                🔁 Repeat Order / Add Items to Cart
                            </button>
                        </div>
                    </div>
                `;
            });

            if (currentProfileScreen === 'orders') {
                container.innerHTML = html;
            }
        });
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load orders.</p>';
    }
}

window.cancelOrder = async function (orderId) {
    if (confirm("Are you sure you want to cancel this order?")) {
        try {
            await updateDoc(doc(db, "orders", orderId), {
                status: "Cancelled"
            });
            window.showToast("Order cancelled successfully!", true);
        } catch (error) {
            window.showToast("Error cancelling order: " + error.message, false)
        }
    }
}

window.toggleOrderDetails = function (orderId, element) {
    const detailsDiv = document.getElementById(`details-${orderId}`);
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        element.innerText = 'Hide Details ↑';
    } else {
        detailsDiv.style.display = 'none';
        element.innerText = 'View Details ↓';
    }
}

window.reorderItems = function (orderId) {
    const order = currentCustomerOrders.find(o => o.id === orderId);
    if (order && order.items) {
        order.items.forEach(histItem => {
            const existingItem = cart.find(item => item.id === histItem.id);
            if (existingItem) { existingItem.quantity += histItem.quantity; }
            else { cart.push({ ...histItem }); }
            updateProductActionUI(histItem.id);
        });
        updateCartUI();
        closeProfile();
        openCart();
    }
}

// ==========================================
// 📍 ADDRESS BOOK LOGIC
// ==========================================

window.renderMyAddresses = async function () {
    currentProfileScreen = 'addresses';
    document.getElementById('profile-title').innerText = "Address Book";

    const container = document.getElementById('profile-content-container');
    container.innerHTML = '<p style="text-align:center; padding: 30px;">Loading your addresses...</p>';

    try {
        const docRef = doc(db, "customers", loggedInUser);
        const docSnap = await getDoc(docRef);

        let html = `<div class="add-new-addr-btn" onclick="window.openNewAddressModal('profile')">+ Add New Address</div>`;

        if (docSnap.exists() && docSnap.data().addresses && docSnap.data().addresses.length > 0) {
            currentSavedAddresses = docSnap.data().addresses;

            currentSavedAddresses.forEach((addr, idx) => {
                let displayFull = "";
                let displayTag = "HOME";

                if (typeof addr === 'string') {
                    displayFull = addr;
                } else {
                    displayFull = `<strong>${addr.fullName}</strong><br>${addr.building}, ${addr.area}<br>${addr.city}, ${addr.state} - <strong>${addr.pincode}</strong>`;
                    displayTag = addr.type ? addr.type.toUpperCase() : "HOME";
                }

                html += `
                    <div class="address-card">
                        <div class="addr-header">
                            <span class="addr-name">Address ${idx + 1} ${idx === 0 ? '(Default)' : ''}</span>
                            <span class="addr-tag">${displayTag}</span>
                        </div>
                        <div class="addr-full">${displayFull}</div>
                        <div class="addr-mobile">Mobile No: ${loggedInUser}</div>
                        <div class="addr-actions">
                            <span style="color:#128c7e; margin-right: 20px; cursor:pointer;" onclick="window.editAddress(${idx}, 'profile')">✏️ Edit</span>
                            <span style="color:#dc3545; cursor:pointer;" onclick="window.deleteAddress(${idx})">🗑️ Delete</span>
                        </div>
                    </div>
                `;
            });
        } else {
            currentSavedAddresses = [];
            html += '<p style="text-align:center; font-size:14px; color:#777; margin-top:30px;">No saved addresses found.</p>';
        }
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load addresses.</p>';
    }
}

// ==========================================
// 🌐 6. PREMIUM 2-STEP ADDRESS MODAL (MAP + FORM)
// ==========================================

let addressModalSource = 'profile';
let addressMap = null;

function injectGlobalAddressModal() {
    if (document.getElementById('new-address-overlay')) return;
    const modalHtml = `
        <div id="new-address-overlay" class="address-overlay" style="z-index: 3500; display: none;">
            
            <div class="address-box-modal" id="addr-step-1" style="height: 90vh; padding: 0; display: flex; flex-direction: column; width: 100%; max-width: 480px; border-radius: 20px 20px 0 0; background: #fff;">
                <div style="padding: 15px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #eee; background: #fff; border-radius: 20px 20px 0 0;">
                    <span onclick="closeNewAddressForm()" style="font-size: 24px; cursor:pointer; font-weight: bold;">←</span>
                    <h3 style="font-size: 18px; color: #111;">Add new address</h3>
                </div>
                
                <div id="map-container" style="flex: 1; background: #e0e0e0; position: relative; overflow: hidden;">
                    <div id="map-body" style="width: 100%; height: 100%; z-index: 1;"></div>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); z-index: 1000; pointer-events: none;">
                        <span style="font-size: 45px; filter: drop-shadow(0px 5px 4px rgba(0,0,0,0.3));">📍</span>
                    </div>
                    <button onclick="window.useCurrentLocationOnMap()" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fff; border: 1px solid #ddd; padding: 10px 20px; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-weight: bold; color: #2563eb; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        🎯 Use current location
                    </button>
                </div>
                
                <div style="padding: 20px; background: #fff; border-top: 1px solid #eee; border-radius: 20px 20px 0 0; margin-top: -15px; z-index: 1001; position: relative; box-shadow: 0 -4px 10px rgba(0,0,0,0.05);">
                    <h4 style="margin-bottom: 15px; font-size: 15px; color: #555;">Deliver To</h4>
                    <div style="display: flex; gap: 15px; align-items: flex-start; margin-bottom: 20px;">
                        <span style="font-size: 24px;">📍</span>
                        <div>
                            <h4 id="map-area-name" style="font-size: 16px; margin-bottom: 4px; color: #111;">Fetching location...</h4>
                            <p id="map-full-address" style="font-size: 13px; color: #666; line-height: 1.4;">Move the map to select delivery location.</p>
                        </div>
                    </div>
                    <button onclick="window.goToAddressDetails()" style="width: 100%; background: #2563eb; color: white; padding: 14px; border: none; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer;">Enter Complete Address</button>
                </div>
            </div>

            <div class="address-box-modal" id="addr-step-2" style="display: none; padding: 20px; max-height: 90vh; overflow-y: auto; width: 100%; max-width: 480px; border-radius: 20px 20px 0 0; background: #fff;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="font-size: 20px; font-weight: 700;">Complete Address</h3>
                    <span class="close-btn" onclick="closeNewAddressForm()" style="font-size: 28px; cursor: pointer; color: #888;">&times;</span>
                </div>

                <input type="hidden" id="editAddressIdx" value="">
                <input type="hidden" id="addrLat" value="">
                <input type="hidden" id="addrLng" value="">

                <div class="form-group" style="margin-bottom: 15px;">
                    <input type="text" id="addrBuilding" class="addr-input" placeholder="Flat / House no. / Building name *" required style="border: 1px solid #2563eb;">
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <input type="text" id="addrLandmark" class="addr-input" placeholder="Nearby Landmark (Optional)">
                </div>

                <div style="background: #f4f6f8; padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <label style="font-size: 11px; color: #888; font-weight: bold;">AREA / LOCALITY (FROM MAP)</label>
                        <span onclick="window.backToMap()" style="color: #2563eb; font-size: 12px; font-weight: bold; cursor: pointer;">Change on Map</span>
                    </div>
                    <textarea id="display-selected-area" class="addr-input" style="padding: 10px; background: #fff; margin-bottom: 0; font-size: 14px;" rows="2" required></textarea>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <input type="text" id="addrFullName" class="addr-input" placeholder="Receiver's full name *" required>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <input type="tel" id="addrMobile" class="addr-input" placeholder="10-digit mobile number *" pattern="[0-9]{10}" required>
                </div>

                <div class="addr-type-section" style="margin-bottom: 20px;">
                    <label style="font-size: 13px; color: #666; display: block; margin-bottom: 8px; font-weight: bold;">Save address as</label>
                    <div class="addr-type-chips">
                        <button class="type-chip active" onclick="selectAddrType('Home', this)" style="display: flex; align-items: center; gap: 5px;">🏠 Home</button>
                        <button class="type-chip" onclick="selectAddrType('Work', this)" style="display: flex; align-items: center; gap: 5px;">🏢 Work</button>
                    </div>
                    <input type="hidden" id="addrTypeSelected" value="Home">
                </div>

                <button id="addrSubmitBtn" class="btn-save-address" onclick="saveNewAddress()" style="background: #2563eb;">Save address</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}


injectGlobalAddressModal();

// 📍 NAYA MAP LOGIC (Fixed Pin Style)
window.initAddressMap = function (lat = 26.9124, lng = 75.7873) {
    if (typeof L === 'undefined') {
        window.showToast("Map is loading, please wait...", false);
        return;
    }

    if (!addressMap) {
        // Zoom level 17 kiya hai taaki road/gali saaf dikhe aur location exact aaye
        addressMap = L.map('map-body', { zoomControl: false }).setView([lat, lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(addressMap);

        // Marker hata diya hai, uski jagah map hilaane (move) par center nikal rahe hain
        addressMap.on('moveend', function () {
            const center = addressMap.getCenter();
            fetchAddressFromCoords(center.lat, center.lng);
        });
    } else {
        addressMap.setView([lat, lng], 17);
    }
    fetchAddressFromCoords(lat, lng);
    setTimeout(() => addressMap.invalidateSize(), 300);
}

window.fetchAddressFromCoords = async function (lat, lng) {
    document.getElementById('addrLat').value = lat;
    document.getElementById('addrLng').value = lng;
    document.getElementById('map-area-name').innerText = "Fetching...";
    document.getElementById('map-full-address').innerText = "Locating your dropped pin...";

    try {
        // NAYA: Headers mein application name add kiya taaki API block na kare
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`, {
            headers: {
                "Accept-Language": "en",
                "User-Agent": "DRYFU-App/1.0"
            }
        });
        const data = await response.json();

        if (data && data.address) {
            const addr = data.address;
            let exactLocation = data.name || addr.shop || addr.building || addr.amenity || addr.road || addr.neighbourhood || addr.suburb || "Selected Location";

            if (exactLocation.length > 30 && exactLocation.includes(',')) exactLocation = exactLocation.split(',')[0];

            let addressParts = [];
            if (addr.road && exactLocation !== addr.road) addressParts.push(addr.road);
            if (addr.neighbourhood && exactLocation !== addr.neighbourhood) addressParts.push(addr.neighbourhood);
            if (addr.suburb && exactLocation !== addr.suburb) addressParts.push(addr.suburb);
            if (addr.city || addr.city_district) addressParts.push(addr.city || addr.city_district);
            if (addr.state) addressParts.push(addr.state);
            if (addr.postcode) addressParts.push(addr.postcode);

            let cleanParts = [...new Set(addressParts)];
            let fullAddr = cleanParts.join(', ');

            if (!fullAddr) fullAddr = data.display_name;

            document.getElementById('map-area-name').innerText = exactLocation;
            document.getElementById('map-full-address').innerText = fullAddr;
            document.getElementById('display-selected-area').value = exactLocation + ", " + fullAddr;
        }
    } catch (e) {
        // Fallback incase API fails
        document.getElementById('map-area-name').innerText = "Selected Location";
        document.getElementById('map-full-address').innerText = "Location pinpointed on map (Check text box below)";
        document.getElementById('display-selected-area').value = "GPS Location selected. Please add nearby landmarks.";
        window.showToast("Could not fetch exact street name. Please verify the address box.", false);
    }
}

window.editAddress = function (index, source = 'profile') {
    addressModalSource = source;
    const addr = currentSavedAddresses[index];
    if (!addr || typeof addr === 'string') {
        window.showToast("Please delete old format addresses and add a new one.", false);
        return;
    }
    document.getElementById('editAddressIdx').value = index;
    document.getElementById('addrSubmitBtn').innerText = "Update address";

    document.getElementById('addrFullName').value = addr.fullName || '';
    document.getElementById('addrMobile').value = addr.mobile || loggedInUser || '';
    document.getElementById('addrBuilding').value = addr.building || '';
    document.getElementById('addrLandmark').value = addr.landmark || ''; // Naya
    document.getElementById('display-selected-area').value = addr.area || ''; // Naya (Value read kar raha hai)
    document.getElementById('addrLat').value = addr.lat || "";
    document.getElementById('addrLng').value = addr.lng || "";

    const type = addr.type || 'Home';
    document.getElementById('addrTypeSelected').value = type;
    const chips = document.querySelectorAll('.type-chip');
    chips.forEach(chip => {
        if (chip.innerText.includes(type)) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    document.getElementById('new-address-overlay').classList.add('active');
    document.getElementById('new-address-overlay').style.display = 'flex';

    document.getElementById('addr-step-1').style.display = 'none';
    document.getElementById('addr-step-2').style.display = 'block';

    if (addr.lat && addr.lng) {
        initAddressMap(addr.lat, addr.lng);
    }
}
// 📍 HIGH ACCURACY GPS FETCH
window.useCurrentLocationOnMap = function () {
    if (navigator.geolocation) {
        document.getElementById('map-area-name').innerText = "Detecting GPS...";
        navigator.geolocation.getCurrentPosition(
            (position) => {
                initAddressMap(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                window.showToast("Unable to fetch exact location. Please ensure GPS/Location is ON in your phone settings.", false);
            },
            // Naya: Phone ko bolna force karke fresh location le aaye bina cache ke
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }
}

window.goToAddressDetails = function () {
    document.getElementById('addr-step-1').style.display = 'none';
    document.getElementById('addr-step-2').style.display = 'block';
}

window.backToMap = function () {
    document.getElementById('addr-step-2').style.display = 'none';
    document.getElementById('addr-step-1').style.display = 'flex';
    setTimeout(() => addressMap.invalidateSize(), 100);
}

window.openNewAddressModal = function (source = 'profile') {
    addressModalSource = source;
    document.getElementById('editAddressIdx').value = "";
    document.getElementById('addrSubmitBtn').innerText = "Save address";

    document.getElementById('addrFullName').value = "";
    document.getElementById('addrMobile').value = loggedInUser || "";
    document.getElementById('addrBuilding').value = "";

    document.getElementById('addrTypeSelected').value = "Home";
    const chips = document.querySelectorAll('.type-chip');
    chips.forEach(chip => {
        if (chip.innerText.includes('Home')) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    document.getElementById('new-address-overlay').classList.add('active');
    document.getElementById('new-address-overlay').style.display = 'flex';
    document.getElementById('addr-step-2').style.display = 'none';
    document.getElementById('addr-step-1').style.display = 'flex';

    // Default location load karein (Agar user location allow kare toh automatically wahan le jayein)
    window.useCurrentLocationOnMap();
}

window.editAddress = function (index, source = 'profile') {
    addressModalSource = source;
    const addr = currentSavedAddresses[index];
    if (!addr || typeof addr === 'string') {
        window.showToast("Please delete old format addresses and add a new one.", false);
        return;
    }
    document.getElementById('editAddressIdx').value = index;
    document.getElementById('addrSubmitBtn').innerText = "Update address";

    document.getElementById('addrFullName').value = addr.fullName || '';
    document.getElementById('addrMobile').value = addr.mobile || loggedInUser || '';
    document.getElementById('addrBuilding').value = addr.building || '';
    document.getElementById('addrLandmark').value = addr.landmark || ''; // Naya
    document.getElementById('display-selected-area').value = addr.area || ''; // Naya (Value read kar raha hai)
    document.getElementById('addrLat').value = addr.lat || "";
    document.getElementById('addrLng').value = addr.lng || "";

    const type = addr.type || 'Home';
    document.getElementById('addrTypeSelected').value = type;
    const chips = document.querySelectorAll('.type-chip');
    chips.forEach(chip => {
        if (chip.innerText.includes(type)) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    document.getElementById('new-address-overlay').classList.add('active');
    document.getElementById('new-address-overlay').style.display = 'flex';

    document.getElementById('addr-step-1').style.display = 'none';
    document.getElementById('addr-step-2').style.display = 'block';

    if (addr.lat && addr.lng) {
        initAddressMap(addr.lat, addr.lng);
    }
}

window.closeNewAddressForm = function () {
    document.getElementById('new-address-overlay').style.display = 'none';
    document.getElementById('new-address-overlay').classList.remove('active');
}

window.selectAddrType = function (type, element) {
    document.getElementById('addrTypeSelected').value = type;
    const chips = document.querySelectorAll('.type-chip');
    chips.forEach(chip => chip.classList.remove('active'));
    element.classList.add('active');
}

window.saveNewAddress = async function () {
    const fullName = document.getElementById('addrFullName').value.trim();
    const mobile = document.getElementById('addrMobile').value.trim();
    const building = document.getElementById('addrBuilding').value.trim();
    const landmark = document.getElementById('addrLandmark').value.trim(); // Naya
    const area = document.getElementById('display-selected-area').value.trim(); // Naya (Value le raha hai input se)
    const type = document.getElementById('addrTypeSelected').value;
    const editIdx = document.getElementById('editAddressIdx').value;

    const lat = document.getElementById('addrLat').value;
    const lng = document.getElementById('addrLng').value;

    if (!fullName || !mobile || !building || !area) {
        window.showToast("Please fill all required (*) fields", false);
        return;
    }

    const btn = document.getElementById('addrSubmitBtn');
    btn.innerText = "Saving..."; btn.disabled = true;

    // Landmark ko area me jodh dete hain taaki purana code crash na ho
    let finalAreaText = landmark ? `${area} (Landmark: ${landmark})` : area;

    const newAddressObj = {
        fullName, mobile, building, area: finalAreaText, type, lat, lng,
        landmark: landmark, city: "", state: "", pincode: "", email: ""
    };

    const docRef = doc(db, "customers", loggedInUser);

    try {
        if (editIdx !== "") {
            let updatedAddresses = [...currentSavedAddresses];
            updatedAddresses[parseInt(editIdx)] = newAddressObj;
            await updateDoc(docRef, { addresses: updatedAddresses });
        } else {
            await updateDoc(docRef, { addresses: arrayUnion(newAddressObj) });
        }

        closeNewAddressForm();

        if (addressModalSource === 'checkout') {
            if (editIdx === "") {
                const docSnap2 = await getDoc(docRef);
                if (docSnap2.exists() && docSnap2.data().addresses) {
                    checkoutState.selectedAddressIndex = docSnap2.data().addresses.length - 1;
                }
            }
            window.renderCheckoutPage(true);
        } else {
            renderMyAddresses();
        }

        btn.innerText = "Save address"; btn.disabled = false;
    } catch (e) {
        window.showToast("Error saving address", false);
        btn.innerText = "Try Again"; btn.disabled = false;
    }
}
let toastTimeout;
window.showToast = function (msg, isSuccess) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.innerHTML = msg;

    toast.style.backgroundColor = isSuccess ? '#10b981' : '#f59e0b';
    toast.style.display = 'block';
    toast.style.opacity = '1';

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
}

// 🔍 SEARCH LOGIC
window.handleSearch = function () {
    let query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (query === '') {
        renderCategoryNav();
        window.safeRenderCatalog(); // Wapas normal screen
        return;
    }

    let filtered = allProducts.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.mainCategory.toLowerCase().includes(query) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(query))
    );

    document.getElementById('category-nav').innerHTML = '';
    document.getElementById('sub-category-nav').classList.add('hidden');

    mainContainer.innerHTML = `<div class="category-section"><div class="category-header"><h3>Search Results</h3></div></div>`;
    let section = mainContainer.querySelector('.category-section');

    if (filtered.length === 0) {
        section.innerHTML += `<p style="text-align:center; color:#777; padding: 30px;">No items found for "${query}" 😥</p>`;
    } else {
        filtered.forEach(p => section.appendChild(window.createProductItem(p)));
    }
}

// ==========================================
// 🛍️ PRODUCT DETAILS PAGE (PDP) LOGIC
// ==========================================

window.openPDP = function (productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('pdp-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    let mrp = parseFloat(product.mrp);
    let sp = parseFloat(product.sellingPrice);
    let savePercent = Math.round(((mrp - sp) / mrp) * 100);

    let weight = product.weight || "Standard Pack";
    let benefits = product.benefits || "• Premium Quality\n• 100% Authentic & Pure\n• Freshly packed";
    let benefitsHtml = benefits.split('\n').map(b => `<li style="margin-left: 15px; color:#555; font-size:14px; margin-bottom:5px;">${b}</li>`).join('');

    let related = allProducts.filter(p => p.mainCategory === product.mainCategory && p.id !== product.id).slice(0, 4);
    let relatedHtml = '';
    related.forEach(rp => {
        relatedHtml += `
            <div style="min-width: 130px; max-width: 130px; background: #fff; border-radius: 8px; padding: 10px; border: 1px solid #eee; cursor: pointer;" onclick="window.openPDP('${rp.id}')">
                <img src="${rp.img}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px;">
                <div style="font-size: 13px; font-weight: bold; margin-top: 8px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${rp.name}</div>
                <div style="font-size: 14px; font-weight: 800; color: #128c7e; margin-top: 4px;">₹${rp.sellingPrice}</div>
            </div>
        `;
    });

    const container = document.getElementById('pdp-content-container');
    container.innerHTML = `
        <div style="background: #fff; width: 100%; overflow-x: auto; scroll-snap-type: x mandatory; display: flex; scrollbar-width: none;">
            <div style="min-width: 100%; scroll-snap-align: center; display: flex; justify-content: center; align-items: center; background: #f9f9f9; overflow: hidden; position: relative;">
                <img src="${product.img}" style="width: 100%; height: 350px; object-fit: contain; cursor: zoom-in; transition: transform 0.3s ease;" 
                     onclick="this.style.transform = this.style.transform === 'scale(1.8)' ? 'scale(1)' : 'scale(1.8)'; this.style.cursor = this.style.transform === 'scale(1.8)' ? 'zoom-out' : 'zoom-in';">
            </div>
        </div>
        <div style="background: #fff; padding: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee;">
            <h1 style="font-size: 20px; color: #111; margin-bottom: 8px; font-weight: 800;">${product.name}</h1>
            <div style="color: #666; font-size: 14px; margin-bottom: 15px;">Net Weight: <strong style="color: #333;">${weight}</strong></div>
            <div style="display: flex; align-items: baseline; gap: 10px;">
                <span style="font-size: 28px; font-weight: 800; color: #111;">₹${product.sellingPrice}</span>
                <span style="font-size: 16px; color: #999; text-decoration: line-through;">₹${product.mrp}</span>
                <span style="background: #e6f4ea; color: #166534; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: bold; margin-left: auto;">Save ${savePercent}%</span>
            </div>
            ${product.stockQty <= 10 && product.stockQty > 0 ? `<p style="color: #dc3545; font-size: 12px; font-weight: bold; margin-top: 10px;">⏳ Hurry! Only ${product.stockQty} left in stock</p>` : ''}
        </div>
        <div style="background: #fff; padding: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee;">
            <h3 style="font-size: 16px; margin-bottom: 15px; color: #111; display: flex; align-items: center; gap: 8px;">✨ Why Buy This?</h3>
            <ul style="padding: 0; list-style-type: none;">${benefitsHtml}</ul>
        </div>
        <div style="background: #fff; padding: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee;">
            <h3 style="font-size: 16px; margin-bottom: 10px; color: #111;">📝 Product Description</h3>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">${product.desc}</p>
        </div>
        ${related.length > 0 ? `
        <div style="background: #fff; padding: 20px;">
            <h3 style="font-size: 16px; margin-bottom: 15px; color: #111;">🛒 You might also like</h3>
            <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none;">
                ${relatedHtml}
            </div>
        </div>
        ` : ''}
    `;

    if (product.stockQty !== undefined && product.stockQty <= 0) {
        document.getElementById('pdp-add-btn').innerText = "Out of Stock";
        document.getElementById('pdp-add-btn').style.opacity = "0.5";
        document.getElementById('pdp-buy-btn').style.display = "none";
    } else {
        document.getElementById('pdp-add-btn').innerText = "Add to Cart";
        document.getElementById('pdp-add-btn').style.opacity = "1";
        document.getElementById('pdp-buy-btn').style.display = "block";
        document.getElementById('pdp-add-btn').onclick = () => { window.addToCart(product.id); window.showToast('Item added to cart! 🛒', true); };
        document.getElementById('pdp-buy-btn').onclick = () => { window.addToCart(product.id); closePDP(); openLoginModal('checkout'); };
    }
}

window.closePDP = function () {
    document.getElementById('pdp-modal').classList.add('hidden');
    document.body.style.overflow = '';
}


// ==========================================
// 🎁 GLOBAL PROMO CHOICE MODAL (INJECTED VIA JS)
// ==========================================
function injectPromoChoiceModal() {
    if (document.getElementById('promo-choice-overlay')) return;
    const modalHtml = `
        <div id="promo-choice-overlay" class="login-overlay" style="z-index: 4000;">
            <div class="login-box" style="background:#f4f6f8;">
                <div class="login-header">
                    <h3 id="promoChoiceTitle">Select Your Reward</h3>
                    <span class="close-login" onclick="closePromoChoiceModal()">&times;</span>
                </div>
                <p style="color: #666; font-size: 13px; margin-bottom: 15px;" id="promoChoiceSubtitle">Choose 1 item from the list below:</p>
                
                <div id="promoChoiceList" style="max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    </div>
                
                <input type="hidden" id="activePromoCodeSelected">
                <input type="hidden" id="activePromoCodeType">
                <button type="button" class="btn-checkout btn-full" onclick="confirmPromoChoice()">Claim Reward</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
injectPromoChoiceModal();

window.closePromoChoiceModal = function () {
    document.getElementById('promo-choice-overlay').classList.remove('active');
}

// ==========================================
// 🎉 CELEBRATION VISUAL EFFECT
// ==========================================
window.showCelebration = function (title, subtitle) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100dvh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';

    const box = document.createElement('div');
    box.style.backgroundColor = '#fff';
    box.style.padding = '30px 20px';
    box.style.borderRadius = '16px';
    box.style.textAlign = 'center';
    box.style.width = '80%';
    box.style.maxWidth = '320px';
    box.style.transform = 'scale(0.5)';
    box.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

    box.innerHTML = `
        <div style="font-size: 55px; margin-bottom: 10px; animation: bounce 1s infinite alternate;">🎊</div>
        <h2 style="color: #128c7e; margin-bottom: 8px; font-size: 22px; font-weight: 900; text-transform: uppercase;">${title}</h2>
        <p style="color: #555; font-size: 15px; font-weight: bold;">${subtitle}</p>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animate In
    setTimeout(() => {
        overlay.style.opacity = '1';
        box.style.transform = 'scale(1)';
    }, 50);

    // Auto Remove After 2.5 seconds
    setTimeout(() => {
        overlay.style.opacity = '0';
        box.style.transform = 'scale(0.5)';
        setTimeout(() => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 300);
    }, 2500);
}


// ==========================================
// 📱 PWA INSTALLATION LOGIC (ADD TO HOME SCREEN)    
// ==========================================

// 1. Service Worker Register Karna aur NAYA UPDATE Check Karna
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker Registered!');

                // 🌟 NAYA: Check karo ki kya koi naya update (sw.js) aaya hai?
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Agar naya update mil gaya, toh customer ko Update karne ko bolo
                            if (confirm("🚀 A new version of DRYFU app is available! Click OK to update now.")) {
                                window.location.reload(); // Ek click me hard refresh
                            }
                        }
                    };
                };
            })
            .catch(err => console.error('Service Worker Registration Failed!', err));
    });
}

// 2. Custom Install Banner
let deferredPrompt;

// 🌟 NAYA: Cinema Curtain Drop Style UI
// 🌟 NAYA: VIP Cinema Curtain Drop Style UI
const installBannerHTML = `
    <div id="pwa-install-banner" style="position: fixed; top: 0; left: 0; right: 0; margin: 0 auto; max-width: 480px; width: 100%; background: linear-gradient(180deg, #07473f 0%, #128c7e 100%); padding: 35px 20px 25px 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.5); z-index: 5000; display: flex; align-items: center; justify-content: space-between; transform: translateY(-100%); opacity: 0; transition: transform 1.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease-in; overflow: visible;">
        
        <!-- 🌟 Cinema Parda Wavy Design (Bottom Edge) -->
        <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style="position: absolute; bottom: -18px; left: 0; width: 100%; height: 20px; z-index: 10; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.2));">
            <path d="M0,0 C150,40 150,40 300,0 C450,40 450,40 600,0 C750,40 750,40 900,0 C1050,40 1050,40 1200,0 L1200,0 L0,0 Z" fill="#128c7e" />
        </svg>

        <div style="display: flex; align-items: center; gap: 15px; flex: 1; z-index: 20;">
            <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 50%; font-size: 26px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); border: 2px solid #f59e0b;">👑</div>
            <div>
                <h4 style="margin: 0; font-size: 18px; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; text-shadow: 1px 1px 3px rgba(0,0,0,0.4);">DRYFU VIP App</h4>
                <p style="margin: 0; font-size: 13px; color: #f59e0b; margin-top: 4px; font-weight: 700;">Faster checkout & offers!</p>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-end; z-index: 20;">
            <button id="pwa-install-btn" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; border: none; padding: 10px 24px; border-radius: 20px; font-weight: 900; font-size: 14px; cursor: pointer; box-shadow: 0 6px 15px rgba(0,0,0,0.3); text-transform: uppercase; letter-spacing: 0.5px;">Install Now</button>
            <button id="pwa-close-btn" style="background: transparent; border: none; color: #fff; font-size: 12px; cursor: pointer; padding: 2px; font-weight: bold; text-decoration: underline; opacity: 0.8;">Maybe Later</button>
        </div>
    </div>
`;
document.body.insertAdjacentHTML('beforeend', installBannerHTML);

const installBanner = document.getElementById('pwa-install-banner');
const installBtn = document.getElementById('pwa-install-btn');
const closeBtn = document.getElementById('pwa-close-btn');

// Browser jab check kar lega ki app installable (aur pehle se install nahi) hai, tab ye event chalega
window.addEventListener('beforeinstallprompt', (e) => {
    // Default browser mini-infobar ko rokna
    e.preventDefault();
    // Event ko save karna taaki baad me button click par use kar sakein
    deferredPrompt = e;

    // 🌟 NAYA: Ab koi localStorage check nahi hai. Har baar page khulne/refresh hone par ye parda niche aayega.
    setTimeout(() => {
        installBanner.style.transform = 'translateY(0)';
        installBanner.style.opacity = '1';
    }, 3000); // 3 second baad parda niche aayega
});

// 🌟 NAYA: Play Store jaisa Loading Spinner aur CSS Design Add karna
const pwaLoadingStyle = document.createElement('style');
pwaLoadingStyle.innerHTML = `
@keyframes spin-circle { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.installing-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100dvh; background: rgba(255,255,255,0.95); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.installing-overlay.active { opacity: 1; pointer-events: all; }
.install-spinner { width: 55px; height: 55px; border: 5px solid #e2e8f0; border-top: 5px solid #128c7e; border-radius: 50%; animation: spin-circle 1s linear infinite; margin-bottom: 20px; }
`;
document.head.appendChild(pwaLoadingStyle);

const pwaLoadingHTML = `
<div id="installing-overlay" class="installing-overlay">
    <div class="install-spinner" id="pwa-spinner-icon"></div>
    <div id="pwa-success-icon" style="font-size: 60px; margin-bottom: 10px; display: none;">🎉</div>
    <h2 id="pwa-loading-title" style="color: #111; margin-bottom: 5px; font-size: 22px; font-weight: 800;">Installing DRYFU...</h2>
    <p id="pwa-loading-sub" style="color: #666; font-size: 14px; font-weight: bold;">Please wait a moment</p>
</div>
`;
document.body.insertAdjacentHTML('beforeend', pwaLoadingHTML);

// 🌟 UPDATED INSTALL CLICK EVENT
installBtn.addEventListener('click', async () => {
    // 1. Parda wapas upar le jana
    installBanner.style.transform = 'translateY(-100%)';
    installBanner.style.opacity = '0';

    if (deferredPrompt) {
        // 2. System popup dikhana
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            // 3. User ke Install dabate hi Play Store jaisa Loading kholna
            const overlay = document.getElementById('installing-overlay');
            overlay.classList.add('active');

            // 4. 2.5 Second ka Artificial Delay (Taaki real feel aaye)
            setTimeout(() => {
                // Loading circle chhupa kar Success Icon dikhana
                document.getElementById('pwa-spinner-icon').style.display = 'none';
                document.getElementById('pwa-success-icon').style.display = 'block';

                document.getElementById('pwa-loading-title').innerText = "App Installed!";
                document.getElementById('pwa-loading-title').style.color = "#128c7e";
                document.getElementById('pwa-loading-sub').innerText = "Check your home screen.";

                // 5. 2 Second baad Success popup bhi band kar dena
                setTimeout(() => {
                    overlay.classList.remove('active');
                }, 2000);

            }, 2500);
        }
        deferredPrompt = null;
    }
});

// ==========================================
// 🚀 SMART SCROLL BOTTOM NAVIGATION & CART LOGIC
// ==========================================
let lastScrollTop = 0;
const bottomNav = document.querySelector('.bottom-navigation');

window.addEventListener('scroll', function (e) {
    if (!bottomNav) return;

    const cartCheckoutBar = document.getElementById('cart-checkout-bar');

    let currentScroll = 0;
    if (e.target === document || e.target === window) {
        currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    } else {
        currentScroll = e.target.scrollTop;
    }

    if (currentScroll === undefined) return;

    if (currentScroll > lastScrollTop && currentScroll > 50) {
        // 👇 Niche Scroll: Dono ko ek sath niche bhejo
        bottomNav.classList.add('hide-nav-down');
        if (cartCheckoutBar) cartCheckoutBar.classList.add('hide-checkout-down');
    } else {
        // 👇 Upar Scroll: Dono ko ek sath upar bulao
        bottomNav.classList.remove('hide-nav-down');
        if (cartCheckoutBar) cartCheckoutBar.classList.remove('hide-checkout-down');
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
}, true);



closeBtn.addEventListener('click', () => {
    // 🌟 NAYA: Sirf parda upar jayega, system kuch bhi yaad nahi rakhega.
    installBanner.style.transform = 'translateY(-100%)';
    installBanner.style.opacity = '0';
    // 'localStorage.setItem' wali line yahan se HATA DI GAYI HAI
});
// ==========================================
// 🔙 100% PERFECT HARDWARE BACK BUTTON LOGIC (HASH STACK)
// ==========================================
(function () {
    // 1. App start hote hi agar URL me kachra (#modal) fasa ho toh usko saaf karna
    window.addEventListener('load', () => {
        if (window.location.hash === '#modal') {
            window.history.replaceState(null, null, window.location.href.split('#')[0]);
        }
    });

    let isSystemAction = false;

    // 2. Ye function check karega ki screen par sabse upar kaunsa parda khula hai
    function getTopModalCloseFunc() {
        const success = document.getElementById('order-success-modal');
        if (success && success.style.display === 'flex') return 'closeSuccessModal';

        const promo = document.getElementById('promo-choice-overlay');
        if (promo && promo.classList.contains('active')) return 'closePromoChoiceModal';

        const address = document.getElementById('new-address-overlay');
        if (address && (address.classList.contains('active') || address.style.display === 'flex')) return 'closeNewAddressForm';

        const login = document.getElementById('login-overlay');
        if (login && login.classList.contains('active')) return 'closeLoginModal';

        const checkout = document.getElementById('checkout-modal');
        if (checkout && !checkout.classList.contains('hidden')) return 'closeCheckoutPage';

        const pdp = document.getElementById('pdp-modal');
        if (pdp && !pdp.classList.contains('hidden')) return 'closePDP';

        const profile = document.getElementById('profile-modal');
        if (profile && !profile.classList.contains('hidden')) return 'closeProfile';

        const cart = document.getElementById('cart-modal');
        if (cart && !cart.classList.contains('hidden')) return 'closeCart';

        return null; // Koi modal nahi khula
    }

    // 3. Jab bhi koi modal khulega, hum history me ek step badha denge (#modal)
    const openFuncs = ['openCart', 'openLoginModal', 'openCheckoutPage', 'openProfile', 'openPDP', 'openNewAddressModal', 'editAddress', 'openPromoChoiceModal'];

    openFuncs.forEach(func => {
        if (typeof window[func] === 'function') {
            const original = window[func];
            window[func] = function (...args) {
                isSystemAction = true;
                window.history.pushState({ modal: true }, "", "#modal");
                setTimeout(() => { isSystemAction = false; }, 50);
                return original.apply(this, args);
            };
        }
    });

    // 4. Jab user manually 'X' dabakar modal band kare, toh hum history se ek step hata denge
    const closeFuncs = ['closeCart', 'closeLoginModal', 'closeCheckoutPage', 'closeProfile', 'closePDP', 'closeNewAddressForm', 'closePromoChoiceModal', 'closeSuccessModal'];

    closeFuncs.forEach(func => {
        if (typeof window[func] === 'function') {
            const original = window[func];
            window[func] = function (...args) {
                const result = original.apply(this, args);

                // Agar button se band kiya hai (back button se nahi)
                if (!isSystemAction && window.location.hash === '#modal') {
                    isSystemAction = true;
                    window.history.back(); // Piche chale jao
                    setTimeout(() => { isSystemAction = false; }, 50);
                }
                return result;
            };
        }
    });

    // 5. 🌟 JADU: Jab Mobile ka Hardware Back Button dabega
    window.addEventListener('popstate', function () {
        if (isSystemAction) return; // Agar system ne khud back kiya hai toh ignore karo

        isSystemAction = true;
        const topModalCloseFunc = getTopModalCloseFunc();

        if (topModalCloseFunc) {
            window[topModalCloseFunc](); // Sirf sabse upar wale modal ko band karo
        }

        setTimeout(() => { isSystemAction = false; }, 50);
    });
})();


// ==========================================
// 🏠 HOME PAGE & NAVIGATION LOGIC
// ==========================================

function switchTab(tabName) {
    // Pages ko hide/show karna
    if (tabName === 'home') {
        document.getElementById('home-page').style.display = 'block';
        document.getElementById('catalog-page').style.display = 'none';

        document.getElementById('nav-home').classList.add('active');
        document.getElementById('nav-catalog').classList.remove('active');
    } else if (tabName === 'catalog') {
        document.getElementById('home-page').style.display = 'none';
        document.getElementById('catalog-page').style.display = 'block';

        document.getElementById('nav-catalog').classList.add('active');
        document.getElementById('nav-home').classList.remove('active');
    }

    // Hash routing for back button (Optional: Agar app hardware back ka use kare)
    window.scrollTo(0, 0);
}

window.renderTrendingDeals = function () {
    try {
        const trendingContainer = document.getElementById('trending-deals-container');
        // 🌟 NAYA: Poore section ke parent div ko select karna taaki heading bhi hide ho sake
        const trendingSectionParent = trendingContainer ? trendingContainer.parentElement : null;

        if (!trendingContainer || typeof allProducts === 'undefined' || !Array.isArray(allProducts) || allProducts.length === 0) {
            if (trendingSectionParent) trendingSectionParent.style.display = 'none';
            return;
        }

        trendingContainer.innerHTML = '';

        // Sirf wahi products nikalna jinme 'trending' tag checked hai
        const trendingProducts = allProducts.filter(product => product.tags && product.tags.includes('trending'));

        // Agar koi trending product nahi hai, toh poore section (heading ke sath) ko hide kar do
        if (trendingProducts.length === 0) {
            if (trendingSectionParent) trendingSectionParent.style.display = 'none';
            return;
        }

        // Agar products hain, toh section ko wapas show karo
        if (trendingSectionParent) trendingSectionParent.style.display = 'block';

        trendingProducts.forEach(product => {
            let pPrice = product.price || product.sellingPrice || 0;
            let pImg = product.imageUrl || product.img || 'https://via.placeholder.com/150';

            let priceHtml = `₹${pPrice}`;
            if (product.mrp && product.mrp > pPrice) {
                priceHtml = `<span style="text-decoration: line-through; color: #999; font-size: 11px; margin-right: 5px;">₹${product.mrp}</span>₹${pPrice}`;
            }

            const cardHTML = `
                <div class="trending-card" onclick="if(typeof window.openPDP === 'function') window.openPDP('${product.id}')" style="min-width: 140px; background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;">
                    <img src="${pImg}" alt="${product.name}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;">
                    <div style="font-size: 12px; font-weight: bold; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.name}</div>
                    <div style="font-size: 10px; color: #777; margin-bottom: 5px;">${product.weight || 'Standard'}</div>
                    <div style="font-size: 14px; color: #128c7e; font-weight: 800;">${priceHtml}</div>
                </div>
            `;
            trendingContainer.insertAdjacentHTML('beforeend', cardHTML);
        });
    } catch (error) {
        console.error("Trending deals load hone me dikkat: ", error);
    }
};

window.renderHomeCategories = function () {
    try {
        const catContainer = document.getElementById('home-category-container');
        const catSection = document.getElementById('home-category-section');

        // Agar master subcategories nahi hain, toh section chhipa do
        if (!catContainer || masterSubCategories.length === 0) {
            if (catSection) catSection.style.display = 'none';
            return;
        }

        if (catSection) catSection.style.display = 'block';
        catContainer.innerHTML = '';

        masterSubCategories.forEach(sub => {
            // 🌟 Beautiful Image Circle Design
            const catHTML = `
                <div class="circle-cat" onclick="window.openSubCategoryFromHome('${sub.parent}', '${sub.name}')" style="display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 75px; cursor: pointer;">
                    <img src="${sub.img}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.08); border: 2px solid #128c7e;">
                    <span style="font-size: 11px; font-weight: 700; color: #333; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75px;">
                        ${sub.name}
                    </span>
                </div>
            `;
            catContainer.insertAdjacentHTML('beforeend', catHTML);
        });
    } catch (error) {
        console.error("Home subcategories render error: ", error);
    }
};



// 🌟 IMPORTANT: Product load hone ke baad trending deals bhi render karni hain
// Apne `renderProducts()` function ke end mein (jahan html inject hota hai uske baad)
// ye line zaroor daal dein: `renderTrendingDeals();`

// ==========================================
// 🚀 MASTER NAVIGATION & HOME LOGIC (ERROR-PROOF)
// ==========================================

window.bottomNavAction = function (action) {
    try {
        // 1. Agar screen par koi bhi "Parda" (Modal) khula hai, toh usko pehle band karo
        const cartModal = document.getElementById('cart-modal');
        const profileModal = document.getElementById('profile-modal');
        const pdpModal = document.getElementById('pdp-modal');

        if (cartModal && !cartModal.classList.contains('hidden') && typeof window.closeCart === 'function') { window.closeCart(); }
        if (profileModal && !profileModal.classList.contains('hidden') && typeof window.closeProfile === 'function') { window.closeProfile(); }
        if (pdpModal && !pdpModal.classList.contains('hidden') && typeof window.closePDP === 'function') { window.closePDP(); }

        // 2. Ab user ko sahi page par bhejo
        if (action === 'home') {
            window.switchTab('home');
        } else if (action === 'catalog') {
            window.switchTab('catalog');
        } else if (action === 'cart') {
            if (typeof window.openCart === 'function') window.openCart();
        } else if (action === 'profile') {
            if (typeof window.openProfile === 'function') window.openProfile();
        }
    } catch (error) {
        console.error("Navigation button me kuch dikkat aayi: ", error);
    }
};


// 🌟 NAYA: Kisi bhi tab ko green (active) karne ka master function
window.updateNavHighlight = function (activeTabName) {
    // Pehle sabhi tabs se 'active' class (green color) hata do
    document.querySelectorAll('.bottom-navigation .nav-item').forEach(el => el.classList.remove('active'));

    // Ab jo tab khula hai, usko dhundho aur uspe 'active' class laga do
    const activeNav = document.getElementById('nav-' + activeTabName);
    if (activeNav) activeNav.classList.add('active');
};

window.switchTab = function (tabName) {
    try {
        localStorage.setItem('dryfu_active_tab', tabName);
        const homePage = document.getElementById('home-page');
        const catalogPage = document.getElementById('catalog-page');

        // 👇 YAHAN HUMNE MASTER FUNCTION KO CALL KIYA HAI
        window.updateNavHighlight(tabName);

        if (tabName === 'home') {
            if (homePage) homePage.style.display = 'block';
            if (catalogPage) catalogPage.style.display = 'none';
            if (typeof window.renderDynamicHomeSections === 'function') {
                window.renderDynamicHomeSections();
            }
        } else if (tabName === 'catalog') {
            if (homePage) homePage.style.display = 'none';
            if (catalogPage) catalogPage.style.display = 'block';
        }
        window.scrollTo(0, 0);
    } catch (error) {
        console.error("Tab switch karne me dikkat: ", error);
    }
};



let activeAppTags = [];

// TAGS LAANA AUR SORT KARNA
function listenAppTags() {
    onSnapshot(collection(db, "tags"), (snapshot) => {
        activeAppTags = [];
        snapshot.forEach(doc => activeAppTags.push(doc.data()));

        // 🌟 NAYA LOGIC: Priority number ke hisaab se order me lagana (1, 2, 3...)
        activeAppTags.sort((a, b) => (a.priority || 99) - (b.priority || 99));

        if (typeof window.renderDynamicHomeSections === 'function') {
            window.renderDynamicHomeSections();
        }
    });
}


// 🌟 NAYA: Main Categories ko Priority ke sath lana
let masterMainCategories = [];

function listenMasterMainCategories() {
    onSnapshot(collection(db, "mainCategories"), (snapshot) => {
        masterMainCategories = [];
        snapshot.forEach(docSnap => {
            let data = docSnap.data();
            masterMainCategories.push({ id: docSnap.id, ...data });
        });

        // 🌟 YAHAN HAI ASLI JADU: Priority ke hisaab se sort karna
        masterMainCategories.sort((a, b) => (a.priority || 99) - (b.priority || 99));

        if (typeof renderCategoryNav === 'function' && Object.keys(productsByCategory).length > 0) {
            renderCategoryNav();
            window.safeRenderCatalog();
        }

        // 👇 NAYA CODE: Yahan bhi Grid Render ko call karo taaki race-condition na aaye
        if (typeof window.renderGridCategories === 'function') {
            window.renderGridCategories();
        }
    });
}

// 🌟 NAYA: Global variable grid ke columns yaad rakhne ke liye
window.currentGridCols = 3;

// Load Layout Settings & Render Grid
function listenAppLayoutSettings() {
    onSnapshot(doc(db, "settings", "appLayout"), (docSnap) => {
        if (docSnap.exists()) {
            let data = docSnap.data();

            // Update Flex Orders
            document.getElementById('dynamic-banner-container').style.order = data.bannerOrder || 1;
            document.getElementById('home-category-section').style.order = data.slideCatOrder || 2;
            document.getElementById('dynamic-tags-sections-container').style.order = data.tagsOrder || 3;
            document.getElementById('home-grid-category-section').style.order = data.gridCatOrder || 4;

            // Grid columns save karna
            window.currentGridCols = data.gridCols || 3;

            // Agar settings change ho toh grid dubara render karo
            if (typeof window.renderGridCategories === 'function') {
                window.renderGridCategories();
            }
        }
    });
}

// 🌟 NAYA: Master Category ke hisaab se Group karke Grid render karna
window.renderGridCategories = function () {
    const gridSection = document.getElementById('home-grid-category-section');
    const gridContainer = document.getElementById('home-grid-category-container');

    if (!gridContainer || masterSubCategories.length === 0) {
        if (gridSection) gridSection.style.display = 'none';
        return;
    }

    if (gridSection) gridSection.style.display = 'block';
    gridContainer.innerHTML = '';

    // Wrapper ko normal block banane ke liye purani class hata di
    gridContainer.className = '';

    // Main Categories (e.g. Dry Fruits, Spices) ke hisaab se loop chalana
    masterMainCategories.forEach(mainCat => {

        // Is main category ki sabhi sub-categories nikaalo
        let subCats = masterSubCategories.filter(sub => sub.parent === mainCat.name);

        // Agar is category me sub-categories hain, tabhi section dikhao
        if (subCats.length > 0) {

            // Amazon Fresh jaisi Heading aur naya Grid start
            let sectionHTML = `
                <h3 style="margin: 20px 0 15px 20px; font-size: 18px; font-weight: 800; color: #111;">${mainCat.name}</h3>
                <div class="home-grid-categories cols-${window.currentGridCols}">
            `;

            // Us category ke items grid me add karna
            subCats.forEach(sub => {
                sectionHTML += `
                    <div class="grid-cat-item" onclick="window.openSubCategoryFromHome('${sub.parent}', '${sub.name}')">
                        <img src="${sub.img}" alt="${sub.name}">
                        <span>${sub.name}</span>
                    </div>
                `;
            });

            sectionHTML += `</div>`; // Grid close

            // HTML ko screen par add karna
            gridContainer.insertAdjacentHTML('beforeend', sectionHTML);
        }
    });
};

// INITIALIZE APP ke andar (File ke end me) ise call karein:
listenAppLayoutSettings();


// ==========================================
// 📂 MASTER SUBCATEGORIES FOR HOME PAGE
// ==========================================
let masterSubCategories = [];

// MASTER SUBCATEGORIES LAANA AUR SORT KARNA
// MASTER SUBCATEGORIES LAANA AUR SORT KARNA
function listenMasterCategories() {
    onSnapshot(collection(db, "subCategories"), (snapshot) => {
        masterSubCategories = [];
        snapshot.forEach(docSnap => masterSubCategories.push(docSnap.data()));

        // 🌟 NAYA LOGIC: Priority number ke hisaab se order me lagana
        masterSubCategories.sort((a, b) => (a.priority || 99) - (b.priority || 99));

        if (typeof window.renderHomeCategories === 'function') {
            window.renderHomeCategories();
            window.renderGridCategories();
        }

        // 🌟 NAYA JODA: Sub-category ka order change hone par Catalog ko bhi turant update karo
        if (typeof renderCatalog === 'function' && Object.keys(productsByCategory).length > 0) {
            window.safeRenderCatalog();
        }
    });
}

window.renderDynamicHomeSections = function () {
    try {
        const container = document.getElementById('dynamic-tags-sections-container');
        if (!container || typeof allProducts === 'undefined' || allProducts.length === 0) return;
        container.innerHTML = '';

        activeAppTags.forEach(tag => {
            const tagProducts = allProducts.filter(product => product.tags && product.tags.includes(tag.code));
            if (tagProducts.length > 0) {

                // 🌟 NAYA: horizontal-scroll div mein 'align-items: stretch;' add kiya hai
                let sectionHtml = `
                    <div class="dynamic-home-section" style="padding: 15px 0; background: #fff; margin-top: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 20px; margin-bottom: 15px;">
                            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #111;">${tag.title}</h3>
                            <span onclick="switchTab('catalog')" style="color: #128c7e; font-size: 13px; font-weight: bold; cursor: pointer;">See All ></span>
                        </div>
                        <div class="horizontal-scroll" style="padding: 0 20px; align-items: stretch;">
                `;

                tagProducts.forEach(product => {
                    let pPrice = product.price || product.sellingPrice || 0;
                    let pImg = product.imageUrl || product.img || 'https://via.placeholder.com/150';
                    let priceHtml = `₹${pPrice}`;
                    if (product.mrp && product.mrp > pPrice) {
                        priceHtml = `<span style="text-decoration: line-through; color: #999; font-size: 11px; margin-right: 5px;">₹${product.mrp}</span>₹${pPrice}`;
                    }

                    const cartItem = cart.find(item => item.id === product.id);
                    let actionHTML = '';
                    let btnStyle = "width: 100%; border: none; color: #fff; background: linear-gradient(135deg, #128c7e, #0f766a); font-weight: 800; border-radius: 6px; padding: 8px; font-size: 12px; cursor: pointer; text-transform: uppercase;";
                    let qtyStyle = "display: flex; align-items: center; justify-content: space-between; border: 1px solid #128c7e; border-radius: 6px; background: #f3fdf6; height: 32px; width: 100%;";

                    if (product.stockQty !== undefined && product.stockQty <= 0) {
                        actionHTML = `<span style="display:block; text-align:center; color:#dc3545; font-weight:bold; font-size:11px; padding: 6px; background: #fff0f0; border-radius: 6px;">Out of Stock</span>`;
                    } else if (cartItem) {
                        actionHTML = `<div style="${qtyStyle}">
                            <button onclick="window.decreaseQuantity('${product.id}')" style="background:transparent; border:none; color:#128c7e; font-size:16px; font-weight:bold; width:30%; cursor:pointer;">-</button>
                            <span style="font-size:13px; font-weight:800; color:#111; width:40%; text-align:center; background:#fff; line-height:30px; border-left:1px solid #128c7e; border-right:1px solid #128c7e;">${cartItem.quantity}</span>
                            <button onclick="window.addToCart('${product.id}')" style="background:transparent; border:none; color:#128c7e; font-size:16px; font-weight:bold; width:30%; cursor:pointer;">+</button>
                        </div>`;
                    } else {
                        actionHTML = `<button style="${btnStyle}" onclick="window.addToCart('${product.id}')">ADD</button>`;
                    }

                    // 🌟 NAYA: height: 100% hata kar 'align-self: stretch' lagaya hai jisse cards sabse lambe card ke barabar stretch honge
                    sectionHtml += `
                        <div class="trending-card" style="min-width: 140px; max-width: 140px; align-self: stretch; background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column;">
                            <img src="${pImg}" alt="${product.name}" onclick="if(typeof window.openPDP === 'function') window.openPDP('${product.id}')" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
                            
                            <div class="card-title-text" onclick="if(typeof window.openPDP === 'function') window.openPDP('${product.id}')" style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 4px; cursor: pointer;">${product.name}</div>
                            
                            <!-- margin-top: auto button aur price ko hamesha bottom me set rakhega -->
                            <div style="margin-top: auto;">
                                <div style="font-size: 10px; color: #777; margin-bottom: 8px;">${product.weight || 'Standard'}</div>
                                <div style="font-size: 14px; color: #128c7e; font-weight: 800; margin-bottom: 10px;">${priceHtml}</div>
                                <div class="product-action-ui-${product.id}">${actionHTML}</div>
                            </div>
                        </div>
                    `;
                });

                sectionHtml += `</div></div>`;
                container.insertAdjacentHTML('beforeend', sectionHtml);
            }
        });
    } catch (error) { console.error(error); }
};
// 🌟 NAYA: Home page se direct category open karne ka logic (With Auto-Scroll Fix)
window.openSubCategoryFromHome = function (parentCat, subCat) {
    selectedCategory = parentCat;
    window.switchTab('catalog');

    if (typeof renderCategoryNav === 'function') {
        renderCategoryNav();
        window.safeRenderCatalog();

        // 🌟 JADU: Smoothly scroll directly to that specific Subcategory section!
        setTimeout(() => {
            let cleanSubId = subCat.replace(/\s+/g, '-');
            let targetSection = document.getElementById(`section-${cleanSubId}`);

            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }
        }, 150);
    }
};


// 🌟 नया: नोटिफिकेशन की परमिशन लेना और टोकन सेव करना
window.requestNotificationPermission = async function () {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const swRegistration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, {
                vapidKey: "BIDCVcTjmz46lSKycxQxPRJ5IIiAc8tLmdT088ViaQBn1Im2uKNeJfKKfpRSpFPTFM4QX92hBLbePT30xRDpLVM", // ⚠️ यहाँ अपनी VAPID Key डालें
                serviceWorkerRegistration: swRegistration
            });

            if (token && loggedInUser) {
                // टोकन को डेटाबेस में यूज़र के प्रोफाइल में सेव करें
                await updateDoc(doc(db, "customers", loggedInUser), {
                    fcmToken: token
                });
            }
        }
    } catch (error) {
        console.error("Notification permission error", error);
    }
}

// 🌟 नया: जब ऐप खुला हो (Foreground), तब नोटिफिकेशन आने पर Toast दिखाना
onMessage(messaging, (payload) => {
    window.showToast(`🔔 ${payload.notification.title}`, true);
});

// 🌟 TRACK PWA INSTALLATIONS
window.addEventListener('appinstalled', async (evt) => {
    try {
        // App install hote hi Firebase mein ek record save ho jayega
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        
        await addDoc(collection(db, "appInstalls"), {
            timestamp: new Date().toISOString(),
            platform: navigator.platform || 'Unknown',
            userMobile: loggedInUser ? loggedInUser : 'Guest'
        });
        console.log("App Install Recorded Successfully!");
    } catch (error) {
        console.error("Error recording app install:", error);
    }
});

// ==========================================
// 🚀 INITIALIZE APP
// ==========================================
listenProducts();
listenAppTags();
listenCoupons();
updateCartUI(); // 🌟 NAYA: App khulte hi saved cart ko load aur display karna
listenBanners(); // 🌟 NAYA: Banners load karne ke liye call
listenMasterCategories();
listenMasterMainCategories(); // 🌟 YEH NAYI LINE ADD KARNI HAI
// 🌟 NAYA: Page load/refresh hone par check karo aakhiri baar konsi tab khuli thi
setTimeout(() => {
    let savedTab = localStorage.getItem('dryfu_active_tab') || 'home'; // Default 'home' rahega
    window.switchTab(savedTab);
}, 100);
