export const CRM_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexusCRM - Premium SaaS Command Center</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google Fonts: Space Grotesk & Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <!-- Lucide Icons CDN -->
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: {
              50: '#f8fafc',
              100: '#f1f5f9',
              800: '#1e293b',
              900: '#0f172a', // Deep Navy Blue background
              950: '#020617',
            },
            orange: {
              500: '#f97316', // Vibrant Orange Accent
              600: '#ea580c',
            }
          },
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            display: ['Space Grotesk', 'sans-serif'],
          }
        }
      }
    }
  </script>
  
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background-color: #0f172a;
      color: #f1f5f9;
      overflow-x: hidden;
    }
    .font-display {
      font-family: 'Space Grotesk', sans-serif;
    }
    /* Custom scrollbar for premium feel */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0f172a;
    }
    ::-webkit-scrollbar-thumb {
      background: #1e293b;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #f97316;
    }
    /* Smooth view transitions */
    .view-panel {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .glass-card {
      background: rgba(30, 41, 59, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body class="bg-navy-950 text-slate-100 min-h-screen flex flex-col md:flex-row antialiased">

  <!-- SIDEBAR NAVIGATION -->
  <aside class="w-full md:w-64 bg-[#090d16] border-b md:border-b-0 md:border-r border-slate-800/80 shrink-0 flex flex-col justify-between z-30">
    <div>
      <!-- Brand Logo -->
      <div class="p-6 flex items-center gap-3 border-b border-slate-800/60">
        <div class="w-10 h-10 bg-gradient-to-tr from-orange-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <i data-lucide="layers" class="w-5.5 h-5.5 text-white"></i>
        </div>
        <div>
          <span class="text-lg font-bold font-display tracking-tight text-white block">Nexus<span class="text-orange-500">CRM</span></span>
          <span class="text-[10px] font-mono text-orange-500/80 uppercase font-black tracking-widest block">Tenant isolated</span>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="p-4 space-y-1.5">
        <button id="nav-dashboard" onclick="switchView('dashboard')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-orange-500 bg-orange-500/10 border-l-2 border-orange-500 rounded-r-lg transition-all duration-200 group text-left cursor-pointer">
          <div class="flex items-center gap-3">
            <i data-lucide="layout-dashboard" class="w-4.5 h-4.5"></i>
            <span>Dashboard</span>
          </div>
          <span class="text-[10px] font-mono bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-black">Live</span>
        </button>

        <button id="nav-contacts" onclick="switchView('contacts')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/40 rounded-lg transition-all duration-200 text-left cursor-pointer">
          <div class="flex items-center gap-3">
            <i data-lucide="users" class="w-4.5 h-4.5"></i>
            <span>Contacts & Deals</span>
          </div>
          <span id="sidebar-contacts-count" class="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">5</span>
        </button>

        <button id="nav-settings" onclick="switchView('settings')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/40 rounded-lg transition-all duration-200 text-left cursor-pointer">
          <div class="flex items-center gap-3">
            <i data-lucide="settings" class="w-4.5 h-4.5"></i>
            <span>Settings & API</span>
          </div>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </button>
      </nav>
    </div>

    <!-- Active Profile Footer -->
    <div class="p-4 border-t border-slate-800/60 bg-[#060a10]">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center font-bold text-orange-500 text-sm font-display uppercase" id="profile-initial">
          AA
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="text-xs font-bold text-white truncate" id="profile-name">Al Amin</h4>
          <p class="text-[10px] text-slate-400 truncate" id="profile-email">admin@alaminn.info</p>
        </div>
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse shrink-0"></div>
      </div>
    </div>
  </aside>

  <!-- MAIN APP CONTAINER -->
  <main class="flex-1 flex flex-col min-w-0 relative">
    
    <!-- TOP BAR SEARCH & STATUS -->
    <header class="h-16 border-b border-slate-800/80 bg-[#090d16] flex items-center justify-between px-6 z-10">
      <div class="flex items-center gap-3">
        <span class="bg-emerald-500/10 text-emerald-400 text-[10px] font-black tracking-widest font-mono uppercase px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          CRM Live Node
        </span>
        <span class="text-slate-500 text-xs font-mono hidden sm:inline">| Port 3000 Ingress</span>
      </div>

      <div class="flex items-center gap-4 text-xs font-mono text-slate-400">
        <span>System Sync: <span class="text-orange-500">100% Ok</span></span>
        <span id="current-time-display" class="bg-slate-900 border border-slate-800/60 px-3 py-1 rounded text-slate-300"></span>
      </div>
    </header>

    <!-- VIEWS CONTENT -->
    <div class="flex-1 p-6 overflow-y-auto relative">
      
      <!-- 1. DASHBOARD VIEW -->
      <section id="view-dashboard" class="view-panel space-y-8">
        
        <!-- Welcome Hero Banner -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-[#131d31] to-slate-900 border border-slate-800/60 p-6 rounded-2xl relative overflow-hidden shadow-xl shadow-slate-950/20">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.06),transparent_45%)]"></div>
          <div>
            <h1 class="text-2xl md:text-3xl font-black font-display text-white tracking-tight">Enterprise CRM Analytics</h1>
            <p class="text-slate-400 text-sm mt-1">Real-time leads tracking, dynamic pipeline telemetry, and campaign performance indices.</p>
          </div>
          <button onclick="switchView('contacts')" class="bg-orange-500 hover:bg-orange-600 text-slate-950 font-extrabold text-xs px-5 py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 border border-orange-500/10 hover:translate-y-[-1px] cursor-pointer">
            <i data-lucide="plus-circle" class="w-4 h-4 text-slate-950"></i>
            <span>Manage Sales Ledger</span>
          </button>
        </div>

        <!-- 4 STAT CARDS -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Card 1: Total Contacts -->
          <div class="glass-card p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-slate-950/25">
            <div class="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />
            <div class="flex justify-between items-start mb-4">
              <div>
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">Total Leads Ledger</span>
                <h3 id="stat-total-contacts" class="text-3xl font-black text-white mt-1">1,482</h3>
              </div>
              <div class="p-3 bg-orange-500/15 border border-orange-500/30 text-orange-500 rounded-xl">
                <i data-lucide="users" class="w-5 h-5"></i>
              </div>
            </div>
            <div class="flex items-center gap-1 text-xs text-emerald-400 font-bold">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              <span>+12.4%</span>
              <span class="text-slate-500 font-medium ml-1">v.s. last month</span>
            </div>
          </div>

          <!-- Card 2: Active Deals -->
          <div class="glass-card p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-slate-950/25">
            <div class="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />
            <div class="flex justify-between items-start mb-4">
              <div>
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">Active Deals Scope</span>
                <h3 id="stat-active-deals" class="text-3xl font-black text-white mt-1">64</h3>
              </div>
              <div class="p-3 bg-orange-500/15 border border-orange-500/30 text-orange-500 rounded-xl">
                <i data-lucide="activity" class="w-5 h-5"></i>
              </div>
            </div>
            <div class="flex items-center gap-1 text-xs text-emerald-400 font-bold">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              <span>+8.2%</span>
              <span class="text-slate-500 font-medium ml-1">from yesterday</span>
            </div>
          </div>

          <!-- Card 3: Total Revenue -->
          <div class="glass-card p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-slate-950/25">
            <div class="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />
            <div class="flex justify-between items-start mb-4">
              <div>
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">Total Pipeline Value</span>
                <h3 id="stat-total-revenue" class="text-3xl font-black text-white mt-1">$267,500</h3>
              </div>
              <div class="p-3 bg-orange-500/15 border border-orange-500/30 text-orange-500 rounded-xl">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
            </div>
            <div class="flex items-center gap-1 text-xs text-emerald-400 font-bold">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              <span>+24.3%</span>
              <span class="text-slate-500 font-medium ml-1">YoY expansion</span>
            </div>
          </div>

          <!-- Card 4: Tasks -->
          <div class="glass-card p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-slate-950/25">
            <div class="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />
            <div class="flex justify-between items-start mb-4">
              <div>
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">Urgent Action Tasks</span>
                <h3 id="stat-total-tasks" class="text-3xl font-black text-white mt-1">12</h3>
              </div>
              <div class="p-3 bg-orange-500/15 border border-orange-500/30 text-orange-500 rounded-xl">
                <i data-lucide="check-square" class="w-5 h-5"></i>
              </div>
            </div>
            <div class="flex items-center gap-1 text-xs text-orange-400 font-bold">
              <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>
              <span>3 Overdue</span>
              <span class="text-slate-500 font-medium ml-1">needs response</span>
            </div>
          </div>
        </div>

        <!-- PIPELINE FLOW PIPELINE -->
        <div class="glass-card p-6 rounded-2xl relative shadow-lg shadow-slate-950/20">
          <div class="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
            <div>
              <h2 class="text-base font-bold text-white font-display">Sales Pipeline Telemetry</h2>
              <p class="text-xs text-slate-400">Relative weight distribution across stages</p>
            </div>
            <span class="text-[10px] font-mono bg-orange-500/15 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded font-bold uppercase tracking-wider">Operational funnel</span>
          </div>

          <!-- Vertical/Horizontal Funnel Pipeline -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            <!-- Stage 1: Lead -->
            <div class="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-all duration-200">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-slate-850 flex items-center justify-center font-bold font-mono text-xs text-slate-400">1</div>
                <div>
                  <h4 class="text-xs font-black text-white">Lead</h4>
                  <p class="text-[10px] text-slate-500" id="funnel-count-lead">1 Leads</p>
                </div>
              </div>
              <span class="text-xs font-black text-orange-500 font-mono" id="funnel-val-lead">$5,000</span>
            </div>

            <!-- Stage 2: Contacted -->
            <div class="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-all duration-200">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-slate-850 flex items-center justify-center font-bold font-mono text-xs text-slate-400">2</div>
                <div>
                  <h4 class="text-xs font-black text-white">Contacted</h4>
                  <p class="text-[10px] text-slate-500" id="funnel-count-contacted">1 Leads</p>
                </div>
              </div>
              <span class="text-xs font-black text-orange-500 font-mono" id="funnel-val-contacted">$12,500</span>
            </div>

            <!-- Stage 3: Proposal -->
            <div class="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-all duration-200">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-slate-850 flex items-center justify-center font-bold font-mono text-xs text-slate-400">3</div>
                <div>
                  <h4 class="text-xs font-black text-white">Proposal</h4>
                  <p class="text-[10px] text-slate-500" id="funnel-count-proposal">1 Leads</p>
                </div>
              </div>
              <span class="text-xs font-black text-orange-500 font-mono" id="funnel-val-proposal">$85,000</span>
            </div>

            <!-- Stage 4: Won -->
            <div class="bg-orange-500/5 border-2 border-orange-500/20 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/40 transition-all duration-200">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold font-mono text-xs">4</div>
                <div>
                  <h4 class="text-xs font-black text-orange-500">Won</h4>
                  <p class="text-[10px] text-orange-400" id="funnel-count-won">2 Leads</p>
                </div>
              </div>
              <span class="text-xs font-black text-orange-500 font-mono" id="funnel-val-won">$165,000</span>
            </div>
          </div>

          <!-- Total Pipeline value progress bar -->
          <div class="mt-6 bg-slate-950 p-4 rounded-xl border border-slate-800/60">
            <div class="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-2 font-bold">
              <span>Conversion Funnel Dispatch Efficiency</span>
              <span class="text-orange-500" id="pipeline-efficiency">82.3% Efficiency Rate</span>
            </div>
            <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div class="bg-gradient-to-r from-orange-600 to-orange-500 h-full rounded-full" style="width: 82.3%"></div>
            </div>
          </div>
        </div>

        <!-- RECENT ACTIVITIES LIST -->
        <div class="glass-card p-6 rounded-2xl relative shadow-lg shadow-slate-950/20">
          <div class="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
            <div>
              <h2 class="text-base font-bold text-white font-display">Recent Activity Logs</h2>
              <p class="text-xs text-slate-400">Tenant audit trails and communication telemetry</p>
            </div>
            <button onclick="clearActivityLogs()" class="text-slate-500 hover:text-orange-500 font-mono text-[10px] uppercase font-bold cursor-pointer">Clear Logs</button>
          </div>

          <div class="space-y-3 max-h-80 overflow-y-auto pr-1" id="activity-logs-container">
            <!-- Activities will be injected here -->
          </div>
        </div>

      </section>

      <!-- 2. CONTACTS VIEW -->
      <section id="view-contacts" class="view-panel hidden space-y-6">
        
        <!-- Header row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h2 class="text-2xl font-black font-display text-white tracking-tight">Client Directory Ledger</h2>
            <p class="text-xs text-slate-400 mt-1">Manage contact profiles, assign pipeline phases, and track absolute deal metrics.</p>
          </div>
          
          <button onclick="toggleContactModal(true)" class="bg-orange-500 hover:bg-orange-600 text-slate-950 font-extrabold text-xs px-5 py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 border border-orange-500/10 cursor-pointer">
            <i data-lucide="plus" class="w-4.5 h-4.5"></i>
            <span>Add Contact</span>
          </button>
        </div>

        <!-- Search / Filter bar -->
        <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800/60 flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-500"></i>
            <input
              type="text"
              id="contact-search-bar"
              oninput="handleSearchContacts()"
              placeholder="Filter contacts by name, email, or status..."
              class="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/20 font-medium"
            />
          </div>
          <div class="w-full sm:w-auto shrink-0">
            <select
              id="contact-status-filter"
              onchange="handleSearchContacts()"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 font-bold focus:border-orange-500 focus:outline-none cursor-pointer"
            >
              <option value="All">All Stages</option>
              <option value="Lead">Lead</option>
              <option value="Contacted">Contacted</option>
              <option value="Proposal">Proposal</option>
              <option value="Won">Won</option>
            </select>
          </div>
        </div>

        <!-- DATA TABLE -->
        <div class="glass-card rounded-2xl overflow-hidden shadow-lg shadow-slate-950/20 border border-slate-800/60">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-900/80 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  <th class="p-4 pl-6 font-bold">Contact Name</th>
                  <th class="p-4 font-bold">Email Identity</th>
                  <th class="p-4 font-bold">Pipeline Stage</th>
                  <th class="p-4 font-bold text-right">Deal Value</th>
                  <th class="p-4 pr-6 text-center font-bold">Actions</th>
                </tr>
              </thead>
              <tbody id="contacts-table-body" class="divide-y divide-slate-800/50 text-sm">
                <!-- Rows will be dynamically injected here -->
              </tbody>
            </table>
          </div>

          <!-- Empty state -->
          <div id="contacts-empty-state" class="hidden p-12 text-center text-slate-500">
            <i data-lucide="search-code" class="w-12 h-12 text-slate-600 mx-auto mb-3"></i>
            <h4 class="font-bold text-white text-sm">No matching records found</h4>
            <p class="text-xs text-slate-400 mt-1">Refine your search parameters or register a new client profile.</p>
          </div>
        </div>

      </section>

      <!-- 3. SETTINGS VIEW -->
      <section id="view-settings" class="view-panel hidden space-y-6">
        
        <div class="border-b border-slate-800 pb-5">
          <h2 class="text-2xl font-black font-display text-white tracking-tight">System Settings & Profile</h2>
          <p class="text-xs text-slate-400 mt-1">Configure client identities, currency mappings, and secure webhook credentials.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <!-- Left side: Form -->
          <form onsubmit="handleSaveSettings(event)" class="lg:col-span-8 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-6 shadow-lg shadow-slate-950/15">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Owner Full Name</label>
                <input
                  type="text"
                  id="settings-name"
                  value="Al Amin"
                  required
                  class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Email Identity</label>
                <input
                  type="email"
                  id="settings-email"
                  value="admin@alaminn.info"
                  required
                  class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">API Endpoint Host</label>
                <input
                  type="text"
                  id="settings-host"
                  value="crm.alaminn.info"
                  required
                  class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono"
                />
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">System Currency Prefix</label>
                <select
                  id="settings-currency"
                  class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="BDT">BDT (৳)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <div class="border-t border-slate-800/80 pt-5 space-y-4">
              <h3 class="text-sm font-bold text-white font-display">External Integrations Telemetry</h3>
              
              <div class="flex items-center justify-between bg-slate-950/60 p-4 rounded-xl border border-slate-800/50">
                <div class="space-y-0.5">
                  <h4 class="text-xs font-bold text-white">Dynamic Webhook Syncing</h4>
                  <p class="text-[10px] text-slate-400">Trigger HubSpot alignments when lead transitions to won</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" id="settings-webhook-toggle" checked class="sr-only peer">
                  <div class="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              <div>
                <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Bearer Authentication Token</label>
                <div class="relative flex items-center">
                  <input
                    type="password"
                    id="settings-api-token"
                    value="REDACTED_EXAMPLE_CREDENTIAL"
                    readonly
                    class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 pl-3 pr-10 text-xs text-white focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onclick="toggleTokenReveal()"
                    class="absolute right-3 text-slate-500 hover:text-white cursor-pointer"
                  >
                    <i data-lucide="eye" id="token-eye-icon" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="submit"
                class="bg-orange-500 hover:bg-orange-600 text-slate-950 font-extrabold text-xs px-6 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-orange-500/10"
              >
                Save Profile
              </button>
            </div>
          </form>

          <!-- Right side: Quick Info Card -->
          <div class="lg:col-span-4 space-y-4">
            <div class="glass-card rounded-2xl p-5 border border-slate-800/60 relative overflow-hidden">
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.03),transparent_40%)]"></div>
              <h3 class="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 mb-3">API Health Metric</h3>
              <div class="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-850">
                <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                </div>
                <div>
                  <span class="text-xs text-white block font-bold">Node Host Active</span>
                  <span class="text-[10px] text-slate-500 font-mono">Ping: 12ms | Latency optimal</span>
                </div>
              </div>
            </div>

            <div class="bg-[#FFF4EB] border border-[#FF6A00]/20 rounded-2xl p-5 text-slate-800">
              <h3 class="text-xs font-mono font-bold uppercase tracking-widest text-[#003A8C] mb-2">Development Guide</h3>
              <p class="text-xs leading-relaxed text-slate-600 font-medium">
                This dashboard uses strict reactive client state mechanics to ensure zero page reloads. Adding, searching, and filtering contact profiles happens instantly in-memory.
              </p>
            </div>
          </div>

        </div>

      </section>

    </div>

  </main>

  <!-- ADD CONTACT FORM MODAL -->
  <div id="add-contact-modal" class="hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border-2 border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative text-left p-6">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />
      
      <div class="flex justify-between items-start mb-5">
        <div>
          <span class="bg-orange-500/10 text-orange-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-orange-500/20 uppercase tracking-widest">
            Registration Form
          </span>
          <h3 class="text-xl font-bold font-display text-white mt-2">Register CRM Contact</h3>
          <p class="text-slate-400 text-xs mt-1">Register a new client lead into the secure local database.</p>
        </div>
        <button
          onclick="toggleContactModal(false)"
          class="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form id="add-contact-form" onsubmit="handleFormSubmitContact(event)" class="space-y-4">
        <div>
          <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Contact Full Name</label>
          <input
            type="text"
            id="form-contact-name"
            required
            placeholder="e.g. Bruce Wayne"
            class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Email Address</label>
          <input
            type="email"
            id="form-contact-email"
            required
            placeholder="e.g. bruce@waynecorp.com"
            class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Funnel Stage</label>
            <select
              id="form-contact-status"
              class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="Lead">Lead</option>
              <option value="Contacted">Contacted</option>
              <option value="Proposal">Proposal</option>
              <option value="Won">Won</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-2">Deal Value (USD)</label>
            <input
              type="number"
              id="form-contact-value"
              required
              min="0"
              placeholder="e.g. 5000"
              class="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono"
            />
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3">
          <button
            type="button"
            onclick="toggleContactModal(false)"
            class="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-orange-500/20"
          >
            Register Profile
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- CLIENT-SIDE EMBEDDED JAVASCRIPT STATE ENGINE -->
  <script>
    // 1. DUMMY DATA BASELINE
    let contacts = [
      { id: "c_1", name: "Sarah Connor", email: "sarah.c@cyberdyne.com", status: "Won", value: 45000 },
      { id: "c_2", name: "Bruce Wayne", email: "bruce@waynecorp.com", status: "Proposal", value: 85000 },
      { id: "c_3", name: "John Doe", email: "john.doe@gmail.com", status: "Contacted", value: 12500 },
      { id: "c_4", name: "Clark Kent", email: "clark@dailyplanet.com", status: "Lead", value: 5000 },
      { id: "c_5", name: "Tony Stark", email: "tony@starkindustries.com", status: "Won", value: 120000 }
    ];

    let activityLogs = [
      { id: "log_1", time: "10 mins ago", text: "Bruce Wayne moved to Proposal phase", type: "pipeline" },
      { id: "log_2", time: "2 hours ago", text: "New lead Sarah Connor generated via API webhook", type: "system" },
      { id: "log_3", time: "4 hours ago", text: "Follow-up proposal email dispatched to Tony Stark", type: "outreach" },
      { id: "log_4", time: "1 day ago", text: "HubSpot CRM alignments matched successfully", type: "sync" }
    ];

    let selectedCurrency = "USD";

    // 2. VIEW INITIALIZATION ON PAGE LOAD
    window.addEventListener("load", () => {
      // Initialize Lucide icon mapping
      lucide.createIcons();
      
      // Load current system time
      updateSystemTime();
      setInterval(updateSystemTime, 1000);

      // Render default states
      renderContactsTable();
      renderStatistics();
      renderActivities();
    });

    // 3. CLOCK DISPLAY DYNAMICS
    function updateSystemTime() {
      const display = document.getElementById("current-time-display");
      if (display) {
        const d = new Date();
        display.innerText = d.toISOString().replace("T", " ").substring(0, 19) + " UTC";
      }
    }

    // 4. VIEW-SWITCHING COMPONENT MECHANIC
    function switchView(viewName) {
      // Hide all panels
      document.getElementById("view-dashboard").classList.add("hidden");
      document.getElementById("view-contacts").classList.add("hidden");
      document.getElementById("view-settings").classList.add("hidden");

      // Show requested panel
      document.getElementById("view-" + viewName).classList.remove("hidden");

      // Reset nav classes
      const navButtons = ["dashboard", "contacts", "settings"];
      navButtons.forEach(btn => {
        const el = document.getElementById("nav-" + btn);
        if (btn === viewName) {
          el.className = "w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-orange-500 bg-orange-500/10 border-l-2 border-orange-500 rounded-r-lg transition-all duration-200 group text-left cursor-pointer";
        } else {
          el.className = "w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/40 rounded-lg transition-all duration-200 text-left cursor-pointer";
        }
      });
    }

    // 5. STATISTICS RENDER ENGINE
    function renderStatistics() {
      const totalContacts = contacts.length;
      const totalDeals = contacts.filter(c => c.status !== "Won").length;
      const totalRevenue = contacts.reduce((sum, current) => sum + current.value, 0);
      const activeTasks = Math.floor(totalContacts * 1.5 + 4);

      const symbol = getCurrencySymbol();

      // Update stat cards
      document.getElementById("stat-total-contacts").innerText = totalContacts.toLocaleString();
      document.getElementById("stat-active-deals").innerText = totalDeals.toLocaleString();
      document.getElementById("stat-total-revenue").innerText = symbol + totalRevenue.toLocaleString();
      document.getElementById("stat-total-tasks").innerText = activeTasks.toString();

      // Update Funnel Stats
      const leadWfs = contacts.filter(c => c.status === "Lead");
      const contactWfs = contacts.filter(c => c.status === "Contacted");
      const proposalWfs = contacts.filter(c => c.status === "Proposal");
      const wonWfs = contacts.filter(c => c.status === "Won");

      document.getElementById("funnel-count-lead").innerText = \`\${leadWfs.length} Lead\${leadWfs.length !== 1 ? 's' : ''}\`;
      document.getElementById("funnel-count-contacted").innerText = \`\${contactWfs.length} Contacted\`;
      document.getElementById("funnel-count-proposal").innerText = \`\${proposalWfs.length} Proposal\${proposalWfs.length !== 1 ? 's' : ''}\`;
      document.getElementById("funnel-count-won").innerText = \`\${wonWfs.length} Won\`;

      document.getElementById("funnel-val-lead").innerText = symbol + leadWfs.reduce((sum, c) => sum + c.value, 0).toLocaleString();
      document.getElementById("funnel-val-contacted").innerText = symbol + contactWfs.reduce((sum, c) => sum + c.value, 0).toLocaleString();
      document.getElementById("funnel-val-proposal").innerText = symbol + proposalWfs.reduce((sum, c) => sum + c.value, 0).toLocaleString();
      document.getElementById("funnel-val-won").innerText = symbol + wonWfs.reduce((sum, c) => sum + c.value, 0).toLocaleString();

      // Update sidebar counter
      document.getElementById("sidebar-contacts-count").innerText = totalContacts.toString();
    }

    function getCurrencySymbol() {
      switch (selectedCurrency) {
        case "EUR": return "€";
        case "BDT": return "৳";
        case "GBP": return "£";
        default: return "$";
      }
    }

    // 6. CONTACTS DIRECTORY RENDER ENGINE
    function renderContactsTable(filterList = null) {
      const targetList = filterList || contacts;
      const tbody = document.getElementById("contacts-table-body");
      const emptyState = document.getElementById("contacts-empty-state");
      
      tbody.innerHTML = "";

      if (targetList.length === 0) {
        emptyState.classList.remove("hidden");
        return;
      } else {
        emptyState.classList.add("hidden");
      }

      const symbol = getCurrencySymbol();

      targetList.forEach(contact => {
        const row = document.createElement("tr");
        row.className = "hover:bg-slate-900/40 transition-colors font-sans";
        
        let badgeClass = "";
        if (contact.status === "Won") badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        else if (contact.status === "Proposal") badgeClass = "bg-orange-500/10 text-orange-400 border border-orange-500/20";
        else if (contact.status === "Contacted") badgeClass = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
        else badgeClass = "bg-slate-800 text-slate-300 border border-slate-700/60";

        row.innerHTML = \`
          <td class="p-4 pl-6 font-bold text-white">\${contact.name}</td>
          <td class="p-4 text-slate-400 font-mono text-xs">\${contact.email}</td>
          <td class="p-4">
            <span class="inline-flex items-center text-[10px] font-black uppercase tracking-wider font-mono px-2.5 py-1 rounded \${badgeClass}">
              \${contact.status}
            </span>
          </td>
          <td class="p-4 text-right font-bold text-orange-500 font-mono">\${symbol}\${contact.value.toLocaleString()}</td>
          <td class="p-4 pr-6 text-center">
            <button onclick="deleteContact('\${contact.id}')" class="text-slate-500 hover:text-red-500 transition-colors p-1 rounded cursor-pointer" title="Delete Profile">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </td>
        \`;
        tbody.appendChild(row);
      });

      lucide.createIcons();
    }

    // 7. DYNAMIC LIVE SEARCH FILTER
    function handleSearchContacts() {
      const searchVal = document.getElementById("contact-search-bar").value.toLowerCase();
      const statusFilter = document.getElementById("contact-status-filter").value;

      const filtered = contacts.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchVal) || c.email.toLowerCase().includes(searchVal);
        const matchesStatus = statusFilter === "All" || c.status === statusFilter;
        return matchesSearch && matchesStatus;
      });

      renderContactsTable(filtered);
    }

    // 8. ADD CONTACT MODAL INTERACTIONS
    function toggleContactModal(show) {
      const modal = document.getElementById("add-contact-modal");
      if (show) {
        modal.classList.remove("hidden");
      } else {
        modal.classList.add("hidden");
        document.getElementById("add-contact-form").reset();
      }
    }

    function handleFormSubmitContact(e) {
      e.preventDefault();
      const name = document.getElementById("form-contact-name").value.trim();
      const email = document.getElementById("form-contact-email").value.trim();
      const status = document.getElementById("form-contact-status").value;
      const value = parseFloat(document.getElementById("form-contact-value").value) || 0;

      const newContact = {
        id: "c_" + Date.now().toString(36),
        name,
        email,
        status,
        value
      };

      // Push to stack
      contacts.unshift(newContact);

      // Create activity log
      const logText = \`\${name} added to database as a new \${status}\`;
      activityLogs.unshift({
        id: "log_" + Date.now(),
        time: "Just now",
        text: logText,
        type: "system"
      });

      // Refresh layout
      renderContactsTable();
      renderStatistics();
      renderActivities();

      // Close modal
      toggleContactModal(false);
    }

    // 9. DELETE CONTACT PROFILE
    function deleteContact(id) {
      const record = contacts.find(c => c.id === id);
      if (!record) return;

      if (confirm(\`Are you sure you want to delete profile: \${record.name}?\`)) {
        contacts = contacts.filter(c => c.id !== id);
        
        activityLogs.unshift({
          id: "log_" + Date.now(),
          time: "Just now",
          text: \`Contact profile \${record.name} deleted\`,
          type: "system"
        });

        renderContactsTable();
        renderStatistics();
        renderActivities();
      }
    }

    // 10. ACTIVITIES RENDERING PANEL
    function renderActivities() {
      const container = document.getElementById("activity-logs-container");
      container.innerHTML = "";

      if (activityLogs.length === 0) {
        container.innerHTML = \`<p class="text-xs text-slate-500 font-mono text-center py-4">No recent activities on this tenant.</p>\`;
        return;
      }

      activityLogs.forEach(log => {
        let iconMarkup = "";
        if (log.type === "pipeline") {
          iconMarkup = \`<div class="p-2 bg-orange-500/10 text-orange-500 rounded border border-orange-500/20"><i data-lucide="arrow-right-left" class="w-3.5 h-3.5"></i></div>\`;
        } else if (log.type === "sync") {
          iconMarkup = \`<div class="p-2 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i></div>\`;
        } else if (log.type === "outreach") {
          iconMarkup = \`<div class="p-2 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20"><i data-lucide="send" class="w-3.5 h-3.5"></i></div>\`;
        } else {
          iconMarkup = \`<div class="p-2 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20"><i data-lucide="database" class="w-3.5 h-3.5"></i></div>\`;
        }

        const div = document.createElement("div");
        div.className = "flex items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/40";
        div.innerHTML = \`
          \${iconMarkup}
          <div class="flex-1 min-w-0">
            <p class="text-xs text-slate-200 font-medium truncate">\${log.text}</p>
          </div>
          <span class="text-[10px] text-slate-500 font-mono shrink-0">\${log.time}</span>
        \`;
        container.appendChild(div);
      });

      lucide.createIcons();
    }

    function clearActivityLogs() {
      activityLogs = [];
      renderActivities();
    }

    // 11. PROFILE SETTINGS PERSISTENCE
    function handleSaveSettings(e) {
      e.preventDefault();
      const name = document.getElementById("settings-name").value;
      const email = document.getElementById("settings-email").value;
      const currency = document.getElementById("settings-currency").value;

      selectedCurrency = currency;

      // Update sidebar visual details
      document.getElementById("profile-name").innerText = name;
      document.getElementById("profile-email").innerText = email;

      const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().substring(0, 2);
      document.getElementById("profile-initial").innerText = initials;

      // Log action
      activityLogs.unshift({
        id: "log_" + Date.now(),
        time: "Just now",
        text: \`Tenant profile configuration updated. Currency set to \${currency}.\`,
        type: "system"
      });

      renderStatistics();
      renderContactsTable();
      renderActivities();

      alert("Settings configuration saved successfully! Profile synced on port 3000.");
    }

    // Token Visibility Reveal
    function toggleTokenReveal() {
      const input = document.getElementById("settings-api-token");
      const icon = document.getElementById("token-eye-icon");
      if (input.type === "password") {
        input.type = "text";
        icon.setAttribute("data-lucide", "eye-off");
      } else {
        input.type = "password";
        icon.setAttribute("data-lucide", "eye");
      }
      lucide.createIcons();
    }
  </script>
</body>
</html>`;
