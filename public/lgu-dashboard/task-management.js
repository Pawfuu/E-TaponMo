import { TaskService } from './task-service.js';

// task-management.js
// TODO: connect Firebase via task-service.js when ready.

document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const taskService = new TaskService();

// State variables for data from service
let CURRENT_USER = '';
let tasks = [];
let barangayCounts = [];
let STAT_TOTAL = 0;
let STAT_ASSIGNED = 0;
let STAT_OVERDUE = 0;
let STAT_COMPLETED = 0;
let overview = [];

// ---------------------------------------------------------------------
// Priority / status style maps
// ---------------------------------------------------------------------
const priorityStyle = {
    High: 'bg-rose-50 text-rose-600 border border-rose-100',
    Medium: 'bg-amber-50 text-amber-700 border border-amber-100',
    Low: 'bg-blue-50 text-blue-600 border border-blue-100',
};

const statusStyle = {
    Planning: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' },
    Assigned: { dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-600' },
    Pending: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
    'In Progress': { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-600' },
    Overdue: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-600' },
    Completed: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-600' },
};

// ---------------------------------------------------------------------
// Filter / tab / search state
// ---------------------------------------------------------------------
const state = {
    tab: 'all',
    status: 'all',
    priority: 'all',
    assignee: 'all',
    barangay: 'all',
    search: '',
    page: 1,
};
const PAGE_SIZE = 7;

function applyFilters() {
    let list = tasks.slice();

    if (state.tab === 'mine') list = list.filter(t => t.assignee === CURRENT_USER);
    if (state.tab === 'overdue') list = list.filter(t => t.status === 'Overdue');
    if (state.tab === 'completed') list = list.filter(t => t.status === 'Completed');

    if (state.status !== 'all') list = list.filter(t => t.status === state.status);
    if (state.priority !== 'all') list = list.filter(t => t.priority === state.priority);
    if (state.assignee !== 'all') list = list.filter(t => t.assignee === state.assignee);
    if (state.barangay !== 'all') list = list.filter(t => t.barangay === state.barangay);

    if (state.search.trim()) {
        const q = state.search.trim().toLowerCase();
        list = list.filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    }

    return list;
}

// ---------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------
const tbody = document.getElementById('task-table-body');
const counter = document.getElementById('table-results-counter');
const pager = document.getElementById('pagination-controls');

function renderTable() {
    const filtered = applyFilters();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = '';
    pageItems.forEach((t, i) => {
        const st = statusStyle[t.status] || statusStyle.Planning;
        const initials = t.assignee.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors animate-table-row';
        tr.style.animationDelay = `${i * 30}ms`;
        tr.innerHTML = `
      <td class="px-5 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${t.id}</td>
      <td class="px-5 py-3.5">
        <p class="font-semibold text-slate-800">${t.title}</p>
      </td>
      <td class="px-5 py-3.5 text-slate-600 whitespace-nowrap">${t.barangay}</td>
      <td class="px-5 py-3.5">
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-black flex-shrink-0">${initials}</span>
          <div class="min-w-0">
            <p class="font-semibold text-slate-800 truncate">${t.assignee}</p>
            <p class="text-[10px] text-slate-400 truncate">${t.team}</p>
          </div>
        </div>
      </td>
      <td class="px-5 py-3.5">
        <span class="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${priorityStyle[t.priority]}">${t.priority}</span>
      </td>
      <td class="px-5 py-3.5 text-slate-600 whitespace-nowrap">${t.due}</td>
      <td class="px-5 py-3.5">
        <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.pill}">
          <span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>${t.status}
        </span>
      </td>
      <td class="px-5 py-3.5 text-right">
        <button class="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors inline-flex items-center justify-center">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m-7-7h14"/></svg>
        </button>
      </td>
    `;
        tbody.appendChild(tr);
    });

    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-5 py-10 text-center text-slate-400 text-xs">No tasks match your filters.</td></tr>`;
    }

    counter.textContent = filtered.length
        ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} tasks`
        : 'Showing 0 tasks';

    renderPagination(totalPages);
    renderTabCounts();
}

function renderPagination(totalPages) {
    pager.innerHTML = '';
    const mkBtn = (label, page, opts = {}) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = `w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${opts.active ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
            } ${opts.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`;
        if (!opts.disabled) b.addEventListener('click', () => { state.page = page; renderTable(); });
        return b;
    };
    pager.appendChild(mkBtn('‹', Math.max(1, state.page - 1), { disabled: state.page === 1 }));
    for (let p = 1; p <= totalPages; p++) {
        pager.appendChild(mkBtn(String(p), p, { active: p === state.page }));
    }
    pager.appendChild(mkBtn('›', Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages }));
}

function renderTabCounts() {
    document.getElementById('tab-count-all').textContent = `(${STAT_TOTAL})`;
    document.getElementById('tab-count-mine').textContent = `(${tasks.filter(t => t.assignee === CURRENT_USER).length})`;
    document.getElementById('tab-count-overdue').textContent = `(${STAT_OVERDUE})`;
    document.getElementById('tab-count-completed').textContent = `(${STAT_COMPLETED})`;
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
const tabButtons = {
    all: document.getElementById('tab-all'),
    mine: document.getElementById('tab-mine'),
    overdue: document.getElementById('tab-overdue'),
    completed: document.getElementById('tab-completed'),
};
Object.entries(tabButtons).forEach(([key, btn]) => {
    btn.addEventListener('click', () => {
        state.tab = key;
        state.page = 1;
        Object.values(tabButtons).forEach(b => {
            b.classList.remove('border-emerald-600', 'text-emerald-600', 'font-bold', 'active-task-tab');
            b.classList.add('border-transparent');
        });
        btn.classList.add('border-emerald-600', 'text-emerald-600', 'font-bold', 'active-task-tab');
        btn.classList.remove('border-transparent');
        renderTable();
    });
});

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------
document.getElementById('task-search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.page = 1;
    renderTable();
});

// ---------------------------------------------------------------------
// Generic dropdown wiring (status / priority / assignee / barangay)
// ---------------------------------------------------------------------
function wireDropdown(btnId, menuId, textId, stateKey, defaultLabel) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    const text = document.getElementById(textId);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('[id^="dd-"][id$="-menu"]').forEach(m => { if (m !== menu) m.classList.add('hidden'); });
        menu.classList.toggle('hidden');
    });

    menu.addEventListener('click', (e) => {
        const opt = e.target.closest('.dd-opt');
        if (!opt) return;
        state[stateKey] = opt.dataset.value;
        text.textContent = opt.dataset.value === 'all' ? defaultLabel : opt.dataset.value;
        menu.classList.add('hidden');
        state.page = 1;
        renderTable();
    });
}

wireDropdown('dd-status-btn', 'dd-status-menu', 'dd-status-text', 'status', 'All Status');
wireDropdown('dd-priority-btn', 'dd-priority-menu', 'dd-priority-text', 'priority', 'All Priorities');

// Assignee + barangay menus are built dynamically from task data
function buildDynamicMenu(menuId, values, defaultLabel) {
    const menu = document.getElementById(menuId);
    menu.innerHTML = `<div class="dd-opt px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">${defaultLabel}</div>`;
    values.forEach(v => {
        const div = document.createElement('div');
        div.className = 'dd-opt px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors';
        div.dataset.value = v;
        div.textContent = v;
        menu.appendChild(div);
    });
}

// Unique assignees and barangays will be initialized in init()

document.addEventListener('click', () => {
    document.querySelectorAll('[id^="dd-"][id$="-menu"]').forEach(m => m.classList.add('hidden'));
});

// Reset filters
document.getElementById('reset-filters-btn').addEventListener('click', () => {
    state.status = 'all'; state.priority = 'all'; state.assignee = 'all'; state.barangay = 'all'; state.search = '';
    document.getElementById('dd-status-text').textContent = 'All Status';
    document.getElementById('dd-priority-text').textContent = 'All Priorities';
    document.getElementById('dd-assignee-text').textContent = 'All Assignees';
    document.getElementById('dd-barangay-text').textContent = 'All Barangays';
    document.getElementById('task-search-input').value = '';
    state.page = 1;
    renderTable();
});

// New Task button (placeholder action for prototype)
document.getElementById('new-task-btn').addEventListener('click', () => {
    alert('New Task form coming soon.');
});

// ---------------------------------------------------------------------
// Service Queue by Barangay (sidebar)
// ---------------------------------------------------------------------
const levelColor = { High: 'bg-rose-500', Medium: 'bg-amber-500', Low: 'bg-emerald-500' };
const levelText = { High: 'text-rose-600', Medium: 'text-amber-600', Low: 'text-emerald-600' };

function renderServiceQueue() {
    const container = document.getElementById('service-queue-list');
    const max = Math.max(...barangayCounts.map(b => b.count));
    container.innerHTML = '';
    barangayCounts.forEach(b => {
        const pct = Math.round((b.count / max) * 100);
        const row = document.createElement('div');
        row.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-bold text-slate-700">${b.name}</span>
        <span class="text-xs font-black ${levelText[b.level]}">${b.count}</span>
      </div>
      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full ${levelColor[b.level]} rounded-full" style="width:${pct}%"></div>
      </div>
    `;
        container.appendChild(row);
    });
}

// ---------------------------------------------------------------------
// Task Overview donut (sidebar)
// ---------------------------------------------------------------------
// Overview data will be initialized in init()

function renderDonut() {
    const total = overview.reduce((s, o) => s + o.value, 0);
    document.getElementById('task-donut-total').textContent = STAT_TOTAL;

    let cursor = 0;
    const stops = overview.map(o => {
        const startPct = (cursor / total) * 100;
        cursor += o.value;
        const endPct = (cursor / total) * 100;
        return `${o.color} ${startPct}% ${endPct}%`;
    }).join(', ');
    document.getElementById('task-donut-chart').style.background = `conic-gradient(${stops})`;

    const legend = document.getElementById('task-donut-legend');
    legend.innerHTML = '';
    overview.forEach(o => {
        const pct = Math.round((o.value / total) * 100);
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2';
        row.innerHTML = `
      <span class="flex items-center gap-2 truncate">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${o.color}"></span>
        <span class="truncate">${o.label}</span>
      </span>
      <span class="text-slate-400 font-semibold flex-shrink-0">${pct}%</span>
    `;
        legend.appendChild(row);
    });
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
async function init() {
    CURRENT_USER = await taskService.getCurrentUser();
    barangayCounts = await taskService.getBarangayCounts();
    
    const stats = await taskService.getStats();
    STAT_TOTAL = stats.total;
    STAT_ASSIGNED = stats.assigned;
    STAT_OVERDUE = stats.overdue;
    STAT_COMPLETED = stats.completed;

    document.getElementById('stat-total').textContent = STAT_TOTAL;
    document.getElementById('stat-assigned').textContent = STAT_ASSIGNED;
    document.getElementById('stat-overdue').textContent = STAT_OVERDUE;
    document.getElementById('stat-completed').textContent = STAT_COMPLETED;

    overview = await taskService.getOverview();

    wireDropdown('dd-assignee-btn', 'dd-assignee-menu', 'dd-assignee-text', 'assignee', 'All Assignees');
    wireDropdown('dd-barangay-btn', 'dd-barangay-menu', 'dd-barangay-text', 'barangay', 'All Barangays');

    renderServiceQueue();
    renderDonut();

    taskService.subscribeTasks((newTasks) => {
        tasks = newTasks;
        
        const uniqueAssignees = [...new Set(tasks.map(t => t.assignee))];
        const uniqueBarangays = [...new Set(tasks.map(t => t.barangay))];
        buildDynamicMenu('dd-assignee-menu', uniqueAssignees, 'All Assignees');
        buildDynamicMenu('dd-barangay-menu', uniqueBarangays, 'All Barangays');

        renderTable();
    });
}

init();