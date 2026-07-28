import { AiInsightService } from './ai-insight-service.js';

document.getElementById('footDate').textContent = new Date().toLocaleString('en-PH');

const icons = {
    anomaly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    prediction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>',
    recommendation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.05V17h6v-.25c0-.85.4-1.55 1-2.05A7 7 0 0 0 12 2Z"/></svg>'
};
const labels = { anomaly: 'Anomaly', prediction: 'Prediction', recommendation: 'Recommendation' };

let insights = [];
let activeFilter = 'all';

const feed = document.getElementById('feed');
const filterBtns = document.querySelectorAll('.filter-btn');

function render(list) {
    feed.innerHTML = '';
    list.forEach(ins => {
        const el = document.createElement('div');
        el.className = `insight ${ins.type}`;
        el.innerHTML = `
      <div class="iicon">${icons[ins.type]}</div>
      <div class="body">
        <span class="itype">${labels[ins.type]}</span>
        <p class="headline">${ins.headline}</p>
        <p class="detail">${ins.detail}</p>
        <p class="meta">${ins.meta}</p>
      </div>
      <div class="confidence">
        <div class="cval">${ins.confidence}%</div>
        <div class="clabel">Confidence</div>
        <div class="cbar"><div style="width:${ins.confidence}%"></div></div>
      </div>
    `;
        feed.appendChild(el);
    });
}

function applyFilter() {
    render(activeFilter === 'all' ? insights : insights.filter(i => i.type === activeFilter));
}

document.getElementById('filterRow').addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-btn')) return;
    filterBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    applyFilter();
});

const aiInsightService = new AiInsightService();

aiInsightService.subscribeInsights((data) => {
    insights = data;
    applyFilter();
});