// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const LOCAL_DATA_URL = './data.json'; 
const BIN_ID = '69c77c1fc3097a1dd56b9c1b';    // Paste your JSONBin Bin ID here
const API_KEY = '$2a$10$L0Y90t8JHX0YDiMXodX5ueo9Z/5DvBquw1fJP0f5IIJunV5WEk8qG';  // Paste your JSONBin API Key here
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let masterProjects = [];
let remoteStatuses = {}; // Now stores objects: { status: "completed", startDate: "...", endDate: "..." }
let isAdmin = sessionStorage.getItem('isAdmin') === 'true'; 

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const ui = {
    loading: document.getElementById('loading-spinner'),
    dashboardView: document.getElementById('dashboard-view'),
    archiveView: document.getElementById('all-projects-view'),
    pastView: document.getElementById('past-projects-view'),
    currentWeekContainer: document.getElementById('current-week-container'),
    projectGrid: document.getElementById('project-grid'),
    pastGrid: document.getElementById('past-grid'),
    progressBar: document.getElementById('master-progress'),
    progressText: document.getElementById('progress-text'),
    navLinks: document.querySelectorAll('.nav-links li[data-target]'),
    themeToggle: document.getElementById('theme-toggle'),
    adminToggle: document.getElementById('admin-toggle'),
    phaseFilter: document.getElementById('phase-filter'),
    authModal: document.getElementById('auth-modal'),
    closeAuthBtn: document.getElementById('close-auth'),
    loginBtn: document.getElementById('login-btn'),
    passwordInput: document.getElementById('admin-password'),
    authError: document.getElementById('auth-error')
};

// ==========================================
// 3. INITIALIZATION 
// ==========================================
async function initApp() {
    initTheme();
    setupEventListeners();
    updateAdminUI();

    try {
        const [localRes, remoteRes] = await Promise.all([
            fetch(LOCAL_DATA_URL),
            fetch(API_URL, { headers: { 'X-Master-Key': API_KEY } })
        ]);

        if (!localRes.ok) throw new Error("Could not load local data.json");
        masterProjects = await localRes.json();
        
        if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            remoteStatuses = remoteData.record || {};
        }

        populatePhaseFilter();
        renderApp();
    } catch (error) {
        console.error(error);
        ui.loading.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error loading data.`;
    }
}

// ==========================================
// 4. RENDERING LOGIC & TIMESTAMPS
// ==========================================
function getProjectState(week) {
    const data = remoteStatuses[week];
    // Backwards compatibility if data is just a string, or returns default object
    if (typeof data === 'string') return { status: data, startDate: null, endDate: null };
    if (data && typeof data === 'object') return data;
    return { status: 'pending', startDate: null, endDate: null };
}

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderApp() {
    ui.loading.classList.add('hidden');
    
    let completedCount = 0;
    let currentWeekProject = null;

    ui.projectGrid.innerHTML = '';
    ui.pastGrid.innerHTML = '';

    masterProjects.forEach(project => {
        const state = getProjectState(project.week);
        
        if (state.status === 'completed') {
            completedCount++;
            ui.pastGrid.insertAdjacentHTML('afterbegin', generateCardHTML(project, state)); // Add to past view
        } else if (!currentWeekProject && state.status !== 'completed') {
            currentWeekProject = project; // Grab the first non-completed project
        }

        // Add to main archive
        ui.projectGrid.insertAdjacentHTML('beforeend', generateCardHTML(project, state));
    });

    // Render Current Week
    if (currentWeekProject) {
        const state = getProjectState(currentWeekProject.week);
        ui.currentWeekContainer.innerHTML = generateCardHTML(currentWeekProject, state, true);
    } else {
        ui.currentWeekContainer.innerHTML = `<div class="card completed"><h3>🎉 130 Weeks Conquered!</h3></div>`;
    }

    // Update Progress
    const progressPercentage = (completedCount / masterProjects.length) * 100;
    ui.progressBar.style.width = `${progressPercentage}%`;
    ui.progressText.innerText = `${completedCount} / ${masterProjects.length} Completed`;
}

function generateCardHTML(project, state, isSpotlight = false) {
    const techTags = project.tech_stack.map(tech => `<span class="tech-tag">${tech}</span>`).join('');
    const disableDropdown = isAdmin ? '' : 'disabled title="Admin login required"';
    
    // Build Timestamp HTML
    let timeHTML = '';
    if (state.startDate) timeHTML += `<div class="timestamp">Started: ${formatDate(state.startDate)}</div>`;
    if (state.endDate) timeHTML += `<div class="timestamp">Finished: ${formatDate(state.endDate)}</div>`;

    return `
        <div class="card ${state.status} ${isSpotlight ? 'spotlight-card' : ''}" data-phase="${project.phase}">
            <div class="card-header">
                <span class="week-badge">Week ${project.week}</span>
                <span class="difficulty-badge">${project.difficulty}</span>
            </div>
            <h3>${project.title}</h3>
            <p class="description">${project.description}</p>
            
            ${timeHTML ? `<div class="time-tracking">${timeHTML}</div>` : ''}

            <div class="tech-stack">${techTags}</div>
            
            <div class="card-actions">
                <a href="${project.links.github_repo || '#'}" target="_blank"><i class="fa-brands fa-github"></i> View Repo</a>
                <select onchange="updateStatus(${project.week}, this.value)" class="status-dropdown" ${disableDropdown}>
                    <option value="pending" ${state.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="in_progress" ${state.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${state.status === 'completed' ? 'selected' : ''}>Completed ✅</option>
                </select>
            </div>
        </div>
    `;
}

// ==========================================
// 5. AUTO-ADVANCE & DATABASE UPDATES
// ==========================================
async function updateStatus(weekNumber, newStatus) {
    if (!isAdmin) return; 

    const now = new Date().toISOString();
    let currentData = getProjectState(weekNumber);
    
    // 1. Update Current Week Logic
    currentData.status = newStatus;
    
    if (newStatus === 'in_progress' && !currentData.startDate) {
        currentData.startDate = now;
    } else if (newStatus === 'completed') {
        currentData.endDate = now;
        if (!currentData.startDate) currentData.startDate = now; // Fallback if they skipped 'in_progress'
    }

    remoteStatuses[weekNumber] = currentData;

    // 2. Auto-Advance Logic
    if (newStatus === 'completed' && weekNumber < 130) {
        const nextWeekNum = weekNumber + 1;
        let nextData = getProjectState(nextWeekNum);
        
        if (nextData.status === 'pending') {
            nextData.status = 'in_progress';
            nextData.startDate = now;
            remoteStatuses[nextWeekNum] = nextData;
        }
    }

    renderApp(); // Instantly update UI

    // 3. Save to Cloud
    try {
        await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify(remoteStatuses)
        });
    } catch (error) {
        alert("Failed to sync with cloud. Check network.");
    }
}

// ==========================================
// 6. SPA ROUTING & FILTERS
// ==========================================
function setupEventListeners() {
    ui.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            ui.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            ui.dashboardView.classList.add('hidden');
            ui.archiveView.classList.add('hidden');
            ui.pastView.classList.add('hidden');

            document.getElementById(link.getAttribute('data-target')).classList.remove('hidden');
        });
    });

    ui.phaseFilter.addEventListener('change', (e) => {
        const selected = e.target.value;
        document.querySelectorAll('#all-projects-view .card').forEach(card => {
            card.style.display = (selected === 'all' || card.getAttribute('data-phase') === selected) ? 'flex' : 'none';
        });
    });

    ui.themeToggle.addEventListener('click', () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Admin Toggle (Login / Logout)
    ui.adminToggle.addEventListener('click', () => {
        if (isAdmin) {
            // Logout sequence
            isAdmin = false;
            sessionStorage.removeItem('isAdmin');
            updateAdminUI();
            renderApp();
        } else {
            ui.authModal.classList.remove('hidden');
        }
    });

    ui.closeAuthBtn.addEventListener('click', () => ui.authModal.classList.add('hidden'));
    ui.loginBtn.addEventListener('click', handleLogin);
    ui.passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
}

function populatePhaseFilter() {
    const phases = [...new Set(masterProjects.map(p => p.phase))];
    phases.forEach(phase => ui.phaseFilter.insertAdjacentHTML('beforeend', `<option value="${phase}">${phase}</option>`));
}

// ==========================================
// 7. AUTHENTICATION & THEME ENGINES
// ==========================================
function handleLogin() {
    if (ui.passwordInput.value === 'yagnam') {
        isAdmin = true;
        sessionStorage.setItem('isAdmin', 'true');
        ui.authModal.classList.add('hidden');
        ui.authError.classList.add('hidden');
        ui.passwordInput.value = '';
        updateAdminUI();
        renderApp();
    } else {
        ui.authError.classList.remove('hidden');
    }
}

function updateAdminUI() {
    if (isAdmin) {
        ui.adminToggle.classList.replace('admin-locked', 'admin-unlocked');
        ui.adminToggle.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
        ui.adminToggle.title = "Admin Unlocked - Click to Lock";
    } else {
        ui.adminToggle.classList.replace('admin-unlocked', 'admin-locked');
        ui.adminToggle.innerHTML = '<i class="fa-solid fa-lock"></i>';
        ui.adminToggle.title = "Admin Login";
    }
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', (saved === 'dark' || (!saved && prefersDark)) ? 'dark' : 'light');
}

initApp();