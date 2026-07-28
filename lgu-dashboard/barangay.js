import { BarangayService } from './barangay-service.js';

const barangayService = new BarangayService();

function renderBoard(barangays) {
    const board = document.getElementById('board');
    if (!board) return;

    // keep the head row
    const headHtml = `
      <div class="board-row head">
        <div>#</div>
        <div>Barangay</div>
        <div class="col-hide">Resolved</div>
        <div class="col-hide">Avg. Resp.</div>
        <div>Rate</div>
        <div class="col-hide">Segregation mix</div>
        <div class="col-hide">7-day trend</div>
        <div>Status</div>
      </div>
    `;

    // Sort barangays by rate descending
    const sorted = [...barangays].sort((a, b) => (b.rate || 0) - (a.rate || 0));

    let html = headHtml;
    sorted.forEach((b, index) => {
        const rank = index + 1;
        
        // segregation logic
        const seg = b.segregation || { biodeg: 25, recyc: 25, residual: 25, hazard: 25 };
        const total = (seg.biodeg || 0) + (seg.recyc || 0) + (seg.residual || 0) + (seg.hazard || 0) || 1;
        const pBio = ((seg.biodeg || 0) / total) * 100;
        const pRec = ((seg.recyc || 0) / total) * 100;
        const pRes = ((seg.residual || 0) / total) * 100;
        const pHaz = ((seg.hazard || 0) / total) * 100;
        
        // trend logic
        const trend = (b.trend || "stable").toLowerCase();
        let stampClass = "watch";
        let stampText = "STABLE";
        if (trend === "improving") { stampClass = "ok"; stampText = "IMPROVING"; }
        if (trend === "declining") { stampClass = "critical"; stampText = "NEEDS ACTION"; }

        // status logic
        let beaconClass = "ok";
        const status = (b.status || "ok").toLowerCase();
        if (status === "watch") beaconClass = "watch";
        if (status === "critical") beaconClass = "critical";

        html += `
          <div class="board-row">
            <div class="rank">${rank}</div>
            <div class="brgy-name">
              <div class="beacon ${beaconClass}"></div>
              <div>
                <div class="name">${b.name || 'Unknown'}</div>
                <div class="zone">${b.zone || ''}</div>
              </div>
            </div>
            <div class="num col-hide">${b.resolved || 0}</div>
            <div class="num col-hide">${b.avgResponse || '0h 0m'}</div>
            <div class="rate">${b.rate || 0}%</div>
            <div class="col-hide">
              <div class="seg-bar">
                <div style="width:${pBio}%; background:var(--biodeg)"></div>
                <div style="width:${pRec}%; background:var(--recyc)"></div>
                <div style="width:${pRes}%; background:var(--residual)"></div>
                <div style="width:${pHaz}%; background:var(--hazard)"></div>
              </div>
            </div>
            <div class="col-hide">
              <div class="stamp ${stampClass}">${stampText}</div>
            </div>
            <div>
              <span style="font-size:11px;font-weight:600;color:var(--ink);text-transform:capitalize">${status}</span>
            </div>
          </div>
        `;
    });

    board.innerHTML = html;
}

function init() {
    const footDate = document.getElementById('footDate');
    if (footDate) {
        footDate.textContent = new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    barangayService.subscribeBarangays((data) => {
        renderBoard(data);
    });
}

init();
