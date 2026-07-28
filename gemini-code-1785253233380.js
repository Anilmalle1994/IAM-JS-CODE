// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your Project URL
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your anon/public key
const db = supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// PREVENT BACK BUTTON & AUTO-LOGOUT LOGIC
// ==========================================

window.addEventListener('load', function() {
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
        window.location.replace('https://www.anilmalle.in/admin/');
    }
});

window.history.pushState(null, "", window.location.href);
window.onpopstate = function() {
    window.location.replace("https://www.anilmalle.in/admin/");
};

let inactivityTimer;
const INACTIVITY_LIMIT = 5 * 60 * 1000; 

function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(logout, INACTIVITY_LIMIT);
}

window.onload = function() {
    resetTimer();
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;
    document.onmousedown = resetTimer; 
    document.ontouchstart = resetTimer;
    document.onclick = resetTimer;
    document.onscroll = resetTimer;
    
    // LOAD DATA FROM SUPABASE ON BOOT
    loadAppData();
};

function logout() {
    document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/"); 
    });
    sessionStorage.clear();
    Object.keys(localStorage).forEach(key => {
        if (key.toLowerCase().includes('auth') || key.toLowerCase().includes('token') || key.toLowerCase().includes('supabase')) {
            localStorage.removeItem(key);
        }
    });

    alert('Securely logged out.');
    window.location.replace('https://www.anilmalle.in/admin/?logout=' + new Date().getTime()); 
}

// ==========================================
// DATA STORAGE & INIT (SUPABASE)
// ==========================================
let appData = { vendors: [], orders: {}, vendorAllotmentsHistory: [], staff: [] };

async function loadAppData() {
    try {
        // Fetch Orders
        const { data: orders } = await db.from('orders').select('*');
        if (orders) orders.forEach(o => appData.orders[o.orderId] = o);

        // Fetch Vendors
        const { data: vendors } = await db.from('vendors').select('*');
        if (vendors) appData.vendors = vendors;

        // Fetch Staff
        const { data: staff } = await db.from('staff').select('*');
        if (staff) appData.staff = staff;

        // Fetch History
        const { data: history } = await db.from('vendor_allotments_history').select('*');
        if (history) appData.vendorAllotmentsHistory = history;

        updateDashboardStats();
    } catch (error) {
        console.error("Error fetching data from Supabase:", error);
    }
}

// ==========================================
// SIDEBAR NAVIGATION & MOBILE
// ==========================================
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}
document.getElementById('mobile-menu-btn').addEventListener('click', toggleSidebar);
document.getElementById('sidebar-close-btn').addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

document.getElementById('settings-menu-toggle').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('settings-submenu').classList.toggle('open');
});

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(btn.id === 'settings-menu-toggle') return;
        
        e.preventDefault();
        navBtns.forEach(b => b.classList.remove('active'));
        viewSections.forEach(s => s.classList.remove('active'));

        const targetId = btn.getAttribute('data-target');
        btn.classList.add('active');
        
        if(btn.closest('.submenu')) {
            document.getElementById('settings-menu-toggle').classList.add('active');
        }

        document.getElementById(targetId).classList.add('active');
        document.getElementById('page-title').innerText = btn.innerText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|\▼/g, '').trim();

        if(targetId === 'dashboard') updateDashboardStats();
        if(targetId === 'new-order') initNewOrder();
        if(targetId === 'staff-master') renderStaffTable();
        if(targetId === 'pending-reports') { renderPRClient(); renderPRVendor(); }
        if(targetId === 'vendor-reports') renderVendorReport();

        if(window.innerWidth <= 768) toggleSidebar();
    });
});

function showToast(message) {
    document.getElementById('toast-message').innerText = message;
    const toast = document.getElementById('app-toast');
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

function generateOrderId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${date}`;

    let maxSerial = 0;
    Object.keys(appData.orders).forEach(id => {
        if (id.startsWith(`IAM-${dateStr}-`)) {
            const serialParts = id.split('-');
            const serial = parseInt(serialParts[2]);
            if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
        }
    });
    const nextSerial = String(maxSerial + 1).padStart(3, '0');
    return `IAM-${dateStr}-${nextSerial}`;
}

// ==========================================
// EMAIL COMPOSE LOGIC
// ==========================================
function openEmailClient() {
    const subject = encodeURIComponent(`Monthly Dues Report - ${new Date().toLocaleString('default', { month: 'long' })}`);
    const body = encodeURIComponent(`Hello,\n\nPlease find attached the monthly reports for Client Pendings and Vendor Allotments downloaded from the system today.\n\nRegards,\nSystem Admin`);
    window.open(`mailto:iamdesign81@gmail.com?subject=${subject}&body=${body}`, '_self');
}

// ==========================================
// VCF GENERATION LOGIC
// ==========================================
function downloadClientsVCF() {
    let vcfData = "";
    let clientsAdded = new Set();
    Object.values(appData.orders).forEach(order => {
        let uniqueKey = order.client.trim().toLowerCase() + "_" + order.phone.trim();
        if(!clientsAdded.has(uniqueKey)) {
            clientsAdded.add(uniqueKey);
            vcfData += `BEGIN:VCARD\nVERSION:3.0\nFN:${order.client}\nTEL;TYPE=CELL:${order.phone}\nEND:VCARD\n`;
        }
    });

    if(vcfData === "") return alert("No clients found in the database!");

    let blob = new Blob([vcfData], { type: "text/vcard" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Clients_Contacts_${Date.now()}.vcf`;
    link.click();
    showToast("Downloading Clients VCF...");
}

// ==========================================
// QR SCANNER
// ==========================================
let html5QrcodeScanner = null;
let qrTargetInput = null;
let qrCallback = null;

function openQRScanner(inputId, callbackFunction) {
    qrTargetInput = inputId;
    qrCallback = callbackFunction;
    document.getElementById('qrModal').style.display = 'flex';
    document.getElementById('qr-reader').innerHTML = '';
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5QrcodeScanner.render(onScanSuccess, () => {});
}

function onScanSuccess(decodedText) {
    document.getElementById(qrTargetInput).value = decodedText;
    closeQRModal();
    showToast("QR Scanned Successfully!");
    if(qrCallback) qrCallback();
}

function closeQRModal() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            document.getElementById('qrModal').style.display = 'none';
            document.getElementById('qr-reader').innerHTML = '';
        });
    } else document.getElementById('qrModal').style.display = 'none';
}

function findOrder(query) {
    query = query.trim();
    if(appData.orders[query]) return appData.orders[query]; 
    for (let id in appData.orders) { if (appData.orders[id].phone === query) return appData.orders[id]; }
    return null;
}

// ==========================================
// DASHBOARD (SORT, FILTER, EXPORT)
// ==========================================
function updateDashboardStats() {
    let active = 0, desPending = 0, payPending = 0, readyDel = 0, pickupReady = 0;
    Object.values(appData.orders).forEach(order => {
        if(order.status !== 'delivered') active++;
        if(order.status === 'designing') desPending++;
        if(parseFloat(order.balance) > 0) payPending++;
        if(order.status === 'ready_for_delivery') readyDel++;
        if(order.status === 'vendor_allotted') pickupReady++;
    });
    document.getElementById('dash-active').innerText = active;
    document.getElementById('dash-designs').innerText = desPending;
    document.getElementById('dash-payments').innerText = payPending;
    document.getElementById('dash-delivery').innerText = readyDel;
    document.getElementById('dash-pickup').innerText = pickupReady;
}

let currentDashFilter = 'active';
let dashSort = { col: null, asc: true };

function sortDashboard(col) {
    if(dashSort.col === col) dashSort.asc = !dashSort.asc;
    else { dashSort.col = col; dashSort.asc = true; }
    renderDashboardTable();
}

function renderDashboardTable(filterType = currentDashFilter) {
    currentDashFilter = filterType;
    document.getElementById('dashboard-welcome').style.display = 'none';
    document.getElementById('dashboard-list-container').style.display = 'block';
    
    let titleMap = { 'active': 'All Active Orders', 'designing': 'Designs Pending List', 'payments': 'Payments Pending List', 'staff_pickup': 'Pending Staff Pickups', 'delivery': 'Ready for Delivery List' };
    document.getElementById('dashboard-list-title').innerText = titleMap[filterType] || 'Order List';

    const tbody = document.querySelector('#dashboard-table tbody');
    tbody.innerHTML = '';
    
    let filteredOrders = Object.values(appData.orders);
    
    if (filterType === 'active') filteredOrders = filteredOrders.filter(o => o.status !== 'delivered'); 
    else if (filterType === 'designing') filteredOrders = filteredOrders.filter(o => o.status === 'designing');
    else if (filterType === 'payments') filteredOrders = filteredOrders.filter(o => parseFloat(o.balance) > 0);
    else if (filterType === 'staff_pickup') filteredOrders = filteredOrders.filter(o => o.status === 'vendor_allotted');
    else if (filterType === 'delivery') filteredOrders = filteredOrders.filter(o => o.status === 'ready_for_delivery');
    
    const fId = (document.getElementById('dash-filt-id')?.value || '').toLowerCase();
    const fClient = (document.getElementById('dash-filt-client')?.value || '').toLowerCase();
    const fPhone = (document.getElementById('dash-filt-phone')?.value || '').toLowerCase();
    const fWork = (document.getElementById('dash-filt-work')?.value || '').toLowerCase();
    const fBal = parseFloat(document.getElementById('dash-filt-bal')?.value);
    const fStatus = document.getElementById('dash-filt-status')?.value;

    filteredOrders = filteredOrders.filter(o => {
        if(fId && !o.orderId.toLowerCase().includes(fId)) return false;
        if(fClient && !o.client.toLowerCase().includes(fClient)) return false;
        if(fPhone && !o.phone.includes(fPhone)) return false;
        if(fWork && !(o.work || '').toLowerCase().includes(fWork)) return false;
        if(!isNaN(fBal) && parseFloat(o.balance) > fBal) return false;
        if(fStatus && o.status !== fStatus) return false;
        return true;
    });

    if(dashSort.col) {
        filteredOrders.sort((a, b) => {
            let valA = a[dashSort.col] || ''; let valB = b[dashSort.col] || '';
            if(dashSort.col === 'balance') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(valA < valB) return dashSort.asc ? -1 : 1;
            if(valA > valB) return dashSort.asc ? 1 : -1;
            return 0;
        });
    }
    
    if (filteredOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--gray);">No orders found.</td></tr>`;
        return;
    }

    filteredOrders.forEach(o => {
        const tr = document.createElement('tr');
        let balanceColor = parseFloat(o.balance) > 0 ? 'red' : 'green';
        let displayStatus = o.status.replace(/_/g, ' ').toUpperCase();
        
        let actionBtnHTML = '<span style="color:var(--gray); font-size:12px;">No Actions</span>';
        if(filterType === 'designing' && o.status === 'designing') {
            actionBtnHTML = `<button class="btn-primary" style="padding: 4px 8px; font-size: 10px;" onclick="markDesignReady('${o.orderId}')">Design Ready</button>`;
        } else if (filterType === 'payments' && parseFloat(o.balance) > 0) {
            actionBtnHTML = `<button class="btn-primary" style="padding: 4px 8px; font-size: 10px; background: #25D366;" onclick="openPaymentModal('${o.orderId}')">Pay</button>`;
        }

        tr.innerHTML = `<td><strong>${o.orderId}</strong></td><td>${o.client}</td><td>${o.phone}</td><td>${o.work || 'N/A'}</td><td style="color: ${balanceColor}; font-weight: bold;">₹${o.balance}</td><td><span class="status-badge status-${o.status.replace(/_/g, '-')}">${displayStatus}</span></td><td>${actionBtnHTML}</td>`;
        tbody.appendChild(tr);
    });
}

function closeDashboardTable() {
    document.getElementById('dashboard-list-container').style.display = 'none';
    document.getElementById('dashboard-welcome').style.display = 'block';
}

function downloadDashboardPDF() {
    let filteredOrders = Object.values(appData.orders);
    let filterType = currentDashFilter;
    
    if (filterType === 'active') filteredOrders = filteredOrders.filter(o => o.status !== 'delivered'); 
    else if (filterType === 'designing') filteredOrders = filteredOrders.filter(o => o.status === 'designing');
    else if (filterType === 'payments') filteredOrders = filteredOrders.filter(o => parseFloat(o.balance) > 0);
    else if (filterType === 'staff_pickup') filteredOrders = filteredOrders.filter(o => o.status === 'vendor_allotted');
    else if (filterType === 'delivery') filteredOrders = filteredOrders.filter(o => o.status === 'ready_for_delivery');
    
    const fId = (document.getElementById('dash-filt-id')?.value || '').toLowerCase();
    const fClient = (document.getElementById('dash-filt-client')?.value || '').toLowerCase();
    const fPhone = (document.getElementById('dash-filt-phone')?.value || '').toLowerCase();
    const fWork = (document.getElementById('dash-filt-work')?.value || '').toLowerCase();
    const fBal = parseFloat(document.getElementById('dash-filt-bal')?.value);
    const fStatus = document.getElementById('dash-filt-status')?.value;

    filteredOrders = filteredOrders.filter(o => {
        if(fId && !o.orderId.toLowerCase().includes(fId)) return false;
        if(fClient && !o.client.toLowerCase().includes(fClient)) return false;
        if(fPhone && !o.phone.includes(fPhone)) return false;
        if(fWork && !(o.work || '').toLowerCase().includes(fWork)) return false;
        if(!isNaN(fBal) && parseFloat(o.balance) > fBal) return false;
        if(fStatus && o.status !== fStatus) return false;
        return true;
    });

    if(dashSort.col) {
        filteredOrders.sort((a, b) => {
            let valA = a[dashSort.col] || ''; let valB = b[dashSort.col] || '';
            if(dashSort.col === 'balance') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(valA < valB) return dashSort.asc ? -1 : 1;
            if(valA > valB) return dashSort.asc ? 1 : -1;
            return 0;
        });
    }

    let titleMap = { 'active': 'Active Orders', 'designing': 'Designs Pending', 'payments': 'Payments Pending', 'staff_pickup': 'Staff Pickups', 'delivery': 'Ready for Delivery' };
    let title = titleMap[filterType] || 'Order List';

    let html = `<div style="padding: 20px; font-family: 'Poppins', sans-serif;"><h2 style="color: #f26522; border-bottom: 2px solid #f26522; padding-bottom: 10px;">${title} Report</h2><p>Generated on: ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px;"><thead><tr style="background-color: #f4f4f4; text-align: left;"><th style="padding: 10px; border: 1px solid #ddd;">Order ID</th><th style="padding: 10px; border: 1px solid #ddd;">Client Name</th><th style="padding: 10px; border: 1px solid #ddd;">Contact</th><th style="padding: 10px; border: 1px solid #ddd;">Work Details</th><th style="padding: 10px; border: 1px solid #ddd;">Status</th><th style="padding: 10px; border: 1px solid #ddd;">Balance (₹)</th></tr></thead><tbody>`;
    
    let totalBal = 0;
    filteredOrders.forEach(o => {
        totalBal += parseFloat(o.balance) || 0;
        html += `<tr><td style="padding: 8px; border: 1px solid #ddd;">${o.orderId}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.client}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.phone}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.work || 'N/A'}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.status.replace(/_/g, ' ').toUpperCase()}</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">₹${o.balance}</td></tr>`;
    });
    html += `</tbody><tfoot><tr><td colspan="5" style="text-align: right; padding: 10px; font-weight: bold;">Total Balance Displayed:</td><td style="padding: 10px; font-weight: bold; font-size: 14px; color: red;">₹${totalBal}</td></tr></tfoot></table></div>`;
    
    html2pdf().set({ margin: 10, filename: `Dashboard_Orders_${Date.now()}.pdf`, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(html).save();
    showToast("Downloading Dashboard Report PDF...");
}

// Designing
async function saveDesignRequest() {
    const client = document.getElementById('des-client').value;
    const phone = document.getElementById('des-phone').value;
    if(!client || phone.length !== 10) return alert("Valid client and 10 digit phone required.");
    
    const orderId = `IAM-DES-${Math.floor(1000+Math.random()*9000)}`;
    const newOrder = { orderId, client, phone, status: 'designing', balance: parseFloat(document.getElementById('des-est-amt').value) || 0 };
    
    appData.orders[orderId] = newOrder; // Local update
    
    // DB Update
    const { error } = await db.from('orders').insert([newOrder]);
    if (error) console.error(error);

    showToast("Design Request Saved");
    document.getElementById('designing-form').reset();
    updateDashboardStats();
}

function addDesignWorkRow() {
    document.getElementById('des-works-container').innerHTML += `<div class="form-grid des-work-row"><div class="form-group"><label>Work</label><input type="text" class="des-work-input"></div><div class="form-group"><label>Dimensions</label><input type="text" class="des-dim-input"></div></div>`;
}

function markDesignReady(orderId) {
    const order = appData.orders[orderId];
    if(!order) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-target="new-order"]').classList.add('active');
    document.getElementById('new-order').classList.add('active');
    
    document.getElementById('nw-orderid').value = order.orderId;
    document.getElementById('nw-client').value = order.client;
    document.getElementById('nw-phone').value = order.phone;
    document.getElementById('nw-amount').value = order.amount || 0;
    document.getElementById('nw-advance').value = order.advance || 0;
    calcBalance();
}

// ==========================================
// NEW WORK ORDER LOGIC
// ==========================================
function initNewOrder() {
    document.getElementById('nw-date').value = new Date().toLocaleString();
    const newId = generateOrderId();
    document.getElementById('nw-orderid').value = newId;
    document.getElementById('qrcode').innerHTML = ""; 
    new QRCode(document.getElementById("qrcode"), { text: newId, width: 100, height: 100 });
}

function handleWorkTypeChange(selectElement) {
    const row = selectElement.closest('.nw-work-row');
    const othersInput = row.querySelector('.nw-work-others-input');
    othersInput.style.display = selectElement.value === 'Others' ? 'block' : 'none';
}

function addNewWorkRow() {
    const container = document.getElementById('nw-works-container');
    const row = document.createElement('div');
    row.className = 'form-grid nw-work-row';
    row.style.marginTop = '15px';
    row.style.borderTop = '1px dashed #ccc';
    row.style.paddingTop = '15px';
    row.innerHTML = `<div class="form-group"><label>Work Type</label><select class="nw-work-type" onchange="handleWorkTypeChange(this)"><option value="Flex">Flex</option><option value="Digital Printing">Digital Printing</option><option value="Offset Printing">Offset Printing</option><option value="Special Work">Special Work</option><option value="Others">Others</option></select><input type="text" class="nw-work-others-input" placeholder="Type custom work..." style="display: none; margin-top: 8px;"></div><div class="form-group"><label>Description / Details</label><input type="text" class="nw-work-desc" placeholder="e.g. Dimensions or extra details"></div><div class="form-group" style="grid-column: 1 / -1;"><label>Upload Design (Optional)</label><input type="file" class="nw-work-file" accept="image/*" style="background: white;"></div>`;
    container.appendChild(row);
}

function calcBalance() {
    const amt = parseFloat(document.getElementById('nw-amount').value) || 0;
    const adv = parseFloat(document.getElementById('nw-advance').value) || 0;
    document.getElementById('nw-balance').value = Math.max(0, amt - adv);
}
        
async function saveNewOrder() {
    const orderId = document.getElementById('nw-orderid').value;
    const client = document.getElementById('nw-client').value;
    const phone = document.getElementById('nw-phone').value;
    
    if(!client || phone.length !== 10) return alert("Valid client and 10 digit phone required.");

    let workTypesArray = [];
    let filesToDownload = [];

    document.querySelectorAll('.nw-work-row').forEach((row, index) => {
        let type = row.querySelector('.nw-work-type').value;
        if(type === 'Others') type = row.querySelector('.nw-work-others-input').value.trim() || 'Other Work';
        const desc = row.querySelector('.nw-work-desc').value.trim();
        
        let finalWorkString = desc ? desc : type;
        workTypesArray.push(finalWorkString);

        const fileInput = row.querySelector('.nw-work-file');
        if(fileInput && fileInput.files.length > 0) {
            filesToDownload.push({ file: fileInput.files[0], index: index + 1 });
        }
    });

    const newOrderObj = {
        orderId, client, phone, date: new Date().toISOString(),
        work: workTypesArray.join(", "),
        amount: parseFloat(document.getElementById('nw-amount').value) || 0,
        advance: parseFloat(document.getElementById('nw-advance').value) || 0,
        balance: parseFloat(document.getElementById('nw-balance').value) || 0,
        status: 'processing'
    };

    appData.orders[orderId] = newOrderObj;
    
    // DB Update
    const { error } = await db.from('orders').upsert([newOrderObj]);
    if(error) console.error(error);
    
    const qrCanvas = document.querySelector('#qrcode canvas');
    let qrDataUrl = qrCanvas ? qrCanvas.toDataURL("image/png") : null;

    if(qrDataUrl) {
        const qrLink = document.createElement('a'); qrLink.download = `QR_${orderId}.png`; qrLink.href = qrDataUrl; qrLink.click();
    }
    
    filesToDownload.forEach(item => {
        const fileLink = document.createElement('a'); 
        fileLink.download = `Design_${orderId}_Part${item.index}_${item.file.name}`; 
        fileLink.href = URL.createObjectURL(item.file); 
        fileLink.click();
    });

    let fileNotice = filesToDownload.length > 0 ? `Please find your Ticket QR code and ${filesToDownload.length} design preview(s) attached.` : "Please find your Ticket QR code attached.";
    let msg = `Hello ${client},\nYour order ${orderId} has been successfully placed with iam des!gns.\n\nWork: ${appData.orders[orderId].work}\nTotal Amount: ₹${appData.orders[orderId].amount}\nPaid: ₹${appData.orders[orderId].advance}\nBalance Due: ₹${appData.orders[orderId].balance}\n\n${fileNotice}\n\nWe will notify you when it is ready!`;
    
    setTimeout(() => {
        alert(`✅ Order Saved.\n\nDownloads triggered for QR Code${filesToDownload.length > 0 ? ' and Design Previews' : ''}.\nPlease attach them manually in the WhatsApp window that opens next.`);
        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }, 500);

    document.getElementById('new-order-form').reset();
    document.getElementById('nw-works-container').innerHTML = `<div class="form-grid nw-work-row" style="border-bottom: 1px dashed #ccc; padding-bottom: 15px;"><div class="form-group"><label>Work Type</label><select class="nw-work-type" onchange="handleWorkTypeChange(this)"><option value="Flex">Flex</option><option value="Digital Printing">Digital Printing</option><option value="Offset Printing">Offset Printing</option><option value="Special Work">Special Work</option><option value="Others">Others</option></select><input type="text" class="nw-work-others-input" placeholder="Type custom work..." style="display: none; margin-top: 8px;"></div><div class="form-group"><label>Description / Details</label><input type="text" class="nw-work-desc" placeholder="e.g. Dimensions or extra details"></div><div class="form-group" style="grid-column: 1 / -1;"><label>Upload Design (Optional)</label><input type="file" class="nw-work-file" accept="image/*" style="background: white;"></div></div>`;
    
    initNewOrder(); updateDashboardStats();
}

// ==========================================
// VENDOR ALLOTMENT & MASTER LOGIC
// ==========================================
function fetchOrderForAllotment() {
    const query = document.getElementById('va-orderid').value.trim();
    const order = findOrder(query);
    if(!order) return alert("Order not found!");
    
    document.getElementById('va-orderid').value = order.orderId;

    const container = document.getElementById('va-rows-container');
    container.innerHTML = ''; 
    
    if(appData.vendors.length === 0) {
        alert("Please add vendors in 'Settings -> Vendors Master' first.");
        return;
    }

    const workItems = order.work ? order.work.split(', ') : ["General Work"];
    workItems.forEach((workItem) => {
        const row = document.createElement('div');
        row.className = 'form-grid va-row';
        row.style.marginTop = '15px';
        row.innerHTML = `<div class="form-group" style="grid-column: 1 / -1;"><label style="color: var(--primary);">Work: ${workItem}</label><input type="hidden" class="va-work-item" value="${workItem}"></div><div class="form-group"><label>Vendor Name</label><select class="va-vendor" onchange="populateMaterials(this)"><option value="">Select Vendor...</option></select></div><div class="form-group"><label>Material</label><select class="va-material" onchange="fetchRateAndCalculate(this)" disabled><option value="">Select Vendor First</option></select></div><div class="form-group"><label>Quantity</label><input type="number" class="va-qty" value="1" min="1" oninput="fetchRateAndCalculate(this)"></div><div class="form-group"><label>Amount (₹)</label><input type="number" class="va-amount" readonly></div>`;
        container.appendChild(row);
    });
    const vSelects = document.querySelectorAll('.va-vendor');
    vSelects.forEach(vSelect => {
        appData.vendors.forEach((v, index) => {
            let opt = document.createElement('option');
            opt.value = index; opt.innerText = v.name; vSelect.appendChild(opt);
        });
    });
}
        
function populateMaterials(selectElement) {
    const row = selectElement.closest('.va-row');
    const vIndex = selectElement.value;
    const mSelect = row.querySelector('.va-material');
    if(vIndex === "") { mSelect.disabled = true; return; }
    mSelect.disabled = false;
    mSelect.innerHTML = '<option value="">Select Material...</option>';
    appData.vendors[vIndex].materials.forEach((m) => { 
        let opt = document.createElement('option'); 
        opt.value = m.rate; 
        opt.innerText = `${m.name} (₹${m.rate})`; 
        mSelect.appendChild(opt); 
    });
    fetchRateAndCalculate(mSelect);
}
        
function fetchRateAndCalculate(element) {
    const row = element.closest('.va-row');
    const rate = parseFloat(row.querySelector('.va-material').value) || 0;
    const qty = parseFloat(row.querySelector('.va-qty').value) || 0;
    row.querySelector('.va-amount').value = rate * qty;
}
        
async function saveVendorAllotment() {
    const query = document.getElementById('va-orderid').value.trim();
    const order = findOrder(query);
    if(!order) return alert("Fetch an order first.");
    
    let allotments = [];
    let newHistoryEntries = [];
    let allValid = true;
    
    document.querySelectorAll('.va-row').forEach(row => {
        const vIndex = row.querySelector('.va-vendor').value;
        if(vIndex !== "") {
            const vendorName = appData.vendors[vIndex].name;
            const amt = parseFloat(row.querySelector('.va-amount').value) || 0;
            const workItem = row.querySelector('.va-work-item').value;
            
            allotments.push({ workItem, vendorName, amount: amt });
            
            const histObj = { date: new Date().toISOString(), orderId: order.orderId, vendor: vendorName, work: workItem, amount: amt };
            newHistoryEntries.push(histObj);
            appData.vendorAllotmentsHistory.push(histObj);
        } else {
            allValid = false;
        }
    });

    if(!allValid) return alert("Please select a vendor for all items, or the setup will be incomplete.");

    order.status = 'vendor_allotted'; 
    order.allotments = allotments; 
    order.vendorName = [...new Set(allotments.map(a => a.vendorName))].join(", ");
    
    // DB Updates
    await db.from('orders').update({
        status: order.status,
        vendorName: order.vendorName,
        allotments: order.allotments
    }).eq('orderId', order.orderId);

    await db.from('vendor_allotments_history').insert(newHistoryEntries);
    
    showToast("Vendor Allotted Successfully!"); 
    document.getElementById('va-rows-container').innerHTML = '';
    updateDashboardStats();
}

function addMaterialRow() {
    const container = document.getElementById('vm-materials-container');
    const row = document.createElement('div');
    row.className = 'form-grid vm-material-row';
    row.style.marginTop = '15px';
    row.innerHTML = `<div class="form-group"><label>Material Name</label><input type="text" class="vm-mat-name"></div><div class="form-group"><label>Rate (₹)</label><input type="number" class="vm-mat-rate"></div>`;
    container.appendChild(row);
}
        
async function saveVendor() {
    const vName = document.getElementById('vm-name').value.trim();
    if(!vName) return alert("Vendor Name required!");
    let materials = [];
    
    document.querySelectorAll('.vm-material-row').forEach(row => {
        let name = row.querySelector('.vm-mat-name').value.trim();
        let rate = parseFloat(row.querySelector('.vm-mat-rate').value) || 0;
        if(name && rate > 0) materials.push({ name, rate });
    });
    
    if(materials.length === 0) return alert("Add at least one valid material with a rate!");
    
    let existingVendor = appData.vendors.find(v => v.name.toLowerCase() === vName.toLowerCase());
    
    if (existingVendor) {
        existingVendor.materials.push(...materials);
        await db.from('vendors').update({ materials: existingVendor.materials }).eq('name', existingVendor.name);
    }
    else {
        const newVendor = { name: vName, materials: materials };
        appData.vendors.push(newVendor);
        await db.from('vendors').insert([newVendor]);
    }

    showToast("Vendor Configuration Saved!");
    document.getElementById('vm-name').value = '';
    document.getElementById('vm-materials-container').innerHTML = `<div class="form-grid vm-material-row"><div class="form-group"><label>Material Name</label><input type="text" class="vm-mat-name"></div><div class="form-group"><label>Rate (₹)</label><input type="number" class="vm-mat-rate"></div></div>`;
}

// ==========================================
// PENDING REPORTS & VENDOR REPORTS
// ==========================================

let prClientSort = { col: null, asc: true };
function sortPRClient(col) {
    if(prClientSort.col === col) prClientSort.asc = !prClientSort.asc;
    else { prClientSort.col = col; prClientSort.asc = true; }
    renderPRClient();
}

function renderPRClient() {
    const tbody = document.querySelector('#pr-client-table tbody');
    tbody.innerHTML = '';
    
    let filteredOrders = Object.values(appData.orders).filter(o => parseFloat(o.balance) > 0);
    
    const fId = (document.getElementById('prc-filt-id')?.value || '').toLowerCase();
    const fClient = (document.getElementById('prc-filt-client')?.value || '').toLowerCase();
    const fPhone = (document.getElementById('prc-filt-phone')?.value || '').toLowerCase();
    const fBal = parseFloat(document.getElementById('prc-filt-bal')?.value);

    filteredOrders = filteredOrders.filter(o => {
        if(fId && !o.orderId.toLowerCase().includes(fId)) return false;
        if(fClient && !o.client.toLowerCase().includes(fClient)) return false;
        if(fPhone && !o.phone.includes(fPhone)) return false;
        if(!isNaN(fBal) && parseFloat(o.balance) > fBal) return false;
        return true;
    });

    if(prClientSort.col) {
        filteredOrders.sort((a, b) => {
            let valA = a[prClientSort.col] || ''; let valB = b[prClientSort.col] || '';
            if(prClientSort.col === 'balance') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(valA < valB) return prClientSort.asc ? -1 : 1;
            if(valA > valB) return prClientSort.asc ? 1 : -1;
            return 0;
        });
    }

    if (filteredOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--gray);">No pending dues found.</td></tr>`;
        return;
    }

    filteredOrders.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${o.orderId}</strong></td><td>${o.client}</td><td>${o.phone}</td><td style="color: red; font-weight: bold;">₹${o.balance}</td>`;
        tbody.appendChild(tr);
    });
}

let prVendorSort = { col: null, asc: true };
function sortPRVendor(col) {
    if(prVendorSort.col === col) prVendorSort.asc = !prVendorSort.asc;
    else { prVendorSort.col = col; prVendorSort.asc = true; }
    renderPRVendor();
}

function renderPRVendor() {
    const tbody = document.querySelector('#pr-vendor-table tbody');
    tbody.innerHTML = '';
    
    let filteredHistory = [...(appData.vendorAllotmentsHistory || [])];
    
    const fDate = (document.getElementById('prv-filt-date')?.value || '').toLowerCase();
    const fOrder = (document.getElementById('prv-filt-order')?.value || '').toLowerCase();
    const fVendor = (document.getElementById('prv-filt-vendor')?.value || '').toLowerCase();
    const fWork = (document.getElementById('prv-filt-work')?.value || '').toLowerCase();
    const fAmt = parseFloat(document.getElementById('prv-filt-amt')?.value);

    filteredHistory = filteredHistory.filter(o => {
        if(fDate && !new Date(o.date).toLocaleDateString().includes(fDate)) return false;
        if(fOrder && !o.orderId.toLowerCase().includes(fOrder)) return false;
        if(fVendor && !o.vendor.toLowerCase().includes(fVendor)) return false;
        if(fWork && !o.work.toLowerCase().includes(fWork)) return false;
        if(!isNaN(fAmt) && parseFloat(o.amount) > fAmt) return false;
        return true;
    });

    if(prVendorSort.col) {
        filteredHistory.sort((a, b) => {
            let valA = a[prVendorSort.col] || ''; let valB = b[prVendorSort.col] || '';
            if(prVendorSort.col === 'amount') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(prVendorSort.col === 'date') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
            if(valA < valB) return prVendorSort.asc ? -1 : 1;
            if(valA > valB) return prVendorSort.asc ? 1 : -1;
            return 0;
        });
    }

    if (filteredHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--gray);">No vendor allotments found.</td></tr>`;
        return;
    }

    filteredHistory.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(o.date).toLocaleDateString()}</td><td><strong>${o.orderId}</strong></td><td>${o.vendor}</td><td>${o.work}</td><td style="font-weight: bold;">₹${o.amount}</td>`;
        tbody.appendChild(tr);
    });
}

let vrSort = { col: null, asc: true };
function sortVR(col) {
    if(vrSort.col === col) vrSort.asc = !vrSort.asc;
    else { vrSort.col = col; vrSort.asc = true; }
    renderVendorReport();
}

function renderVendorReport() {
    const tbody = document.querySelector('#vr-table tbody');
    tbody.innerHTML = '';
    
    let filteredHistory = [...(appData.vendorAllotmentsHistory || [])];
    
    const fDate = (document.getElementById('vr-filt-date')?.value || '').toLowerCase();
    const fOrder = (document.getElementById('vr-filt-order')?.value || '').toLowerCase();
    const fVendor = (document.getElementById('vr-filt-vendor')?.value || '').toLowerCase();
    const fWork = (document.getElementById('vr-filt-work')?.value || '').toLowerCase();
    const fAmt = parseFloat(document.getElementById('vr-filt-amt')?.value);

    filteredHistory = filteredHistory.filter(o => {
        if(fDate && !new Date(o.date).toLocaleDateString().includes(fDate)) return false;
        if(fOrder && !o.orderId.toLowerCase().includes(fOrder)) return false;
        if(fVendor && !o.vendor.toLowerCase().includes(fVendor)) return false;
        if(fWork && !o.work.toLowerCase().includes(fWork)) return false;
        if(!isNaN(fAmt) && parseFloat(o.amount) > fAmt) return false;
        return true;
    });

    if(vrSort.col) {
        filteredHistory.sort((a, b) => {
            let valA = a[vrSort.col] || ''; let valB = b[vrSort.col] || '';
            if(vrSort.col === 'amount') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(vrSort.col === 'date') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
            if(valA < valB) return vrSort.asc ? -1 : 1;
            if(valA > valB) return vrSort.asc ? 1 : -1;
            return 0;
        });
    }

    if (filteredHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--gray);">No vendor allotments found.</td></tr>`;
        return;
    }

    filteredHistory.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(o.date).toLocaleDateString()}</td><td><strong>${o.orderId}</strong></td><td>${o.vendor}</td><td>${o.work}</td><td style="font-weight: bold;">₹${o.amount}</td>`;
        tbody.appendChild(tr);
    });
}

// Dedicated PDF/Excel Downloaders for Filtered Views
function getFilteredPRClient() {
    let filteredOrders = Object.values(appData.orders).filter(o => parseFloat(o.balance) > 0);
    const fId = (document.getElementById('prc-filt-id')?.value || '').toLowerCase();
    const fClient = (document.getElementById('prc-filt-client')?.value || '').toLowerCase();
    const fPhone = (document.getElementById('prc-filt-phone')?.value || '').toLowerCase();
    const fBal = parseFloat(document.getElementById('prc-filt-bal')?.value);
    let result = filteredOrders.filter(o => {
        if(fId && !o.orderId.toLowerCase().includes(fId)) return false;
        if(fClient && !o.client.toLowerCase().includes(fClient)) return false;
        if(fPhone && !o.phone.includes(fPhone)) return false;
        if(!isNaN(fBal) && parseFloat(o.balance) > fBal) return false;
        return true;
    });
    if(prClientSort.col) {
        result.sort((a, b) => {
            let valA = a[prClientSort.col] || ''; let valB = b[prClientSort.col] || '';
            if(prClientSort.col === 'balance') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(valA < valB) return prClientSort.asc ? -1 : 1;
            if(valA > valB) return prClientSort.asc ? 1 : -1;
            return 0;
        });
    }
    return result;
}
function getFilteredPRVendor(prefix, sortObj) {
    let filteredHistory = [...(appData.vendorAllotmentsHistory || [])];
    const fDate = (document.getElementById(prefix + '-filt-date')?.value || '').toLowerCase();
    const fOrder = (document.getElementById(prefix + '-filt-order')?.value || '').toLowerCase();
    const fVendor = (document.getElementById(prefix + '-filt-vendor')?.value || '').toLowerCase();
    const fWork = (document.getElementById(prefix + '-filt-work')?.value || '').toLowerCase();
    const fAmt = parseFloat(document.getElementById(prefix + '-filt-amt')?.value);
    let result = filteredHistory.filter(o => {
        if(fDate && !new Date(o.date).toLocaleDateString().includes(fDate)) return false;
        if(fOrder && !o.orderId.toLowerCase().includes(fOrder)) return false;
        if(fVendor && !o.vendor.toLowerCase().includes(fVendor)) return false;
        if(fWork && !o.work.toLowerCase().includes(fWork)) return false;
        if(!isNaN(fAmt) && parseFloat(o.amount) > fAmt) return false;
        return true;
    });
    if(sortObj.col) {
        result.sort((a, b) => {
            let valA = a[sortObj.col] || ''; let valB = b[sortObj.col] || '';
            if(sortObj.col === 'amount') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
            if(sortObj.col === 'date') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
            if(valA < valB) return sortObj.asc ? -1 : 1;
            if(valA > valB) return sortObj.asc ? 1 : -1;
            return 0;
        });
    }
    return result;
}

function downloadPRClientPDF() {
    let pendingOrders = getFilteredPRClient();
    let html = `<div style="padding: 20px; font-family: 'Poppins', sans-serif;"><h2 style="color: #f26522; border-bottom: 2px solid #f26522; padding-bottom: 10px;">Filtered Client Dues</h2><p>Generated on: ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px;"><thead><tr style="background-color: #f4f4f4; text-align: left;"><th style="padding: 10px; border: 1px solid #ddd;">Order ID</th><th style="padding: 10px; border: 1px solid #ddd;">Client Name</th><th style="padding: 10px; border: 1px solid #ddd;">Contact</th><th style="padding: 10px; border: 1px solid #ddd;">Balance Due (₹)</th></tr></thead><tbody>`;
    let totalDues = 0;
    pendingOrders.forEach(o => { totalDues += parseFloat(o.balance); html += `<tr><td style="padding: 8px; border: 1px solid #ddd;">${o.orderId}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.client}</td><td style="padding: 8px; border: 1px solid #ddd;">${o.phone}</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: red;">₹${o.balance}</td></tr>`; });
    html += `</tbody><tfoot><tr><td colspan="3" style="text-align: right; padding: 10px; font-weight: bold;">Filtered Grand Total:</td><td style="padding: 10px; font-weight: bold; font-size: 16px; color: red;">₹${totalDues}</td></tr></tfoot></table></div>`;
    html2pdf().set({ margin: 10, filename: `Filtered_Client_Dues_${Date.now()}.pdf`, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(html).save();
}
function downloadPRClientExcel() {
    let pendingOrders = getFilteredPRClient().map(o => ({ "Order ID": o.orderId, "Client Name": o.client, "Contact Number": o.phone, "Pending Balance (₹)": o.balance }));
    if (pendingOrders.length === 0) return alert("No pending client dues!");
    let worksheet = XLSX.utils.json_to_sheet(pendingOrders); let workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Client Dues"); XLSX.writeFile(workbook, `Filtered_Client_Dues_${Date.now()}.xlsx`);
}

function downloadPRVendorPDF() {
    let history = getFilteredPRVendor('prv', prVendorSort);
    let html = `<div style="padding: 20px; font-family: 'Poppins', sans-serif;"><h2 style="color: #4a238b; border-bottom: 2px solid #4a238b; padding-bottom: 10px;">Filtered Vendor Allotments</h2><p>Generated on: ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;"><thead><tr style="background-color: #f4f4f4; text-align: left;"><th style="padding: 10px; border: 1px solid #ddd;">Date</th><th style="padding: 10px; border: 1px solid #ddd;">Vendor Name</th><th style="padding: 10px; border: 1px solid #ddd;">Order ID</th><th style="padding: 10px; border: 1px solid #ddd;">Work Allotted</th><th style="padding: 10px; border: 1px solid #ddd;">Amount (₹)</th></tr></thead><tbody>`;
    let totalAllotments = 0;
    history.forEach(v => { totalAllotments += parseFloat(v.amount); html += `<tr><td style="padding: 8px; border: 1px solid #ddd;">${new Date(v.date).toLocaleDateString()}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.vendor}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.orderId}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.work}</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">₹${v.amount}</td></tr>`; });
    html += `</tbody><tfoot><tr><td colspan="4" style="text-align: right; padding: 10px; font-weight: bold;">Filtered Total Amount:</td><td style="padding: 10px; font-weight: bold; font-size: 16px;">₹${totalAllotments}</td></tr></tfoot></table></div>`;
    html2pdf().set({ margin: 10, filename: `Filtered_Vendor_Allotments_${Date.now()}.pdf`, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(html).save();
}
function downloadPRVendorExcel() {
    let history = getFilteredPRVendor('prv', prVendorSort).map(v => ({ "Date": new Date(v.date).toLocaleDateString(), "Vendor Name": v.vendor, "Order ID": v.orderId, "Work Allotted": v.work, "Amount (₹)": v.amount }));
    if (history.length === 0) return alert("No vendor records found!");
    let worksheet = XLSX.utils.json_to_sheet(history); let workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Vendor Allotments"); XLSX.writeFile(workbook, `Filtered_Vendor_Allotments_${Date.now()}.xlsx`);
}

function downloadVRPDF() {
    let history = getFilteredPRVendor('vr', vrSort);
    let html = `<div style="padding: 20px; font-family: 'Poppins', sans-serif;"><h2 style="color: #4a238b; border-bottom: 2px solid #4a238b; padding-bottom: 10px;">Filtered Vendor Reports</h2><p>Generated on: ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;"><thead><tr style="background-color: #f4f4f4; text-align: left;"><th style="padding: 10px; border: 1px solid #ddd;">Date</th><th style="padding: 10px; border: 1px solid #ddd;">Vendor Name</th><th style="padding: 10px; border: 1px solid #ddd;">Order ID</th><th style="padding: 10px; border: 1px solid #ddd;">Work Allotted</th><th style="padding: 10px; border: 1px solid #ddd;">Amount (₹)</th></tr></thead><tbody>`;
    let totalAllotments = 0;
    history.forEach(v => { totalAllotments += parseFloat(v.amount); html += `<tr><td style="padding: 8px; border: 1px solid #ddd;">${new Date(v.date).toLocaleDateString()}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.vendor}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.orderId}</td><td style="padding: 8px; border: 1px solid #ddd;">${v.work}</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">₹${v.amount}</td></tr>`; });
    html += `</tbody><tfoot><tr><td colspan="4" style="text-align: right; padding: 10px; font-weight: bold;">Filtered Total Amount:</td><td style="padding: 10px; font-weight: bold; font-size: 16px;">₹${totalAllotments}</td></tr></tfoot></table></div>`;
    html2pdf().set({ margin: 10, filename: `Vendor_Reports_${Date.now()}.pdf`, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(html).save();
}
function downloadVRExcel() {
    let history = getFilteredPRVendor('vr', vrSort).map(v => ({ "Date": new Date(v.date).toLocaleDateString(), "Vendor Name": v.vendor, "Order ID": v.orderId, "Work Allotted": v.work, "Amount (₹)": v.amount }));
    if (history.length === 0) return alert("No vendor records found!");
    let worksheet = XLSX.utils.json_to_sheet(history); let workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Vendor Reports"); XLSX.writeFile(workbook, `Vendor_Reports_${Date.now()}.xlsx`);
}

// ==========================================
// STAFF MASTER & STAFF PICKUP
// ==========================================
async function saveStaff() {
    const name = document.getElementById('sm-name').value.trim();
    const phone = document.getElementById('sm-phone').value.trim();
    if(!name || phone.length !== 10) return alert("Valid name and 10-digit number required.");
    
    const newStaff = { id: Date.now(), name, phone };
    appData.staff.push(newStaff); 
    
    // DB Update
    await db.from('staff').insert([newStaff]);

    document.getElementById('sm-name').value = ''; 
    document.getElementById('sm-phone').value = '';
    renderStaffTable(); 
    showToast("Staff Member Saved!");
}

function renderStaffTable() {
    const tbody = document.querySelector('#staff-table tbody'); tbody.innerHTML = '';
    appData.staff.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${s.name}</strong></td><td>${s.phone}</td><td><button onclick="removeStaff(${s.id})" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

async function removeStaff(id) { 
    appData.staff = appData.staff.filter(s => s.id !== id); 
    // DB Update
    await db.from('staff').delete().eq('id', id);
    renderStaffTable(); 
}

let currentlySearchedOrderId = null;
function searchPickup() {
    const order = findOrder(document.getElementById('pickup-search-input').value);
    if(order) {
        currentlySearchedOrderId = order.orderId;
        document.getElementById('pick-oid').innerText = order.orderId;
        document.getElementById('pick-client').innerText = order.client;
        document.getElementById('pick-work').innerText = order.work || 'N/A';
        document.getElementById('pick-vendor').innerText = order.vendorName || 'Not Allotted';
        document.getElementById('pickup-result-card').style.display = 'block';
    }
}
        
function markStaffPickupReady() {
    const order = appData.orders[currentlySearchedOrderId];
    if(!order) return;
    order.status = 'ready_for_delivery';
    
    // We update async in background without blocking UI
    db.from('orders').update({ status: 'ready_for_delivery' }).eq('orderId', order.orderId);
    
    let msg = `Hello Team,\n\nPlease pick up the following order:\n*Order ID:* ${order.orderId}\n*Vendor Name:* ${order.vendorName || 'Not Listed'}\n*Work Details:* ${order.work}\n\nThank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    
    showToast(`Pickup Ready Notification Triggered`);
    document.getElementById('pickup-result-card').style.display = 'none';
    document.getElementById('pickup-search-input').value = '';
    updateDashboardStats();
}

// ==========================================
// PAYMENTS & BILL GENERATOR
// ==========================================
function searchPayment() {
    const order = findOrder(document.getElementById('pay-search-input').value);
    if(order) {
        currentlySearchedOrderId = order.orderId;
        document.getElementById('pa-oid').innerText = order.orderId;
        document.getElementById('pa-bal').innerText = order.balance;
        document.getElementById('pay-result-card').style.display = 'block';

        const payBtn = document.getElementById('receive-payment-btn');
        const paidMsg = document.getElementById('pa-paid-msg');
        if(parseFloat(order.balance) <= 0) {
            payBtn.style.display = 'none';
            paidMsg.style.display = 'block';
        } else {
            payBtn.style.display = 'inline-block';
            paidMsg.style.display = 'none';
        }
    } else alert("Order Not Found");
}
        
function openPaymentModal(id) { 
    const order = appData.orders[id];
    if(parseFloat(order.balance) <= 0) return alert("This order is already fully paid.");
    
    document.getElementById('modal-order-id').innerText = id; 
    
    const amtInput = document.getElementById('pay-modal-amt');
    amtInput.max = order.balance; 
    amtInput.value = order.balance; 
    
    document.getElementById('paymentModal').style.display = 'flex'; 
}
        
function closePaymentModal() { document.getElementById('paymentModal').style.display = 'none'; }
        
async function submitPayment() {
    const amt = parseFloat(document.getElementById('pay-modal-amt').value) || 0;
    const ro = parseFloat(document.getElementById('pay-modal-roundoff').value) || 0;
    const order = appData.orders[currentlySearchedOrderId];
    
    if(order && (amt > 0 || ro > 0)) {
        if((amt + ro) > parseFloat(order.balance)) {
            return alert("Total deduction (Payment + Round Off) cannot exceed the pending balance of ₹" + order.balance);
        }
        
        order.advance = (parseFloat(order.advance) + amt).toFixed(2);
        order.balance = (parseFloat(order.balance) - (amt + ro)).toFixed(2);
        
        // DB Update
        await db.from('orders').update({ advance: order.advance, balance: order.balance }).eq('orderId', order.orderId);
        
        showToast(`Payment of ₹${amt} and Round off of ₹${ro} received.`);
        document.getElementById('pay-modal-amt').value = '';
        document.getElementById('pay-modal-roundoff').value = '0';
        
        closePaymentModal(); 
        searchPayment(); 
        updateDashboardStats();

        if(parseFloat(order.balance) <= 0) {
            openBillGenerator(order);
        }
    } else {
        alert("Please enter a valid amount or round off value.");
    }
}

// --- Bill Logic ---
function openBillGenerator(order) {
    document.getElementById('billModal').style.display = 'flex';
    document.getElementById('bill-client-info').value = `${order.client}\nPhone: ${order.phone}`;
    document.getElementById('billNo').value = order.orderId;
    const today = new Date();
    document.getElementById('billDate').value = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const tbody = document.getElementById('billTableBody');
    tbody.innerHTML = '';
    
    const workItems = order.work ? order.work.split(', ') : ["General Print Work"];
    let roughSplitAmt = (parseFloat(order.amount) / workItems.length).toFixed(2);

    workItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input type="text" value="${item}"></td><td><input type="text" class="center" placeholder="Size"></td><td><input type="number" class="center copies" value="1" oninput="calculateBillTotal()"></td><td><input type="number" class="right total-field" value="${roughSplitAmt}" oninput="calculateBillTotal()"></td><td class="center print-hide"><button type="button" onclick="removeBillRow(this)" style="background:none;border:none;color:red;cursor:pointer;font-weight:bold;">&times;</button></td>`;
        tbody.appendChild(tr);
    });
    calculateBillTotal();
}

function addBillRow() {
    const tbody = document.getElementById('billTableBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="text" placeholder="Item description"></td><td><input type="text" class="center" placeholder="Size"></td><td><input type="number" class="center copies" placeholder="0" oninput="calculateBillTotal()"></td><td><input type="number" class="right total-field" placeholder="0.00" oninput="calculateBillTotal()"></td><td class="center print-hide"><button type="button" onclick="removeBillRow(this)" style="background:none;border:none;color:red;cursor:pointer;font-weight:bold;">&times;</button></td>`;
    tbody.appendChild(tr);
}

function removeBillRow(btn) {
    const row = btn.parentNode.parentNode;
    if(document.getElementById('billTableBody').rows.length > 1) {
        row.parentNode.removeChild(row);
        calculateBillTotal();
    }
}

function calculateBillTotal() {
    const totalFields = document.querySelectorAll('#billTableBody .total-field');
    let grandTotal = 0;
    totalFields.forEach(field => {
        const val = parseFloat(field.value);
        if (!isNaN(val)) grandTotal += val;
    });
    document.getElementById('billGrandTotal').innerText = grandTotal.toFixed(2);
}

function downloadBillAndWhatsApp() {
    const element = document.getElementById('bill-render-area');
    const orderId = document.getElementById('billNo').value;
    const clientInfo = document.getElementById('bill-client-info').value;
    const phoneMatch = clientInfo.match(/Phone:\s*(\d{10})/);
    const phone = phoneMatch ? phoneMatch[1] : '';

    const opt = { margin: 0, filename: `Bill_${orderId}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };

    document.getElementById('bill-controls-section').style.display = 'none';
    const hideTds = document.querySelectorAll('.print-hide');
    hideTds.forEach(td => td.style.display = 'none');

    html2pdf().set(opt).from(element).save().then(() => {
        document.getElementById('bill-controls-section').style.display = 'flex';
        hideTds.forEach(td => td.style.display = '');

        if(phone) {
            const msg = `Dear Customer,\nYour payment for Order ${orderId} is complete.\nWe have generated your final bill. Please find the attached document.\nThank you for choosing us!`;
            window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
        }
        document.getElementById('billModal').style.display = 'none';
    });
}

// ==========================================
// DELIVERY
// ==========================================
function searchDelivery() {
    const order = findOrder(document.getElementById('del-search-input').value);
    if(order) {
        document.getElementById('res-oid').innerText = order.orderId;
        document.getElementById('res-bal').innerText = order.balance;
        document.getElementById('res-phone').innerText = order.phone;
        document.getElementById('del-result-card').style.display = 'block';
    }
}
function sendDeliveryWhatsApp() {
    const phone = document.getElementById('res-phone').innerText;
    const msg = `Dear Customer, your order ${document.getElementById('res-oid').innerText} is ready for delivery!`;
    const order = findOrder(document.getElementById('res-oid').innerText);
    
    if(order) {
        order.status = 'delivered';
        // DB update
        db.from('orders').update({ status: 'delivered' }).eq('orderId', order.orderId);
    }
    
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank'); 
    updateDashboardStats();
}