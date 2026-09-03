// DPDP Control Plane & DPO Dashboard Frontend Application

let currentTab = 'overview';

// Navigation Tab Switching
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('bg-surface2', 'text-ink', 'font-medium');
    btn.classList.add('text-inkSubtle');
  });

  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-inkSubtle');
    activeBtn.classList.add('bg-surface2', 'text-ink', 'font-medium');
  }

  // Update views
  const views = ['overview', 'datamap', 'consents', 'dsr', 'ledger', 'agents'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  loadCurrentViewData();
}

// Fetch and render dashboard overview
async function fetchOverview() {
  try {
    const res = await fetch('/api/v1/dpo/overview');
    if (!res.ok) return;
    const data = await res.json();

    // 1. Update Scorecard
    const comp = data.compliance;
    document.getElementById('stat-grade').textContent = comp.grade;
    document.getElementById('stat-score').textContent = `${comp.overallScore}% Compliant`;
    document.getElementById('stat-agents').textContent = comp.metrics.connectedAgentsCount;
    document.getElementById('stat-pii').textContent = comp.metrics.piiFieldsClassifiedCount;
    document.getElementById('stat-tables').textContent = comp.metrics.discoveredTablesCount;
    document.getElementById('stat-ledger-blocks').textContent = comp.metrics.ledgerBlockCount;

    const validBadge = document.getElementById('stat-ledger-valid');
    if (comp.metrics.ledgerValid) {
      validBadge.textContent = 'Valid (Tamper-evident)';
      validBadge.className = 'text-semanticSuccess';
    } else {
      validBadge.textContent = 'COMPROMISED!';
      validBadge.className = 'text-red-500 font-bold';
    }

    // Breakdown bars
    document.getElementById('prog-discovery').textContent = `${comp.breakdown.catalogDiscoveryScore}%`;
    document.getElementById('bar-discovery').style.width = `${comp.breakdown.catalogDiscoveryScore}%`;

    document.getElementById('prog-consent').textContent = `${comp.breakdown.consentGovernanceScore}%`;
    document.getElementById('bar-consent').style.width = `${comp.breakdown.consentGovernanceScore}%`;

    document.getElementById('prog-dsr').textContent = `${comp.breakdown.dsrSlaAdherenceScore}%`;
    document.getElementById('bar-dsr').style.width = `${comp.breakdown.dsrSlaAdherenceScore}%`;

    document.getElementById('prog-ledger').textContent = `${comp.breakdown.ledgerIntegrityScore}%`;
    document.getElementById('bar-ledger').style.width = `${comp.breakdown.ledgerIntegrityScore}%`;

    // Recommendation
    if (comp.recommendations.length > 0) {
      document.getElementById('overview-recommendation').textContent = comp.recommendations[0];
    }

    // 2. Recent Telemetry Feed
    const eventsContainer = document.getElementById('overview-recent-events');
    const recentBlocks = (await (await fetch('/api/v1/dpo/ledger')).json()).blocks || [];

    if (recentBlocks.length === 0) {
      eventsContainer.innerHTML = `<div class="text-xs text-inkSubtle text-center py-6">No telemetry events logged yet. Waiting for agents...</div>`;
    } else {
      const topBlocks = recentBlocks.slice(-8).reverse();
      eventsContainer.innerHTML = topBlocks
        .map(
          (b) => `
        <div class="flex items-start justify-between p-3 rounded-lg bg-surface2 border hairline-border">
          <div class="space-y-0.5">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono ${getEventBadgeClass(b.eventType)}">${b.eventType}</span>
              <span class="text-xs text-ink font-medium">Block #${b.index}</span>
            </div>
            <div class="text-[11px] text-inkMuted font-mono truncate max-w-md">${JSON.stringify(b.payload)}</div>
          </div>
          <div class="text-[10px] text-inkTertiary font-mono">${new Date(b.timestamp).toLocaleTimeString()}</div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

function getEventBadgeClass(eventType) {
  if (eventType.includes('CONSENT_GRANTED') || eventType.includes('DISCOVERY')) {
    return 'bg-semanticSuccess/20 text-semanticSuccess';
  }
  if (eventType.includes('WITHDRAWN') || eventType.includes('INVALIDATE')) {
    return 'bg-amber-500/20 text-amber-400';
  }
  if (eventType.includes('DSR')) {
    return 'bg-primary/20 text-primaryHover';
  }
  return 'bg-surface3 text-inkSubtle';
}

// Fetch and render Data Map
async function fetchDataMap() {
  const container = document.getElementById('datamap-container');
  try {
    const res = await fetch('/api/v1/dpo/datamap');
    const data = await res.json();
    const tables = data.tables || [];

    if (tables.length === 0) {
      container.innerHTML = `
        <div class="col-span-2 p-12 text-center bg-surface1 rounded-xl border hairline-border text-xs text-inkSubtle">
          No tables discovered yet. Start the Zone Agent or click "Trigger Fleet Rescan".
        </div>
      `;
      return;
    }

    container.innerHTML = tables
      .map(
        (t) => `
      <div class="bg-surface1 rounded-xl border hairline-border p-5 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b hairline-border">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded bg-primary/40 border border-primary"></div>
            <h3 class="text-sm font-semibold text-ink font-mono">${t.tableName}</h3>
            <span class="text-[10px] text-inkTertiary font-mono">~${t.rowCountEstimate} rows</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] bg-surface2 border hairline-border text-inkSubtle font-mono">${t.targetId}</span>
        </div>

        <div class="space-y-2">
          ${t.columns
            .map((c) => {
              const pii = c.detectedPii;
              const hasPii = pii && pii.piiType !== 'UNKNOWN';
              return `
              <div class="flex items-center justify-between p-2 rounded bg-surface2/60 border hairline-border text-xs">
                <div class="flex items-center space-x-2">
                  <span class="font-mono text-ink font-medium">${c.name}</span>
                  <span class="text-[10px] text-inkTertiary font-mono">(${c.dataType})</span>
                  ${c.isPrimaryKey ? '<span class="text-[9px] px-1 py-0.2 bg-primary/20 text-primaryHover rounded">PK</span>' : ''}
                </div>
                <div class="flex items-center space-x-2">
                  ${
                    hasPii
                      ? `
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-semanticSuccess/20 text-semanticSuccess border border-semanticSuccess/30">
                      ${pii.piiType} (${Math.round(pii.confidence * 100)}%)
                    </span>
                    ${pii.sampleMasked ? `<span class="text-[10px] text-inkTertiary font-mono hidden sm:inline">[preview: ${pii.sampleMasked}]</span>` : ''}
                  `
                      : `<span class="text-[10px] text-inkTertiary font-mono">non-pii</span>`
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load data map:', err);
  }
}

// Fetch and render Consents
async function fetchConsents() {
  const tbody = document.getElementById('consents-table-body');
  try {
    const res = await fetch('/api/v1/dpo/overview');
    const data = await res.json();
    const consents = data.recentConsents || [];

    if (consents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-inkSubtle">No consent records found. Test with the demo e-com app signup.</td></tr>`;
      return;
    }

    tbody.innerHTML = consents
      .map(
        (c) => `
      <tr class="hover:bg-surface2/40 transition-colors">
        <td class="py-3 px-4 text-ink font-medium">${c.principalId}</td>
        <td class="py-3 px-4 text-inkSubtle">${c.noticeVersion}</td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1">
            ${c.consentedPurposes.map((p) => `<span class="px-1.5 py-0.5 rounded text-[10px] bg-surface3 text-inkMuted">${p}</span>`).join('')}
          </div>
        </td>
        <td class="py-3 px-4 text-inkSubtle">${c.channel}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${c.status === 'ACTIVE' ? 'bg-semanticSuccess/20 text-semanticSuccess' : 'bg-red-500/20 text-red-400'}">
            ${c.status}
          </span>
        </td>
        <td class="py-3 px-4 text-inkTertiary">${new Date(c.timestamp).toLocaleString()}</td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load consents:', err);
  }
}

// Fetch and render DSR Sagas
async function fetchDsr() {
  const tbody = document.getElementById('dsr-table-body');
  try {
    const res = await fetch('/api/v1/dpo/overview');
    const data = await res.json();
    const dsrs = data.recentDsrs || [];

    if (dsrs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-inkSubtle">No active or completed DSR requests. Click "+ New Erasure Request" to test.</td></tr>`;
      return;
    }

    tbody.innerHTML = dsrs
      .map(
        (d) => `
      <tr class="hover:bg-surface2/40 transition-colors">
        <td class="py-3 px-4 text-ink font-medium">${d.dsrId}</td>
        <td class="py-3 px-4 text-inkSubtle">${d.principalId}</td>
        <td class="py-3 px-4 text-primaryHover">${d.requestType}</td>
        <td class="py-3 px-4 text-inkSubtle">${d.tasks.length} sub-tasks dispatched</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${d.status === 'COMPLETED' ? 'bg-semanticSuccess/20 text-semanticSuccess' : 'bg-amber-500/20 text-amber-400'}">
            ${d.status}
          </span>
        </td>
        <td class="py-3 px-4 text-inkTertiary">${new Date(d.slaDeadline).toLocaleDateString()}</td>
        <td class="py-3 px-4 text-inkTertiary font-mono">
          ${d.proofs.length > 0 ? `<span class="text-semanticSuccess text-[10px]">Proof HMAC: ${d.proofs[0].agentSignature.slice(0, 10)}...</span>` : 'Awaiting agent proof'}
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load DSR requests:', err);
  }
}

// Fetch and render Audit Ledger
async function fetchLedger() {
  const container = document.getElementById('ledger-blocks-container');
  try {
    const res = await fetch('/api/v1/dpo/ledger');
    const data = await res.json();
    const blocks = data.blocks || [];

    if (blocks.length === 0) {
      container.innerHTML = `<div class="p-8 text-center bg-surface1 rounded-xl border hairline-border text-xs text-inkSubtle">Audit ledger is empty.</div>`;
      return;
    }

    container.innerHTML = blocks
      .map(
        (b) => `
      <div class="bg-surface1 rounded-xl border hairline-border p-4 space-y-2 hover:border-hairlineStrong transition-colors font-mono text-xs">
        <div class="flex items-center justify-between pb-2 border-b hairline-border">
          <div class="flex items-center space-x-3">
            <span class="w-6 h-6 rounded bg-surface2 flex items-center justify-center font-bold text-ink text-[11px]">#${b.index}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${getEventBadgeClass(b.eventType)}">${b.eventType}</span>
          </div>
          <span class="text-[11px] text-inkTertiary">${new Date(b.timestamp).toISOString()}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] py-1 text-inkSubtle">
          <div>
            <span class="text-inkTertiary">Block Hash:</span>
            <span class="text-primaryHover break-all">${b.hash}</span>
          </div>
          <div>
            <span class="text-inkTertiary">Prev Hash:</span>
            <span class="text-inkMuted break-all">${b.prevHash}</span>
          </div>
        </div>

        <div class="bg-canvas p-2.5 rounded-lg border hairline-border text-[11px] text-inkMuted overflow-x-auto custom-scroll">
          ${JSON.stringify(b.payload, null, 2)}
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load ledger:', err);
  }
}

// Fetch and render Agent Fleet
async function fetchAgents() {
  const container = document.getElementById('agents-cards-container');
  try {
    const res = await fetch('/api/v1/dpo/overview');
    const data = await res.json();
    const agents = data.agents || [];

    if (agents.length === 0) {
      container.innerHTML = `<div class="col-span-2 p-12 text-center bg-surface1 rounded-xl border hairline-border text-xs text-inkSubtle">No agents registered yet.</div>`;
      return;
    }

    container.innerHTML = agents
      .map(
        (a) => `
      <div class="bg-surface1 rounded-xl border hairline-border p-5 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b hairline-border">
          <div class="flex items-center space-x-2">
            <span class="w-2.5 h-2.5 rounded-full ${a.status === 'ACTIVE' || a.status === 'DORMANT' ? 'bg-semanticSuccess' : 'bg-red-500'} animate-pulse"></span>
            <h3 class="text-sm font-semibold text-ink">${a.agentName}</h3>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${a.status === 'ACTIVE' ? 'bg-semanticSuccess/20 text-semanticSuccess' : 'bg-surface2 text-inkSubtle'}">${a.status}</span>
        </div>

        <div class="space-y-1.5 text-xs text-inkSubtle font-mono">
          <div><span class="text-inkTertiary">Agent ID:</span> ${a.agentId}</div>
          <div><span class="text-inkTertiary">Environment:</span> ${a.environment}</div>
          <div><span class="text-inkTertiary">Targets:</span> ${a.targetEndpoints.join(', ')}</div>
          <div><span class="text-inkTertiary">Last Heartbeat:</span> ${new Date(a.lastHeartbeat).toLocaleTimeString()}</div>
          <div><span class="text-inkTertiary">DDL Checksum:</span> <span class="text-primaryHover">${a.ddlChecksum ? a.ddlChecksum.slice(0, 16) + '...' : 'pending'}</span></div>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

function loadCurrentViewData() {
  if (currentTab === 'overview') fetchOverview();
  if (currentTab === 'datamap') fetchDataMap();
  if (currentTab === 'consents') fetchConsents();
  if (currentTab === 'dsr') fetchDsr();
  if (currentTab === 'ledger') fetchLedger();
  if (currentTab === 'agents') fetchAgents();
}

// Modal actions
function openDsrModal() {
  document.getElementById('modal-dsr').classList.remove('hidden');
}

function closeDsrModal() {
  document.getElementById('modal-dsr').classList.add('hidden');
}

async function submitDsrRequest() {
  const principalId = document.getElementById('dsr-input-principal').value.trim();
  const requestType = document.getElementById('dsr-input-type').value;
  const requestedBy = document.getElementById('dsr-input-by').value.trim();

  if (!principalId) {
    alert('Please enter a Data Principal identifier');
    return;
  }

  try {
    const res = await fetch('/api/v1/dpo/dsr/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principalId, requestType, requestedBy }),
    });

    if (res.ok) {
      closeDsrModal();
      switchTab('dsr');
      alert(`DSR Erasure Saga dispatched for principal: ${principalId}`);
    }
  } catch (err) {
    alert('Failed to dispatch DSR request');
  }
}

async function verifyLedgerIntegrity() {
  try {
    const res = await fetch('/api/v1/dpo/ledger/verify', { method: 'POST' });
    const data = await res.json();
    if (data.valid) {
      alert(`✅ Cryptographic Audit Ledger Integrity VERIFIED!\n\nAll ${data.totalBlocks} blocks are mathematically unbroken and tamper-free (SHA-256 chained).`);
    } else {
      alert(`🚨 TAMPER ALERT!\n\nLedger integrity failed at Block #${data.invalidIndex}: ${data.error}`);
    }
  } catch (err) {
    alert('Verification check failed');
  }
}

async function triggerRescan() {
  try {
    const overviewRes = await fetch('/api/v1/dpo/overview');
    const overview = await overviewRes.json();
    const agent = overview.agents?.[0];
    if (!agent) {
      alert('No agents currently connected');
      return;
    }

    await fetch('/api/v1/dpo/agent/trigger-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent.agentId }),
    });

    alert(`Rescan triggered for agent: ${agent.agentId}`);
    setTimeout(() => {
      fetchDataMap();
      fetchOverview();
    }, 1000);
  } catch (err) {
    alert('Failed to trigger scan');
  }
}

// Agent Enrollment Modal Functions
async function openEnrollAgentModal() {
  document.getElementById('modal-enroll').classList.remove('hidden');
  await updateEnrollCommand();
}

function closeEnrollAgentModal() {
  document.getElementById('modal-enroll').classList.add('hidden');
}

async function updateEnrollCommand() {
  const agentId = document.getElementById('enroll-agent-id').value.trim() || 'agent-proxmox-vm-02';
  const subnet = document.getElementById('enroll-target-subnet').value.trim() || '192.168.1.0/24';

  try {
    const res = await fetch(`/api/v1/dpo/enrollment-script?agent_id=${encodeURIComponent(agentId)}&subnet=${encodeURIComponent(subnet)}`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById('enroll-docker-cmd').value = data.dockerCommand;
    }
  } catch (err) {
    document.getElementById('enroll-docker-cmd').value = `docker run -d --name dpdp-zone-agent -e AGENT_ID="${agentId}" -e CONTROL_PLANE_URL="${window.location.origin}" -p 5000:5000 dpdp-zone-agent:latest`;
  }
}

function copyEnrollCommand() {
  const cmd = document.getElementById('enroll-docker-cmd');
  cmd.select();
  navigator.clipboard.writeText(cmd.value);
  alert('Docker run command copied to clipboard! Paste and run this on your target VM/Proxmox node.');
}

// DPO Authentication Functions
function toggleDpoAuthModal() {
  const modal = document.getElementById('modal-dpo-auth');
  modal.classList.toggle('hidden');
}

async function submitDpoLogin() {
  const username = document.getElementById('dpo-login-username').value.trim();
  const password = document.getElementById('dpo-login-password').value;

  try {
    const res = await fetch('/api/v1/dpo/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('dpdp_dpo_token', data.session.token);
      document.getElementById('dpo-officer-name').textContent = data.session.user.fullName;
      document.getElementById('dpo-officer-role').textContent = data.session.user.role;
      toggleDpoAuthModal();
      alert(`Authenticated successfully as: ${data.session.user.fullName} (${data.session.user.role})`);
    } else {
      const err = await res.json();
      alert(`Login failed: ${err.error || 'Invalid credentials'}`);
    }
  } catch (e) {
    alert('Authentication request failed');
  }
}

// Event listeners for dynamic enrollment input change
document.getElementById('enroll-agent-id')?.addEventListener('input', updateEnrollCommand);
document.getElementById('enroll-target-subnet')?.addEventListener('input', updateEnrollCommand);

// Initial load & 4-second polling loop
fetchOverview();
setInterval(() => {
  loadCurrentViewData();
}, 4000);

